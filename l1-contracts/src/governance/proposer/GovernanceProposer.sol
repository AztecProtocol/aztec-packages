// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IGSE} from "@aztec/governance/GSE.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {IEmpire} from "@aztec/governance/interfaces/IEmpire.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {IGovernanceProposer} from "@aztec/governance/interfaces/IGovernanceProposer.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {EmpireBase} from "./EmpireBase.sol";

/**
 * @title GovernanceProposer
 * An implementation of EmpireBase, used to propose payloads to governance from sequencers on the canonical rollup.
 *
 * Note: any payload which passes through this contract will have a call to GSEPayload.amIValid appended to the
 * list of actions before it is proposed to Governance.
 * This will cause the proposal to revert if 2/3 of all stake in the GSE are not staked on the canonical rollup after
 * the *original* payload is executed by Governance.
 */
contract GovernanceProposer is IGovernanceProposer, EmpireBase {
  IRegistry public immutable REGISTRY;
  IGSE public immutable GSE;

  /**
   * @dev Mapping of proposal ID to the proposer address.
   * This allows instances to see if they were the proposer of a proposal
   * after the payload is `propose`ed to Governance.
   * Instances that *did* propose a proposal are willing to vote on it in Governance.
   * See `StakingLib.vote` for more details.
   */
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

  /**
   * @dev Returns the address of the Governance contract, i.e. the contract at which
   * we will `propose` a winning proposal.
   */
  function getGovernance() public view override(IGovernanceProposer) returns (address) {
    return REGISTRY.getGovernance();
  }

  /**
   * @dev A hook used by the EmpireBase to determine who is the current block builder (block "proposer"),
   * and thus may signal.
   *
   * This contract only respects the canonical rollup.
   */
  function getInstance() public view override(EmpireBase, IEmpire) returns (address) {
    return address(REGISTRY.getCanonicalRollup());
  }

  /**
   * @dev Called by the EmpireBase contract in `submitRoundWinner`, which asserts that the payload
   * has enough support to be proposed to Governance.
   *
   * Note that it wraps the original payload in a GSEPayload before pushing into the Governance contract.
   *
   * This creates additional checks, namely that *after* the original payload is executed,
   * the canonical rollup (both the instance and the "magical address") has at least 2/3 of the total stake.
   *
   * @param _payload The payload to propose to the governance contract.
   * @return true if the proposal was proposed successfully, reverts otherwise.
   */
  function _handleRoundWinner(IPayload _payload) internal override(EmpireBase) returns (bool) {
    GSEPayload extendedPayload = new GSEPayload(_payload, GSE);
    uint256 proposalId = IGovernance(getGovernance()).propose(IPayload(address(extendedPayload)));
    proposalProposer[proposalId] = getInstance();
    return true;
  }
}
