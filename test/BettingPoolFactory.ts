import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { decodeEventLog, getAddress, zeroAddress } from "viem";

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

  it("constructor sets usdc and treasury, and deploys tickets", async () => {
    const { factory, usdc, treasury } = await networkHelpers.loadFixture(deployFixture);

    assert.equal(getAddress(await factory.read.usdc()), getAddress(usdc.address));
    assert.equal(getAddress(await factory.read.treasury()), getAddress(treasury));

    const ticketsAddr = await factory.read.tickets();
    assert.notEqual(getAddress(ticketsAddr), getAddress(zeroAddress));
  });

  it("createPool emits PoolCreated and creates EventPool with correct fields", async () => {
    const { factory, usdc, owner, publicClient } = await networkHelpers.loadFixture(deployFixture);

    const description = "Derby";
    const outcomes = ["Home", "Away", "Draw"] as const;

    const now = await networkHelpers.time.latest();
    const endTime = now + 3600;

    const { result: returnedPoolAddr, request } = await factory.simulate.createPool(
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

  it("createPool reverts if endTime is in the past", async () => {
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

  // TODO правильный settlePool


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

  it("setTreasury updates treasury", async () => {
    const { factory, owner, alice } = await networkHelpers.loadFixture(deployFixture);

    await factory.write.setTreasury([alice.account.address], { account: owner.account });
    assert.equal(getAddress(await factory.read.treasury()), getAddress(alice.account.address));
  });

  it("setTreasury reverts with Invalid treasury if zero address", async () => {
    const { factory, owner } = await networkHelpers.loadFixture(deployFixture);

    await viem.assertions.revertWith(
      factory.write.setTreasury([zeroAddress], { account: owner.account }),
      "Invalid treasury",
    );
  });
});
