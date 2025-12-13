import hre from "hardhat";
import { formatUnits } from "viem";

/**
 * Test script for PlaceBet
 * Deploys contracts, creates pool, and places bets
 *
 * Usage:
 *   npx hardhat run scripts/test/testPlaceBet.ts
 */

const USDC_DECIMALS = 6;

async function main() {
  console.log("Testing PlaceBet Script\n");

  const { viem } = await hre.network.connect();
  const [owner, alice, bob] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log(`Owner: ${owner.account.address}`);
  console.log(`Alice: ${alice.account.address}`);
  console.log(`Bob: ${bob.account.address}\n`);

  // 1. Deploy contracts
  console.log("Deploying contracts...");
  const usdc = await viem.deployContract("MockUSDC", [owner.account.address]);
  console.log(`   MockUSDC: ${usdc.address}`);

  const factory = await viem.deployContract("BettingPoolFactory", [
    usdc.address,
    owner.account.address,
    owner.account.address, // treasury
  ]);
  console.log(`   Factory: ${factory.address}`);

  // 2. Create pool
  console.log("\nCreating pool...");
  const currentBlock = await publicClient.getBlock();
  const endTime = Number(currentBlock.timestamp) + 3600; // 1 hour

  await factory.write.createPool(
    ["Test Match: Team A vs Team B", ["Team A", "Team B", "Draw"], endTime],
    { account: owner.account }
  );

  const poolAddress = await factory.read.allPools([0n]);
  const pool = await viem.getContractAt("EventPool", poolAddress);
  console.log(`   Pool: ${poolAddress}`);

  // 3. Fund Alice and Bob with USDC
  console.log("\nFunding bettors with USDC...");
  const aliceAmount = 100_000_000n; // 100 USDC
  const bobAmount = 50_000_000n;    // 50 USDC

  await usdc.write.transfer([alice.account.address, aliceAmount], { account: owner.account });
  await usdc.write.transfer([bob.account.address, bobAmount], { account: owner.account });

  console.log(`   Alice: ${formatUnits(aliceAmount, USDC_DECIMALS)} USDC`);
  console.log(`   Bob: ${formatUnits(bobAmount, USDC_DECIMALS)} USDC`);

  // 4. Alice bets on Team A (outcome 0)
  console.log("\nAlice placing bet on Team A...");
  const aliceBet = 25_000_000n; // 25 USDC

  await usdc.write.approve([poolAddress, aliceBet], { account: alice.account });
  await pool.write.placeBet([0, aliceBet], { account: alice.account });

  console.log(`   Bet: ${formatUnits(aliceBet, USDC_DECIMALS)} USDC on Team A`);

  // 5. Bob bets on Team B (outcome 1)
  console.log("\nBob placing bet on Team B...");
  const bobBet = 15_000_000n; // 15 USDC

  await usdc.write.approve([poolAddress, bobBet], { account: bob.account });
  await pool.write.placeBet([1, bobBet], { account: bob.account });

  console.log(`   Bet: ${formatUnits(bobBet, USDC_DECIMALS)} USDC on Team B`);

  // 6. Verify pool state
  console.log("\nPool State:");

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

  let totalPool = 0n;
  for (let i = 0; i < outcomes.length; i++) {
    totalPool += outcomes[i].total;
    console.log(`   [${i}] ${outcomes[i].name}: ${formatUnits(outcomes[i].total, USDC_DECIMALS)} USDC`);
  }
  console.log(`   ─────────────────────────────`);
  console.log(`   Total: ${formatUnits(totalPool, USDC_DECIMALS)} USDC`);

  // 7. Verify balances
  console.log("\nRemaining USDC balances:");
  const aliceBalance = await usdc.read.balanceOf([alice.account.address]);
  const bobBalance = await usdc.read.balanceOf([bob.account.address]);
  const poolBalance = await usdc.read.balanceOf([poolAddress]);

  console.log(`   Alice: ${formatUnits(aliceBalance, USDC_DECIMALS)} USDC`);
  console.log(`   Bob: ${formatUnits(bobBalance, USDC_DECIMALS)} USDC`);
  console.log(`   Pool: ${formatUnits(poolBalance, USDC_DECIMALS)} USDC`);

  // 8. Assertions
  console.log("\n8. Running assertions...");

  const expectedAlice = aliceAmount - aliceBet;
  const expectedBob = bobAmount - bobBet;
  const expectedPool = aliceBet + bobBet;

  if (aliceBalance !== expectedAlice) {
    throw new Error(`Alice balance mismatch: ${aliceBalance} !== ${expectedAlice}`);
  }
  if (bobBalance !== expectedBob) {
    throw new Error(`Bob balance mismatch: ${bobBalance} !== ${expectedBob}`);
  }
  if (poolBalance !== expectedPool) {
    throw new Error(`Pool balance mismatch: ${poolBalance} !== ${expectedPool}`);
  }

  console.log("\n\x1b[32mTest passed! PlaceBet works correctly.\x1b[0m");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
