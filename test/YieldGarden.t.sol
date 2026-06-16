// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/YieldGarden.sol";
import "../src/SeedToken.sol";

contract YieldGardenTest is Test {
    YieldGarden public garden;
    SeedToken public seed;

    address owner = address(0x1);
    address alice = address(0x2);
    address bob = address(0x3);
    address stranger = address(0x99);

    // 1 wei per token per second → easy math in tests
    uint256 constant RATE = 1;

    function setUp() public {
        vm.startPrank(owner);
        seed = new SeedToken();
        garden = new YieldGarden(address(seed), RATE, owner);
        // fund reward pool
        vm.deal(owner, 100 ether);
        (bool ok,) = address(garden).call{value: 10 ether}("");
        require(ok);
        vm.stopPrank();

        // mint tokens to users
        seed.mint(alice, 1000 ether);
        seed.mint(bob, 500 ether);

        // approve garden
        vm.prank(alice);
        seed.approve(address(garden), type(uint256).max);
        vm.prank(bob);
        seed.approve(address(garden), type(uint256).max);
    }

    // ─── stake ────────────────────────────────────────────────────────────────

    function test_stake_recordsStake() public {
        vm.prank(alice);
        garden.stake(100 ether);

        (uint256 amount,) = garden.stakes(alice);
        assertEq(amount, 100 ether);
        assertEq(garden.totalStaked(), 100 ether);
    }

    function test_stake_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit YieldGarden.Staked(alice, 100 ether);

        vm.prank(alice);
        garden.stake(100 ether);
    }

    function test_stake_revertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(YieldGarden.ZeroAmount.selector);
        garden.stake(0);
    }

    function test_stake_revertsIfAlreadyStaking() public {
        vm.startPrank(alice);
        garden.stake(100 ether);

        vm.expectRevert(YieldGarden.AlreadyStaking.selector);
        garden.stake(50 ether);
        vm.stopPrank();
    }

    // ─── pendingRewards ───────────────────────────────────────────────────────

    function test_pendingRewards_zeroBeforeStake() public view {
        assertEq(garden.pendingRewards(alice), 0);
    }

    function test_pendingRewards_accruesTotalOverTime() public {
        vm.prank(alice);
        garden.stake(100 ether);

        vm.warp(block.timestamp + 10);

        // (100e18 units * 1 wei/token/s * 10s) / 1e18 = 1000 wei
        assertEq(garden.pendingRewards(alice), 1000);
    }

    function test_pendingRewards_proportionalToAmount() public {
        vm.prank(alice);
        garden.stake(200 ether);
        vm.prank(bob);
        garden.stake(100 ether);

        vm.warp(block.timestamp + 5);

        // alice staked 2x bob → 2x rewards
        assertEq(garden.pendingRewards(alice), garden.pendingRewards(bob) * 2);
    }

    // ─── claimRewards ─────────────────────────────────────────────────────────

    function test_claimRewards_sendsEth() public {
        vm.prank(alice);
        garden.stake(100 ether);

        vm.warp(block.timestamp + 100);

        uint256 expected = garden.pendingRewards(alice);
        uint256 balanceBefore = alice.balance;

        vm.prank(alice);
        garden.claimRewards();

        assertEq(alice.balance, balanceBefore + expected);
    }

    function test_claimRewards_emitsEvent() public {
        vm.prank(alice);
        garden.stake(100 ether);

        vm.warp(block.timestamp + 10);

        uint256 expected = garden.pendingRewards(alice);

        vm.expectEmit(true, false, false, true);
        emit YieldGarden.RewardsClaimed(alice, expected);

        vm.prank(alice);
        garden.claimRewards();
    }

    function test_claimRewards_resetsAccrual() public {
        vm.prank(alice);
        garden.stake(100 ether);

        vm.warp(block.timestamp + 10);
        vm.prank(alice);
        garden.claimRewards();

        // immediately after claim, pending should be ~0
        assertEq(garden.pendingRewards(alice), 0);
    }

    function test_claimRewards_revertsIfNoRewards() public {
        vm.prank(alice);
        garden.stake(100 ether);

        // no time has passed
        vm.prank(alice);
        vm.expectRevert(YieldGarden.NoRewards.selector);
        garden.claimRewards();
    }

    function test_claimRewards_revertsIfNotStaking() public {
        vm.prank(stranger);
        vm.expectRevert(YieldGarden.NoRewards.selector);
        garden.claimRewards();
    }

    // ─── unstake ──────────────────────────────────────────────────────────────

    function test_unstake_returnsTokens() public {
        uint256 balanceBefore = seed.balanceOf(alice);

        vm.prank(alice);
        garden.stake(100 ether);

        vm.warp(block.timestamp + 1);

        vm.prank(alice);
        garden.unstake();

        assertEq(seed.balanceOf(alice), balanceBefore);
    }

    function test_unstake_alsoPaysRewards() public {
        vm.prank(alice);
        garden.stake(100 ether);

        vm.warp(block.timestamp + 50);

        uint256 expectedReward = garden.pendingRewards(alice);
        uint256 ethBefore = alice.balance;

        vm.prank(alice);
        garden.unstake();

        assertEq(alice.balance, ethBefore + expectedReward);
    }

    function test_unstake_clearsTotalStaked() public {
        vm.prank(alice);
        garden.stake(100 ether);

        vm.warp(block.timestamp + 1);

        vm.prank(alice);
        garden.unstake();

        assertEq(garden.totalStaked(), 0);
        (uint256 amount,) = garden.stakes(alice);
        assertEq(amount, 0);
    }

    function test_unstake_revertsIfNotStaking() public {
        vm.prank(stranger);
        vm.expectRevert(YieldGarden.NotStaking.selector);
        garden.unstake();
    }

    function test_unstake_emitsEvent() public {
        vm.prank(alice);
        garden.stake(100 ether);

        vm.warp(block.timestamp + 1);

        vm.expectEmit(true, false, false, true);
        emit YieldGarden.Unstaked(alice, 100 ether);

        vm.prank(alice);
        garden.unstake();
    }

    // ─── owner ────────────────────────────────────────────────────────────────

    function test_setRewardRate_updatesRate() public {
        vm.prank(owner);
        garden.setRewardRate(5);
        assertEq(garden.rewardRatePerTokenPerSecond(), 5);
    }

    function test_setRewardRate_revertsIfNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        garden.setRewardRate(5);
    }

    // ─── fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_pendingRewards_linearInTime(uint256 elapsed) public {
        elapsed = bound(elapsed, 1, 365 days);

        vm.prank(alice);
        garden.stake(100 ether);

        vm.warp(block.timestamp + elapsed);

        // (100e18 * 1 * elapsed) / 1e18 = 100 * elapsed wei
        uint256 expected = (100 ether * RATE * elapsed) / 1e18;
        assertEq(garden.pendingRewards(alice), expected);
    }
}
