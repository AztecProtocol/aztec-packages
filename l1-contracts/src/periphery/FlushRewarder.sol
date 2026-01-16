// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {IFlushRewarder} from "./interfaces/IFlushRewarder.sol";

contract FlushRewarder is Ownable, IFlushRewarder {
  using SafeERC20 for IERC20;

  uint256 public constant DEFAULT_MAX_ADD_PER_FLUSH = 16;

  IInstance public immutable ROLLUP;
  IERC20 public immutable REWARD_ASSET;

  uint256 public rewardPerInsertion;

  uint256 internal debt;

  mapping(address => uint256) public rewardsOf;

  constructor(address _owner, IInstance _rollup, IERC20 _rewardAsset, uint256 _rewardPerInsertion) Ownable(_owner) {
    ROLLUP = _rollup;
    REWARD_ASSET = _rewardAsset;
    rewardPerInsertion = _rewardPerInsertion;
  }

  function setRewardPerInsertion(uint256 _rewardPerInsertion) external override(IFlushRewarder) onlyOwner {
    rewardPerInsertion = _rewardPerInsertion;
    emit RewardPerInsertionUpdated(_rewardPerInsertion);
  }

  function recover(address _asset, address _to, uint256 _amount) external override(IFlushRewarder) onlyOwner {
    if (_asset == address(REWARD_ASSET)) {
      require(_amount <= rewardsAvailable(), InsufficientRewardsAvailable());
    }
    IERC20(_asset).safeTransfer(_to, _amount);
  }

  function flushEntryQueue() external override(IFlushRewarder) {
    flushEntryQueue(DEFAULT_MAX_ADD_PER_FLUSH);
  }

  function claimRewards() external override(IFlushRewarder) {
    require(ROLLUP.isRewardsClaimable(), Errors.Rollup__RewardsNotClaimable());

    uint256 rewardsToClaim = rewardsOf[msg.sender];
    if (rewardsToClaim > 0) {
      rewardsOf[msg.sender] = 0;
      debt -= rewardsToClaim;
      REWARD_ASSET.safeTransfer(msg.sender, rewardsToClaim);
    }
  }

  function flushEntryQueue(uint256 _toAdd) public override(IFlushRewarder) {
    uint256 validatorSetSizeBefore = ROLLUP.getActiveAttesterCount();
    ROLLUP.flushEntryQueue(_toAdd);
    uint256 insertions = ROLLUP.getActiveAttesterCount() - validatorSetSizeBefore;

    if (insertions > 0) {
      uint256 rewards = Math.min(insertions * rewardPerInsertion, rewardsAvailable());
      debt += rewards;
      rewardsOf[msg.sender] += rewards;
    }
  }

  function rewardsAvailable() public view override(IFlushRewarder) returns (uint256) {
    return REWARD_ASSET.balanceOf(address(this)) - debt;
  }
}
