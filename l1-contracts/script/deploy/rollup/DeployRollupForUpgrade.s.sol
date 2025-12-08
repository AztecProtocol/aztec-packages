// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {DeployRollup, RollupDeploymentInput} from "./DeployRollup.s.sol";
import {RollupConfiguration} from "./RollupConfiguration.sol";

/// @title DeployRollupForUpgrade
/// @author Aztec Labs
/// @notice Standalone script for deploying a new Rollup contract as an upgrade.
/// This uses DeployRollup via composition to provide the entrypoint for standalone rollup upgrades.
/// It loads existing L1 infrastructure from environment variables and outputs
/// deployment results to JSON.
///
/// For initial L1 deployment, use DeployL1Contracts.s.sol instead.
///
/// Required environment variables:
/// - REGISTRY_ADDRESS: Existing Registry contract address
/// - GSE_ADDRESS: Existing GSE contract address
/// - GOVERNANCE_ADDRESS: Existing Governance contract address
/// - FEE_ASSET_ADDRESS: Existing fee asset ERC20 address
/// - STAKING_ASSET_ADDRESS: Existing staking asset ERC20 address
/// - DEPLOYER_ADDRESS: (optional) Address performing the deployment
contract DeployRollupForUpgrade is Script {
    /// @notice Input: L1 infrastructure addresses (loaded from env)
    RollupDeploymentInput public input;

    /// @notice Rollup deployer helper
    DeployRollup public rollupDeployer;

    function setUp() public virtual {
        input.deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
    }

    /// @notice Deploy rollup and write output to file
    function run(string memory outputPath) public {
        _parseInputAddresses();
        RollupConfiguration rollupConfig = new RollupConfiguration();
        rollupConfig.loadConfig();

        _deployRollupViaHelper(rollupConfig);

        _writeDeploymentOutput(outputPath);
    }

    /// @notice Deploy rollup without writing output
    function run() public {
        _parseInputAddresses();
        RollupConfiguration rollupConfig = new RollupConfiguration();
        rollupConfig.loadConfig();

        _deployRollupViaHelper(rollupConfig);
    }

    /// @notice Parse existing L1 infrastructure from environment variables
    function _parseInputAddresses() internal {
        input.registry = Registry(vm.envAddress("REGISTRY_ADDRESS"));
        input.gse = GSE(vm.envAddress("GSE_ADDRESS"));
        input.governance = Governance(vm.envAddress("GOVERNANCE_ADDRESS"));
        input.feeAsset = IERC20(vm.envAddress("FEE_ASSET_ADDRESS"));
        input.stakingAsset = IERC20(vm.envAddress("STAKING_ASSET_ADDRESS"));
        input.rewardDistributor = RewardDistributor(address(input.registry.getRewardDistributor()));
    }

    /// @notice Deploy rollup via DeployRollup helper
    function _deployRollupViaHelper(RollupConfiguration rollupConfig) internal {
        rollupDeployer = new DeployRollup();
        rollupDeployer.setEnv(input);
        rollupDeployer.deployRollupWithConfig(rollupConfig);
    }

    /// @notice Write deployment output to JSON file
    function _writeDeploymentOutput(string memory outputPath) internal {
        string memory json = "rollup";
        string memory finalJson = rollupDeployer.writeRollupAddressesToJson(json);
        vm.writeJson(finalJson, outputPath);
    }
}
