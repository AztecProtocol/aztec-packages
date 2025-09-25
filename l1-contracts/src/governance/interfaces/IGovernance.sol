// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Ballot} from "@aztec/governance/libraries/compressed-data/Ballot.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

// @notice if this changes, please update the enum in governance.ts
enum ProposalState {
  Pending,
  Active,
  Queued,
  Executable,
  Rejected,
  Executed,
  Droppable,
  Dropped,
  Expired
}

struct ProposeWithLockConfiguration {
  Timestamp lockDelay;
  uint256 lockAmount;
}

struct Configuration {
  ProposeWithLockConfiguration proposeConfig;
  Timestamp votingDelay;
  Timestamp votingDuration;
  Timestamp executionDelay;
  Timestamp gracePeriod;
  uint256 quorum;
  uint256 requiredYeaMargin;
  uint256 minimumVotes;
}

// Configuration for proposals - same as Configuration but without proposeConfig
// since proposeConfig is only used for proposeWithLock, not for the proposal itself
struct ProposalConfiguration {
  Timestamp votingDelay;
  Timestamp votingDuration;
  Timestamp executionDelay;
  Timestamp gracePeriod;
  uint256 quorum;
  uint256 requiredYeaMargin;
  uint256 minimumVotes;
}

struct Proposal {
  ProposalConfiguration config;
  ProposalState cachedState;
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
  event BeneficiaryAdded(address beneficiary);
  event FloodGatesOpened();

  event Proposed(uint256 indexed proposalId, address indexed proposal);
  event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 amount);
  event ProposalExecuted(uint256 indexed proposalId);
  event ProposalDropped(uint256 indexed proposalId);
  event GovernanceProposerUpdated(address indexed governanceProposer);
  event ConfigurationUpdated(Timestamp indexed time);

  event Deposit(address indexed depositor, address indexed onBehalfOf, uint256 amount);
  event WithdrawInitiated(uint256 indexed withdrawalId, address indexed recipient, uint256 amount);
  event WithdrawFinalized(uint256 indexed withdrawalId);

  function addBeneficiary(address _beneficiary) external;
  function openFloodgates() external;

  function updateGovernanceProposer(address _governanceProposer) external;
  function updateConfiguration(Configuration memory _configuration) external;
  function deposit(address _onBehalfOf, uint256 _amount) external;
  function initiateWithdraw(address _to, uint256 _amount) external returns (uint256);
  function finalizeWithdraw(uint256 _withdrawalId) external;
  function propose(IPayload _proposal) external returns (uint256);
  function proposeWithLock(IPayload _proposal, address _to) external returns (uint256);
  function vote(uint256 _proposalId, uint256 _amount, bool _support) external;
  function execute(uint256 _proposalId) external;
  function dropProposal(uint256 _proposalId) external;

  function isPermittedInGovernance(address _caller) external view returns (bool);
  function isAllBeneficiariesAllowed() external view returns (bool);

  function powerAt(address _owner, Timestamp _ts) external view returns (uint256);
  function powerNow(address _owner) external view returns (uint256);
  function totalPowerAt(Timestamp _ts) external view returns (uint256);
  function totalPowerNow() external view returns (uint256);
  function getProposalState(uint256 _proposalId) external view returns (ProposalState);
  function getConfiguration() external view returns (Configuration memory);
  function getProposal(uint256 _proposalId) external view returns (Proposal memory);
  function getWithdrawal(uint256 _withdrawalId) external view returns (Withdrawal memory);
  function getBallot(uint256 _proposalId, address _user) external view returns (Ballot memory);
}
