// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Slot} from "@aztec/core/libraries/TimeMath.sol";
import {IApella} from "@aztec/governance/interfaces/IApella.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

interface IGerousia {
  event VoteCast(IPayload indexed proposal, uint256 indexed round, address indexed voter);
  event ProposalPushed(IPayload indexed proposal, uint256 indexed round);

  function vote(IPayload _proposa) external returns (bool);
  function pushProposal(uint256 _roundNumber) external returns (bool);
  function yeaCount(address _instance, uint256 _round, IPayload _proposal)
    external
    view
    returns (uint256);
  function computeRound(Slot _slot) external view returns (uint256);
  function getApella() external view returns (IApella);
}
