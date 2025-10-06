// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Configuration, ProposeWithLockConfiguration} from "@aztec/governance/interfaces/IGovernance.sol";
import {CompressedTimestamp, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

/**
 * @title CompressedConfiguration
 * @notice Compressed storage representation of governance configuration
 * @dev Packs configuration into minimal storage slots:
 *      Slot 1: Timing & percentages - votingDelay (32), votingDuration (32), executionDelay (32), gracePeriod (32),
 * quorum (64), requiredYeaMargin (64)
 *      Slot 2: Amounts & proposeConfig - minimumVotes (96), lockAmount (96), lockDelay (32), unused (32)
 *
 * This packing reduces storage from ~8 slots to 2 slots.
 * All timestamps use CompressedTimestamp (uint32, valid until year 2106).
 * Percentages (quorum, requiredYeaMargin) use uint64 (max 1e18).
 * Amounts use uint96 for realistic token amounts.
 * ProposeConfig fields are kept together in Slot 2.
 */
struct CompressedConfiguration {
  // Slot 1: Timing and percentages - 32*4 + 64*2 = 256 bits
  CompressedTimestamp votingDelay;
  CompressedTimestamp votingDuration;
  CompressedTimestamp executionDelay;
  CompressedTimestamp gracePeriod;
  uint64 quorum;
  uint64 requiredYeaMargin;
  // Slot 2: Amounts and proposeConfig - 96 + 96 + 32 = 224 bits (32 bits unused)
  uint96 minimumVotes;
  uint96 lockAmount;
  CompressedTimestamp lockDelay;
}

library CompressedConfigurationLib {
  using SafeCast for uint256;
  using CompressedTimeMath for Timestamp;
  using CompressedTimeMath for CompressedTimestamp;

  /**
   * @notice Get the propose configuration directly from storage
   * @param _compressed Storage pointer to compressed configuration
   * @return The propose configuration
   */
  function getProposeConfig(CompressedConfiguration storage _compressed)
    internal
    view
    returns (ProposeWithLockConfiguration memory)
  {
    return
      ProposeWithLockConfiguration({lockDelay: _compressed.lockDelay.decompress(), lockAmount: _compressed.lockAmount});
  }

  /**
   * @notice Compress a Configuration struct into CompressedConfiguration
   * @param _config The uncompressed configuration
   * @return The compressed configuration
   * @dev Values that exceed the compressed type limits will cause a revert.
   *      This is intentional to prevent storing invalid configurations.
   */
  function compress(Configuration memory _config) internal pure returns (CompressedConfiguration memory) {
    // Validate that amounts fit in their compressed types
    require(_config.proposeConfig.lockAmount <= type(uint96).max, "lockAmount exceeds uint96");
    require(_config.minimumVotes <= type(uint96).max, "minimumVotes exceeds uint96");
    require(_config.quorum <= type(uint64).max, "quorum exceeds uint64");
    require(_config.requiredYeaMargin <= type(uint64).max, "requiredYeaMargin exceeds uint64");

    return CompressedConfiguration({
      votingDelay: _config.votingDelay.compress(),
      votingDuration: _config.votingDuration.compress(),
      executionDelay: _config.executionDelay.compress(),
      gracePeriod: _config.gracePeriod.compress(),
      quorum: _config.quorum.toUint64(),
      requiredYeaMargin: _config.requiredYeaMargin.toUint64(),
      minimumVotes: _config.minimumVotes.toUint96(),
      lockAmount: _config.proposeConfig.lockAmount.toUint96(),
      lockDelay: _config.proposeConfig.lockDelay.compress()
    });
  }

  /**
   * @notice Decompress a CompressedConfiguration into Configuration
   * @param _compressed The compressed configuration
   * @return The uncompressed configuration
   */
  function decompress(CompressedConfiguration memory _compressed) internal pure returns (Configuration memory) {
    return Configuration({
      proposeConfig: ProposeWithLockConfiguration({
        lockDelay: _compressed.lockDelay.decompress(),
        lockAmount: _compressed.lockAmount
      }),
      votingDelay: _compressed.votingDelay.decompress(),
      votingDuration: _compressed.votingDuration.decompress(),
      executionDelay: _compressed.executionDelay.decompress(),
      gracePeriod: _compressed.gracePeriod.decompress(),
      quorum: _compressed.quorum,
      requiredYeaMargin: _compressed.requiredYeaMargin,
      minimumVotes: _compressed.minimumVotes
    });
  }
}
