// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IGSECore} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IHaveVersion, IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";

/**
 * @title RegisterNewRollupVersionPayload
 * @author Aztec Labs
 * @notice A payload that registers a new rollup version in the Registry and GSE.
 * @dev Only executes while PREDECESSOR is still the canonical rollup, so a stale registration cannot demote a
 *      newer one.
 */
contract RegisterNewRollupVersionPayload is IPayload {
  /// @notice The registry the rollup is registered in.
  IRegistry public immutable REGISTRY;

  /// @notice The rollup to register.
  IInstance public immutable ROLLUP;

  /// @notice The rollup that was canonical when this payload was deployed. ROLLUP replaces it.
  IHaveVersion public immutable PREDECESSOR;

  /// @notice Thrown when PREDECESSOR is no longer the canonical rollup.
  error PredecessorNotCanonical(address predecessor, address canonical);

  /**
   * @param _registry The registry to register the rollup in
   * @param _rollup The rollup to register
   */
  constructor(IRegistry _registry, IInstance _rollup) {
    REGISTRY = _registry;
    ROLLUP = _rollup;
    PREDECESSOR = _registry.getCanonicalRollup();
  }

  /**
   * @notice Returns the actions that register ROLLUP.
   * @dev The first action checks that PREDECESSOR is still canonical, so a stale registration reverts before
   *      anything is written.
   * @return The array of actions to execute
   */
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](3);

    res[0] = Action({target: address(this), data: abi.encodeWithSelector(this.assertPredecessorIsCanonical.selector)});

    res[1] =
      Action({target: address(REGISTRY), data: abi.encodeWithSelector(IRegistry.addRollup.selector, address(ROLLUP))});

    res[2] = Action({
      target: address(ROLLUP.getGSE()), data: abi.encodeWithSelector(IGSECore.addRollup.selector, address(ROLLUP))
    });

    return res;
  }

  /// @notice Reverts unless PREDECESSOR is the canonical rollup in REGISTRY.
  /// @dev Called by Governance as the first action of this payload.
  // solhint-disable-next-line comprehensive-interface
  function assertPredecessorIsCanonical() external view {
    address canonical = address(REGISTRY.getCanonicalRollup());
    require(canonical == address(PREDECESSOR), PredecessorNotCanonical(address(PREDECESSOR), canonical));
  }

  /**
   * @notice Returns the URI describing this payload
   * @return The payload URI string
   */
  function getURI() external pure override(IPayload) returns (string memory) {
    return "RegisterNewRollupVersionPayload";
  }
}
