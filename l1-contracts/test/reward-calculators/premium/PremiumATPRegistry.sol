// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";

/**
 * @notice A linear unlock schedule with a cliff, shared by every position of a registry.
 * @param startTime Nothing unlocks before `startTime + cliffDuration`
 * @param cliffDuration Time from the start until the cliff
 * @param lockDuration Time from the start until everything is unlocked, at least the cliff duration and not zero
 */
struct UnlockSchedule {
  uint256 startTime;
  uint256 cliffDuration;
  uint256 lockDuration;
}

/**
 * @title PremiumATPRegistry
 * @author Aztec Labs
 * @notice The registry of premium-eligible Aztec Token Positions: the value their `getRegistry()` returns, which
 *         sequencer reward calculators key their policy on, and the unlock schedule all its positions follow.
 *
 * @dev Its owner is a trust root of the positions' lock: it can move the unlock start earlier (never later), which
 *      unlocks every position sooner. It cannot change what a position has reserved for staking, so it cannot let a
 *      beneficiary claim stake that earns a premium. Unlike the ignition registry it registers no staker
 *      implementations: premium stakers cannot be upgraded.
 */
contract PremiumATPRegistry is Ownable {
  UnlockSchedule internal schedule;

  /**
   * @notice Emitted when the unlock start moves earlier
   * @param startTime The new start time
   */
  event UnlockStartTimeUpdated(uint256 startTime);

  error PremiumATPRegistry__InvalidSchedule(uint256 cliffDuration, uint256 lockDuration);
  error PremiumATPRegistry__StartTimeNotEarlier(uint256 newStartTime, uint256 currentStartTime);

  /**
   * @param _owner The owner, allowed to move the unlock start earlier
   * @param _schedule The unlock schedule of every position of this registry
   */
  constructor(address _owner, UnlockSchedule memory _schedule) Ownable(_owner) {
    require(
      _schedule.lockDuration > 0 && _schedule.lockDuration >= _schedule.cliffDuration,
      PremiumATPRegistry__InvalidSchedule(_schedule.cliffDuration, _schedule.lockDuration)
    );
    schedule = _schedule;
  }

  /**
   * @notice Moves the unlock start earlier
   * @param _startTime The new start time, strictly earlier than the current one
   */
  function setUnlockStartTime(uint256 _startTime) external onlyOwner {
    require(_startTime < schedule.startTime, PremiumATPRegistry__StartTimeNotEarlier(_startTime, schedule.startTime));
    schedule.startTime = _startTime;
    emit UnlockStartTimeUpdated(_startTime);
  }

  /**
   * @notice Returns the unlock schedule
   * @return The schedule
   */
  function getUnlockSchedule() external view returns (UnlockSchedule memory) {
    return schedule;
  }

  /**
   * @notice Returns how much of `_allocation` the schedule has unlocked at `_timestamp`
   * @param _allocation The allocation of a position
   * @param _timestamp The time
   * @return The unlocked amount, between zero and `_allocation`
   */
  function unlockedAt(uint256 _allocation, uint256 _timestamp) external view returns (uint256) {
    UnlockSchedule memory s = schedule;
    if (_timestamp < s.startTime + s.cliffDuration) {
      return 0;
    }
    if (_timestamp >= s.startTime + s.lockDuration) {
      return _allocation;
    }
    return (_allocation * (_timestamp - s.startTime)) / s.lockDuration;
  }
}
