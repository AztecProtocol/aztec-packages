// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";

/**
 * @title RegisterNewRollupVersionPayload
 * @author Aztec Labs
 * @notice A payload that registers a new rollup version.
 */
contract RegisterNewRollupVersionPayload is IPayload {
  IRegistry public immutable REGISTRY;
  address public immutable ROLLUP;

  constructor(IRegistry _registry, address _rollup) {
    REGISTRY = _registry;
    ROLLUP = _rollup;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](1);

    res[0] = Action({
      target: address(REGISTRY),
      data: abi.encodeWithSelector(IRegistry.upgrade.selector, ROLLUP)
    });

    return res;
  }
}
