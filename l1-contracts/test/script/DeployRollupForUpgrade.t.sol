// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {DeployAztecL1Contracts, DeployAztecL1ContractsOutput} from "../../script/deploy/DeployAztecL1Contracts.s.sol";
import {DeployRollupForUpgrade} from "../../script/deploy/DeployRollupForUpgrade.s.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";

/**
 * @title DeployRollupForUpgradeTest
 * @notice Tests for the DeployRollupForUpgrade.s.sol script
 * @dev This test validates:
 *      1. The script deploys only Rollup, Verifier, and SlashFactory
 *      2. It uses existing infrastructure contracts correctly
 *      3. The new rollup is properly registered (if deployer is owner)
 */
contract DeployRollupForUpgradeTest is Test {
  // Test that a rollup upgrade works.
  function test_DeployThenUpgrade() public {
    // ============ STEP 1: Initial Deployment ============
    DeployAztecL1Contracts fullDeploy = new DeployAztecL1Contracts();
    fullDeploy.run();

    DeployAztecL1ContractsOutput memory initialOutput = fullDeploy.output();
    Registry registry = initialOutput.registry;
    Rollup initialRollup = initialOutput.rollup.rollup;
    uint256 initialVersion = initialRollup.getVersion();

    // Verify initial state
    assertEq(address(registry.getCanonicalRollup()), address(initialRollup));
    assertEq(address(registry.getRollup(initialVersion)), address(initialRollup));

    // become owner of the registry to perform upgrade
    vm.prank(address(initialOutput.governance));
    registry.transferOwnership(address(this));

    // ============ STEP 2: Deploy Rollup Upgrade ============
    vm.setEnv("REGISTRY_ADDRESS", vm.toString(address(registry)));
    // Set a different genesis archive root to get a different version
    // This mirrors the TS test: genesisArchiveRoot: Fr.random()
    vm.setEnv("GENESIS_ARCHIVE_ROOT", vm.toString(uint256(keccak256("different_genesis"))));

    DeployRollupForUpgrade upgradeDeploy = new DeployRollupForUpgrade();
    upgradeDeploy.run();

    Rollup newRollup = upgradeDeploy.rollupOutput().rollup;
    uint256 newVersion = newRollup.getVersion();

    // ============ STEP 3: Verify Registry State ============
    assertTrue(address(newRollup) != address(initialRollup));
    assertTrue(newVersion != initialVersion);

    // Canonical should now be the new rollup
    assertEq(address(registry.getCanonicalRollup()), address(newRollup));

    // Both versions should be retrievable
    assertEq(address(registry.getRollup(initialVersion)), address(initialRollup));
    assertEq(address(registry.getRollup(newVersion)), address(newRollup));

    // Version count should be 2
    assertEq(registry.numberOfVersions(), 2);
  }
}
