import hre from "hardhat";
import { formatUnits, keccak256, encodePacked } from "viem";

/**
 * Test script for SettlePool (Full E2E)
 * Deploys contracts, creates pool, places bets, settles, and verifies tickets
 *
 * Usage:
 *   npx hardhat run scripts/test/testSettlePool.ts
 */

const USDC_DECIMALS = 6;

async function main() {
  console.log("Testing SettlePool Script (Full E2E)\n");

  const { viem, networkHelpers } = await hre.network.connect();
  const [owner, alice, bob] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log(`Owner: ${owner.account.address}`);
  console.log(`Alice: ${alice.account.address}`);
  console.log(`Bob: ${bob.account.address}\n`);

  // 1. Deploy contracts
  console.log("1. Deploying contracts...");
  const usdc = await viem.deployContract("MockUSDC", [owner.account.address]);
  console.log(`   MockUSDC: ${usdc.address}`);

  const treasury = owner.account.address;
  const factory = await viem.deployContract("BettingPoolFactory", [
    usdc.address,
    owner.account.address,
    treasury,
  ]);
  console.log(`   Factory: ${factory.address}`);

  const ticketsAddress = await factory.read.tickets();
  const tickets = await viem.getContractAt("EventTickets", ticketsAddress);
  console.log(`   Tickets: ${ticketsAddress}`);

  // 2. Create 1 hour pool
  console.log("\n2. Creating pool...");
  const currentBlock = await publicClient.getBlock();
  const endTime = Number(currentBlock.timestamp) + 3600;

  await factory.write.createPool(
    ["Test Match: Team A vs Team B", ["Team A", "Team B", "Draw"], endTime],
    { account: owner.account }
  );

  const poolAddress = await factory.read.allPools([0n]);
  const pool = await viem.getContractAt("EventPool", poolAddress);
  console.log(`   Pool: ${poolAddress}`);

  // 3. Fund and place bets
  console.log("\n3. Placing bets...");

  // Alice bets 50 USDC on Team A (outcome 0) - WIN
  const aliceBet = 50_000_000n;
  await usdc.write.transfer([alice.account.address, aliceBet], { account: owner.account });
  await usdc.write.approve([poolAddress, aliceBet], { account: alice.account });
  await pool.write.placeBet([0, aliceBet], { account: alice.account });
  console.log(`   Alice: ${formatUnits(aliceBet, USDC_DECIMALS)} USDC on Team A`);

  // Bob bets 30 USDC on Team B (outcome 1) - LOSE
  const bobBet = 30_000_000n;
  await usdc.write.transfer([bob.account.address, bobBet], { account: owner.account });
  await usdc.write.approve([poolAddress, bobBet], { account: bob.account });
  await pool.write.placeBet([1, bobBet], { account: bob.account });
  console.log(`   Bob: ${formatUnits(bobBet, USDC_DECIMALS)} USDC on tEAM b`);

  // 4. Using Time Machine ...
  console.log("\n4. Fast-forwarding time...");
  await networkHelpers.time.increaseTo(endTime + 1);
  console.log(`   Time moved to: ${new Date((endTime + 1) * 1000).toISOString()}`);

  // 5. Record balances before settlement
  const treasuryBalanceBefore = await usdc.read.balanceOf([treasury]);

  // 6. Settle pool (Team A wins(outcome 0))
  console.log("\n5. Settling pool (Team A wins)...");
  const winningOutcome = 0;

  const settleHash = await factory.write.settlePool(
    [poolAddress, winningOutcome],
    { account: owner.account }
  );
  await publicClient.waitForTransactionReceipt({ hash: settleHash });
  console.log(`   Settled with outcome: [${winningOutcome}] Team A`);

  // 7. Verify pool status
  const status = await pool.read.status();
  console.log(`   Pool status: ${Number(status) === 1 ? "SETTLED" : "ERROR"}`);

  // 8. Verify ERC-1155 tickets
  console.log("\n6. Verifying ERC-1155 tickets...");

  // Calculate token ID: keccak256(abi.encodePacked(poolAddress, winningOutcome)) 
  // (goes from EventTickets.sol)
  const tokenId = BigInt(
    keccak256(encodePacked(["address", "uint8"], [poolAddress, winningOutcome]))
  );

  const aliceTickets = await tickets.read.balanceOf([alice.account.address, tokenId]);
  const bobTickets = await tickets.read.balanceOf([bob.account.address, tokenId]);

  console.log(`   Alice tickets: ${formatUnits(aliceTickets, USDC_DECIMALS)} (expected: ${formatUnits(aliceBet, USDC_DECIMALS)})`);
  console.log(`   Bob tickets: ${formatUnits(bobTickets, USDC_DECIMALS)} (expected: 0)`);

  // 9. Verify treasury received losing bets
  console.log("\n7. Verifying treasury...");
  const treasuryBalanceAfter = await usdc.read.balanceOf([treasury]);
  const treasuryReceived = treasuryBalanceAfter - treasuryBalanceBefore;

  console.log(`   Treasury received: ${formatUnits(treasuryReceived, USDC_DECIMALS)} USDC (expected: ${formatUnits(bobBet, USDC_DECIMALS)})`);

  // 8. Assertions
  console.log("\n8. Running assertions...");

  if (Number(status) !== 1) {
    throw new Error("Pool status should be SETTLED (1)");
  }

  if (aliceTickets !== aliceBet) {
    throw new Error(`Alice tickets mismatch: ${aliceTickets} !== ${aliceBet}`);
  }

  if (bobTickets !== 0n) {
    throw new Error(`Bob should have 0 tickets, got: ${bobTickets}`);
  }

  if (treasuryReceived !== bobBet) {
    throw new Error(`Treasury should receive ${bobBet}, got: ${treasuryReceived}`);
  }

  console.log("   All assertions passed!");

  console.log("\n\x1b[32mTest passed! SettlePool works correctly.\x1b[0m");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
