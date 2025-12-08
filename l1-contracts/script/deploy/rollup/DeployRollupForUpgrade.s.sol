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

import {DeployRollup, RollupAddressInput} from "./DeployRollup.s.sol";
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
contract DeployRollupForUpgrade is Script {
    /// @notice Rollup deployer script instance.
    DeployRollup public rollupDeployer;

    /// @notice Deploy rollup and write output to file
    function run(string memory outputPath) public {
        RollupConfiguration rollupConfig = new RollupConfiguration();
        rollupConfig.loadConfig();
        rollupDeployer = new DeployRollup();
        rollupDeployer.setEnv(_getRollupAddressInput());
        rollupDeployer.deployRollup(rollupConfig);
        string memory finalJson = rollupDeployer.writeRollupAddressesToJson("rollup");
        vm.writeJson(finalJson, outputPath);
    }

    /// @notice Parse existing L1 infrastructure from environment variables
    function _getRollupAddressInput() internal returns (RollupAddressInput memory) {
        return RollupAddressInput({
            // the --private-key passed to forge script:
            deployer: msg.sender,
            registry: Registry(vm.envAddress("REGISTRY_ADDRESS")),
            gse: GSE(vm.envAddress("GSE_ADDRESS")),
            governance: Governance(vm.envAddress("GOVERNANCE_ADDRESS")),
            feeAsset: IERC20(vm.envAddress("FEE_ASSET_ADDRESS")),
            stakingAsset: IERC20(vm.envAddress("STAKING_ASSET_ADDRESS")),
            rewardDistributor: RewardDistributor(
                address(Registry(vm.envAddress("REGISTRY_ADDRESS")).getRewardDistributor())
            )
        });
    }
}
