// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title YieldGarden — Stake SEED tokens, earn ETH rewards per second
contract YieldGarden is Ownable {
    IERC20 public immutable seedToken;

    // ETH reward rate: wei per token per second (set by owner)
    uint256 public rewardRatePerTokenPerSecond;

    struct StakeInfo {
        uint256 amount;
        uint256 stakedAt;
    }

    mapping(address => StakeInfo) public stakes;

    uint256 public totalStaked;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 reward);
    event RewardRateUpdated(uint256 newRate);
    event EthFunded(uint256 amount);

    error ZeroAmount();
    error NotStaking();
    error AlreadyStaking();
    error NoRewards();
    error InsufficientRewardPool();
    error TransferFailed();

    constructor(address _seedToken, uint256 _rewardRatePerTokenPerSecond, address _owner)
        Ownable(_owner)
    {
        seedToken = IERC20(_seedToken);
        rewardRatePerTokenPerSecond = _rewardRatePerTokenPerSecond;
    }

    // ─── Owner ────────────────────────────────────────────────────────────────

    function setRewardRate(uint256 newRate) external onlyOwner {
        rewardRatePerTokenPerSecond = newRate;
        emit RewardRateUpdated(newRate);
    }

    receive() external payable {
        emit EthFunded(msg.value);
    }

    // ─── User ─────────────────────────────────────────────────────────────────

    function stake(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (stakes[msg.sender].amount > 0) revert AlreadyStaking();

        seedToken.transferFrom(msg.sender, address(this), amount);

        stakes[msg.sender] = StakeInfo({amount: amount, stakedAt: block.timestamp});
        totalStaked += amount;

        emit Staked(msg.sender, amount);
    }

    function claimRewards() external {
        uint256 reward = pendingRewards(msg.sender);
        if (reward == 0) revert NoRewards();
        if (address(this).balance < reward) revert InsufficientRewardPool();

        // CEI: reset checkpoint so rewards accrue from now
        stakes[msg.sender].stakedAt = block.timestamp;

        (bool ok,) = msg.sender.call{value: reward}("");
        if (!ok) revert TransferFailed();

        emit RewardsClaimed(msg.sender, reward);
    }

    function unstake() external {
        StakeInfo memory info = stakes[msg.sender];
        if (info.amount == 0) revert NotStaking();

        uint256 reward = pendingRewards(msg.sender);

        // CEI: clear state before transfers
        uint256 amount = info.amount;
        delete stakes[msg.sender];
        totalStaked -= amount;

        seedToken.transfer(msg.sender, amount);

        if (reward > 0 && address(this).balance >= reward) {
            (bool ok,) = msg.sender.call{value: reward}("");
            if (!ok) revert TransferFailed();
            emit RewardsClaimed(msg.sender, reward);
        }

        emit Unstaked(msg.sender, amount);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /// @notice Returns unclaimed ETH rewards for a user
    /// @dev rate is expressed as wei per whole token (1e18 units) per second
    function pendingRewards(address user) public view returns (uint256) {
        StakeInfo memory info = stakes[user];
        if (info.amount == 0) return 0;
        uint256 elapsed = block.timestamp - info.stakedAt;
        return (info.amount * rewardRatePerTokenPerSecond * elapsed) / 1e18;
    }
}
