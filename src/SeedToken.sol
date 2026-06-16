// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/// @title SeedToken — ERC20 used for staking in YieldGarden
contract SeedToken is ERC20 {
    constructor() ERC20("Seed Token", "SEED") {}

    /// @notice Anyone can mint for testing on testnet
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
