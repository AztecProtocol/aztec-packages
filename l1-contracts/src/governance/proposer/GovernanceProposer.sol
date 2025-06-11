// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IGSE} from "@aztec/core/staking/GSE.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {IEmpire} from "@aztec/governance/interfaces/IEmpire.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {IGovernanceProposer} from "@aztec/governance/interfaces/IGovernanceProposer.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {EmpireBase} from "./EmpireBase.sol";

/**
 * @notice  A GovernanceProposer implementation following the empire model
 *          Beware that while governance generally do not care about the implementation
 *          this implementation will since it is dependent on the sequencer selection.
 *          This also means that the implementation here will need to be "updated" if
 *          the interfaces of the sequencer selection changes, for example going optimistic.
 */
contract GovernanceProposer is IGovernanceProposer, EmpireBase {
  IRegistry public immutable REGISTRY;
  IGSE public immutable GSE;

  mapping(uint256 proposalId => address proposer) internal proposalProposer;

  constructor(IRegistry _registry, IGSE _gse, uint256 _n, uint256 _m) EmpireBase(_n, _m) {
    REGISTRY = _registry;
    GSE = _gse;
  }

  function getProposalProposer(uint256 _proposalId)
    external
    view
    override(IGovernanceProposer)
    returns (address)
  {
    return proposalProposer[_proposalId];
  }

  function getExecutor() public view override(EmpireBase, IEmpire) returns (address) {
    return REGISTRY.getGovernance();
  }

  function getInstance() public view override(EmpireBase, IEmpire) returns (address) {
    return address(REGISTRY.getCanonicalRollup());
  }

  function _execute(IPayload _proposal) internal override(EmpireBase) returns (bool) {
    GSEPayload extendedPayload = new GSEPayload(_proposal, GSE);
    uint256 proposalId = IGovernance(getExecutor()).propose(IPayload(address(extendedPayload)));
    proposalProposer[proposalId] = getInstance();
    return true;
  }
}
