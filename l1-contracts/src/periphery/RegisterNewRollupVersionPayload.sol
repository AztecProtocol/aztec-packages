// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IGSECore} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";

/**
 * @title RegisterNewRollupVersionPayload
 * @author Aztec Labs
 * @notice A payload that registers a new rollup version in the Registry and GSE.
 */
contract RegisterNewRollupVersionPayload is IPayload {
  /// @notice The registry contract where the rollup will be registered
  IRegistry public immutable REGISTRY;

  /// @notice The rollup instance to register
  IInstance public immutable ROLLUP;

  /**
   * @notice Constructs a new RegisterNewRollupVersionPayload
   * @param _registry The registry contract
   * @param _rollup The rollup instance to register
   */
  constructor(IRegistry _registry, IInstance _rollup) {
    REGISTRY = _registry;
    ROLLUP = _rollup;
  }

  /**
   * @notice Returns the actions to execute for registering the new rollup version
   * @return The array of actions to execute
   */
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](3);

    res[0] =
      Action({target: address(REGISTRY), data: abi.encodeWithSelector(IRegistry.addRollup.selector, address(ROLLUP))});

    res[1] = Action({
      target: address(ROLLUP.getGSE()), data: abi.encodeWithSelector(IGSECore.addRollup.selector, address(ROLLUP))
    });

    // Pins the validator-set sample floor to this transaction's timestamp, so the rollup can form a
    // committee from its inherited validators immediately instead of stalling for `lag + 1` epochs.
    // MUST stay after `GSE.addRollup`: until that action runs the GSE still reports the previous
    // rollup as its latest, and the setter rejects a floor pinned at such a timestamp.
    res[2] = Action({
      target: address(ROLLUP), data: abi.encodeWithSelector(IValidatorSelectionCore.setValidatorSetSampleFloor.selector)
    });

    return res;
  }

  /**
   * @notice Returns the URI describing this payload
   * @return The payload URI string
   */
  function getURI() external pure override(IPayload) returns (string memory) {
    return "RegisterNewRollupVersionPayload";
  }
}
