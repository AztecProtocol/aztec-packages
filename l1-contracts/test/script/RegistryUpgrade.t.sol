// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {Rollup} from "@aztec/core/Rollup.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";

import {DeployAztecL1Contracts} from "../../script/deploy/DeployAztecL1Contracts.s.sol";
import {DeployRollupForUpgrade} from "../../script/deploy/DeployRollupForUpgrade.s.sol";

/**
 * @title RegistryUpgradeTest
 * @author Aztec Labs
 * @notice Tests registry behavior when deploying a new rollup version.
 * @dev This test mirrors yarn-project/ethereum/src/contracts/registry.test.ts:
 *      1. Calls DeployAztecL1Contracts to set up initial infrastructure
 *      2. Transfers registry ownership to deployer (mirroring setRegistryOwnership in TS)
 *      3. Calls DeployRollupForUpgrade to add a new rollup version
 *      4. Verifies the registry correctly tracks both versions
 */
contract RegistryUpgradeTest is Test {
    using stdJson for string;

    function setUp() public {
        // Clear any env vars that might be left over from other tests
        vm.setEnv("REGISTRY_ADDRESS", "");
    }

    function _getOutputPath(string memory prefix) internal view returns (string memory) {
        return string.concat(
            vm.projectRoot(),
            "/.deployments/",
            prefix,
            "-",
            vm.toString(block.timestamp),
            "-",
            vm.toString(gasleft()),
            ".json"
        );
    }

    /**
     * @notice Test that mirrors yarn-project/ethereum/src/contracts/registry.test.ts
     */
    function test_DeployThenUpgrade() public {
        string memory initialPath = _getOutputPath("initial");
        string memory upgradePath = _getOutputPath("upgrade");

        // ============ STEP 1: Initial Deployment ============
        DeployAztecL1Contracts fullDeploy = new DeployAztecL1Contracts();
        fullDeploy.run(initialPath);

        string memory initialJson = vm.readFile(initialPath);
        address registryAddr = initialJson.readAddress(".registryAddress");
        address rollupAddr = initialJson.readAddress(".rollupAddress");
        address governanceAddr = initialJson.readAddress(".governanceAddress");

        Registry registry = Registry(registryAddr);
        Rollup initialRollup = Rollup(rollupAddr);
        uint256 initialVersion = initialRollup.getVersion();

        // Verify initial state
        assertEq(address(registry.getCanonicalRollup()), rollupAddr);
        assertEq(address(registry.getRollup(initialVersion)), rollupAddr);

        // ============ STEP 2: Transfer ownership to deployer ============
        // Mirrors the TypeScript: setRegistryOwnership(deployer.client.account.address)
        // After initial deployment, registry is owned by governance
        vm.prank(governanceAddr);
        registry.transferOwnership(address(this));

        // ============ STEP 3: Deploy Rollup Upgrade ============
        vm.setEnv("REGISTRY_ADDRESS", vm.toString(registryAddr));
        // Set a different genesis archive root to get a different version
        // This mirrors the TS test: genesisArchiveRoot: Fr.random()
        vm.setEnv("GENESIS_ARCHIVE_ROOT", vm.toString(uint256(keccak256("different_genesis"))));

        DeployRollupForUpgrade upgradeDeploy = new DeployRollupForUpgrade();
        upgradeDeploy.run(upgradePath);

        string memory upgradeJson = vm.readFile(upgradePath);
        address newRollupAddr = upgradeJson.readAddress(".rollupAddress");

        Rollup newRollup = Rollup(newRollupAddr);
        uint256 newVersion = newRollup.getVersion();

        // ============ STEP 4: Verify Registry State ============
        assertTrue(newRollupAddr != rollupAddr);
        assertTrue(newVersion != initialVersion);

        // Canonical should now be the new rollup
        assertEq(address(registry.getCanonicalRollup()), newRollupAddr);

        // Both versions should be retrievable
        assertEq(address(registry.getRollup(initialVersion)), rollupAddr);
        assertEq(address(registry.getRollup(newVersion)), newRollupAddr);

        // Version count should be 2
        assertEq(registry.numberOfVersions(), 2);
    }
}
