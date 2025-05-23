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
   *
   * @param _committeeSize - The size of the committee
   * @param _indexCount - The total number of indices
   * @param _seed - The seed to use for shuffling
   *
   * @dev assumption, _committeeSize <= _indexCount
   *
   * @return indices - The indices of the committee
   */
  function computeCommittee(uint256 _committeeSize, uint256 _indexCount, uint256 _seed)
    internal
    returns (uint256[] memory)
  {
    require(
      _committeeSize <= _indexCount,
      Errors.SampleLib__SampleLargerThanIndex(_committeeSize, _indexCount)
    );

    uint256[] memory sampledIndices = new uint256[](_committeeSize);

    uint256 upperLimit = _indexCount - 1;

    for (uint256 index = 0; index < _committeeSize; index++) {
      uint256 sampledIndex = computeSampleIndex(index, upperLimit + 1, _seed);

      // Get index, or its swapped override
      sampledIndices[index] = getValue(sampledIndex);
      if (upperLimit > 0) {
        // Swap with the last index
        setOverrideValue(sampledIndex, getValue(upperLimit));
        // Decrement the upper limit
        upperLimit--;
      }
    }

    // Clear transient storage.
    // Note that we are cleaing the `sampleIndicies` and do not keep track of a separate list of
    // `sampleIndex` that was written to. The reasoning being that we are only overwriting for
    // duplicate cases, so `sampleIndicies` isa superset of the `sampleIndex` that have been drawn
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

  function getValue(uint256 _index) internal view returns (uint256) {
    uint256 overrideValue = getOverrideValue(_index);
    if (overrideValue != 0) {
      return overrideValue;
    }

    return _index;
  }

  function getOverrideValue(uint256 _index) internal view returns (uint256) {
    return OVERRIDE_NAMESPACE.erc7201Slot().deriveMapping(_index).asUint256().tload();
  }

  /**
   * @notice  Compute the sample index for a given index, seed and index count.
   *
   * @param _index - The index to shuffle
   * @param _indexCount - The total number of indices
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
