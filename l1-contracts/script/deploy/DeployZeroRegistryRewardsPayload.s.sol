// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {StdAssertions} from "forge-std/StdAssertions.sol";
import {console} from "forge-std/console.sol";

import {Ownable} from "@oz/access/Ownable.sol";

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Registry} from "@aztec/governance/Registry.sol";

import {RegistryReductionCalculator} from "@aztec/periphery/RegistryReductionCalculator.sol";
import {ZeroRegistryRewardsPayload} from "@aztec/periphery/ZeroRegistryRewardsPayload.sol";

import {ZeroRegistryRewardsSimulation} from "./ZeroRegistryRewardsSimulation.sol";

/**
 * @title DeployZeroRegistryRewardsPayload
 * @author Aztec Labs
 * @notice Deploys a {ZeroRegistryRewardsPayload} for the canonical rollup, for sequencers to signal for through the
 *         GovernanceProposer.
 *
 * @dev Usage:
 *        REGISTRY_ADDRESS=0x... forge script script/deploy/DeployZeroRegistryRewardsPayload.s.sol \
 *          --rpc-url $L1_RPC_URL --private-key $KEY --broadcast
 *      Re-check a deployed payload without deploying anything:
 *        REGISTRY_ADDRESS=0x... forge script ... --sig 'verify(address)' <payload> --rpc-url $L1_RPC_URL
 *
 *      `REGISTRY_ADDRESS` is the only environment input. The registry list is a literal in {_registries}, so
 *      reviewing this file is sufficient to review the deployment. The rollup is read off the registry.
 *
 *      The deployer holds no rights over the payload or over the calculator it deploys: the calculator is owned by
 *      the rollup's owner from construction. After deploying, {run} reads the payload back with {verify} and executes
 *      it through governance on a snapshot with {ZeroRegistryRewardsSimulation}, so a deploy cannot succeed while
 *      producing a payload that would fail.
 */
contract DeployZeroRegistryRewardsPayload is Script, StdAssertions {
  /// @notice Thrown when run against a chain this script has no registry list for.
  error DeployZeroRegistryRewardsPayload__UnsupportedChain(uint256 chainId);

  uint256 internal constant MAINNET_CHAIN_ID = 1;

  /// @notice The payload {run} deployed. Zero until it has run.
  ZeroRegistryRewardsPayload public deployedPayload;

  /// @notice The ATP registries the payload lists on the current chain.
  function _registries() internal view virtual returns (address[] memory registries) {
    if (block.chainid == MAINNET_CHAIN_ID) {
      registries = new address[](2);
      registries[0] = 0x667d2641cb96734f386adA6A9afCF07B1815fB8b;
      registries[1] = 0xD938bE4A2cB41105Bc2FbE707dca124A2e5d0c80;
      return registries;
    }
    revert DeployZeroRegistryRewardsPayload__UnsupportedChain(block.chainid);
  }

  /// @notice The registry the canonical rollup and governance are read from. `virtual` so a test can supply one
  ///         without the environment, which is shared between tests running in parallel.
  function _registry() internal view virtual returns (Registry) {
    return Registry(vm.envAddress("REGISTRY_ADDRESS"));
  }

  /// @notice Deploys the payload for the canonical rollup, then verifies and simulates it.
  function run() public {
    Registry registry = _registry();
    IInstance rollup = IInstance(address(registry.getCanonicalRollup()));
    address[] memory registries = _registries();

    // The payload's last action is `setSequencerRewardCalculator`, which rollups without calculator support do not
    // have. Reading the getter fails here, before broadcasting, rather than at execution.
    address currentCalculator = Rollup(address(rollup)).getSequencerRewardCalculator();
    assertEq(Ownable(address(rollup)).owner(), registry.getGovernance(), "rollup is not owned by governance");

    vm.startBroadcast(msg.sender);
    ZeroRegistryRewardsPayload payload = new ZeroRegistryRewardsPayload(rollup, registries);
    vm.stopBroadcast();

    verify(address(payload));

    console.log("rollup            ", address(rollup));
    console.log("current calculator", currentCalculator);
    console.log("payload           ", address(payload));
    console.log("calculator        ", address(payload.CALCULATOR()), "(installed by the payload)");

    _simulate(address(payload));

    deployedPayload = payload;
  }

  /**
   * @notice Asserts a deployed payload targets the canonical rollup, deploys a calculator owned by governance and
   *         bound to the rollup's GSE, and lists exactly the registries in {_registries}, in order.
   * @param _payload The deployed {ZeroRegistryRewardsPayload}
   */
  function verify(address _payload) public view {
    Registry registry = _registry();
    ZeroRegistryRewardsPayload payload = ZeroRegistryRewardsPayload(_payload);
    IInstance rollup = payload.ROLLUP();
    RegistryReductionCalculator calculator = payload.CALCULATOR();

    assertEq(address(rollup), address(registry.getCanonicalRollup()), "payload targets a non-canonical rollup");
    assertEq(calculator.owner(), registry.getGovernance(), "calculator owner is not governance");
    assertEq(address(calculator.GSE()), address(rollup.getGSE()), "calculator is bound to another GSE");

    address[] memory expected = _registries();
    assertEq(payload.registryCount(), expected.length, "registry count");
    for (uint256 i = 0; i < expected.length; i++) {
      assertEq(payload.registries(i), expected[i], "registry list");
    }

    IPayload.Action[] memory actions = payload.getActions();
    assertEq(actions.length, expected.length + 1, "one action per registry, plus the install");
    for (uint256 i = 0; i < expected.length; i++) {
      assertEq(actions[i].target, address(calculator), "registry action target");
      assertEq(
        actions[i].data,
        abi.encodeCall(RegistryReductionCalculator.setRegistryReward, (expected[i], 0)),
        "registry action data"
      );
    }
    assertEq(actions[expected.length].target, address(rollup), "install action target");
    assertEq(
      actions[expected.length].data,
      abi.encodeCall(IRollupCore.setSequencerRewardCalculator, (address(calculator))),
      "install action data"
    );
  }

  /**
   * @notice Runs the payload through governance against a state snapshot and reverts it.
   * @dev Requires forked state; see {ZeroRegistryRewardsSimulation}. `virtual` so a test against a local stack can
   *      skip it.
   */
  function _simulate(address _payload) internal virtual {
    new ZeroRegistryRewardsSimulation().simulate(_payload);
  }
}
