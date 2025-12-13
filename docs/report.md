# Report for project: "Decentralized Betting Platform for Sports/Esports"

---

## ✅ Problem Statement

Nowday in 2025 betting feels kinda sketchy. High fees and frozen accounts are big problems in this industry today. Operators impose steep cuts, delay payouts, and can freeze funds without recourse.
Bettors are left in the dark as odds are shifted after bets close, undermining fairness. Outdated regulations exclude a global user base, limiting market growth and accessibility. Everything mentioned cost users money and creates an opportunity for a trust-less alternative.

---

## ✅ Objectives and Scope

**Project's objectives:**
- Build a minimal, secure, and extensible decentralized sports betting protocol where users place USDC bets on match outcomes and receive verifiable, tradable ERC-1155 tickets for winning bets—combining utility and digital ownership.

**Project's scope:**
- Within our project a simple version of decentralized batting platform is being realized
- No visual interface is being realized
- No oracles is provided in simple version, (cause they require to many research work for reliable sources and automatization)

---

## ✅ Requirements

### Core Stakeholders

| Role | Needs |
| --- | --- |
| Bettor | Simple UX, instant confirmation, proof of win, ability to transfer/sell tickets |
| Protocol Owner (future oracle) | Ability to create events, settle outcomes, transfer control, audit funds |
| Treasury / DAO | Secure inflow of losing bets, transparent revenue stream |
| Developers | Composable contracts, clear interfaces, test coverage, deployability across EVM chains |

---

## ✅ Functional & Non-functional Requirements

### Functional Requirements
| ID  | Requirement | Description |
|---|---|---|
| 1 | Pool Creation | Factory can deploy new EventPool with metadata (match, teams, close time) and USDC acceptance. |
| 2 | Bet Placement | Bettors can approve & bet USDC on exactly one of three outcomes before deadline. |
| 3 | Outcome Settlement | Owner (oracle) calls settlePool(outcomeIndex) after match ends. |
| 4 | Ticket Minting | Winners receive ERC-1155 tickets (1 ticket = 1 USDC won) with unique ID keccak256(poolAddress | outcome). |
| 5 | Treasury Distribution | All losing bets (USDC) are transferred to pre-configured treasury address on settlement. |
| 6 | Ownership Transfer | BettingPoolFactory supports OpenZeppelin’s Ownable2Step for safe ownership handover. |
| 7 | Ticket Uniqueness & Query | Each ticket ID maps unambiguously to a pool + outcome; metadata includes event details. |

### Non-functional Requirements
| Category  | Requirement |
|-----|------------|
| Security | No reentrancy, overflow, or front-running vulnerabilities. All external calls minimized. USDC handled via safeTransferFrom. |
| Gas Efficiency | Bets and settlement optimized for reasonable mainnet costs (< 150k gas for bet, < 300k for settlement w/ minting). |
| Transparency | All state (bets, outcomes, balances) readable on-chain. No hidden logic. |
| Maintainability | Contracts modular, documented, and follow Solidity best practices (NatSpec, custom errors). |
| Test Coverage | ≥ 95% unit test coverage (Hardhat), including edge cases (e.g., double settlement, invalid outcomes). |

---

## ✅ Approach and Design

### Architecture

- Separation of Concerns: EventPool, EventTickets, BettingPoolFactory
- Minimal Trust: Owner is required only for settlement—no control over funds during betting
- Composability: ERC-1155 tickets are fully compatible with OpenSea, Blur, and future reward/redemption contracts.

### Design

- ERC-1155: Efficient batch minting for winning bets (e.g., 100 USDC → 100 identical tickets). Lower gas, supports fungible batches per outcome.
- Per-Event Smart Contract: Isolates risk/event logic; simplifies accounting and audit. Avoids monolithic “mega-pool” complexity.
- Owner = Oracle: Balances decentralization ideal with project feasibility. Ownership transfer enables DAO transition post-MVP.
- Fixed 3 outcomes: Matches real-world football betting; avoids UI/UX complexity of variable outcomes.
- USDC-only: Reduces attack surface (no price oracles needed), aligns with stablecoin adoption in DeFi.

---

## ✅ Implementation

### Tech Stack

| Layer | Tool |
| --- | --- |
| Smart Contracts | Solidity 0.8.20, OpenZeppelin Contracts 5.0 |
| Testing | Hardhat |
| Deployment | Hardhat Ignition Modules |
| Config Management | hardhat-keystore plugin for environment secrets (USDC/Treasury addresses) |

---

## ✅ Conclusion

### BetChain delivers a focused, production-grade MVP for decentralized sports betting that prioritizes:
- User empowerment through ownership (NFT tickets as proof-of-win)
- Transparency via on-chain settlement and open accounting
- Extensibility through clean architecture and ownership transfer

While the oracle remains centralized in this iteration, the design explicitly accommodates future decentralization—e.g., switching BettingPoolFactory ownership to a Chainlink-secured DAO or multi-sig. The ERC-1155 ticket primitive opens doors for secondary markets, fan engagement platforms, and loyalty integrations.

---
