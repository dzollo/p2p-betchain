import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress, zeroAddress } from "viem";

const { viem, networkHelpers } = await hre.network.connect();

describe("EventPool", () => {
  async function deployFixture() {
    const [owner, alice, bob, carol] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const usdc = await viem.deployContract("MockUSDC", [owner.account.address]);

    const treasury = bob.account.address;
    const factory = await viem.deployContract("BettingPoolFactory", [
      usdc.address,
      owner.account.address,
      treasury,
    ]);

    const description = "Match #1";
    const outcomes = ["A", "B", "Draw"] as const;

    const now = await networkHelpers.time.latest();
    const endTime = now + 3600;

    const hash = await factory.write.createPool(
      [description, [...outcomes], endTime],
      { account: owner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash });

    const poolAddr = await factory.read.allPools([0n]);
    const pool = await viem.getContractAt("EventPool", poolAddr);

    return {
      publicClient,
      owner,
      alice,
      bob,
      carol,
      usdc,
      factory,
      treasury,
      pool,
      poolAddr,
      description,
      outcomes,
      endTime,
    };
  }

  it("constructor: stores fields set by factory-created pool", async () => {
    const { pool, description, outcomes, endTime, usdc, factory } =
      await networkHelpers.loadFixture(deployFixture);

    assert.equal(await pool.read.description(), description);

    assert.equal(await pool.read.outcomes([0n]), outcomes[0]);
    assert.equal(await pool.read.outcomes([1n]), outcomes[1]);
    assert.equal(await pool.read.outcomes([2n]), outcomes[2]);

    const onchainEndTime = await pool.read.endTime();
    assert.equal(Number(onchainEndTime), endTime);

    assert.equal(getAddress(await pool.read.usdc() as `0x${string}`), getAddress(usdc.address));
    assert.equal(getAddress(await pool.read.factoryAddress() as `0x${string}`), getAddress(factory.address));
  });

    it("constructor: reverts if endTime is in the past", async () => {
        const [owner] = await viem.getWalletClients();

        const now = await networkHelpers.time.latest();
        const endTimePast = now - 1;

        await viem.assertions.revertWith(
        viem.deployContract("EventPool", [
          "Bad pool",
          ["A", "B", "Draw"],
          endTimePast,
          owner.account.address,
          owner.account.address,
        ]),
    "End time in past",
      );
    });

    it("constructor: reverts if usdc is zero", async () => {
      const [owner] = await viem.getWalletClients();

      const now = await networkHelpers.time.latest();
      const endTime = now + 3600;

      await viem.assertions.revertWith(
        viem.deployContract("EventPool", [
          "Bad pool",
          ["A", "B", "Draw"],
          endTime,
          zeroAddress,
          owner.account.address,
        ]),
        "Invalid USDC",
      );
    });

    it("constructor: reverts if factoryAddress is zero", async () => {
      const [owner] = await viem.getWalletClients();

      const now = await networkHelpers.time.latest();
      const endTime = now + 3600;

      const usdc = await viem.deployContract("MockUSDC", [owner.account.address]);

      await viem.assertions.revertWith(
        viem.deployContract("EventPool", [
          "Bad pool",
          ["A", "B", "Draw"],
          endTime,
          usdc.address,
          zeroAddress,
        ]),
        "Invalid factory",
      );
    });


  it("placeBet: reverts if amount < 10**4 (min bet 0.01 USDC)", async () => {
    const { pool, usdc, owner, alice } = await networkHelpers.loadFixture(deployFixture);

    await usdc.write.mint([alice.account.address, 50_000n], { account: owner.account });
    await usdc.write.approve([pool.address, 50_000n], { account: alice.account });

    await viem.assertions.revertWith(
      pool.write.placeBet([0, 9_999n], { account: alice.account }),
      "Min bet 0.01 USDC",
    );
  });

  it("placeBet: transfers USDC, decreases Alice balance, and updates only chosen outcomeTotals", async () => {
    const { pool, usdc, owner, alice } = await networkHelpers.loadFixture(deployFixture);

    await usdc.write.mint([alice.account.address, 200_000n], { account: owner.account });
    await usdc.write.approve([pool.address, 200_000n], { account: alice.account });

    const aliceBefore = await usdc.read.balanceOf([alice.account.address]);

    await pool.write.placeBet([1, 100_000n], { account: alice.account });

    const poolBal = await usdc.read.balanceOf([pool.address]);
    assert.equal(poolBal, 100_000n);

    const aliceAfter = await usdc.read.balanceOf([alice.account.address]);
    assert.equal(aliceBefore - aliceAfter, 100_000n);

    const t0 = await pool.read.outcomeTotals([0n]);
    const t1 = await pool.read.outcomeTotals([1n]);
    const t2 = await pool.read.outcomeTotals([2n]);

    assert.equal(t0, 0n);
    assert.equal(t1, 100_000n);
    assert.equal(t2, 0n);
  });

  it('placeBet: reverts if pool already settled ("Pool settled")', async () => {
    const { pool, usdc, owner, alice, factory, endTime } =
      await networkHelpers.loadFixture(deployFixture);

    await usdc.write.mint([alice.account.address, 100_000n], { account: owner.account });
    await usdc.write.approve([pool.address, 100_000n], { account: alice.account });
    await pool.write.placeBet([0, 10_000n], { account: alice.account });

    await networkHelpers.time.increaseTo(endTime);
    await factory.write.settlePool([pool.address, 1], { account: owner.account }); // outcome=1 => no winners

    await viem.assertions.revertWith(
      pool.write.placeBet([0, 10_000n], { account: alice.account }),
      "Pool settled",
    );
  });


  it("placeBet: reverts if outcomeIndex >= 3", async () => {
    const { pool, usdc, owner, alice } = await networkHelpers.loadFixture(deployFixture);

    await usdc.write.mint([alice.account.address, 100_000n], { account: owner.account });
    await usdc.write.approve([pool.address, 100_000n], { account: alice.account });

    await viem.assertions.revertWith(
      pool.write.placeBet([3, 10_000n], { account: alice.account }),
      "Invalid outcome",
    );
  });

  it("placeBet: reverts after endTime (Betting closed)", async () => {
    const { pool, usdc, owner, alice, endTime } = await networkHelpers.loadFixture(deployFixture);

    await usdc.write.mint([alice.account.address, 100_000n], { account: owner.account });
    await usdc.write.approve([pool.address, 100_000n], { account: alice.account });

    await networkHelpers.time.increaseTo(endTime);

    await viem.assertions.revertWith(
      pool.write.placeBet([0, 10_000n], { account: alice.account }),
      "Betting closed",
    );
  });

  it("settle: only factory can call (Unauthorized)", async () => {
    const { pool, alice } = await networkHelpers.loadFixture(deployFixture);

    await viem.assertions.revertWith(
      pool.write.settle([0], { account: alice.account }),
      "Unauthorized",
    );
  });

  it("settle: reverts before endTime (Event ongoing)", async () => {
    const { pool, factory, owner } = await networkHelpers.loadFixture(deployFixture);
    await viem.assertions.revertWith(
      factory.write.settlePool([pool.address, 0], { account: owner.account }),
      "Event ongoing",
    );
  });

  it("settle: after endTime sets status=SETTLED and sends losing USDC to treasury (no winners)", async () => {
    const { pool, usdc, owner, alice, factory, treasury, endTime } =
      await networkHelpers.loadFixture(deployFixture);

    await usdc.write.mint([alice.account.address, 100_000n], { account: owner.account });
    await usdc.write.approve([pool.address, 100_000n], { account: alice.account });
    await pool.write.placeBet([0, 100_000n], { account: alice.account });

    await networkHelpers.time.increaseTo(endTime);

    const treasuryBefore = await usdc.read.balanceOf([treasury]);
    await factory.write.settlePool([pool.address, 1], { account: owner.account });
    const treasuryAfter = await usdc.read.balanceOf([treasury]);

    const status = await pool.read.status();
    assert.equal(status, 1);

    assert.equal(treasuryAfter - treasuryBefore, 100_000n);

    const poolBal = await usdc.read.balanceOf([pool.address]);
    assert.equal(poolBal, 0n);
  });

  it("settle: reverts if called twice (Already settled)", async () => {
    const { pool, usdc, owner, alice, factory, endTime } =
      await networkHelpers.loadFixture(deployFixture);

    // place one bet to make it realistic
    await usdc.write.mint([alice.account.address, 20_000n], { account: owner.account });
    await usdc.write.approve([pool.address, 20_000n], { account: alice.account });
    await pool.write.placeBet([0, 20_000n], { account: alice.account });

    await networkHelpers.time.increaseTo(endTime);
    await factory.write.settlePool([pool.address, 1], { account: owner.account });

    await viem.assertions.revertWith(
      factory.write.settlePool([pool.address, 1], { account: owner.account }),
      "Already settled",
    );
  });

  it("withdrawRemaining: only factory (Unauthorized)", async () => {
    const { pool, alice } = await networkHelpers.loadFixture(deployFixture);

    await viem.assertions.revertWith(
      pool.write.withdrawRemaining([], { account: alice.account }),
      "Unauthorized",
    );
  });

  it("withdrawRemaining: transfers leftover USDC to treasury when called via factory", async () => {
    const { owner, usdc, treasury, factory, pool } =
      await networkHelpers.loadFixture(deployFixture);

    await usdc.write.mint([pool.address, 55_000n], { account: owner.account });

    const treasuryBefore = await usdc.read.balanceOf([treasury]);
    const poolBefore = await usdc.read.balanceOf([pool.address]);
    assert.equal(poolBefore, 55_000n);

    await factory.write.withdrawFromPool([pool.address], { account: owner.account });

    const treasuryAfter = await usdc.read.balanceOf([treasury]);
    const poolAfter = await usdc.read.balanceOf([pool.address]);

    assert.equal(poolAfter, 0n);
    assert.equal(treasuryAfter - treasuryBefore, 55_000n);
  });
});
