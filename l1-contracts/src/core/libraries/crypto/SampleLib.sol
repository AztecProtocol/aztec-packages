// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";

/**
 * @title   SampleLib
 * @author  Anaxandridas II
 * @notice  A tiny library to draw committee indices using a sample without replacement algorithm based on Feistel permutations.
 */
library SampleLib {
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
    pure
    returns (uint256[] memory)
  {
    require(
      _committeeSize <= _indexCount,
      Errors.SampleLib__SampleLargerThanIndex(_committeeSize, _indexCount)
    );

    if (_committeeSize == 0) {
      return new uint256[](0);
    }

    // Use optimized batch Feistel computation
    return computeCommitteeBatch(_committeeSize, _indexCount, _seed);
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

  /**
   * @notice  Compute a single committee member at a specific index in O(1) time
   *          without allowing duplicates using a Feistel network permutation
   *
   * @param _index - The index in the committee (0 to _committeeSize-1)
   * @param _committeeSize - The size of the committee
   * @param _indexCount - The total number of validators to sample from
   * @param _seed - The seed for randomization
   *
   * @return The validator index for the committee position
   */
  function computeCommitteeMemberAtIndex(
    uint256 _index,
    uint256 _committeeSize,
    uint256 _indexCount,
    uint256 _seed
  ) internal pure returns (uint256) {
    require(_index < _committeeSize, Errors.SampleLib__IndexOutOfBounds(_index, _committeeSize));
    require(
      _committeeSize <= _indexCount,
      Errors.SampleLib__SampleLargerThanIndex(_committeeSize, _indexCount)
    );

    // Use a Feistel network to create a permutation of [0, _indexCount)
    uint256 permutedIndex = feistelPermute(_index, _indexCount, _seed);

    // Cycle walking: keep applying the permutation until we get a value < _indexCount
    // This handles non-power-of-2 sizes
    while (permutedIndex >= _indexCount) {
      permutedIndex = feistelPermute(permutedIndex, _indexCount, _seed);
    }

    return permutedIndex;
  }

  /**
   * @notice  Optimized batch computation of committee members using Feistel network
   *          Computes all indices simultaneously with shared pre-computation
   *
   * @param _committeeSize - The size of the committee
   * @param _indexCount - The total number of validators to sample from
   * @param _seed - The seed for randomization
   *
   * @return The array of validator indices for the committee
   */
  function computeCommitteeBatch(uint256 _committeeSize, uint256 _indexCount, uint256 _seed)
    internal
    pure
    returns (uint256[] memory)
  {
    uint256[] memory indices = new uint256[](_committeeSize);

    // Pre-compute constants for Feistel network
    uint256 size = 1;
    uint256 bits = 0;
    while (size < _indexCount) {
      size <<= 1;
      bits++;
    }

    uint256 halfBits = (bits + 1) / 2;
    uint256 mask = (1 << halfBits) - 1;

    // Process all committee members
    for (uint256 i = 0; i < _committeeSize; i++) {
      uint256 permuted = i;

      // Apply Feistel rounds
      do {
        uint256 left = permuted >> halfBits;
        uint256 right = permuted & mask;

        // 4 rounds of Feistel
        for (uint256 round = 0; round < 4; round++) {
          uint256 newLeft = right;
          uint256 f = uint256(keccak256(abi.encodePacked(_seed, round, right))) & mask;
          right = left ^ f;
          left = newLeft;
        }

        permuted = (left << halfBits) | right;
      } while (permuted >= _indexCount); // Cycle walking for non-power-of-2 domains

      indices[i] = permuted;
    }

    return indices;
  }

  /**
   * @notice  Feistel network implementation for creating a bijective mapping
   *          Guarantees no collisions within the domain
   *
   * @param _input - The input value to permute
   * @param _max - The maximum value (exclusive) in the domain
   * @param _seed - The seed for the permutation
   *
   * @return The permuted value
   */
  function feistelPermute(uint256 _input, uint256 _max, uint256 _seed)
    internal
    pure
    returns (uint256)
  {
    // Find next power of 2 >= _max for balanced Feistel
    uint256 size = 1;
    uint256 bits = 0;
    while (size < _max) {
      size <<= 1;
      bits++;
    }

    uint256 halfBits = (bits + 1) / 2;
    uint256 mask = (1 << halfBits) - 1;

    uint256 left = _input >> halfBits;
    uint256 right = _input & mask;

    // 4 rounds provides good mixing for cryptographic permutation
    for (uint256 round = 0; round < 4; round++) {
      uint256 newLeft = right;
      uint256 f = uint256(keccak256(abi.encodePacked(_seed, round, right))) & mask;
      right = left ^ f;
      left = newLeft;
    }

    return (left << halfBits) | right;
  }
}
