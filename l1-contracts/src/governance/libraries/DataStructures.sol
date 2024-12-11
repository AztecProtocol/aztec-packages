// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

/**
 * @title Data Structures Library
 * @author Aztec Labs
 * @notice Library that contains data structures used throughout Aztec governance
 */
library DataStructures {
  // docs:start:registry_snapshot
  /**
   * @notice Struct for storing address of cross communication components and the block number when it was updated
   * @param rollup - The address of the rollup contract
   * @param blockNumber - The block number of the snapshot
   */
  struct RegistrySnapshot {
    address rollup;
    uint256 blockNumber;
  }
  // docs:end:registry_snapshot

  struct ProposeConfiguration {
    Timestamp lockDelay;
    uint256 lockAmount;
  }

  struct Configuration {
    ProposeConfiguration proposeConfig;
    Timestamp votingDelay;
    Timestamp votingDuration;
    Timestamp executionDelay;
    Timestamp gracePeriod;
    uint256 quorum;
    uint256 voteDifferential;
    uint256 minimumVotes;
  }

  struct Ballot {
    uint256 yea;
    uint256 nea;
  }

  enum ProposalState {
    Pending,
    Active,
    Queued,
    Executable,
    Rejected,
    Executed,
    Dropped,
    Expired
  }

  struct Proposal {
    Configuration config;
    ProposalState state;
    IPayload payload;
    address governanceProposer;
    Timestamp creation;
    Ballot summedBallot;
  }

  struct CheckPoint {
    Timestamp time;
    uint256 power;
  }

  struct User {
    uint256 numCheckPoints;
    mapping(uint256 checkpointIndex => CheckPoint) checkpoints;
  }

  struct Withdrawal {
    uint256 amount;
    Timestamp unlocksAt;
    address recipient;
    bool claimed;
  }
}
