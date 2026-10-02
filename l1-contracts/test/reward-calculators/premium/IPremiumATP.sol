// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IATP, IATPStaker} from "@test/reward-calculators/IATP.sol";

/**
 * @notice The provenance record of a premium ATP factory: every position it created, and nothing else.
 */
interface IPremiumATPFactory {
  /**
   * @notice Returns whether `_atp` was created by this factory
   * @param _atp The address to check
   * @return True if and only if this factory created `_atp`
   */
  function isATP(address _atp) external view returns (bool);

  /**
   * @notice Returns the registry of every position this factory creates
   * @return The registry address
   */
  function getRegistry() external view returns (address);

  /**
   * @notice Returns the GSE every staker of this factory's positions is bound to: the only GSE whose rollups they
   *         deposit into
   * @return The GSE address
   */
  function getGSE() external view returns (address);
}

/**
 * @notice A premium-eligible Aztec Token Position: a locked allocation whose staked part is reserved.
 * @dev `claimed + reserved <= allocation` holds at all times.
 */
interface IPremiumATP is IATP {
  /**
   * @notice Returns the staker this position created at initialization, the only one it ever has
   * @return The staker address
   */
  function getStaker() external view returns (address);

  /**
   * @notice Returns the operator the beneficiary allowed to stake through the staker
   * @return The operator address, zero if none
   */
  function getOperator() external view returns (address);

  /**
   * @notice Reserves `_amount` of the allocation for a deposit and sends that many tokens to the staker
   * @dev Only the staker. Reverts if the reservation would exceed `allocation - claimed`.
   * @param _amount The amount to reserve, one activation threshold
   */
  function reserveForStake(uint256 _amount) external;

  /**
   * @notice Frees `_amount` of the reservation
   * @dev Only the staker, for an attester it recorded and no longer records.
   * @param _amount The amount to free
   */
  function releaseReservation(uint256 _amount) external;
}

/**
 * @notice The staker of a premium ATP, which records every attester it deposited from the allocation.
 */
interface IPremiumATPStaker is IATPStaker {
  /**
   * @notice Returns whether this staker deposited `_attester` from its position's allocation and still records it
   * @param _attester The attester
   * @return True if the attester is recorded
   */
  function isAttester(address _attester) external view returns (bool);

  /**
   * @notice Returns the GSE this staker is bound to: it deposits only into rollups on this GSE
   * @return The GSE address
   */
  function getGSE() external view returns (address);
}

/**
 * @notice The provider staking entry point the staker calls, with the signature of the StakingRegistry in
 *         ignition-contracts.
 * @dev The registry dequeues one of the provider's keys, pulls one activation threshold from `msg.sender`, deposits
 *      it into the rollup with `_withdrawalAddress` as the withdrawer, and creates a reward split. It does not
 *      return the attester it chose.
 */
interface IStakingRegistry {
  /**
   * @notice Stakes one activation threshold with a provider's next key
   * @param _providerIdentifier The provider
   * @param _rollupVersion The rollup version to stake on
   * @param _withdrawalAddress The withdrawer of the deposit
   * @param _expectedProviderTakeRate The provider take rate the caller agreed to
   * @param _userRewardsRecipient The recipient of the user's share of the rewards
   * @param _moveWithLatestRollup Whether the stake follows the latest rollup
   */
  function stake(
    uint256 _providerIdentifier,
    uint256 _rollupVersion,
    address _withdrawalAddress,
    uint16 _expectedProviderTakeRate,
    address _userRewardsRecipient,
    bool _moveWithLatestRollup
  ) external;
}
