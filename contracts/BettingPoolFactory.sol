// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EventTickets} from "./EventTickets.sol";
import {EventPool} from "./EventPool.sol";

contract BettingPoolFactory is Ownable {
    IERC20 public immutable usdc;
    EventTickets public immutable tickets;
    address[] public allPools;
    address public treasury; // Where losing bets go

    event PoolCreated(address pool, string description);
    event PoolSettled(
        address pool,
        uint8 winningOutcome,
        uint256 ticketsMinted
    );

    constructor(
        address _usdc,
        address _initialOwner,
        address _treasury
    ) Ownable(_initialOwner) {
        require(_usdc != address(0), "Invalid USDC");
        require(_treasury != address(0), "Invalid treasury");

        usdc = IERC20(_usdc);
        treasury = _treasury;

        // Deploy ERC-1155 tickets contract (this factory owns it)
        tickets = new EventTickets(address(this));
    }

    function createPool(
        string calldata description,
        string[3] calldata outcomes,
        uint32 endTime
    ) external onlyOwner returns (address) {
        require(endTime > block.timestamp, "End time in past");
        require(outcomes.length == 3, "Only 3-way markets");

        EventPool newPool = new EventPool(
            description,
            outcomes,
            endTime,
            address(usdc),
            address(this) // Safe plain address
        );

        allPools.push(address(newPool));
        emit PoolCreated(address(newPool), description);
        return address(newPool);
    }

function settlePool(address pool, uint8 winningOutcome) external onlyOwner {
    (address[] memory winners, uint256[] memory amounts, uint256 totalWinningBets) =
        EventPool(pool).settle(winningOutcome);

    uint256 ticketsMinted = 0;
    if (winners.length > 0) {
        tickets.mintWinningTickets(winners, amounts, pool, winningOutcome);

        ticketsMinted = totalWinningBets;
    }

    emit PoolSettled(pool, winningOutcome, ticketsMinted);
}

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function withdrawFromPool(address pool) external onlyOwner {
        EventPool(pool).withdrawRemaining();
    }
}
