// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Slot} from "@aztec/core/libraries/TimeMath.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

interface IGovernanceProposer {
  event VoteCast(IPayload indexed proposal, uint256 indexed round, address indexed voter);
  event ProposalExecuted(IPayload indexed proposal, uint256 indexed round);

  function vote(IPayload _proposal) external returns (bool);
  function executeProposal(uint256 _roundNumber) external returns (bool);
  function yeaCount(address _instance, uint256 _round, IPayload _proposal)
    external
    view
    returns (uint256);
  function computeRound(Slot _slot) external view returns (uint256);
  function getInstance() external view returns (address);
  function getExecutor() external view returns (address);
}
