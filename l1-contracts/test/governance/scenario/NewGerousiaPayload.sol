// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Apella} from "@aztec/governance/Apella.sol";
import {Gerousia} from "@aztec/governance/Gerousia.sol";

/**
 * @title NewGerousiaPayload
 * @author Aztec Labs
 * @notice A payload that upgrades the Gerousia contract to a new version.
 */
contract NewGerousiaPayload is IPayload {
  IRegistry public immutable REGISTRY;
  address public immutable NEW_GEROUSIA;

  constructor(IRegistry _registry) {
    REGISTRY = _registry;
    NEW_GEROUSIA = address(new Gerousia(_registry, 667, 1000));
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](1);

    Apella apella = Apella(REGISTRY.getApella());

    res[0] = Action({
      target: address(apella),
      data: abi.encodeWithSelector(apella.updateGerousia.selector, NEW_GEROUSIA)
    });

    return res;
  }
}
