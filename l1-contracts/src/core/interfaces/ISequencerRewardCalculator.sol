// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

/**
 * @title ISequencerRewardCalculator
 * @author Aztec Labs
 * @notice Governance-set policy contract that decides the sequencer reward of each newly proven checkpoint.
 *
 * @dev The rollup calls {getSequencerRewards} once per epoch proof that newly covers checkpoints, through a
 *      `staticcall` with a fixed gas stipend of `CALCULATOR_GAS_BASE + CALCULATOR_GAS_PER_CHECKPOINT * n`, where
 *      `n` is the number of proposers passed. The rollup accepts the response only if the call succeeds, the
 *      return data is exactly the ABI encoding of a `uint256[]` of length `n` (`64 + 32 * n` bytes, offset 32), and
 *      every value is at most `MAX_SEQUENCER_REWARD_PER_CHECKPOINT`. Any other outcome, including running out of
 *      the stipend, pays the default reward to every checkpoint. See `SequencerRewardCalculatorLib`.
 *
 *      The calling rollup is `msg.sender`; the calculator MAY read any rollup or GSE state it needs. State is read
 *      when the proof lands, not when the checkpoints were proposed.
 */
interface ISequencerRewardCalculator {
  /**
   * @notice Returns the sequencer reward of each newly proven checkpoint of an epoch proof
   * @dev The rollup passes one entry per checkpoint, including repeated proposers; deduplication, caching and any
   *      lookups are the calculator's responsibility. MUST be a view.
   * @param _epoch The epoch whose checkpoints are being rewarded
   * @param _proposers One attester address per newly proven checkpoint, in checkpoint order
   * @param _defaultReward The default sequencer reward per checkpoint (`checkpointReward * sequencerBps / 10_000`)
   * @param _checkpointReward The total checkpoint reward (sequencer share plus prover share)
   * @return rewards One sequencer reward per entry of `_proposers`, in the same order
   */
  function getSequencerRewards(
    Epoch _epoch,
    address[] calldata _proposers,
    uint256 _defaultReward,
    uint256 _checkpointReward
  ) external view returns (uint256[] memory rewards);
}
