import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * DeployAll Ignition Module – TEMPLATE
 * Replace the placeholder values below with real addresses before deploying.
 */

const DeployAll = buildModule("DeployAll", (m) => {
  // 1. BetPool implementation (logic for clones)
  const impl = m.contract("BetPool", []);

  // 2. SportsOracle – update addresses & names
  const oracle = m.contract("SportsOracle", [
    [
      "0xYOUR_API3_UPDATER",      // <-- change me
      "0xYOUR_CHAINLINK_UPDATER", // <-- change me
      "0xYOUR_SELF_HOST_UPDATER", // <-- change me
    ],
    ["API3", "Chainlink", "SelfHost"], // <-- optional: rename
  ]);

  // 3. BetPoolFactory – update treasury & fee
  const factory = m.contract("BetPoolFactory", [
    impl,
    "0xYOUR_TREASURY", // <-- change me (DAO/multi-sig/EOA)
    100n,              // <-- change me (100 = 1 % fee)
  ]);

  return { impl, oracle, factory };
});

export default DeployAll;