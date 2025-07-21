// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IGSE} from "@aztec/governance/GSE.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IPayload} from "./interfaces/IPayload.sol";
import {IProposerPayload} from "./interfaces/IProposerPayload.sol";

/**
 * @title   GSEPayload
 *
 * @notice  This contract is used by the GovernanceProposer to enforce checks on an existing payload.
 *
 * In the GovernanceProposer, support for payloads may be signalled by the current block proposer of the
 * current canonical rollup according to the Registry. Once a payload receives enough support,
 * it may be submitted by the GovernanceProposer.
 *
 * Instead of proposing the original payload to Governance, the GovernanceProposer creates a new GSEPayload,
 * referencing the original payload. It is this new GSEPayload which is proposed via Governance.propose.
 * If/when the GSE payload is executed, Governance calls `getActions`, which copies the actions of the original
 * payload, and appends a call to `amIValid` to it.
 *
 * NB `amIValid` will fail if the 2/3 of the total stake is not "following canonical", irrespective
 * of what the original proposal does. Note that the GSE is used to perform these checks, hence the name.
 *
 * For example, if the original proposal is just to update a configuration parameter, but in the meantime
 * half of the stake has exited the canonical rollup in the GSE, `amIValid` will fail.
 *
 * In such an event, your recourse is either:
 * - wait for the canonical rollup to have at least 2/3 of the total stake
 * - `GSE.proposeWithLock`, which bypasses the GovernaceProposer
 */
contract GSEPayload is IProposerPayload {
  IPayload public immutable ORIGINAL;
  IGSE public immutable GSE;

  constructor(IPayload _originalPayloadProposal, IGSE _gse) {
    ORIGINAL = _originalPayloadProposal;
    GSE = _gse;
  }

  function getOriginalPayload() external view override(IProposerPayload) returns (IPayload) {
    return ORIGINAL;
  }

  /**
   * @notice called by the Governance contract when executing the proposal.
   *
   * Note that this contract simply appends a call to `amIValid` to the original actions.
   */
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory originalActions = ORIGINAL.getActions();
    IPayload.Action[] memory actions = new IPayload.Action[](originalActions.length + 1);

    for (uint256 i = 0; i < originalActions.length; i++) {
      actions[i] = originalActions[i];
    }

    actions[originalActions.length] = IPayload.Action({
      target: address(this),
      data: abi.encodeWithSelector(GSEPayload.amIValid.selector)
    });

    return actions;
  }

  /**
   * @notice We see the proposal as valid if after its execution,
   * the latest rollup in the GSE (including the "bonus instance")
   * have >2/3 of total stake.
   *
   * @dev This function is ONLY meant to be called by the entity executing the proposal, i.e. Governance.
   * As you can see, a call to this function is embedded in the `getActions` above, and its return value
   * is effectively meaningless outside the context of this payload's execution by Governance.
   */
  function amIValid() external view override(IProposerPayload) returns (bool) {
    uint256 totalSupply = GSE.totalSupply();
    address latestRollup = GSE.getLatestRollup();
    address bonusInstance = GSE.getBonusInstanceAddress();
    uint256 effectiveSupplyOfLatestRollup = GSE.supplyOf(latestRollup) + GSE.supplyOf(bonusInstance);

    require(
      effectiveSupplyOfLatestRollup > totalSupply * 2 / 3,
      Errors.GovernanceProposer__GSEPayloadInvalid()
    );
    return true;
  }
}
