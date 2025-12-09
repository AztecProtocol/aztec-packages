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
     * @notice Test deployment with custom GSE thresholds
     */
    function test_DeployWithCustomGSEThresholds() public {
        DeployL1Contracts deployScript = new DeployL1Contracts();
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
        DeployL1Contracts deployScript = new DeployL1Contracts();
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
}
