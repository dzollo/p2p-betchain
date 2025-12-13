import hre from "hardhat";
// import { getAddress } from "viem";

/**
 * Test script for CreatePool script
 * Deploys all contracts and creates a test pool
 *
 * Usage:
 *   npx hardhat run scripts/test/testCreatePool.ts
 */

async function main() {
  console.log("Testing CreatePool Script\n");

  // Connect to network
  const { viem } = await hre.network.connect();
  const [owner] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  // console.log(`Network: ${hre.network.name}`);
  console.log(`Owner: ${owner.account.address}\n`);

  // 1. Deploy MockUSDC
  console.log("Deploying MockUSDC...");
  const usdc = await viem.deployContract("MockUSDC", [owner.account.address]);
  console.log(`   MockUSDC: ${usdc.address}`);

  // 2. Deploy BettingPoolFactory
  console.log("Deploying BettingPoolFactory...");
  const treasury = owner.account.address; // Use owner as treasury for testing
  const factory = await viem.deployContract("BettingPoolFactory", [
    usdc.address,
    owner.account.address,
    treasury,
  ]);
  console.log(`   Factory: ${factory.address}`);

  // 3. Get tickets address
  const ticketsAddr = await factory.read.tickets();
  console.log(`   Tickets: ${ticketsAddr}`);

  // 4. Create a test pool
  console.log("\nCreating test pool...");

  const description = "Champions League Final: Real Madrid vs Manchester City";
  const outcomes = ["Real Madrid", "Manchester City", "Draw"] as const;

  // Get current timestamp and set end time to 24 hours from now
  const currentBlock = await publicClient.getBlock();
  const currentTimestamp = Number(currentBlock.timestamp);
  const endTime = currentTimestamp + 24 * 60 * 60;

  console.log(`   Description: ${description}`);
  console.log(`   Outcomes: [${outcomes.join(", ")}]`);
  console.log(`   End Time: ${new Date(endTime * 1000).toISOString()}`);

  const hash = await factory.write.createPool(
    [description, [...outcomes], endTime],
    { account: owner.account }
  );
  console.log(`   Tx hash: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   Gas used: ${receipt.gasUsed}`);

  // 5. Verify pool was created
  const poolAddress = await factory.read.allPools([0n]);
  console.log(`\nPool created: ${poolAddress}`);

  // 6. Verify pool data
  const pool = await viem.getContractAt("EventPool", poolAddress);

  console.log("\nPool Verification:");
  console.log(`   Description: ${await pool.read.description()}`);
  console.log(`   Outcome 0: ${await pool.read.outcomes([0n])}`);
  console.log(`   Outcome 1: ${await pool.read.outcomes([1n])}`);
  console.log(`   Outcome 2: ${await pool.read.outcomes([2n])}`);
  console.log(`   End Time: ${new Date(Number(await pool.read.endTime()) * 1000).toISOString()}`);
  console.log(`   Status: ${Number(await pool.read.status()) === 0 ? "ACTIVE" : "SETTLED"}`);

  console.log("\n\x1b[32mTest passed! CreatePool works correctly.\x1b[0m");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
