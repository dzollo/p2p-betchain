import hre from "hardhat";
import { getAddress, formatUnits, parseUnits } from "viem";

/**
 * PlaceBet Script
 * Places a USDC bet on a specific outcome in an EventPool
 *
 * Usage:
 *   npx hardhat run scripts/placeBet.ts --network <network>
 *
 * Environment variables or modify the config below:
 *   POOL_ADDRESS - EventPool address to bet on
 *   USDC_ADDRESS - USDC token address
 */

// ============ CONFIGURATION ============
const CONFIG = {
  // Pool address to place bet on
  poolAddress: process.env.POOL_ADDRESS as `0x${string}` || "0x" as `0x${string}`,

  // USDC token address
  usdcAddress: process.env.USDC_ADDRESS as `0x${string}` || "0x" as `0x${string}`,

  // Bet parameters
  bet: {
    outcomeIndex: 0,
    amount: "1.00", // USDC amount (human readable, e.g., "10.50")
  },
};
// =======================================

const USDC_DECIMALS = 6;
const MIN_BET = 10_000n; // 0.01 USDC

async function main() {
  console.log("PlaceBet Script\n");

  // Connect to network
  const { viem } = await hre.network.connect();
  const [bettor] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log(`Network: ${hre.network.name}`);
  console.log(`Bettor: ${bettor.account.address}\n`);

  // Validate addresses
  if (CONFIG.poolAddress === "0x" || CONFIG.poolAddress.length !== 42) {
    console.error("Error: POOL_ADDRESS not set");
    process.exit(1);
  }
  if (CONFIG.usdcAddress === "0x" || CONFIG.usdcAddress.length !== 42) {
    console.error("Error: USDC_ADDRESS not set");
    process.exit(1);
  }

  // Get contracts
  const pool = await viem.getContractAt("EventPool", CONFIG.poolAddress);
  const usdc = await viem.getContractAt("MockUSDC", CONFIG.usdcAddress);

  console.log(`Pool: ${getAddress(CONFIG.poolAddress)}`);
  console.log(`USDC: ${getAddress(CONFIG.usdcAddress)}`);

  // Get pool info
  const description = await pool.read.description();
  const endTime = await pool.read.endTime();
  const status = await pool.read.status();

  console.log(`\nPool Info:`);
  console.log(`   Description: ${description}`);
  console.log(`   End Time: ${new Date(Number(endTime) * 1000).toISOString()}`);
  console.log(`   Status: ${Number(status) === 0 ? "ACTIVE" : "SETTLED"}`);

  // Check pool is active
  if (Number(status) !== 0) {
    console.error("\nError: Pool is already settled");
    process.exit(1);
  }

  // Check betting window
  const currentBlock = await publicClient.getBlock();
  const currentTimestamp = Number(currentBlock.timestamp);
  if (currentTimestamp >= Number(endTime)) {
    console.error("\nError: Betting window has closed");
    process.exit(1);
  }

  // Read outcomes
  const outcomes: { name: string; total: bigint }[] = [];
  for (let i = 0; ; i++) {
    try {
      const name = await pool.read.outcomes([BigInt(i)]);
      if (!name) break;
      const total = await pool.read.outcomeTotals([BigInt(i)]);
      outcomes.push({ name, total });
    } catch {
      break;
    }
  }

  // Display outcomes
  console.log(`\n   Outcomes:`);
  for (let i = 0; i < outcomes.length; i++) {
    const marker = i === CONFIG.bet.outcomeIndex ? " ← YOUR BET" : "";
    console.log(`     [${i}] ${outcomes[i].name}: ${formatUnits(outcomes[i].total, USDC_DECIMALS)} USDC${marker}`);
  }

  // Validate outcome index
  if (CONFIG.bet.outcomeIndex < 0 || CONFIG.bet.outcomeIndex >= outcomes.length) {
    console.error(`\nError: Invalid outcome index (must be 0 to ${outcomes.length - 1})`);
    process.exit(1);
  }

  // Parse bet amount
  const betAmount = parseUnits(CONFIG.bet.amount, USDC_DECIMALS);
  if (betAmount < MIN_BET) {
    console.error(`\nError: Minimum bet is 0.01 USDC`);
    process.exit(1);
  }

  console.log(`\nBet Details:`);
  console.log(`   Outcome: [${CONFIG.bet.outcomeIndex}] ${await pool.read.outcomes([BigInt(CONFIG.bet.outcomeIndex)])}`);
  console.log(`   Amount: ${CONFIG.bet.amount} USDC`);

  // Check USDC balance
  const balance = await usdc.read.balanceOf([bettor.account.address]);
  console.log(`\n   Your USDC balance: ${formatUnits(balance, USDC_DECIMALS)} USDC`);

  if (balance < betAmount) {
    console.error(`\nError: Insufficient USDC balance`);
    process.exit(1);
  }

  // Check allowance and approve if needed
  const allowance = await usdc.read.allowance([bettor.account.address, CONFIG.poolAddress]);
  console.log(`   Current allowance: ${formatUnits(allowance, USDC_DECIMALS)} USDC`);

  if (allowance < betAmount) {
    console.log(`\nApproving USDC spend...`);
    const approveHash = await usdc.write.approve(
      [CONFIG.poolAddress, betAmount],
      { account: bettor.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`   Approved: ${approveHash}`);
  }

  // Place bet
  console.log(`\nPlacing bet...`);
  const betHash = await pool.write.placeBet(
    [CONFIG.bet.outcomeIndex, betAmount],
    { account: bettor.account }
  );
  console.log(`   Tx hash: ${betHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: betHash });
  console.log(`   Block: ${receipt.blockNumber}`);
  console.log(`   Gas used: ${receipt.gasUsed}`);

  // Show updated totals
  console.log(`\nUpdated Pool Totals:`);
  for (let i = 0; i < outcomes.length; i++) {
    const total = await pool.read.outcomeTotals([BigInt(i)]);
    console.log(`   [${i}] ${outcomes[i].name}: ${formatUnits(total, USDC_DECIMALS)} USDC`);
  }

  console.log("\nBet placed successfully! Good luck!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
