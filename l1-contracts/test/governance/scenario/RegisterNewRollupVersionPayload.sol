// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IGSECore} from "@aztec/core/staking/GSE.sol";

/**
 * @title RegisterNewRollupVersionPayload
 * @author Aztec Labs
 * @notice A payload that registers a new rollup version.
 */
contract RegisterNewRollupVersionPayload is IPayload {
  IRegistry public immutable REGISTRY;
  IInstance public immutable ROLLUP;

  constructor(IRegistry _registry, IInstance _rollup) {
    REGISTRY = _registry;
    ROLLUP = _rollup;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](2);

    res[0] = Action({
      target: address(REGISTRY),
      data: abi.encodeWithSelector(IRegistry.addRollup.selector, address(ROLLUP))
    });

    res[1] = Action({
      target: address(ROLLUP.getGSE()),
      data: abi.encodeWithSelector(IGSECore.addRollup.selector, address(ROLLUP))
    });

    return res;
  }
}
