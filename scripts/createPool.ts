import hre from "hardhat";
import { getAddress } from "viem";

/**
 * CreatePool Script
 * Creates a new betting pool via BettingPoolFactory
 *
 * Usage:
 *   npx hardhat run scripts/createPool.ts --network <network>
 * 
 * Environment variables or modify the config below:
 *   FACTORY_ADDRESS - BettingPoolFactory аddress
 */

// ============ CONFIGURATION ============
const CONFIG = {
  // Set via env or hardcode after deployment)
  factoryAddress: process.env.FACTORY_ADDRESS as `0x${string}` || "0x" as `0x${string}`,

  // Pool parameters
  pool: {
    description: "Champions League Final: Real Madrid vs Manchester City",
    outcomes: ["Real Madrid", "Manchester City", "Draw"] as const,
    endTimeOffset: 60 * 60 * 24, // 24 hours from now
  },
};
// =======================================

async function main() {
  console.log("CreatePool Script\n");

  // Connect to network
  const { viem } = await hre.network.connect();
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log(`Network: ${hre.network.name}`);
  console.log(`Deployer: ${deployer.account.address}\n`);

  // Validate factory address
  if (CONFIG.factoryAddress === "0x" || CONFIG.factoryAddress.length !== 42) {
    console.error("Error: FACTORY_ADDRESS not set");
    console.log("Set it via environment variable or modify CONFIG in this script");
    process.exit(1);
  }

  // Get factory contract
  const factory = await viem.getContractAt("BettingPoolFactory", CONFIG.factoryAddress);
  console.log(`Factory: ${getAddress(CONFIG.factoryAddress)}`);

  // Verify ownership
  const owner = await factory.read.owner();
  if (getAddress(owner) !== getAddress(deployer.account.address)) {
    console.error(`Error: You are not the owner of this factory`);
    console.log(`   Owner: ${owner}`);
    console.log(`   You:   ${deployer.account.address}`);
    process.exit(1);
  }

  // Calculate end time
  const currentBlock = await publicClient.getBlock();
  const currentTimestamp = Number(currentBlock.timestamp);
  const endTime = currentTimestamp + CONFIG.pool.endTimeOffset;

  console.log("\nPool Parameters:");
  console.log(`   Description: ${CONFIG.pool.description}`);
  console.log(`   Outcomes: [${CONFIG.pool.outcomes.join(", ")}]`);
  console.log(`   End Time: ${new Date(endTime * 1000).toISOString()}`);
  console.log(`   (${CONFIG.pool.endTimeOffset / 3600} hours from now)\n`);

  // Create pool
  console.log("Creating pool...");

  const hash = await factory.write.createPool(
    [CONFIG.pool.description, [...CONFIG.pool.outcomes], endTime],
    { account: deployer.account }
  );

  console.log(`   Tx hash: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`   Block: ${receipt.blockNumber}`);
  console.log(`   Gas used: ${receipt.gasUsed}`);

  // Get created pool address
  const allPoolsCount = await factory.read.allPools.length;
  // Read the last pool from array
  let poolIndex = 0n;
  let poolAddress: `0x${string}` | null = null;

  // Find the latest pool
  while (true) {
    try {
      poolAddress = await factory.read.allPools([poolIndex]);
      poolIndex++;
    } catch {
      break;
    }
  }

  if (poolAddress) {
    // Get actual last pool address
    poolAddress = await factory.read.allPools([poolIndex - 1n]);
    console.log(`\nPool created successfully!`);
    console.log(`   Pool Address: ${poolAddress}`);
    console.log(`   Pool Index: ${poolIndex - 1n}`);

    // Verify pool data
    const pool = await viem.getContractAt("EventPool", poolAddress);
    const desc = await pool.read.description();
    console.log(`\nVerification:`);
    console.log(`   Description: ${desc}`);
    console.log(`   Outcome 0: ${await pool.read.outcomes([0n])}`);
    console.log(`   Outcome 1: ${await pool.read.outcomes([1n])}`);
    console.log(`   Outcome 2: ${await pool.read.outcomes([2n])}`);
  }

  console.log("\nDone!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
