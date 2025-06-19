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
 * @notice  A payload wrapper that adds an extra check to ensure that sufficient
 *          stake is active at what is the canonical after the execution.
 *          Checking AFTER the proposal, since we can then ensure that a new
 *          canonical will have at least 2/3 of stake etc.
 *
 *          Note that this require that 2/3 are following canonical to move, as
 *          there won't otherwise be 2/3 after the move as attesters cannot deposit
 *          into a rollup before it have become canonical to avoid the issue of duplicate
 *          attesters.
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

  function getActions() external view override(IProposerPayload) returns (IPayload.Action[] memory) {
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
   * @notice We see the proposal as valid if after it the canonical have effectively >2/3 of stake
   */
  function amIValid() external view override(IProposerPayload) returns (bool) {
    uint256 totalSupply = GSE.totalSupply();
    address canonical = GSE.getCanonical();
    address magicCanonical = GSE.getCanonicalMagicAddress();
    uint256 supplyOfInstance = GSE.supplyOf(canonical) + GSE.supplyOf(magicCanonical);

    require(supplyOfInstance > totalSupply * 2 / 3, Errors.GovernanceProposer__GSEPayloadInvalid());
    return true;
  }
}
