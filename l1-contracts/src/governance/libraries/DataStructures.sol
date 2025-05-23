// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

/**
 * @title Data Structures Library
 * @author Aztec Labs
 * @notice Library that contains data structures used throughout Aztec governance
 */
library DataStructures {
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

  // @notice if this changes, please update the enum in governance.ts
  // solhint-disable ordering
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

  struct Withdrawal {
    uint256 amount;
    Timestamp unlocksAt;
    address recipient;
    bool claimed;
  }
}
