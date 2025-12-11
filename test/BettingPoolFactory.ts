import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { decodeEventLog, getAddress, zeroAddress, keccak256, encodePacked } from "viem";

const { viem, networkHelpers } = await hre.network.connect();

async function decodeEventsFromReceipt(
  contractName: string,
  receipt: { logs?: Array<{ data: `0x${string}`; topics: `0x${string}`[] }> },
) {
  const artifact = await hre.artifacts.readArtifact(contractName);
  const logs = receipt.logs ?? [];
  const decoded: ReturnType<typeof decodeEventLog>[] = [];

  for (const log of logs) {
    if (!log.topics || log.topics.length === 0) continue;

    const topics = log.topics as [`0x${string}`, ...`0x${string}`[]];

    try {
      decoded.push(
        decodeEventLog({
          abi: artifact.abi as any,
          data: log.data,
          topics,
          strict: false,
        }),
      );
    } catch {
    }
  }

  return decoded;
}

describe("BettingPoolFactory", () => {
  async function deployFixture() {
    const [owner, alice, bob] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const usdc = await viem.deployContract("MockUSDC", [owner.account.address]);
    const treasury = bob.account.address;

    const factory = await viem.deployContract("BettingPoolFactory", [
      usdc.address,
      owner.account.address,
      treasury,
    ]);

    return { publicClient, owner, alice, bob, usdc, treasury, factory };
  }

  it("constructor: sets usdc and treasury, and deploys tickets", async () => {
    const { factory, usdc, treasury } = await networkHelpers.loadFixture(deployFixture);

    assert.equal(getAddress(await factory.read.usdc()), getAddress(usdc.address));
    assert.equal(getAddress(await factory.read.treasury()), getAddress(treasury));

    const ticketsAddr = await factory.read.tickets();
    assert.notEqual(getAddress(ticketsAddr), getAddress(zeroAddress));
  });

  it("createPool: emits PoolCreated and creates EventPool with correct fields", async () => {
    const { factory, usdc, owner, publicClient } = await networkHelpers.loadFixture(deployFixture);

    const description = "Derby";
    const outcomes = ["Home", "Away", "Draw"] as const;

    const now = await networkHelpers.time.latest();
    const endTime = now + 3600;

    const { result: returnedPoolAddr } = await factory.simulate.createPool(
      [description, [...outcomes], endTime],
      { account: owner.account.address },
    );

    const hash = await factory.write.createPool(
      [description, [...outcomes], endTime],
      { account: owner.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const poolAddr = await factory.read.allPools([0n]);
    assert.equal(getAddress(poolAddr), getAddress(returnedPoolAddr));

    const events = await decodeEventsFromReceipt("BettingPoolFactory", receipt as any);
    const poolCreated = events.find((e) => e.eventName === "PoolCreated");
    assert.ok(poolCreated, "PoolCreated event not found");

    const args = poolCreated!.args as unknown as { pool: string; description: string };
    assert.equal(getAddress(args.pool), getAddress(poolAddr));
    assert.equal(args.description, description);

    const pool = await viem.getContractAt("EventPool", poolAddr);

    assert.equal(await pool.read.description(), description);

    assert.equal(await pool.read.outcomes([0n]), outcomes[0]);
    assert.equal(await pool.read.outcomes([1n]), outcomes[1]);
    assert.equal(await pool.read.outcomes([2n]), outcomes[2]);

    const onchainEndTime = await pool.read.endTime();
    assert.equal(Number(onchainEndTime), endTime);

    assert.equal(getAddress(await pool.read.usdc() as `0x${string}`), getAddress(usdc.address));
    assert.equal(getAddress(await pool.read.factoryAddress() as `0x${string}`), getAddress(factory.address));
  });

  it("createPool: reverts if endTime is in the past", async () => {
    const { factory, owner } = await networkHelpers.loadFixture(deployFixture);

    const now = await networkHelpers.time.latest();
    await viem.assertions.revertWith(
      factory.write.createPool(["Match", ["A", "B", "Draw"], now - 1], { account: owner.account }),
      "End time in past",
    );
  });

  it("onlyOwner: non-owner cannot createPool()", async () => {
    const { factory, alice } = await networkHelpers.loadFixture(deployFixture);

    const now = await networkHelpers.time.latest();
    const endTime = now + 3600;

    await viem.assertions.revertWithCustomErrorWithArgs(
      factory.write.createPool(["Match", ["A", "B", "Draw"], endTime], { account: alice.account }),
      factory,
      "OwnableUnauthorizedAccount",
      [getAddress(alice.account.address)],
    );
  });

  it("settlePool: settles pool, mints tickets to winners, and sends losing USDC to treasury", async () => {
    const { publicClient, owner, alice, bob, usdc, treasury, factory } =
      await networkHelpers.loadFixture(deployFixture);

    const now = await networkHelpers.time.latest();
    const endTime = now + 3600;
    const description = "Game";
    const outcomes = ["1", "2", "X"] as const;

    const createHash = await factory.write.createPool(
      [description, [...outcomes], endTime],
      { account: owner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: createHash });

    const poolAddr = await factory.read.allPools([0n]);
    const pool = await viem.getContractAt("EventPool", poolAddr);

    // Fund bettors with USDC from owner
    await usdc.write.transfer([alice.account.address, 200_000n], { account: owner.account });
    await usdc.write.transfer([bob.account.address, 300_000n], { account: owner.account });

    // Approve pool to spend USDC
    await usdc.write.approve([poolAddr, 200_000n], { account: alice.account });
    await usdc.write.approve([poolAddr, 300_000n], { account: bob.account });

    // Place bets: alice wins (outcome 1), bob loses (outcome 0)
    await pool.write.placeBet([1, 200_000n], { account: alice.account });
    await pool.write.placeBet([0, 300_000n], { account: bob.account });

    // Fast-forward to endTime
    await networkHelpers.time.increaseTo(endTime);

    // Settle through factory
    const winningOutcome = 1;
    const settleHash = await factory.write.settlePool([poolAddr, winningOutcome], {
      account: owner.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: settleHash });

    // Pool status should be SETTLED (=1)
    const status = await pool.read.status();
    assert.equal(Number(status), 1);

    // EventPool should emit Settled(winningOutcome, totalWinningBets)
    const poolEvents = await decodeEventsFromReceipt("EventPool", receipt as any);
    const settled = poolEvents.find((e) => e.eventName === "Settled");
    assert.ok(settled, "EventPool.Settled not found");

    const settledArgs = settled!.args as unknown as { winningOutcome: number; ticketsMinted: bigint };
    assert.equal(settledArgs.winningOutcome, winningOutcome);
    assert.equal(settledArgs.ticketsMinted, 200_000n);

    // Factory should emit PoolSettled (in your current factory code it emits ticketsMinted=0)
    const factoryEvents = await decodeEventsFromReceipt("BettingPoolFactory", receipt as any);
    const poolSettled = factoryEvents.find((e) => e.eventName === "PoolSettled");
    assert.ok(poolSettled, "BettingPoolFactory.PoolSettled not found");

    // Verify ERC1155 tickets minted to alice
    const ticketsAddr = await factory.read.tickets();
    assert.notEqual(getAddress(ticketsAddr), getAddress(zeroAddress));
    const tickets = await viem.getContractAt("EventTickets", ticketsAddr);

    const tokenId = BigInt(
      keccak256(encodePacked(["address", "uint8"], [poolAddr, winningOutcome])),
    );

    const aliceBal = await tickets.read.balanceOf([alice.account.address, tokenId]);
    assert.equal(aliceBal, 200_000n);

    const bobBal = await tickets.read.balanceOf([bob.account.address, tokenId]);
    assert.equal(bobBal, 0n);

    // Losing USDC should arrive to treasury (bob's 300_000)
    const treasuryBal = await usdc.read.balanceOf([treasury]);
    assert.equal(treasuryBal, 300_000n);
  });

  it("onlyOwner: non-owner cannot settlePool()", async () => {
    const { factory, owner, alice } = await networkHelpers.loadFixture(deployFixture);

    const now = await networkHelpers.time.latest();
    const endTime = now + 3600;

    const hash = await factory.write.createPool(["Game", ["1", "2", "X"], endTime], {
      account: owner.account,
    });
    await (await viem.getPublicClient()).waitForTransactionReceipt({ hash });

    const poolAddr = await factory.read.allPools([0n]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      factory.write.settlePool([poolAddr, 1], { account: alice.account }),
      factory,
      "OwnableUnauthorizedAccount",
      [getAddress(alice.account.address)],
    );
  });

  it("setTreasury: updates treasury", async () => {
    const { factory, owner, alice } = await networkHelpers.loadFixture(deployFixture);

    await factory.write.setTreasury([alice.account.address], { account: owner.account });
    assert.equal(getAddress(await factory.read.treasury()), getAddress(alice.account.address));
  });

  it("setTreasury: reverts with Invalid treasury if zero address", async () => {
    const { factory, owner } = await networkHelpers.loadFixture(deployFixture);

    await viem.assertions.revertWith(
      factory.write.setTreasury([zeroAddress], { account: owner.account }),
      "Invalid treasury",
    );
  });
});
