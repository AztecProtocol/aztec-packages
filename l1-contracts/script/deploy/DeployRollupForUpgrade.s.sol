// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";

import {DeployRollupLib, RollupAddressInput, RollupAddressOutput} from "./DeployRollupLib.sol";
import {IRollupConfiguration, RollupConfiguration} from "./RollupConfiguration.sol";

/// @title DeployRollupForUpgrade
/// @author Aztec Labs
/// @notice Standalone script for deploying a new Rollup contract as an upgrade.
/// This uses DeployRollupLib to deploy rollup contracts.
/// It loads existing L1 infrastructure from environment variables and outputs
/// deployment results to JSON.
///
/// For initial L1 deployment, use DeployAztecL1Contracts.s.sol instead.
///
/// Required environment variables:
/// - REGISTRY_ADDRESS: Existing Registry contract address
/// - GSE_ADDRESS: Existing GSE contract address
/// - GOVERNANCE_ADDRESS: Existing Governance contract address
/// - FEE_ASSET_ADDRESS: Existing fee asset ERC20 address
/// - STAKING_ASSET_ADDRESS: Existing staking asset ERC20 address
contract DeployRollupForUpgrade is Script {
    /// @notice Rollup deployment output
    RollupAddressOutput public rollupOutput;

    /// @notice Deploy rollup and write output to file
    function run(string memory outputPath) public {
        RollupAddressInput memory input = _getRollupAddressInput();
        IRollupConfiguration rollupConfig = new RollupConfiguration();
        rollupConfig.loadConfig();

        vm.startBroadcast(input.deployer);
        rollupOutput = DeployRollupLib.deployRollup(input, rollupConfig);
        vm.stopBroadcast();

        string memory finalJson = DeployRollupLib.writeRollupAddressesToJson(vm, "rollup", rollupOutput);
        vm.writeJson(finalJson, outputPath);
    }

    /// @notice Parse existing L1 infrastructure from environment variables
    function _getRollupAddressInput() internal returns (RollupAddressInput memory) {
        Registry registry = Registry(vm.envAddress("REGISTRY_ADDRESS"));

        // Load existing addresses from the registry.
        Governance governance = Governance(registry.getGovernance());
        GovernanceProposer governanceProposer = GovernanceProposer(governance.governanceProposer());
        GSE gse = GSE(address(governanceProposer.GSE()));
        IRollup rollup = IRollup(address(registry.getCanonicalRollup()));
        // We support these being separate for test cases.
        // NOTE(AD): Do we still need to support this? Could simplify a bit.
        IERC20 feeAsset = rollup.getFeeAsset();
        IERC20 stakingAsset = governance.ASSET();
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
