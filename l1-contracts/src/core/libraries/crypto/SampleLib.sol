// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";

// Utilities for using transient storage as slots
import {SlotDerivation} from "@openzeppelin/contracts/utils/SlotDerivation.sol";
import {TransientSlot} from "@openzeppelin/contracts/utils/TransientSlot.sol";

import "forge-std/console.sol";

/**
 * @title   SampleLib
 * @author  Anaxandridas II
 * @notice  A tiny library to shuffle indices using a sampling algorithm and then
 *          draw a committee from the sampled indices.
 *
 * @dev     We sample with replacement, with a max resampling attempt is a collision is come across.
 *          We use transient storage to store the sampled indicies, in order to allow us to simply lookup
 *          if an index has already been sampled.
 *
 *          NOTEBOOK: rationale choosing max sampling parameters
 */
library SampleLib {
  using SlotDerivation for string;
  using SlotDerivation for bytes32;
  using TransientSlot for *;

  // Namespace for transient storage keys used within this library
  string private constant _NAMESPACE = "Aztec.SampleLib";

  // The maximum number of attempts to resample an index
  uint256 private constant _MAX_ATTEMPTS = 10;

  /**
   * @notice  Computing a committee the most direct way.
   *
   * @param _committeeSize - The size of the committee
   * @param _indexCount - The total number of indices
   * @param _seed - The seed to use for sampling
   *
   * @return indices - The indices of the committee
   */
  function computeCommittee(uint256 _committeeSize, uint256 _indexCount, uint256 _seed)
    internal
    returns (uint256[] memory)
  {
    uint256[] memory indices = new uint256[](_committeeSize);

    for (uint256 index = 0; index < _committeeSize; index++) {
      uint256 sampledIndex = computeShuffledIndex(index, _indexCount, _seed);
      bool isSampled = _NAMESPACE.erc7201Slot().deriveMapping(sampledIndex).asBoolean().tload();

      // If we have already been sampled, we resample until we have a new index
      if (isSampled) {
        uint256 attempts = 0;
        do {
          sampledIndex = computeShuffledIndexResample(index, _indexCount, _seed, attempts);
          attempts++;
        } while (
          attempts < _MAX_ATTEMPTS
            && _NAMESPACE.erc7201Slot().deriveMapping(sampledIndex).asBoolean().tload()
        );
      }

      indices[index] = sampledIndex;
      _NAMESPACE.erc7201Slot().deriveMapping(sampledIndex).asBoolean().tstore(true);
    }

    // TODO(md): sampling takes place in multiple places
    //           it should only happen once
    //           clear transient storage
    for (uint256 i = 0; i < indices.length; i++) {
      _NAMESPACE.erc7201Slot().deriveMapping(indices[i]).asBoolean().tstore(false);
    }

    return indices;
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

  /**
   * @notice  Compute the shuffled index for a given index, seed and index count.
   *
   * @param _index - The index to shuffle
   * @param _indexCount - The total number of indices
   * @param _seed - The seed to use for shuffling
   * @param _round - The round to use for shuffling
   *
   * @return shuffledIndex - The shuffled index
   */
  function computeShuffledIndexResample(
    uint256 _index,
    uint256 _indexCount,
    uint256 _seed,
    uint256 _round
  ) internal pure returns (uint256) {
    return uint256(keccak256(abi.encodePacked(_seed, _index, _round))) % _indexCount;
  }
}
