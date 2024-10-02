// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Slot} from "@aztec/core/libraries/TimeMath.sol";

interface IGerousia {
  event VoteCast(address indexed proposal, uint256 indexed round, address indexed voter);
  event ProposalPushed(address indexed proposal, uint256 indexed round);

  function vote(address _proposa) external returns (bool);
  function pushProposal(uint256 _roundNumber) external returns (bool);
  function yeaCount(address _instance, uint256 _round, address _proposal)
    external
    view
    returns (uint256);
  function computeRound(Slot _slot) external view returns (uint256);
}
