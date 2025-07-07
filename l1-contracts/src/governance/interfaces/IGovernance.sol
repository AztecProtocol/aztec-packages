// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

// @notice if this changes, please update the enum in governance.ts
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

struct Proposal {
  Configuration config;
  ProposalState state;
  IPayload payload;
  address proposer;
  Timestamp creation;
  Ballot summedBallot;
}

struct Withdrawal {
  uint256 amount;
  Timestamp unlocksAt;
  address recipient;
  bool claimed;
}

interface IGovernance {
  event DepositorAdded(address depositor);
  event FloodGatesOpened();

  event Proposed(uint256 indexed proposalId, address indexed proposal);
  event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 amount);
  event ProposalExecuted(uint256 indexed proposalId);
  event GovernanceProposerUpdated(address indexed governanceProposer);
  event ConfigurationUpdated(Timestamp indexed time);

  event Deposit(address indexed depositor, address indexed onBehalfOf, uint256 amount);
  event WithdrawInitiated(uint256 indexed withdrawalId, address indexed recipient, uint256 amount);
  event WithdrawFinalised(uint256 indexed withdrawalId);

  function addDepositor(address _depositor) external;
  function openFloodgates() external;

  function updateGovernanceProposer(address _governanceProposer) external;
  function updateConfiguration(Configuration memory _configuration) external;
  function deposit(address _onBehalfOf, uint256 _amount) external;
  function initiateWithdraw(address _to, uint256 _amount) external returns (uint256);
  function finaliseWithdraw(uint256 _withdrawalId) external;
  function propose(IPayload _proposal) external returns (uint256);
  function proposeWithLock(IPayload _proposal, address _to) external returns (uint256);
  function vote(uint256 _proposalId, uint256 _amount, bool _support) external returns (bool);
  function execute(uint256 _proposalId) external returns (bool);
  function dropProposal(uint256 _proposalId) external returns (bool);

  function isAllowedToDeposit(address _caller) external view returns (bool);
  function isAllDepositsAllowed() external view returns (bool);

  function powerAt(address _owner, Timestamp _ts) external view returns (uint256);
  function totalPowerAt(Timestamp _ts) external view returns (uint256);
  function getProposalState(uint256 _proposalId) external view returns (ProposalState);
  function getConfiguration() external view returns (Configuration memory);
  function getProposal(uint256 _proposalId) external view returns (Proposal memory);
  function getWithdrawal(uint256 _withdrawalId) external view returns (Withdrawal memory);
}
