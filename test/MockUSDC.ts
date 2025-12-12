import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress } from "viem";

const { viem, networkHelpers } = await hre.network.connect();

describe("MockUSDC", () => {
  async function deployFixture() {
    const [owner, alice, bob] = await viem.getWalletClients();
    const usdc = await viem.deployContract("MockUSDC", [owner.account.address]);
    return { usdc, owner, alice, bob };
  }

  it("decimals() == 6", async () => {
    const { usdc } = await networkHelpers.loadFixture(deployFixture);
    const d = await usdc.read.decimals();
    assert.equal(d, 6);
  });

  it("mints 1_000_000 * 10^6 to initialOwner in constructor", async () => {
    const { usdc, owner } = await networkHelpers.loadFixture(deployFixture);
    const ownerBalance = await usdc.read.balanceOf([owner.account.address]);
    assert.equal(ownerBalance, 1_000_000n * 10n ** 6n);
  });

  it("owner can mint(to, amount)", async () => {
    const { usdc, owner, alice } = await networkHelpers.loadFixture(deployFixture);
    const amount = 100_000n;

    await usdc.write.mint([alice.account.address, amount], {
      account: owner.account,
    });

    const aliceBalance = await usdc.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, amount);
  });

  it("non-owner cannot mint()", async () => {
    const { usdc, alice, bob } = await networkHelpers.loadFixture(deployFixture);

    await viem.assertions.revertWithCustomErrorWithArgs(
      usdc.write.mint([bob.account.address, 1n], { account: alice.account }),
      usdc,
      "OwnableUnauthorizedAccount",
      [getAddress(alice.account.address)],
    );
  });


  it("burn(amount) burns caller balance", async () => {
    const { usdc, owner, alice } = await networkHelpers.loadFixture(deployFixture);

    // give Alice some tokens
    await usdc.write.mint([alice.account.address, 100_000n], { account: owner.account });

    await usdc.write.burn([10_000n], { account: alice.account });

    const aliceBalance = await usdc.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, 90_000n);
  });

  it("rescueERC20 transfers other ERC20 tokens to owner", async () => {
    const { usdc, owner } = await networkHelpers.loadFixture(deployFixture);

    // Deploy a second token to rescue (reuse MockUSDC as generic ERC20)
    const other = await viem.deployContract("MockUSDC", [owner.account.address]);

    // Send some "other" tokens into usdc contract address
    await other.write.transfer([usdc.address, 10_000n], { account: owner.account });

    const ownerBefore = await other.read.balanceOf([owner.account.address]);
    await usdc.write.rescueERC20([other.address, 10_000n], { account: owner.account });
    const ownerAfter = await other.read.balanceOf([owner.account.address]);

    assert.equal(ownerAfter - ownerBefore, 10_000n);
  });

  it("rescueERC20 cannot rescue self", async () => {
    const { usdc, owner } = await networkHelpers.loadFixture(deployFixture);
    await viem.assertions.revertWith(
      usdc.write.rescueERC20([usdc.address, 1n], { account: owner.account }),
      "Cannot rescue self"
    );
  });
});
