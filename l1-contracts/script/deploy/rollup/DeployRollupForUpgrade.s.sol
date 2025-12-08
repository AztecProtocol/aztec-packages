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

import {DeployRollup} from "./DeployRollup.s.sol";
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
    // ============ L1 Infrastructure (loaded from env) ============
    Registry public registry;
    GSE public gseContract;
    Governance public governance;
    IERC20 public feeAsset;
    IERC20 public stakingAsset;
    RewardDistributor public rewardDistributor;

    // ============ Deployment ============
    address public deployer;
    DeployRollup public rollupDeployer;

    function setUp() public virtual {
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
    }

    /// @notice Deploy rollup and write output to file
    /// @param outputPath Path to write deployment JSON output
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
        registry = Registry(vm.envAddress("REGISTRY_ADDRESS"));
        gseContract = GSE(vm.envAddress("GSE_ADDRESS"));
        governance = Governance(vm.envAddress("GOVERNANCE_ADDRESS"));
        feeAsset = IERC20(vm.envAddress("FEE_ASSET_ADDRESS"));
        stakingAsset = IERC20(vm.envAddress("STAKING_ASSET_ADDRESS"));
        rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));
    }

    /// @notice Deploy rollup via DeployRollup helper
    /// @param rollupConfig Configuration for the rollup deployment
    function _deployRollupViaHelper(RollupConfiguration rollupConfig) internal {
        rollupDeployer = new DeployRollup();
        rollupDeployer.setUp();
        rollupDeployer.setEnv(
            deployer,
            registry,
            gseContract,
            governance,
            feeAsset,
            stakingAsset,
            rewardDistributor
        );
        rollupDeployer.deployRollupWithConfig(rollupConfig);
    }

    /// @notice Write deployment output to JSON file
    /// @param outputPath Path to write deployment JSON output
    function _writeDeploymentOutput(string memory outputPath) internal {
        string memory json = "rollup";
        // Rollup-related addresses from the deployer helper
        string memory finalJson = rollupDeployer.writeRollupAddressesToJson(json);
        vm.writeJson(finalJson, outputPath);
    }
}
