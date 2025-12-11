import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CoreBettingSystem", (m) => {
  // Get deployer account (first account in network config)
  const deployer = m.getAccount(0);

  // Get required parameters - WILL FAIL if not set
  const usdcAddress = m.getParameter("USDC_ADDRESS");
  const treasuryAddress = m.getParameter("TREASURY_ADDRESS");

  // Deploy Betting Pool Factory (automatically creates EventTickets)
  const bettingPoolFactory = m.contract("BettingPoolFactory", [
    usdcAddress,      // Real USDC token address
    deployer,         // Owner
    treasuryAddress   // Treasury for losing bets
  ], {
    id: "BettingPoolFactory"
  });

  return { bettingPoolFactory };
});