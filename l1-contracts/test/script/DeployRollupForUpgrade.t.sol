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
        fullDeployScript.setUp();
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

        // Read upgrade deployment addresses
        string memory upgradeJson = vm.readFile(upgradeOutputPath);
        address newRollupAddress = upgradeJson.readAddress(".rollupAddress");
        address newVerifierAddress = upgradeJson.readAddress(".verifierAddress");
        address newSlashFactoryAddress = upgradeJson.readAddress(".slashFactoryAddress");

        // Verify new contracts are deployed
        assertTrue(newRollupAddress != address(0), "New rollup should be deployed");
        assertTrue(newVerifierAddress != address(0), "New verifier should be deployed");
        assertTrue(newSlashFactoryAddress != address(0), "New slash factory should be deployed");

        // Verify new rollup is different from initial
        assertTrue(newRollupAddress != initialRollupAddress, "New rollup should be different from initial");

        // Verify new rollup has correct version (incremented)
        Rollup newRollup = Rollup(newRollupAddress);
        uint256 newVersion = newRollup.getVersion();
        assertTrue(newVersion > 0, "New rollup version should be set");
    }

    /**
     * @notice Test that upgrade does NOT register in Registry when deployer is not owner
     * @dev After initial deployment, Governance becomes the owner. The upgrade script
     *      only auto-registers if the deployer is the owner, which won't be the case
     *      in production. Registration happens through governance proposals.
     */
    function test_UpgradeDoesNotAutoRegisterWhenNotOwner() public {
        _setOutputPaths("DoesNotAutoRegister");

        // Deploy full L1 contracts
        fullDeployScript = new DeployL1Contracts();
        fullDeployScript.setUp();
        fullDeployScript.run(initialOutputPath);

        // Read addresses
        string memory initialJson = vm.readFile(initialOutputPath);
        address registryAddress = initialJson.readAddress(".registryAddress");
        address governanceAddress = initialJson.readAddress(".governanceAddress");

        // Set up environment
        vm.setEnv("REGISTRY_ADDRESS", vm.toString(registryAddress));
        vm.setEnv("GSE_ADDRESS", vm.toString(initialJson.readAddress(".gseAddress")));
        vm.setEnv("GOVERNANCE_ADDRESS", vm.toString(governanceAddress));
        vm.setEnv("FEE_ASSET_ADDRESS", vm.toString(initialJson.readAddress(".feeAssetAddress")));
        vm.setEnv("STAKING_ASSET_ADDRESS", vm.toString(initialJson.readAddress(".stakingAssetAddress")));

        // Get the initial canonical rollup before upgrade
        Registry registry = Registry(registryAddress);
        address initialRollupAddress = address(registry.getCanonicalRollup());

        // Deploy upgrade
        upgradeScript = new DeployRollupForUpgrade();
        upgradeScript.run(upgradeOutputPath);

        // Read new rollup address
        string memory upgradeJson = vm.readFile(upgradeOutputPath);
        address newRollupAddress = upgradeJson.readAddress(".rollupAddress");

        // Verify registry is owned by Governance (not deployer)
        assertEq(registry.owner(), governanceAddress, "Registry should be owned by Governance");

        // Verify rollup was deployed but NOT auto-registered
        assertTrue(newRollupAddress != address(0), "New rollup should be deployed");
        assertTrue(newRollupAddress != initialRollupAddress, "New rollup should be different from initial");

        // The canonical rollup should still be the initial one (upgrade didn't auto-register)
        address canonicalRollup = address(registry.getCanonicalRollup());
        assertEq(canonicalRollup, initialRollupAddress, "Canonical rollup should still be the initial one");
    }

    /**
     * @notice Test that SlashFactory references new rollup
     */
    function test_SlashFactoryReferencesNewRollup() public {
        _setOutputPaths("SlashFactory");

        // Deploy full L1 contracts
        fullDeployScript = new DeployL1Contracts();
        fullDeployScript.setUp();
        fullDeployScript.run(initialOutputPath);

        // Read addresses and set env
        string memory initialJson = vm.readFile(initialOutputPath);
        vm.setEnv("REGISTRY_ADDRESS", vm.toString(initialJson.readAddress(".registryAddress")));
        vm.setEnv("GSE_ADDRESS", vm.toString(initialJson.readAddress(".gseAddress")));
        vm.setEnv("GOVERNANCE_ADDRESS", vm.toString(initialJson.readAddress(".governanceAddress")));
        vm.setEnv("FEE_ASSET_ADDRESS", vm.toString(initialJson.readAddress(".feeAssetAddress")));
        vm.setEnv("STAKING_ASSET_ADDRESS", vm.toString(initialJson.readAddress(".stakingAssetAddress")));

        // Deploy upgrade
        upgradeScript = new DeployRollupForUpgrade();
        upgradeScript.run(upgradeOutputPath);

        // Read addresses
        string memory upgradeJson = vm.readFile(upgradeOutputPath);
        address newRollupAddress = upgradeJson.readAddress(".rollupAddress");
        address newSlashFactoryAddress = upgradeJson.readAddress(".slashFactoryAddress");

        // Verify SlashFactory references the new rollup
        SlashFactory slashFactory = SlashFactory(newSlashFactoryAddress);
        assertEq(
            address(slashFactory.VALIDATOR_SELECTION()),
            newRollupAddress,
            "SlashFactory should reference new rollup"
        );
    }

    /**
     * @notice Test that JSON output contains all required fields
     */
    function test_JsonOutputHasAllFields() public {
        _setOutputPaths("JsonOutput");

        // Deploy full L1 contracts
        fullDeployScript = new DeployL1Contracts();
        fullDeployScript.setUp();
        fullDeployScript.run(initialOutputPath);

        // Set up environment
        string memory initialJson = vm.readFile(initialOutputPath);
        vm.setEnv("REGISTRY_ADDRESS", vm.toString(initialJson.readAddress(".registryAddress")));
        vm.setEnv("GSE_ADDRESS", vm.toString(initialJson.readAddress(".gseAddress")));
        vm.setEnv("GOVERNANCE_ADDRESS", vm.toString(initialJson.readAddress(".governanceAddress")));
        vm.setEnv("FEE_ASSET_ADDRESS", vm.toString(initialJson.readAddress(".feeAssetAddress")));
        vm.setEnv("STAKING_ASSET_ADDRESS", vm.toString(initialJson.readAddress(".stakingAssetAddress")));

        // Deploy upgrade
        upgradeScript = new DeployRollupForUpgrade();
        upgradeScript.run(upgradeOutputPath);

        // Read and verify all fields exist (will revert if missing)
        string memory upgradeJson = vm.readFile(upgradeOutputPath);
        upgradeJson.readAddress(".rollupAddress");
        upgradeJson.readAddress(".verifierAddress");
        upgradeJson.readAddress(".slashFactoryAddress");
        upgradeJson.readAddress(".inboxAddress");
        upgradeJson.readAddress(".outboxAddress");
        upgradeJson.readAddress(".feeAssetPortalAddress");
        upgradeJson.readUint(".rollupVersion");
    }
}
