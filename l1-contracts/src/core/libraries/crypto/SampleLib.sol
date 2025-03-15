// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {SlotDerivation} from "@oz/utils/SlotDerivation.sol";
import {TransientSlot} from "@oz/utils/TransientSlot.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

/**
 * @title   SampleLib
 * @author  Anaxandridas II
 * @notice  A tiny library to shuffle indices using the swap-or-not algorithm and then
 *          draw a committee from the shuffled indices.
 *
 * @dev     Using the `swap-or-not` alogirthm that is used by Ethereum consensus client.
 *          We are using this algorithm, since it can compute a shuffle of individual indices,
 *          which will be very useful for EVENTUALLY reducing the cost of committee selection.
 *
 *          Currently the library is maximally simple, and will simply do "dumb" sampling to select
 *          a committee, but re-use parts of computation to improve efficiency.
 *
 *          https://eth2book.info/capella/part2/building_blocks/shuffling/
 *          https://link.springer.com/content/pdf/10.1007%2F978-3-642-32009-5_1.pdf
 */
library SampleLib {
  using SlotDerivation for string;
  using SlotDerivation for bytes32;
  using TransientSlot for *;

  // Namespace for transient storage keys used within this library
  string private constant _OVERRIDE_NAMESPACE = "Aztec.SampleLib.Override";

  /**
   * @notice  Computing a committee the most direct way.
   *          This is horribly inefficient as we are throwing plenty of things away, but it is useful
   *          for testing and just showcasing the simplest case.
   *
   * @param _committeeSize - The size of the committee
   * @param _indexCount - The total number of indices
   * @param _seed - The seed to use for shuffling
   *
   * @return indices - The indices of the committee
   */
  function computeCommittee(uint256 _committeeSize, uint256 _indexCount, uint256 _seed)
    internal
    returns (uint256[] memory)
  {
    require(_committeeSize <= _indexCount, Errors.SampleLib__SampleLargerThanIndex(_committeeSize, _indexCount));

    uint256[] memory sampledIndices = new uint256[](_committeeSize);

    uint256 upperLimit = _indexCount - 1;

    for (uint256 index = 0; index < _committeeSize; index++) {
      uint256 sampledIndex = computeShuffledIndex(index, upperLimit, _seed);

      // Get index, or its swapped override
      sampledIndices[index] = getValue(sampledIndex);

      // Swap with the last index
      setOverrideValue(sampledIndex, getValue(upperLimit));

      // Decrement the upper limit
      upperLimit--;
    }


    return sampledIndices;
  }

  function getValue(uint256 _index) internal view returns (uint256) {
    uint256 overrideValue = getOverrideValue(_index);
    if (overrideValue != 0) {
      // TODO: edge case where override actually is 0
      return overrideValue;
    }

    return _index;
  }


  function getOverrideValue(uint256 _index) internal view returns (uint256) {
    return _OVERRIDE_NAMESPACE.erc7201Slot().deriveMapping(_index).asUint256().tload();
  }

  function setOverrideValue(uint256 _index, uint256 _value) internal {
    _OVERRIDE_NAMESPACE.erc7201Slot().deriveMapping(_index).asUint256().tstore(_value);
  }


  /**
   * @notice  Compute the shuffled index for a given index, seed and index count.
   *
   * @param _index - The index to shuffle
   * @param _indexCount - The total number of indices
   * @param _seed - The seed to use for shuffling
   *
   * @return shuffledIndex - The shuffled index
   */
  function computeShuffledIndex(uint256 _index, uint256 _indexCount, uint256 _seed)
    internal
    pure
    returns (uint256)
  {
    return uint256(keccak256(abi.encodePacked(_seed, _index))) % _indexCount;
  }
}
