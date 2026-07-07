// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PayToken
 * @notice Mintable test ERC-20 for Amoy demos. Payments go through PaymentForwarder, not this contract directly.
 */
contract PayToken is ERC20, Ownable {
    constructor() ERC20("Moo Test Token", "MOO") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
