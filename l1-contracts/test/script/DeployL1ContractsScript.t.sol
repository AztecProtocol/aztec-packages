// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {DeployL1Contracts} from "../../script/deploy/rollup/DeployL1Contracts.s.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {CoinIssuer} from "@aztec/governance/CoinIssuer.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

/**
 * @title DeployL1ContractsScriptTest
 * @notice Tests for the DeployL1Contracts.s.sol script with env var config
 * @dev This test validates:
 *      1. The script deploys all contracts correctly with various env var configs
 *      2. The JSON output file is written with correct addresses
 *      3. Contract relationships are properly established
 *
 * NOTE: Each test uses a unique output file in .deployments/ to avoid race conditions.
 * Tests can safely run in parallel.
 */
contract DeployL1ContractsScriptTest is Test {
    using stdJson for string;

    // Create a fresh deploy script instance for each test to avoid serializer state pollution
    function _createDeployScript() internal returns (DeployL1Contracts) {
        DeployL1Contracts script = new DeployL1Contracts();
        script.setUp();
        return script;
    }

    // Get a unique output path for each test to avoid race conditions when tests run in parallel
    function _getOutputPath() internal view returns (string memory) {
        // Use gasleft() as a source of uniqueness per test execution
        return string.concat(
            vm.projectRoot(),
            "/.deployments/test-deployment-",
            vm.toString(block.timestamp),
            "-",
            vm.toString(gasleft()),
            ".json"
        );
    }

    /**
     * @notice Test deployment with minimal config (defaults)
     */
    function test_DeployWithDefaults() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Act - the script uses vm.startBroadcast internally, reads config from env vars
        deployScript.run(outputPath);

        // Assert: verify output file exists and has correct structure
        string memory outputJson = vm.readFile(outputPath);

        // Parse addresses from the JSON output
        address rollupAddress = outputJson.readAddress(".rollupAddress");
        address registryAddress = outputJson.readAddress(".registryAddress");
        address feeAssetAddress = outputJson.readAddress(".feeAssetAddress");
        address stakingAssetAddress = outputJson.readAddress(".stakingAssetAddress");
        address gseAddress = outputJson.readAddress(".gseAddress");
        address governanceAddress = outputJson.readAddress(".governanceAddress");
        address coinIssuerAddress = outputJson.readAddress(".coinIssuerAddress");
        address inboxAddress = outputJson.readAddress(".inboxAddress");
        address outboxAddress = outputJson.readAddress(".outboxAddress");
        address feeAssetPortalAddress = outputJson.readAddress(".feeAssetPortalAddress");
        uint256 rollupVersion = outputJson.readUint(".rollupVersion");

        // All core addresses should be non-zero
        assertTrue(rollupAddress != address(0), "Rollup should be deployed");
        assertTrue(registryAddress != address(0), "Registry should be deployed");
        assertTrue(feeAssetAddress != address(0), "FeeAsset should be deployed");
        assertTrue(stakingAssetAddress != address(0), "StakingAsset should be deployed");
        assertTrue(gseAddress != address(0), "GSE should be deployed");
        assertTrue(governanceAddress != address(0), "Governance should be deployed");
        assertTrue(coinIssuerAddress != address(0), "CoinIssuer should be deployed");
        assertTrue(inboxAddress != address(0), "Inbox should be deployed");
        assertTrue(outboxAddress != address(0), "Outbox should be deployed");
        assertTrue(feeAssetPortalAddress != address(0), "FeeAssetPortal should be deployed");
        // Note: rollupVersion starts at 0 for genesis, increments with upgrades
        assertTrue(rollupVersion == 0, "Rollup version should be 0 at genesis");

        // Verify contract relationships
        Rollup rollup = Rollup(rollupAddress);
        Registry registry = Registry(registryAddress);

        assertEq(address(rollup.getInbox()), inboxAddress, "Inbox address should match");
        assertEq(address(rollup.getOutbox()), outboxAddress, "Outbox address should match");
        assertEq(address(rollup.getFeeAssetPortal()), feeAssetPortalAddress, "FeeAssetPortal address should match");
        assertEq(address(registry.getCanonicalRollup()), rollupAddress, "Rollup should be canonical in Registry");
    }

    /**
     * @notice Test deployment with custom genesis config via env vars
     */
    function test_DeployWithCustomGenesis() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Arrange: set custom genesis values via env vars
        vm.setEnv("VK_TREE_ROOT", "0x1234");
        vm.setEnv("PROTOCOL_CONTRACTS_HASH", "0x5678");
        vm.setEnv("GENESIS_ARCHIVE_ROOT", "0x9abc");

        // Act
        deployScript.run(outputPath);

        // Assert: verify deployment succeeded
        string memory outputJson = vm.readFile(outputPath);
        address rollupAddress = outputJson.readAddress(".rollupAddress");
        assertTrue(rollupAddress != address(0), "Rollup should be deployed with custom genesis");
    }

    /**
     * @notice Test deployment with mock verifier config
     */
    function test_DeployWithMockVerifier() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Arrange: explicitly request mock verifier
        vm.setEnv("USE_MOCK_VERIFIER", "true");

        // Act
        deployScript.run(outputPath);

        // Assert
        string memory outputJson = vm.readFile(outputPath);
        address verifierAddress = outputJson.readAddress(".verifierAddress");
        assertTrue(verifierAddress != address(0), "Verifier should be deployed");
    }

    /**
     * @notice Test deployment with custom timing config
     */
    function test_DeployWithCustomTiming() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Arrange: custom timing values via env vars
        vm.setEnv("AZTEC_SLOT_DURATION", "24");
        vm.setEnv("AZTEC_EPOCH_DURATION", "32");
        vm.setEnv("AZTEC_TARGET_COMMITTEE_SIZE", "48");

        // Act
        deployScript.run(outputPath);

        // Assert: deployment should succeed
        string memory outputJson = vm.readFile(outputPath);
        address rollupAddress = outputJson.readAddress(".rollupAddress");
        assertTrue(rollupAddress != address(0), "Rollup should be deployed with custom timing");
    }

    /**
     * @notice Test deployment with custom GSE thresholds
     */
    function test_DeployWithCustomGSEThresholds() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Arrange: custom GSE thresholds via env vars
        vm.setEnv("AZTEC_ACTIVATION_THRESHOLD", "200000000000000000000");
        vm.setEnv("AZTEC_EJECTION_THRESHOLD", "50000000000000000000");

        // Act
        deployScript.run(outputPath);

        // Assert
        string memory outputJson = vm.readFile(outputPath);
        address gseAddress = outputJson.readAddress(".gseAddress");
        assertTrue(gseAddress != address(0), "GSE should be deployed with custom thresholds");

        GSE gse = GSE(gseAddress);
        assertEq(gse.ACTIVATION_THRESHOLD(), 200 ether, "Activation threshold should match");
        assertEq(gse.EJECTION_THRESHOLD(), 50 ether, "Ejection threshold should match");
    }

    /**
     * @notice Test that ownership is correctly transferred to governance
     */
    function test_OwnershipTransferredToGovernance() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Act
        deployScript.run(outputPath);

        // Assert
        string memory outputJson = vm.readFile(outputPath);
        address registryAddress = outputJson.readAddress(".registryAddress");
        address gseAddress = outputJson.readAddress(".gseAddress");
        address governanceAddress = outputJson.readAddress(".governanceAddress");

        Registry registry = Registry(registryAddress);
        GSE gse = GSE(gseAddress);

        assertEq(registry.owner(), governanceAddress, "Registry owner should be Governance");
        assertEq(gse.owner(), governanceAddress, "GSE owner should be Governance");
    }

    /**
     * @notice Test that RewardDistributor is correctly linked
     */
    function test_RewardDistributorLinked() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Act
        deployScript.run(outputPath);

        // Assert
        string memory outputJson = vm.readFile(outputPath);
        address registryAddress = outputJson.readAddress(".registryAddress");
        address rewardDistributorAddress = outputJson.readAddress(".rewardDistributorAddress");

        Registry registry = Registry(registryAddress);
        assertEq(
            address(registry.getRewardDistributor()),
            rewardDistributorAddress,
            "Registry should have correct RewardDistributor"
        );
    }

    /**
     * @notice Test deployment without output file (backwards compatibility)
     */
    function test_DeployWithoutOutputFile() public {
        DeployL1Contracts deployScript = _createDeployScript();
        // Act - should not revert
        deployScript.run();

        // Assert: if we get here without reverting, deployment succeeded
        // (The script has internal assertions via assertAccessControl)
        assertTrue(true, "Deployment should complete without reverting");
    }

    /**
     * @notice Test deployment with empty initial validators env var
     */
    function test_DeployWithEmptyInitialValidators() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Arrange: set empty validators array
        vm.setEnv("INITIAL_VALIDATORS", "[]");

        // Act
        deployScript.run(outputPath);

        // Assert: deployment should succeed
        string memory outputJson = vm.readFile(outputPath);
        address rollupAddress = outputJson.readAddress(".rollupAddress");
        assertTrue(rollupAddress != address(0), "Rollup should be deployed");
    }

    /**
     * @notice Test that SlashFactory is correctly deployed and linked
     */
    function test_SlashFactoryDeployed() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Act
        deployScript.run(outputPath);

        // Assert
        string memory outputJson = vm.readFile(outputPath);
        address slashFactoryAddress = outputJson.readAddress(".slashFactoryAddress");
        address rollupAddress = outputJson.readAddress(".rollupAddress");

        assertTrue(slashFactoryAddress != address(0), "SlashFactory should be deployed");

        SlashFactory slashFactory = SlashFactory(slashFactoryAddress);
        // SlashFactory uses VALIDATOR_SELECTION (which is the Rollup contract implementing IValidatorSelection)
        assertEq(address(slashFactory.VALIDATOR_SELECTION()), rollupAddress, "SlashFactory should reference Rollup");
    }

    /**
     * @notice Test that all JSON output fields are present
     */
    function test_JsonOutputHasAllFields() public {
        DeployL1Contracts deployScript = _createDeployScript();
        string memory outputPath = _getOutputPath();
        // Act
        deployScript.run(outputPath);

        // Assert: read all expected fields (will revert if missing)
        string memory outputJson = vm.readFile(outputPath);

        // Core contracts
        outputJson.readAddress(".rollupAddress");
        outputJson.readAddress(".registryAddress");
        outputJson.readAddress(".feeAssetAddress");
        outputJson.readAddress(".stakingAssetAddress");
        outputJson.readAddress(".gseAddress");
        outputJson.readAddress(".rewardDistributorAddress");
        outputJson.readAddress(".coinIssuerAddress");
        outputJson.readAddress(".governanceProposerAddress");
        outputJson.readAddress(".governanceAddress");
        outputJson.readAddress(".verifierAddress");
        outputJson.readAddress(".slashFactoryAddress");

        // Addresses from Rollup
        outputJson.readAddress(".inboxAddress");
        outputJson.readAddress(".outboxAddress");
        outputJson.readAddress(".feeAssetPortalAddress");
        outputJson.readUint(".rollupVersion");

        // Optional handlers (may be zero address)
        outputJson.readAddress(".feeAssetHandlerAddress");
        outputJson.readAddress(".stakingAssetHandlerAddress");
        outputJson.readAddress(".zkPassportVerifierAddress");
    }
}
