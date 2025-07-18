// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {SlotDerivation} from "@oz/utils/SlotDerivation.sol";
import {TransientSlot} from "@oz/utils/TransientSlot.sol";

/**
 * @title   SampleLib
 * @author  Anaxandridas II
 * @notice  A tiny library to draw committee indices using a sample without replacement algorithm.
 */
library SampleLib {
  using SlotDerivation for string;
  using SlotDerivation for bytes32;
  using TransientSlot for *;

  // Namespace for transient storage keys used within this library
  string private constant OVERRIDE_NAMESPACE = "Aztec.SampleLib.Override";

  /**
   * Compute Committee
   * // I'd align naming of these params with the names that are passed into this function: targetCommitteeSize, validatorSetSize, seed. "indexCount is not clear"
   * @param _committeeSize - The size of the committee
   * @param _indexCount - The total number of indices <-- not a clear description of what this is. Indices of what? validatorSetSize is clearer.
   * @param _seed - The seed to use for shuffling
   *
   * @dev assumption, _committeeSize <= _indexCount
   *
   * @return indices - The indices of the committee <-- indices according to what data structure? Where were those indices first established? In StakingLib? AddressSnapshotLib?
   */
  function computeCommittee(uint256 _committeeSize, uint256 _indexCount, uint256 _seed)
    internal
    returns (uint256[] memory)
  {
    require(
      _committeeSize <= _indexCount,
      Errors.SampleLib__SampleLargerThanIndex(_committeeSize, _indexCount)
    );

    if (_committeeSize == 0) {
      return new uint256[](0);
    }

    // Explain the sampling/shuffling strategy in words, please.

    uint256[] memory sampledIndices = new uint256[](_committeeSize);

    uint256 upperLimit = _indexCount - 1;

    for (uint256 index = 0; index < _committeeSize; index++) {
      uint256 sampledIndex = computeSampleIndex(index, upperLimit + 1, _seed);

      // Get index, or its swapped override <-- explain more comprehensively!
      // We sample an index from the entire list of registered validators. Validators get registered in _____, and the list/mapping within that file is called ____.
      // Once we've sampled a validator from that list, we want to remove them from the next iteration
      // of sampling. So we manipulate an in-memory list of these validator indices: we remove the just-sampled index, and we swap the final item of the list into that hole. This enables us to then shrink the list by 1. Now we're ready to re-sample a list that does not contain the just-sampled validator index. We proceed until we have sampled committeeSize validators.
      // The sampled indices of the validators are kept in `sampledIndices`. We will commit to a
      // Are we only manipulating transient lists of data?

      // Why do we sample from a list of indices, and not a list of validator addresses directly?
      sampledIndices[index] = getValue(sampledIndex); // It's not easy to follow this storage approach. What is the array/mapping that `getValue` is accessing? Where do the values of this array get pushed? In which file and function, and during what step in the process?
      if (upperLimit > 0) {
        // Swap with the last index
        setOverrideValue(sampledIndex, getValue(upperLimit));
        // Decrement the upper limit
        upperLimit--;
      }
    }

    // Comment could be revised for clarity of explanation.
    // Clear transient storage.
    // Note that we are clearing the `sampleIndicies` and do not keep track of a separate list of
    // `sampleIndex` that was written to. The reasoning being that we are only overwriting for
    // duplicate cases [huh?], so `sampleIndicies` is a superset of the `sampleIndex` that have been drawn
    // (due to account for duplicates). Thereby clearing the `sampleIndicies` clears all.
    // Due to the cost of `tstore` and `tload` it is cheaper just to overwrite it all, than checking
    // if there is even anything to override.
    for (uint256 i = 0; i < _committeeSize; i++) {
      setOverrideValue(sampledIndices[i], 0);
    }

    return sampledIndices;
  }

  function setOverrideValue(uint256 _index, uint256 _value) internal {
    OVERRIDE_NAMESPACE.erc7201Slot().deriveMapping(_index).asUint256().tstore(_value);
  }

  // Value of what? From where?
  function getValue(uint256 _index) internal view returns (uint256) {
    uint256 overrideValue = getOverrideValue(_index);
    if (overrideValue != 0) {
      return overrideValue;
    }

    return _index;
  }

  // Needs explanation, because this is dense in its complexity.
  function getOverrideValue(uint256 _index) internal view returns (uint256) {
    // I don't understand this.
    // THere's slot-derivation hashing happening inside erc7201Slot, so just asking the question: can this hashing be optimised-away, because this function is called lots?
    return OVERRIDE_NAMESPACE.erc7201Slot().deriveMapping(_index).asUint256().tload();
  }

  /**
   * @notice  Compute the sample index for a given index, seed and index count.
   *
   * @param _index - The index to shuffle <-- index of what? the next item to be sampled.
   * @param _indexCount - The total number of indices <-- very confusing name, because this is a different `indexCount` from the `indexCount` param of `computeCommittee`. It's the size of the set from which we're sampling.
   * @param _seed - The seed to use for shuffling
   *
   * @return shuffledIndex - The shuffled index
   */
  function computeSampleIndex(uint256 _index, uint256 _indexCount, uint256 _seed)
    internal
    pure
    returns (uint256)
  {
    // Cannot modulo by 0
    if (_indexCount == 0) {
      return 0;
    }

    return uint256(keccak256(abi.encodePacked(_seed, _index))) % _indexCount;
  }
}
