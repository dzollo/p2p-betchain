import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import {
  decodeEventLog,
  encodePacked,
  getAddress,
  keccak256,
} from "viem";

const { viem, networkHelpers } = await hre.network.connect();

describe("EventTickets", () => {
  async function deployFixture() {
    const [owner, alice, bob] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const tickets = await viem.deployContract("EventTickets", [owner.account.address]);

    return { owner, alice, bob, publicClient, tickets };
  }


  it("onlyOwner: non-owner cannot pause/unpause/setURI", async () => {
    const { tickets, alice } = await networkHelpers.loadFixture(deployFixture);

    await viem.assertions.revertWithCustomErrorWithArgs(
      tickets.write.pause({ account: alice.account }),
      tickets,
      "OwnableUnauthorizedAccount",
      [getAddress(alice.account.address)],
    );

    await viem.assertions.revertWithCustomErrorWithArgs(
      tickets.write.unpause({ account: alice.account }),
      tickets,
      "OwnableUnauthorizedAccount",
      [getAddress(alice.account.address)],
    );

    await viem.assertions.revertWithCustomErrorWithArgs(
      tickets.write.setURI(["ipfs://new/{id}.json"], { account: alice.account }),
      tickets,
      "OwnableUnauthorizedAccount",
      [getAddress(alice.account.address)],
    );
  });

  it("pause: blocks mintWinningTickets (whenNotPaused)", async () => {
    const { tickets, owner, alice } = await networkHelpers.loadFixture(deployFixture);

    await tickets.write.pause({ account: owner.account });

    await viem.assertions.revertWithCustomError(
      tickets.write.mintWinningTickets(
        [[alice.account.address], [10_000n], alice.account.address, 1],
        { account: owner.account },
      ),
      tickets,
      "EnforcedPause",
    );
  });

  it("mintWinningTickets: reverts on array mismatch", async () => {
    const { tickets, owner, alice, bob } = await networkHelpers.loadFixture(deployFixture);

    await viem.assertions.revertWith(
      tickets.write.mintWinningTickets(
        [[alice.account.address, bob.account.address], [10_000n], alice.account.address, 1],
        { account: owner.account },
      ),
      "Array mismatch",
    );
  });

  it("mintWinningTickets: reverts on empty winners", async () => {
    const { tickets, owner } = await networkHelpers.loadFixture(deployFixture);

    await viem.assertions.revertWith(
      tickets.write.mintWinningTickets([[], [], "0x0000000000000000000000000000000000000001", 1], {
        account: owner.account,
      }),
      "No winners",
    );
  });

  it("mintWinningTickets: mints ERC1155 balances, sets ticketDetails and emits TicketsMinted", async () => {
    const { tickets, owner, alice, bob, publicClient } =
      await networkHelpers.loadFixture(deployFixture);

    const poolAddress = "0x00000000000000000000000000000000000000AA";
    const winningOutcome = 2;

    const winners = [alice.account.address, bob.account.address] as const;
    const amounts = [12_345n, 50_000n] as const;

    // tokenId = uint256(keccak256(abi.encodePacked(poolAddress, winningOutcome)))
    const packed = encodePacked(["address", "uint8"], [poolAddress, winningOutcome]);
    const tokenId = BigInt(keccak256(packed));

    const hash = await tickets.write.mintWinningTickets(
      [[...winners], [...amounts], poolAddress, winningOutcome],
      { account: owner.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const balAlice = await tickets.read.balanceOf([alice.account.address, tokenId]);
    const balBob = await tickets.read.balanceOf([bob.account.address, tokenId]);
    assert.equal(balAlice, amounts[0]);
    assert.equal(balBob, amounts[1]);

    const details = await tickets.read.ticketDetails([tokenId]);
    assert.equal(details, keccak256(packed));

    const artifact = await hre.artifacts.readArtifact("EventTickets");
    const decodedLogs = (receipt.logs ?? [])
      .map((log) => {
        if (!log.topics || log.topics.length === 0) return null;
        try {
          return decodeEventLog({
            abi: artifact.abi as any,
            data: log.data,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            strict: false,
          });
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<ReturnType<typeof decodeEventLog>>;

    const ev = decodedLogs.find((e) => e.eventName === "TicketsMinted");
    assert.ok(ev, "TicketsMinted event not found");

    const args = ev!.args as unknown as {
      pool: string;
      outcome: number;
      tokenId: bigint;
      winners: string[];
      amounts: bigint[];
    };

    assert.equal(getAddress(args.pool), getAddress(poolAddress));
    assert.equal(args.outcome, winningOutcome);
    assert.equal(args.tokenId, tokenId);
    assert.deepEqual(args.winners.map(getAddress), winners.map(getAddress));
    assert.deepEqual(args.amounts, [...amounts]);
  });

  it("onlyOwner: non-owner cannot mintWinningTickets", async () => {
    const { tickets, alice, bob } = await networkHelpers.loadFixture(deployFixture);

    await viem.assertions.revertWithCustomErrorWithArgs(
      tickets.write.mintWinningTickets(
        [[bob.account.address], [10_000n], alice.account.address, 1],
        { account: alice.account },
      ),
      tickets,
      "OwnableUnauthorizedAccount",
      [getAddress(alice.account.address)],
    );
  });

  it("unpause: allows mint again", async () => {
    const { tickets, owner, alice } = await networkHelpers.loadFixture(deployFixture);

    await tickets.write.pause({ account: owner.account });

    await viem.assertions.revertWithCustomError(
      tickets.write.mintWinningTickets(
        [[alice.account.address], [10_000n], alice.account.address, 1],
        { account: owner.account },
      ),
      tickets,
      "EnforcedPause",
    );

    await tickets.write.unpause({ account: owner.account });

    const poolAddress = "0x00000000000000000000000000000000000000bb";
    const winningOutcome = 0;

    const packed = encodePacked(["address", "uint8"], [poolAddress, winningOutcome]);
    const tokenId = BigInt(keccak256(packed));

    await tickets.write.mintWinningTickets(
      [[alice.account.address], [10_000n], poolAddress, winningOutcome],
      { account: owner.account },
    );

    const bal = await tickets.read.balanceOf([alice.account.address, tokenId]);
    assert.equal(bal, 10_000n);
  });
});
