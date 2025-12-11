# ⚽ BetChain - Decentralized Sports Betting Protocol

Simple, secure betting where winners receive ERC-1155 tickets as proof of winning bets

## Architecture Overview

```mermaid
graph TD
    A[Owner/Oracle] -->|Deploys| B[BettingPoolFactory]
    B -->|Owns| C[EventTickets ERC-1155]
    B -->|Creates| D[EventPool 1]
    B -->|Creates| E[EventPool 2]
    B -->|Creates| F[...]
    
    G[Bettor] -->|Bets USDC on outcomes| D
    H[Bettor] -->|Bets USDC on outcomes| E
    
    A -->|Settles pools| D
    A -->|Settles pools| E
    
    D -->|Requests minting| B
    E -->|Requests minting| B
    
    B -->|Mints tickets| C
    C -->|Sends tickets| G
    C -->|Sends tickets| H
    
    D -->|Sends losing bets| I[Treasury]
    E -->|Sends losing bets| I
    
    classDef owner fill:#FF9E9E,stroke:#E63946
    classDef factory fill:#A8E6CF,stroke:#2A9D8F
    classDef tickets fill:#FFD166,stroke:#E9C46A
    classDef pool fill:#9ECCFF,stroke:#1D3557
    classDef bettor fill:#D8C4F7,stroke:#7209B7
    classDef treasury fill:#FF6B6B,stroke:#B22222
    
    class A owner
    class B factory
    class C tickets
    class D,E pool
    class G,H bettor
    class I treasury
```

### Key Contract Relationships

1. **BettingPoolFactory (Owner)**  
   - Deploys and owns the `EventTickets` ERC-1155 contract
   - Creates `EventPool` instances for each betting event
   - **Can be transferred** to a DAO or multi-sig wallet using `transferOwnership()`
   - Acts as the **oracle** that settles pools and decides winners

2. **EventPool (Per-Event Contract)**  
   - Accepts USDC bets on 3 outcomes (Home/Draw/Away)
   - Stores all bets until settlement
   - When settled by owner:
     - Requests ticket minting for winners
     - Sends losing bets to treasury

3. **EventTickets (ERC-1155)**  
   - Mints unique tickets for each winning outcome
   - Ticket ID format: `keccak256(poolAddress + outcomeIndex)`
   - 1 ticket = 1 USDC winning bet (1:1 ratio)
   - Tickets are tradable NFTs

### Oracle/Owner Flexibility

- The **deployer starts as owner** but can transfer ownership via:

  ```solidity
  bettingPoolFactory.transferOwnership(newOwnerAddress);
  ```

- In production, this would be transferred to:
  - A multi-sig wallet (e.g., Gnosis Safe)
  - A DAO governance contract
  - A decentralized oracle network (future upgrade)
- The owner's **only critical role** is to call `settlePool()` with the correct outcome after events conclude

### Getting Started

```bash
# Set configuration variables (one-time)
npx hardhat keystore set USDC_ADDRESS
npx hardhat keystore set TREASURY_ADDRESS

# Deploy to any network
npx hardhat ignition deploy ignition/modules/DeployCore.ts --network mumbai

# Create a betting pool
npx hardhat run scripts/createPool.ts --network mumbai
```

> **Note**: This is a minimal MVP. The owner/oracle role is intentionally simple for university project scope. Production systems would add decentralized oracle networks and governance controls.
