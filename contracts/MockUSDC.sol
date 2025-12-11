// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDC is ERC20, Ownable {
    constructor(
        address initialOwner
    ) ERC20("Mock USDC", "mUSDC") Ownable(initialOwner) {
        // Mint 1 million tokens to owner (6 decimals like real USDC)
        _mint(initialOwner, 1_000_000 * 10 ** 6);
    }

    /**
     * @dev Mint tokens to a specific address
     * @param to Address to receive tokens
     * @param amount Amount to mint (in 6 decimal units)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens from caller's balance
     * @param amount Amount to burn (in 6 decimal units)
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @dev Rescue accidentally sent ERC20 tokens
     * @param token Address of token to rescue
     * @param amount Amount to rescue
     */
    function rescueERC20(address token, uint256 amount) external onlyOwner {
        require(token != address(this), "Cannot rescue self");
        ERC20(token).transfer(owner(), amount);
    }

    /**
     * @dev Rescue accidentally sent ETH
     */
    function rescueETH() external onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        require(success, "ETH rescue failed");
    }

    // The following functions are overrides required by Solidity.

    function decimals() public pure override returns (uint8) {
        return 6; // USDC uses 6 decimals
    }
}
