// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IGSE} from "@aztec/governance/GSE.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
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
 * - `GSE.proposeWithLock`, which bypasses the GovernanceProposer
 */
contract GSEPayload is IProposerPayload {
  IPayload public immutable ORIGINAL;
  IGSE public immutable GSE;
  IRegistry public immutable REGISTRY;

  constructor(IPayload _originalPayloadProposal, IGSE _gse, IRegistry _registry) {
    ORIGINAL = _originalPayloadProposal;
    GSE = _gse;
    REGISTRY = _registry;
  }

  function getOriginalPayload() external view override(IProposerPayload) returns (IPayload) {
    return ORIGINAL;
  }

  function getURI() external view override(IPayload) returns (string memory) {
    return ORIGINAL.getURI();
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

    actions[originalActions.length] =
      IPayload.Action({target: address(this), data: abi.encodeWithSelector(GSEPayload.amIValid.selector)});

    return actions;
  }

  /**
   * @notice Validates that the proposal maintains governance system integrity by ensuring
   *         sufficient stake remains on the active rollup after execution.
   *
   * The validation passes when EITHER:
   * 1. The latest rollup (plus bonus instance) has >2/3 of total stake, OR
   * 2. A Registry/GSE mismatch is detected (fail-open to prevent governance livelock)
   *
   * @dev The "bonus instance" is a special GSE mechanism where attesters automatically
   *      follow the latest rollup without re-depositing. Their stake counts toward
   *      the latest rollup's total for this validation.
   *
   * @dev LIVELOCK PREVENTION: When canonical != latest, we intentionally return true
   *      to bypass validation. This mismatch typically indicates the GovernanceProposer
   *      is still pointing to a stale GSE contract after a rollup upgrade.
   *
   *      Why this creates a livelock:
   *      - The stale GSE tracks an outdated rollup as "latest"
   *      - The Registry correctly identifies the new rollup as canonical
   *      - Economic incentives drive attesters to follow the canonical (where rewards are)
   *      - The stale GSE's "latest" gradually bleeds stake as rational actors exit
   *      - While theoretically possible to maintain >2/3 stake, it becomes increasingly
   *        unlikely as only inattentive or non-reward-seeking attesters remain
   *      - Proposals keep failing validation, creating a probabilistic livelock where
   *        progress is technically possible but economically improbable
   *
   *      By returning true, we provide an escape hatch that allows governance to
   *      continue functioning despite the misconfiguration, enabling corrective
   *      proposals to update the GovernanceProposer's GSE reference.
   *
   * @dev This function executes as the final action of the proposal (see getActions).
   *      It either reverts with an error (proposal invalid) or returns true (proposal valid).
   *      The boolean return value is effectively ceremonial - only the revert matters.
   *
   * @return Always returns true if the proposal is valid; reverts otherwise
   */
  function amIValid() external view override(IProposerPayload) returns (bool) {
    address canonicalRollup = address(REGISTRY.getCanonicalRollup());
    address latestRollup = GSE.getLatestRollup();

    // Bypass validation on mismatch to prevent economically-driven livelock
    // In theory, >2/3 stake could remain on the stale rollup, but economic
    // incentives make this highly unlikely
    if (canonicalRollup != latestRollup) {
      return true;
    }

    // Standard validation: ensure >2/3 of stake remains with the latest rollup
    uint256 totalSupply = GSE.totalSupply();
    address bonusInstance = GSE.getBonusInstanceAddress();
    uint256 effectiveSupplyOfLatestRollup = GSE.supplyOf(latestRollup) + GSE.supplyOf(bonusInstance);

    require(effectiveSupplyOfLatestRollup > totalSupply * 2 / 3, Errors.GovernanceProposer__GSEPayloadInvalid());
    return true;
  }
}
