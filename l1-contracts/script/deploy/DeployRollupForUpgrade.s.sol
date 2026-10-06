// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

import {ProofOfPossessionPreflight} from "@aztec/periphery/ProofOfPossessionPreflight.sol";
import {RegisterNewRollupVersionPayload} from "@aztec/periphery/RegisterNewRollupVersionPayload.sol";

import {DeployRollupLib, RollupAddressInput, RollupAddressOutput} from "./DeployRollupLib.sol";
import {IRollupConfiguration, RollupConfiguration} from "./RollupConfiguration.sol";

/// @title DeployRollupForUpgrade
/// @author Aztec Labs
/// @notice Standalone script for deploying a new Rollup contract as an upgrade.
/// This uses DeployRollupLib to deploy rollup contracts.
/// It loads existing L1 infrastructure from the registry and canonical rollup,
/// then outputs deployment results to JSON.
///
/// Only shared infrastructure addresses (governance, GSE, fee and staking assets, reward distributor) are
/// reused from the canonical rollup. The new rollup is an independent instance that starts from the
/// GenesisState supplied via environment variables; no archive, checkpoint, message or fee-juice state is
/// carried over from the canonical rollup, which stays registered under its own version.
///
/// This is the env-driven deployer for tests, the spartan/CLI tooling and testnets. Mainnet upgrades
/// do not run it: each mainnet rollup version is deployed by a bespoke pinned script,
/// `DeployRollupForUpgradeV<N>.s.sol`, that hard-codes and re-verifies the configuration of that one
/// deployment. Examples:
///   - v5: `DeployRollupForUpgradeV5.s.sol` on the `v5-next` branch
///   - v6: `DeployRollupForUpgradeV6.s.sol`
/// The environment-driven inputs consumed here and in `RollupConfiguration` describe a test network,
/// not mainnet.
///
/// For initial L1 deployment, use DeployAztecL1Contracts.s.sol instead.
///
/// See RollupConfiguration.sol for relevant environment variables.
contract DeployRollupForUpgrade is Script {
  /// @notice Rollup deployment output
  RollupAddressOutput internal _rollupOutput;

  /// @notice Governance payload for registering the new rollup version
  RegisterNewRollupVersionPayload internal _payload;

  /// @notice Read-only helper that checks a registration's proof of possession against the GSE's gas cap
  ProofOfPossessionPreflight internal _proofOfPossessionPreflight;

  /// @notice The JSON written to stdout by the last run
  string internal _deploymentJson;

  /// @notice Get rollup deployment output
  function rollupOutput() external view returns (RollupAddressOutput memory) {
    return _rollupOutput;
  }

  /// @notice Get the deployed governance payload
  function payload() external view returns (RegisterNewRollupVersionPayload) {
    return _payload;
  }

  /// @notice Get the deployed proof of possession preflight helper
  function proofOfPossessionPreflight() external view returns (ProofOfPossessionPreflight) {
    return _proofOfPossessionPreflight;
  }

  /// @notice Get the JSON written to stdout by the last run
  function deploymentJson() external view returns (string memory) {
    return _deploymentJson;
  }

  /// @notice Deploy rollup and write output to stdout
  function run() public {
    RollupAddressInput memory input = _getRollupAddressInput();
    IRollupConfiguration rollupConfig = new RollupConfiguration();
    rollupConfig.loadConfig();

    vm.startBroadcast(input.deployer);
    _rollupOutput = DeployRollupLib.deployRollup(input, rollupConfig);

    // Deploy governance payload for registering this rollup via governance
    _payload = new RegisterNewRollupVersionPayload(input.registry, IInstance(address(_rollupOutput.rollup)));

    // The helper is stateless and takes the GSE as an argument, so a fresh one per upgrade is harmless and
    // gives networks deployed before it existed an instance.
    _proofOfPossessionPreflight = new ProofOfPossessionPreflight();
    vm.stopBroadcast();
    require(
      _proofOfPossessionPreflight.bn254LibWrapperOf(address(input.gse)).code.length > 0,
      "DeployRollupForUpgrade: no BN254 wrapper at the address the preflight derives for the GSE"
    );

    // Write base rollup addresses to JSON, then add payload and helper addresses
    DeployRollupLib.writeRollupAddressesToJson(vm, "rollup", _rollupOutput);
    vm.serializeAddress("rollup", "payloadAddress", address(_payload));
    string memory finalJson =
      vm.serializeAddress("rollup", "proofOfPossessionPreflightAddress", address(_proofOfPossessionPreflight));
    _deploymentJson = finalJson;
    console.log("JSON DEPLOY RESULT:", finalJson);
  }

  function _requireRegistryHasCode(Registry _registry) internal view {
    require(address(_registry).code.length > 0, "DeployRollupForUpgrade: REGISTRY_ADDRESS has no code on this chain");
  }

  /// @notice Parse existing L1 infrastructure from environment variables
  function _getRollupAddressInput() internal returns (RollupAddressInput memory) {
    Registry registry = Registry(vm.envAddress("REGISTRY_ADDRESS"));
    _requireRegistryHasCode(registry);

    // Load existing addresses from the registry and canonical rollup.
    Governance governance = Governance(registry.getGovernance());
    IStaking rollup = IStaking(address(registry.getCanonicalRollup()));
    GSE gse = rollup.getGSE();
    IERC20 feeAsset = IRollup(address(rollup)).getFeeAsset();
    IERC20 stakingAsset = rollup.getStakingAsset();
    IRewardDistributor rewardDistributor = registry.getRewardDistributor();

    return RollupAddressInput({
      // DEPLOYER_ADDRESS env var is intended only for tests.
      deployer: vm.envOr("DEPLOYER_ADDRESS", msg.sender),
      registry: registry,
      gse: gse,
      governance: governance,
      feeAsset: feeAsset,
      stakingAsset: stakingAsset,
      rewardDistributor: rewardDistributor
    });
  }
}
