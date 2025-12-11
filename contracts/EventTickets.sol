// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Pausable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract EventTickets is ERC1155, Ownable, ERC1155Pausable {
    // Mapping: tokenID -> (poolAddress + outcomeIndex)
    mapping(uint256 => bytes32) public ticketDetails;

    event TicketsMinted(
        address indexed pool,
        uint8 indexed outcome,
        uint256 tokenId,
        address[] winners,
        uint256[] amounts
    );

    constructor(
        address initialOwner
    )
        ERC1155("ipfs://QmYqTb6dJqZQZvX9Y9J9J9J9J9J9J9J9J9J9J9J9J9J/{id}.json")
        Ownable(initialOwner)
    {}

    function setURI(string memory newuri) public onlyOwner {
        _setURI(newuri);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // CRITICAL: Only factory can mint winning tickets
    function mintWinningTickets(
        address[] calldata winners,
        uint256[] calldata amounts,
        address poolAddress,
        uint8 winningOutcome
    ) external onlyOwner whenNotPaused {
        require(winners.length == amounts.length, "Array mismatch");
        require(winners.length > 0, "No winners");

        // Generate deterministic token ID: keccak256(pool + outcome)
        uint256 tokenId = uint256(
            keccak256(abi.encodePacked(poolAddress, winningOutcome))
        );
        ticketDetails[tokenId] = keccak256(
            abi.encodePacked(poolAddress, winningOutcome)
        );

        // Batch mint to all winners
        for (uint256 i = 0; i < winners.length; i++) {
            _mint(winners[i], tokenId, amounts[i], "");
        }

        emit TicketsMinted(
            poolAddress,
            winningOutcome,
            tokenId,
            winners,
            amounts
        );
    }

    // The following functions are overrides required by Solidity.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Pausable) {
        super._update(from, to, ids, values);
    }
}
