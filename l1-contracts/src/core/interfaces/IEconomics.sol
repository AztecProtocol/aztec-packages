// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IEconomicsCore} from "@aztec/core/interfaces/IEconomicsCore.sol";
import {
  EthPerFeeAssetE12,
  EthValue,
  FeeAssetValue,
  FeeConfig
} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {L1FeeData, FeeHeader, L1GasOracleValues} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {
  ActivityScore,
  ManaMinFeeComponents,
  RewardBoostConfig,
  RewardConfig
} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";

/**
 * @title IEconomics
 * @author Aztec Labs
 * @notice External interface for a rollup economics instance.
 * @dev Rollup code routes proposals and proofs to the economics instance that owns the relevant epoch.
 */
interface IEconomics is IEconomicsCore {
  /**
   * @notice Emitted when the reward split or reward distributor changes.
   * @param rewardConfig New reward configuration.
   */
  event RewardConfigUpdated(RewardConfig rewardConfig);
  /**
   * @notice Emitted when the reward-booster curve configuration changes.
   * @param boostConfig New reward-booster configuration.
   */
  event RewardBoostConfigUpdated(RewardBoostConfig boostConfig);
  /**
   * @notice Emitted when the checkpoint mana target increases.
   * @param manaTarget Updated mana target.
   */
  event ManaTargetUpdated(uint256 indexed manaTarget);
  /**
   * @notice Emitted when the fixed proving-cost component changes.
   * @param provingCostPerMana Updated proving cost per mana, denominated in ETH.
   */
  event ProvingCostPerManaUpdated(EthValue provingCostPerMana);

  /**
   * @notice Updates the reward split and reward distributor configuration.
   * @param _config New reward configuration.
   */
  function setRewardConfig(RewardConfig memory _config) external;
  /**
   * @notice Updates the reward-booster curve configuration.
   * @param _config New reward-booster configuration.
   */
  function setRewardBoostConfig(RewardBoostConfig memory _config) external;
  /**
   * @notice Increases the checkpoint mana target.
   * @dev Economics rejects decreases and zero values.
   * @param _manaTarget New mana target.
   */
  function updateManaTarget(uint256 _manaTarget) external;
  /**
   * @notice Updates the fixed proving-cost component used in fee quotes.
   * @param _provingCostPerMana New proving cost per mana, denominated in ETH.
   */
  function updateProvingCostPerMana(EthValue _provingCostPerMana) external;

  /**
   * @notice Claims all currently accrued sequencer rewards for `_sequencer`.
   * @param _sequencer Reward recipient.
   * @return Amount transferred to `_sequencer`.
   */
  function claimSequencerRewards(address _sequencer) external returns (uint256);
  /**
   * @notice Claims finalized prover rewards for the requested epochs.
   * @param _prover Reward recipient.
   * @param _epochs Epochs to claim from.
   * @return Total amount transferred to `_prover`.
   */
  function claimProverRewards(address _prover, Epoch[] calldata _epochs) external returns (uint256);

  /**
   * @notice Returns the stored fee configuration.
   * @return Current fee config snapshot.
   */
  function getFeeConfig() external view returns (FeeConfig memory);
  /**
   * @notice Returns the checkpoint mana limit implied by the stored mana target.
   * @return Mana limit for the next checkpoint.
   */
  function getManaLimit() external view returns (uint256);
  /**
   * @notice Returns the effective fee-asset price used for proposal quoting.
   * @param _checkpointOfInterest Parent checkpoint the next proposal builds on.
   * @return Effective ETH-per-fee-asset price.
   */
  function getEthPerFeeAsset(uint256 _checkpointOfInterest) external view returns (EthPerFeeAssetE12);
  /**
   * @notice Returns the fixed proving-cost component converted into fee-asset units.
   * @param _checkpointOfInterest Parent checkpoint the next proposal builds on.
   * @return Fixed proving-cost component denominated in the fee asset.
   */
  function getProvingCostPerManaInFeeAsset(uint256 _checkpointOfInterest) external view returns (FeeAssetValue);

  /**
   * @notice Returns the proposal-time fee components for the next checkpoint.
   * @param _checkpointOfInterest Parent checkpoint the next proposal builds on.
   * @param _timestamp Timestamp used for the L1 oracle lookup.
   * @param _inFeeAsset Whether to convert the quote into fee-asset units.
   * @return Minimum per-mana fee components for the next checkpoint.
   */
  function getManaMinFeeComponentsAt(uint256 _checkpointOfInterest, Timestamp _timestamp, bool _inFeeAsset)
    external
    view
    returns (ManaMinFeeComponents memory);

  /**
   * @notice Returns the stored fee header for a checkpoint.
   * @dev Reverts when the checkpoint is unavailable for this economics instance.
   * @param _checkpointNumber Checkpoint to inspect.
   * @return Decompressed fee header snapshot.
   */
  function getFeeHeader(uint256 _checkpointNumber) external view returns (FeeHeader memory);
  /**
   * @notice Returns the active L1 fee quote for `_timestamp`.
   * @param _timestamp Timestamp whose slot selects between the queued oracle values.
   * @return L1 gas and blob fee data active at that time.
   */
  function getL1FeesAt(Timestamp _timestamp) external view returns (L1FeeData memory);
  /**
   * @notice Returns the queued L1 gas oracle values.
   * @return Queued oracle values and the slot where `post` becomes active.
   */
  function getL1GasOracleValues() external view returns (L1GasOracleValues memory);

  /**
   * @notice Returns the active reward configuration.
   * @return Current reward configuration.
   */
  function getRewardConfig() external view returns (RewardConfig memory);
  /**
   * @notice Returns the current booster shares for `_prover`.
   * @param _prover Prover to inspect.
   * @return Shares implied by the current activity score.
   */
  function getSharesFor(address _prover) external view returns (uint256);
  /**
   * @notice Returns the reward-booster configuration.
   * @return Booster configuration.
   */
  function getRewardBoostConfig() external view returns (RewardBoostConfig memory);
  /**
   * @notice Returns the decayed activity score for `_prover` at the current epoch.
   * @param _prover Prover to inspect.
   * @return Current activity score snapshot.
   */
  function getActivityScore(address _prover) external view returns (ActivityScore memory);
  /**
   * @notice Returns the currently accrued sequencer rewards for `_sequencer`.
   * @param _sequencer Sequencer to inspect.
   * @return Outstanding sequencer rewards.
   */
  function getSequencerRewards(address _sequencer) external view returns (uint256);
  /**
   * @notice Returns the collective prover rewards allocated for an epoch.
   * @param _epoch Epoch to inspect.
   * @return Total prover rewards for the epoch.
   */
  function getCollectiveProverRewardsForEpoch(Epoch _epoch) external view returns (uint256);
  /**
   * @notice Returns the longest proven prefix stored for `_epoch`.
   * @param _epoch Epoch to inspect.
   * @return Longest settled proof length.
   */
  function getLongestProvenLength(Epoch _epoch) external view returns (uint256);
  /**
   * @notice Returns the prover shares recorded for a specific sub-epoch proof length.
   * @param _epoch Epoch to inspect.
   * @param _length Proven length within the epoch.
   * @param _prover Prover to inspect.
   * @return Shares credited to the prover for that sub-epoch.
   */
  function getProverShares(Epoch _epoch, uint256 _length, address _prover) external view returns (uint256);
  /**
   * @notice Returns the total shares recorded for a specific sub-epoch proof length.
   * @param _epoch Epoch to inspect.
   * @param _length Proven length within the epoch.
   * @return Total shares recorded for that sub-epoch.
   */
  function getSummedShares(Epoch _epoch, uint256 _length) external view returns (uint256);
  /**
   * @notice Returns whether `_prover` already submitted for a given sub-epoch length.
   * @param _epoch Epoch to inspect.
   * @param _length Proven length within the epoch.
   * @param _prover Prover to inspect.
   * @return True when the prover already recorded shares for that sub-epoch.
   */
  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover) external view returns (bool);
  /**
   * @notice Returns whether `_prover` already claimed rewards for `_epoch`.
   * @param _prover Prover to inspect.
   * @param _epoch Epoch to inspect.
   * @return True when the claim bit is set.
   */
  function getHasClaimed(address _prover, Epoch _epoch) external view returns (bool);
  /**
   * @notice Returns the prover rewards claimable for `_epoch`, or `0` if already claimed.
   * @param _epoch Epoch to inspect.
   * @param _prover Prover to inspect.
   * @return Claimable prover rewards for that epoch.
   */
  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover) external view returns (uint256);
  /**
   * @notice Returns the stored activity-score snapshot before applying epoch decay.
   * @param _prover Prover to inspect.
   * @return Stored activity score snapshot.
   */
  function getStoredActivityScore(address _prover) external view returns (ActivityScore memory);
  /**
   * @notice Returns the address used as the congestion-fee burn sink.
   * @return Burn address.
   */
  function getBurnAddress() external pure returns (address);
}
