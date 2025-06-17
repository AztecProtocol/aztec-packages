// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Slot} from "@aztec/shared/libraries/TimeMath.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

interface IEmperor {
  // Not view because it might rely on transient storage.
  // Calls are essentially trusted
  function getCurrentProposer() external returns (address);

  function getCurrentSlot() external view returns (Slot);
}

interface IEmpire {
  event VoteCast(IPayload indexed proposal, uint256 indexed round, address indexed voter);
  event ProposalExecutable(IPayload indexed proposal, uint256 indexed round);
  event ProposalExecuted(IPayload indexed proposal, uint256 indexed round);

  function vote(IPayload _proposal) external returns (bool);
  function voteWithSig(IPayload _proposal, Signature memory _sig) external returns (bool);

  function executeProposal(uint256 _roundNumber) external returns (bool);
  function yeaCount(address _instance, uint256 _round, IPayload _proposal)
    external
    view
    returns (uint256);
  function computeRound(Slot _slot) external view returns (uint256);
  function getInstance() external view returns (address);
  function getExecutor() external view returns (address);
}
