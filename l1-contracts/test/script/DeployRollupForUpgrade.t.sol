// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {DeployL1Contracts} from "../../script/deploy/rollup/DeployL1Contracts.s.sol";
import {DeployRollupForUpgrade} from "../../script/deploy/rollup/DeployRollupForUpgrade.s.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";

/**
 * @title DeployRollupForUpgradeTest
 * @notice Tests for the DeployRollupForUpgrade.s.sol script
 * @dev This test validates:
 *      1. The script deploys only Rollup, Verifier, and SlashFactory
 *      2. It uses existing infrastructure contracts correctly
 *      3. The new rollup is properly registered (if deployer is owner)
 *      4. The JSON output file contains the correct addresses
 */
contract DeployRollupForUpgradeTest is Test {
    using stdJson for string;

    // First deploy a full L1 setup, then test upgrading the rollup
    DeployL1Contracts fullDeployScript;
    DeployRollupForUpgrade upgradeScript;

    string initialOutputPath;
    string upgradeOutputPath;

    // Counter to ensure unique file paths across tests
    uint256 internal testCounter;

    function setUp() public {
        // Clear any env vars that might be left over from other tests
        // These will be set properly after the initial deployment
        vm.setEnv("REGISTRY_ADDRESS", "");
        vm.setEnv("GSE_ADDRESS", "");
        vm.setEnv("GOVERNANCE_ADDRESS", "");
        vm.setEnv("FEE_ASSET_ADDRESS", "");
        vm.setEnv("STAKING_ASSET_ADDRESS", "");

        // Increment counter for unique paths
        testCounter++;

        // Note: Each test should set its own paths using _setOutputPaths()
        // to ensure true uniqueness based on the test function being run
    }

    function _setOutputPaths(string memory testName) internal {
        // Create unique output paths using test name + timestamp + random
        initialOutputPath = string.concat(
            vm.projectRoot(),
            "/.deployments/test-initial-",
            testName,
            "-",
            vm.toString(block.timestamp),
            "-",
            vm.toString(uint256(keccak256(abi.encodePacked(testName, block.timestamp, gasleft())))),
            ".json"
        );
        upgradeOutputPath = string.concat(
            vm.projectRoot(),
            "/.deployments/test-upgrade-",
            testName,
            "-",
            vm.toString(block.timestamp),
            "-",
            vm.toString(uint256(keccak256(abi.encodePacked(testName, block.timestamp, gasleft())))),
            ".json"
        );
    }

    /**
     * @notice Test that upgrade deployment creates new rollup with existing infrastructure
     */
    function test_UpgradeDeploysNewRollup() public {
        _setOutputPaths("UpgradeDeploysNewRollup");

        // First, deploy full L1 contracts
        fullDeployScript = new DeployL1Contracts();
        fullDeployScript.run(initialOutputPath);

        // Read initial deployment addresses
        string memory initialJson = vm.readFile(initialOutputPath);
        address registryAddress = initialJson.readAddress(".registryAddress");
        address gseAddress = initialJson.readAddress(".gseAddress");
        address governanceAddress = initialJson.readAddress(".governanceAddress");
        address feeAssetAddress = initialJson.readAddress(".feeAssetAddress");
        address stakingAssetAddress = initialJson.readAddress(".stakingAssetAddress");
        address initialRollupAddress = initialJson.readAddress(".rollupAddress");

        // Set up environment for upgrade deployment
        vm.setEnv("REGISTRY_ADDRESS", vm.toString(registryAddress));
        vm.setEnv("GSE_ADDRESS", vm.toString(gseAddress));
        vm.setEnv("GOVERNANCE_ADDRESS", vm.toString(governanceAddress));
        vm.setEnv("FEE_ASSET_ADDRESS", vm.toString(feeAssetAddress));
        vm.setEnv("STAKING_ASSET_ADDRESS", vm.toString(stakingAssetAddress));

        // Deploy upgrade
        upgradeScript = new DeployRollupForUpgrade();
        upgradeScript.run(upgradeOutputPath);

        // TODO CLAUDE: assert useful things
    }
}
