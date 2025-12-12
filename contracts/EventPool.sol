// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EventTickets} from "./EventTickets.sol";
import {BettingPoolFactory} from "./BettingPoolFactory.sol";

contract EventPool {
    using SafeERC20 for IERC20;

    enum Status {
        ACTIVE,
        SETTLED
    }

    struct Bet {
        uint256 amount;
        uint8 outcomeIndex;
    }

    string public description;
    string[3] public outcomes;
    uint32 public endTime;
    Status public status = Status.ACTIVE;

    IERC20 public immutable usdc;
    address public immutable factoryAddress;
    BettingPoolFactory public factory;

    uint256[3] public outcomeTotals;
    mapping(address => Bet[]) public bets;
    address[] public bettors;

    event BetPlaced(address indexed bettor, uint8 outcome, uint256 amount);
    event Settled(uint8 winningOutcome, uint256 ticketsMinted);

    constructor(
        string memory _description,
        string[3] memory _outcomes,
        uint32 _endTime,
        address _usdc,
        address _factoryAddress
    ) {
        require(_endTime > block.timestamp, "End time in past");
        require(_usdc != address(0), "Invalid USDC");
        require(_factoryAddress != address(0), "Invalid factory");

        description = _description;
        outcomes = _outcomes;
        endTime = _endTime;
        usdc = IERC20(_usdc);
        factoryAddress = _factoryAddress;
        factory = BettingPoolFactory(_factoryAddress); // Safe cast after storage
    }

    function placeBet(uint8 outcomeIndex, uint256 amount) external {
        require(status == Status.ACTIVE, "Pool settled");
        require(block.timestamp < endTime, "Betting closed");
        require(outcomeIndex < 3, "Invalid outcome");
        require(amount >= 10 ** 4, "Min bet 0.01 USDC"); // 0.01 USDC min

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Track unique bettors
        if (bets[msg.sender].length == 0) {
            bettors.push(msg.sender);
        }

        bets[msg.sender].push(Bet(amount, outcomeIndex));
        outcomeTotals[outcomeIndex] += amount;

        emit BetPlaced(msg.sender, outcomeIndex, amount);
    }

    function settle(uint8 winningOutcome)
        external
        returns (address[] memory winners, uint256[] memory amounts, uint256 totalWinningBets)
    {
        require(msg.sender == address(factory), "Unauthorized");
        require(status == Status.ACTIVE, "Already settled");
        require(block.timestamp >= endTime, "Event ongoing");

        status = Status.SETTLED;

        winners = new address[](bettors.length);
        amounts = new uint256[](bettors.length);

        uint256 winnerCount;

        for (uint256 i; i < bettors.length; i++) {
            address bettor = bettors[i];
            Bet[] storage userBets = bets[bettor];

            for (uint256 j; j < userBets.length; j++) {
                if (userBets[j].outcomeIndex == winningOutcome) {
                    winners[winnerCount] = bettor;
                    amounts[winnerCount] = userBets[j].amount;
                    winnerCount++;
                    totalWinningBets += userBets[j].amount;
                }
            }
        }

        assembly {
            mstore(winners, winnerCount)
            mstore(amounts, winnerCount)
        }

        uint256 losingBets = usdc.balanceOf(address(this)) - totalWinningBets;
        if (losingBets > 0) {
            usdc.safeTransfer(factory.treasury(), losingBets);
        }

        emit Settled(winningOutcome, totalWinningBets);
        return (winners, amounts, totalWinningBets);
    }


    // Allow withdrawing leftover USDC (should be zero after settlement)
    function withdrawRemaining() external {
        require(msg.sender == address(factory), "Unauthorized");
        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) {
            usdc.safeTransfer(factory.treasury(), balance);
        }
    }
}
