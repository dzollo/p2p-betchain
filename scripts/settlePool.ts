import hre from "hardhat";
import { getAddress, formatUnits, decodeEventLog } from "viem";

/**
 * SettlePool Script (Owner Only)
 * Settles a pool after the event concludes and triggers ERC-1155 ticket minting for winners
 *
 * Usage:
 *   npx hardhat run scripts/settlePool.ts --network <network>
 *
 * Environment variables or modify the config below:
 *   FACTORY_ADDRESS - BettingPoolFactory address
 *   POOL_ADDRESS    - EventPool address to settle
 */

// ============ CONFIGURATION ============
const CONFIG = {
  // Factory address
  factoryAddress: process.env.FACTORY_ADDRESS as `0x${string}` || "0x" as `0x${string}`,

  // Pool address to settle
  poolAddress: process.env.POOL_ADDRESS as `0x${string}` || "0x" as `0x${string}`,

  // Winning outcome
  winningOutcome: 0,
};
// =======================================

const USDC_DECIMALS = 6;

async function main() {
  console.log("SettlePool Script (Owner Only)\n");

  // Connect to network
  const { viem } = await hre.network.connect();
  const [owner] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log(`Network: ${hre.network.name}`);
  console.log(`Owner: ${owner.account.address}\n`);

  // Validate addresses
  if (CONFIG.factoryAddress === "0x" || CONFIG.factoryAddress.length !== 42) {
    console.error("Error: FACTORY_ADDRESS not set");
    process.exit(1);
  }
  if (CONFIG.poolAddress === "0x" || CONFIG.poolAddress.length !== 42) {
    console.error("Error: POOL_ADDRESS not set");
    process.exit(1);
  }

  // Get contracts
  const factory = await viem.getContractAt("BettingPoolFactory", CONFIG.factoryAddress);
  const pool = await viem.getContractAt("EventPool", CONFIG.poolAddress);

  console.log(`Factory: ${getAddress(CONFIG.factoryAddress)}`);
  console.log(`Pool: ${getAddress(CONFIG.poolAddress)}`);

  // Verify ownership
  const factoryOwner = await factory.read.owner();
  if (getAddress(factoryOwner) !== getAddress(owner.account.address)) {
    console.error(`\nError: You are not the factory owner`);
    console.log(`   Owner: ${factoryOwner}`);
    console.log(`   You:   ${owner.account.address}`);
    process.exit(1);
  }

  // Get pool info
  const description = await pool.read.description();
  const endTime = await pool.read.endTime();
  const status = await pool.read.status();

  console.log(`\nPool Info:`);
  console.log(`   Description: ${description}`);
  console.log(`   End Time: ${new Date(Number(endTime) * 1000).toISOString()}`);
  console.log(`   Status: ${Number(status) === 0 ? "ACTIVE" : "SETTLED"}`);

  // Check pool is not already settled
  if (Number(status) !== 0) {
    console.error("\nError: Pool is already settled");
    process.exit(1);
  }

  // Check betting period has ended
  const currentBlock = await publicClient.getBlock();
  const currentTimestamp = Number(currentBlock.timestamp);
  if (currentTimestamp < Number(endTime)) {
    const remaining = Number(endTime) - currentTimestamp;
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    console.error(`\nError: Betting period has not ended yet`);
    console.log(`   Time remaining: ${hours}h ${minutes}m`);
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

  // Display outcomes and totals
  console.log(`\nCurrent Pool State:`);
  let totalPool = 0n;
  for (let i = 0; i < outcomes.length; i++) {
    totalPool += outcomes[i].total;
    const marker = i === CONFIG.winningOutcome ? " ← WINNING" : "";
    console.log(`   [${i}] ${outcomes[i].name}: ${formatUnits(outcomes[i].total, USDC_DECIMALS)} USDC${marker}`);
  }
  console.log(`   ─────────────────────────────`);
  console.log(`   Total Pool: ${formatUnits(totalPool, USDC_DECIMALS)} USDC`);

  // Validate winning outcome
  if (CONFIG.winningOutcome < 0 || CONFIG.winningOutcome >= outcomes.length) {
    console.error(`\nError: Invalid winning outcome (must be 0 to ${outcomes.length - 1})`);
    process.exit(1);
  }

  const winningTotal = await pool.read.outcomeTotals([BigInt(CONFIG.winningOutcome)]);
  const losingTotal = totalPool - winningTotal;

  console.log(`\nSettlement Preview:`);
  console.log(`   Winning bets: ${formatUnits(winningTotal, USDC_DECIMALS)} USDC → ERC-1155 tickets`);
  console.log(`   Losing bets: ${formatUnits(losingTotal, USDC_DECIMALS)} USDC → Treasury`);

  // Settle pool
  console.log(`\nSettling pool with winning outcome [${CONFIG.winningOutcome}]...`);

  const settleHash = await factory.write.settlePool(
    [CONFIG.poolAddress, CONFIG.winningOutcome],
    { account: owner.account }
  );
  console.log(`   Tx hash: ${settleHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: settleHash });
  console.log(`   Block: ${receipt.blockNumber}`);
  console.log(`   Gas used: ${receipt.gasUsed}`);

  // Decode events
  const factoryArtifact = await hre.artifacts.readArtifact("BettingPoolFactory");
  const poolArtifact = await hre.artifacts.readArtifact("EventPool");

  let ticketsMinted = 0n;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: factoryArtifact.abi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        strict: false,
      });
      if (decoded.eventName === "PoolSettled") {
        const args = decoded.args as { ticketsMinted: bigint };
        ticketsMinted = args.ticketsMinted;
      }
    } catch { }

    try {
      const decoded = decodeEventLog({
        abi: poolArtifact.abi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        strict: false,
      });
      if (decoded.eventName === "Settled") {
        console.log(`\nEventPool.Settled event emitted`);
      }
    } catch { }
  }

  // Verify settlement
  const newStatus = await pool.read.status();
  console.log(`\nPool settled successfully!`);
  console.log(`   New status: ${Number(newStatus) === 1 ? "SETTLED" : "ERROR"}`);
  console.log(`   Tickets minted: ${formatUnits(ticketsMinted, USDC_DECIMALS)}`);

  // Show tickets contract
  const ticketsAddress = await factory.read.tickets();
  console.log(`\nERC-1155 Tickets Contract: ${ticketsAddress}`);
  console.log(`   Winners can check their balances there!`);

  console.log("\nDone");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
