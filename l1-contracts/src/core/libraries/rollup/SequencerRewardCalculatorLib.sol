// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

/// @dev The largest sequencer reward the rollup accepts for one checkpoint. A validity bound that keeps the reward
///      sums from overflowing, not an economic cap: it is far above any plausible reward, premiums included.
uint256 constant MAX_SEQUENCER_REWARD_PER_CHECKPOINT = 1_000_000e18;

/// @dev Fixed part of the gas stipend forwarded to the sequencer reward calculator.
uint256 constant CALCULATOR_GAS_BASE = 200_000;

/// @dev Per-checkpoint part of the gas stipend forwarded to the sequencer reward calculator.
uint256 constant CALCULATOR_GAS_PER_CHECKPOINT = 100_000;

/// @dev Gas the rollup spends between its gas check and the calculator's first instruction. The call needs one cold
///      account access (2_600), or two if the calculator is an EIP-7702 delegated account, plus a handful of opcodes;
///      the rest is margin.
uint256 constant CALCULATOR_CALL_GAS_RESERVE = 10_000;

/**
 * @title SequencerRewardCalculatorLib
 * @author Aztec Labs
 * @notice Calls the governance-set sequencer reward calculator defensively, so that no calculator behaviour can make
 *         epoch proof submission revert or cost more than a bound fixed by the constants above.
 * @dev The bound is on the calculator, not on the whole proof: a submission must carry enough gas to forward the full
 *      stipend (see `tryGetSequencerRewards`) and, after the calculator has spent all of it, to finish the rest of the
 *      proof. A transaction that passes the stipend check can still run out of gas later in reward distribution;
 *      that depends only on the gas the submitter provided, never on what the calculator returned.
 */
library SequencerRewardCalculatorLib {
  /**
   * @notice Asks `_calculator` for the sequencer reward of each checkpoint and validates the response.
   *
   * @dev The call is a `staticcall` forwarding exactly `CALCULATOR_GAS_BASE + CALCULATOR_GAS_PER_CHECKPOINT * n`
   *      gas. The response is accepted only if the call succeeded, `returndatasize` is exactly `64 + 32 * n`, the ABI
   *      head holds offset 32 and length `n`, and every value is at most `MAX_SEQUENCER_REWARD_PER_CHECKPOINT`.
   *      Nothing is copied out of the return data before its size is checked, and never more than that size, so an
   *      oversized response costs the caller nothing: the stipend bounds what the calculator can spend, and the size
   *      check bounds what the caller spends on the answer. An account without code returns no data and is rejected.
   *
   *      The function reverts if the transaction does not leave enough gas to forward the full stipend. EIP-150
   *      would otherwise forward only 63/64 of what is left, which would let the submitter, rather than the
   *      calculator, decide whether the calculator runs out of gas and the defaults are paid. The requirement
   *      depends on the constants and `n` only, never on the calculator. `CALCULATOR_CALL_GAS_RESERVE` covers the
   *      call itself only; the gas the proof needs after the call is not part of this check.
   *
   * @param _calculator The sequencer reward calculator
   * @param _epoch The epoch whose checkpoints are being rewarded
   * @param _proposers One attester per newly proven checkpoint, in checkpoint order
   * @param _defaultReward The default sequencer reward per checkpoint
   * @param _checkpointReward The total checkpoint reward
   * @return accepted Whether the response is well formed; when false, `rewards` and `total` MUST be ignored
   * @return rewards The sequencer reward of each checkpoint, in the order of `_proposers`
   * @return total The sum of `rewards`
   *
   * @custom:reverts Errors.SequencerRewardCalculatorLib__InsufficientGas if the full stipend cannot be forwarded
   */
  function tryGetSequencerRewards(
    address _calculator,
    Epoch _epoch,
    address[] memory _proposers,
    uint256 _defaultReward,
    uint256 _checkpointReward
  ) internal view returns (bool accepted, uint256[] memory rewards, uint256 total) {
    uint256 count = _proposers.length;
    uint256 stipend = CALCULATOR_GAS_BASE + CALCULATOR_GAS_PER_CHECKPOINT * count;
    bytes memory data = abi.encodeCall(
      ISequencerRewardCalculator.getSequencerRewards, (_epoch, _proposers, _defaultReward, _checkpointReward)
    );

    {
      uint256 required = (stipend * 64) / 63 + 1 + CALCULATOR_CALL_GAS_RESERVE;
      uint256 available = gasleft();
      require(available >= required, Errors.SequencerRewardCalculatorLib__InsufficientGas(required, available));
    }

    assembly ("memory-safe") {
      if staticcall(stipend, _calculator, add(data, 0x20), mload(data), 0, 0) {
        let expectedSize := add(0x40, shl(5, count))
        if eq(returndatasize(), expectedSize) {
          let ptr := mload(0x40)
          returndatacopy(ptr, 0, expectedSize)
          // `[offset][length][values...]`: from the length word on, this is the memory layout of a uint256[].
          if and(eq(mload(ptr), 0x20), eq(mload(add(ptr, 0x20)), count)) {
            rewards := add(ptr, 0x20)
            mstore(0x40, add(ptr, expectedSize))
            accepted := 1
          }
        }
      }
    }

    if (accepted) {
      // Each value is bounded below, so the sum of at most `count` of them cannot overflow.
      unchecked {
        for (uint256 i = 0; i < count; ++i) {
          uint256 reward = rewards[i];
          if (reward > MAX_SEQUENCER_REWARD_PER_CHECKPOINT) {
            return (false, rewards, 0);
          }
          total += reward;
        }
      }
    }
  }
}
