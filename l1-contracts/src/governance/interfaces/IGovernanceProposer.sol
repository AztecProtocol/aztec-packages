// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {IEmpire} from "./IEmpire.sol";

interface IGovernanceProposer is IEmpire {
  function getProposalProposer(uint256 _proposalId) external view returns (address);
}
