# DEV_NOTES – what still needs code

## File map

| File | What goes here |
|------|----------------|
| `contracts/BetPool.sol` | Pool logic, odds curve, payout math |
| `contracts/BetPoolFactory.sol` | Creates minimal clones, fee treasury |
| `contracts/SportsOracle.sol` | Median of 3 sport APIs, auto-dispute |
| `ignition/modules/DeployAll.ts` | Hardhat-Ignition deploy script |
| `test/BetPool.test.ts` | Unit + integration tests (node:test + viem) |
| `scripts/createPool.ts` | CLI wrapper around factory |
| `scripts/placeBet.ts` | Interact with clone |
| `scripts/settle.ts` | Push result & trigger payouts |
| `scripts/dispute.ts` | Open DisputeDAO vote |

## Key formulas

```
payout = bet * oppositeReserve / (ownReserve + bet)
protocolFee = 1 % * netProfit (only winner)
disputeStake = 0.5 % * poolSize
maxDeviation = (max − min) / median
```

## Gas targets

- clone deploy <400 k gas (vs 3.1 M full deploy)
- bet transaction <120 k gas
- settle + payout <80 k gas
