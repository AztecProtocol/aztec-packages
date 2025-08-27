// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Proposal, ProposalState, ProposalConfiguration} from "@aztec/governance/interfaces/IGovernance.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {CompressedBallot, BallotLib} from "@aztec/governance/libraries/compressed-data/Ballot.sol";
import {CompressedConfiguration} from "@aztec/governance/libraries/compressed-data/Configuration.sol";
import {CompressedTimestamp, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

/**
 * @title CompressedProposal
 * @notice Compressed storage representation of governance proposals
 * @dev Packs proposal data with embedded config values into 4 storage slots:
 *      Slot 1: proposer (160) + minimumVotes (96) = 256 bits
 *      Slot 2: cachedState (8) + creation (32) + timing fields (32*4) + quorum (64) = 232 bits
 *      Slot 3: summedBallot (256 bits as CompressedBallot)
 *      Slot 4: payload (160) + requiredYeaMargin (64) = 224 bits
 *
 * This packing reduces storage from ~10 slots to 4 slots by embedding config values
 * directly instead of storing the entire configuration struct.
 */
struct CompressedProposal {
  // Slot 1: Core Identity (256 bits)
  address proposer; // 160 bits
  uint96 minimumVotes; // 96 bits - from config
  // Slot 2: Timing (232 bits used, 24 bits padding)
  ProposalState cachedState; // 8 bits
  CompressedTimestamp creation; // 32 bits
  CompressedTimestamp votingDelay; // 32 bits - from config
  CompressedTimestamp votingDuration; // 32 bits - from config
  CompressedTimestamp executionDelay; // 32 bits - from config
  CompressedTimestamp gracePeriod; // 32 bits - from config
  uint64 quorum; // 64 bits - from config
  // Slot 3: Votes (256 bits)
  CompressedBallot summedBallot; // 256 bits (128 yea + 128 nay)
  // Slot 4: References (224 bits used, 32 bits padding)
  IPayload payload; // 160 bits
  uint64 requiredYeaMargin; // 64 bits - from config
}

library CompressedProposalLib {
  using SafeCast for uint256;
  using CompressedTimeMath for Timestamp;
  using CompressedTimeMath for CompressedTimestamp;
  using BallotLib for CompressedBallot;

  /**
   * @notice Add yea votes to the proposal
   * @param _compressed Storage pointer to compressed proposal
   * @param _amount The amount of yea votes to add
   */
  function addYea(CompressedProposal storage _compressed, uint256 _amount) internal {
    _compressed.summedBallot = _compressed.summedBallot.addYea(_amount);
  }

  /**
   * @notice Add nay votes to the proposal
   * @param _compressed Storage pointer to compressed proposal
   * @param _amount The amount of nay votes to add
   */
  function addNay(CompressedProposal storage _compressed, uint256 _amount) internal {
    _compressed.summedBallot = _compressed.summedBallot.addNay(_amount);
  }

  /**
   * @notice Get yea and nay votes
   * @param _compressed Storage pointer to compressed proposal
   * @return yea The yea votes
   * @return nay The nay votes
   */
  function getVotes(CompressedProposal storage _compressed) internal view returns (uint256 yea, uint256 nay) {
    yea = _compressed.summedBallot.getYea();
    nay = _compressed.summedBallot.getNay();
  }

  /**
   * @notice Create a compressed proposal from uncompressed data and config
   * @param _proposer The proposal creator
   * @param _payload The payload to execute
   * @param _creation The creation timestamp
   * @param _config The compressed configuration to embed
   * @return The compressed proposal
   */
  function create(address _proposer, IPayload _payload, Timestamp _creation, CompressedConfiguration memory _config)
    internal
    pure
    returns (CompressedProposal memory)
  {
    return CompressedProposal({
      proposer: _proposer,
      minimumVotes: _config.minimumVotes,
      cachedState: ProposalState.Pending,
      creation: _creation.compress(),
      votingDelay: _config.votingDelay,
      votingDuration: _config.votingDuration,
      executionDelay: _config.executionDelay,
      gracePeriod: _config.gracePeriod,
      quorum: _config.quorum,
      summedBallot: CompressedBallot.wrap(0),
      payload: _payload,
      requiredYeaMargin: _config.requiredYeaMargin
    });
  }

  /**
   * @notice Compress an uncompressed Proposal into a CompressedProposal
   * @param _proposal The uncompressed proposal to compress
   * @return The compressed proposal
   */
  function compress(Proposal memory _proposal) internal pure returns (CompressedProposal memory) {
    return CompressedProposal({
      proposer: _proposal.proposer,
      minimumVotes: _proposal.config.minimumVotes.toUint96(),
      cachedState: _proposal.cachedState,
      creation: _proposal.creation.compress(),
      votingDelay: _proposal.config.votingDelay.compress(),
      votingDuration: _proposal.config.votingDuration.compress(),
      executionDelay: _proposal.config.executionDelay.compress(),
      gracePeriod: _proposal.config.gracePeriod.compress(),
      quorum: _proposal.config.quorum.toUint64(),
      summedBallot: BallotLib.compress(_proposal.summedBallot),
      payload: _proposal.payload,
      requiredYeaMargin: _proposal.config.requiredYeaMargin.toUint64()
    });
  }

  /**
   * @notice Decompress a CompressedProposal into a standard Proposal
   * @param _compressed The compressed proposal
   * @return The uncompressed proposal
   */
  function decompress(CompressedProposal memory _compressed) internal pure returns (Proposal memory) {
    return Proposal({
      config: ProposalConfiguration({
        votingDelay: _compressed.votingDelay.decompress(),
        votingDuration: _compressed.votingDuration.decompress(),
        executionDelay: _compressed.executionDelay.decompress(),
        gracePeriod: _compressed.gracePeriod.decompress(),
        quorum: _compressed.quorum,
        requiredYeaMargin: _compressed.requiredYeaMargin,
        minimumVotes: _compressed.minimumVotes
      }),
      cachedState: _compressed.cachedState,
      payload: _compressed.payload,
      proposer: _compressed.proposer,
      creation: _compressed.creation.decompress(),
      summedBallot: _compressed.summedBallot.decompress()
    });
  }
}
