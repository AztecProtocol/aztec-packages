// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {IGSE} from "@aztec/core/staking/GSE.sol";

/**
 * @title NewGovernanceProposerPayload
 * @author Aztec Labs
 * @notice A payload that upgrades the GovernanceProposer contract to a new version.
 */
contract NewGovernanceProposerPayload is IPayload {
  IRegistry public immutable REGISTRY;
  address public immutable NEW_GOVERNANCE_PROPOSER;

  constructor(IRegistry _registry, IGSE _gse) {
    REGISTRY = _registry;
    NEW_GOVERNANCE_PROPOSER = address(new GovernanceProposer(_registry, _gse, 667, 1000));
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](1);

    Governance governance = Governance(REGISTRY.getGovernance());

    res[0] = Action({
      target: address(governance),
      data: abi.encodeWithSelector(
        governance.updateGovernanceProposer.selector, NEW_GOVERNANCE_PROPOSER
      )
    });

    return res;
  }
}
