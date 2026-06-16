// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../src/SeedToken.sol";
import "../src/YieldGarden.sol";

contract Deploy is Script {
    // 1 wei reward per whole SEED token per second
    uint256 constant REWARD_RATE = 1;

    function run() external {
        vm.startBroadcast();

        SeedToken seed = new SeedToken();
        console.log("SeedToken deployed at:", address(seed));

        YieldGarden garden = new YieldGarden(address(seed), REWARD_RATE, msg.sender);
        console.log("YieldGarden deployed at:", address(garden));

        vm.stopBroadcast();
    }
}
