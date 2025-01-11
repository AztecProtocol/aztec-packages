// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";

interface IGovernance {
  event Proposed(uint256 indexed proposalId, address indexed proposal);
  event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 amount);
  event ProposalExecuted(uint256 indexed proposalId);
  event GovernanceProposerUpdated(address indexed governanceProposer);
  event ConfigurationUpdated(Timestamp indexed time);

  event Deposit(address indexed depositor, address indexed onBehalfOf, uint256 amount);
  event WithdrawInitiated(uint256 indexed withdrawalId, address indexed recipient, uint256 amount);
  event WithdrawFinalised(uint256 indexed withdrawalId);

  function updateGovernanceProposer(address _governanceProposer) external;
  function updateConfiguration(DataStructures.Configuration memory _configuration) external;
  function deposit(address _onBehalfOf, uint256 _amount) external;
  function initiateWithdraw(address _to, uint256 _amount) external returns (uint256);
  function finaliseWithdraw(uint256 _withdrawalId) external;
  function propose(IPayload _proposal) external returns (bool);
  function proposeWithLock(IPayload _proposal, address _to) external returns (bool);
  function vote(uint256 _proposalId, uint256 _amount, bool _support) external returns (bool);
  function execute(uint256 _proposalId) external returns (bool);
  function dropProposal(uint256 _proposalId) external returns (bool);

  function powerAt(address _owner, Timestamp _ts) external view returns (uint256);
  function totalPowerAt(Timestamp _ts) external view returns (uint256);
  function getProposalState(uint256 _proposalId)
    external
    view
    returns (DataStructures.ProposalState);
  function getConfiguration() external view returns (DataStructures.Configuration memory);
  function getProposal(uint256 _proposalId) external view returns (DataStructures.Proposal memory);
  function getWithdrawal(uint256 _withdrawalId)
    external
    view
    returns (DataStructures.Withdrawal memory);
}
