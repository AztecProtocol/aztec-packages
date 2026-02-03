// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

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
  using stdJson for string;

  // Load environment variables from generated/default.json
  // This file is copied from spartan/environments/default.json by bootstrap.sh
  function setUp() public {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/generated/default.json");
    string memory json = vm.readFile(path);

    // Timing config
    vm.setEnv("AZTEC_SLOT_DURATION", vm.toString(json.readUint(".AZTEC_SLOT_DURATION")));
    vm.setEnv("AZTEC_EPOCH_DURATION", vm.toString(json.readUint(".AZTEC_EPOCH_DURATION")));
    vm.setEnv("AZTEC_INBOX_LAG", vm.toString(json.readUint(".AZTEC_INBOX_LAG")));
    vm.setEnv("AZTEC_PROOF_SUBMISSION_EPOCHS", vm.toString(json.readUint(".AZTEC_PROOF_SUBMISSION_EPOCHS")));

    // Validator config
    vm.setEnv("AZTEC_TARGET_COMMITTEE_SIZE", vm.toString(json.readUint(".AZTEC_TARGET_COMMITTEE_SIZE")));
    vm.setEnv(
      "AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET", vm.toString(json.readUint(".AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET"))
    );
    vm.setEnv("AZTEC_LAG_IN_EPOCHS_FOR_RANDAO", vm.toString(json.readUint(".AZTEC_LAG_IN_EPOCHS_FOR_RANDAO")));
    vm.setEnv("AZTEC_LOCAL_EJECTION_THRESHOLD", json.readString(".AZTEC_LOCAL_EJECTION_THRESHOLD"));
    vm.setEnv("AZTEC_EXIT_DELAY_SECONDS", vm.toString(json.readUint(".AZTEC_EXIT_DELAY_SECONDS")));

    // Fees config
    vm.setEnv("AZTEC_MANA_TARGET", vm.toString(json.readUint(".AZTEC_MANA_TARGET")));
    vm.setEnv("AZTEC_PROVING_COST_PER_MANA", vm.toString(json.readUint(".AZTEC_PROVING_COST_PER_MANA")));
    vm.setEnv("AZTEC_INITIAL_ETH_PER_FEE_ASSET", vm.toString(json.readUint(".AZTEC_INITIAL_ETH_PER_FEE_ASSET")));

    // Slashing config
    vm.setEnv("AZTEC_SLASHER_FLAVOR", json.readString(".AZTEC_SLASHER_FLAVOR"));
    vm.setEnv("AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS", vm.toString(json.readUint(".AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS")));
    vm.setEnv("AZTEC_SLASHING_OFFSET_IN_ROUNDS", vm.toString(json.readUint(".AZTEC_SLASHING_OFFSET_IN_ROUNDS")));
    vm.setEnv("AZTEC_SLASHING_LIFETIME_IN_ROUNDS", vm.toString(json.readUint(".AZTEC_SLASHING_LIFETIME_IN_ROUNDS")));
    vm.setEnv(
      "AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS",
      vm.toString(json.readUint(".AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS"))
    );
    vm.setEnv("AZTEC_SLASHING_DISABLE_DURATION", vm.toString(json.readUint(".AZTEC_SLASHING_DISABLE_DURATION")));
    vm.setEnv("AZTEC_SLASHING_VETOER", json.readString(".AZTEC_SLASHING_VETOER"));
    vm.setEnv("AZTEC_SLASH_AMOUNT_SMALL", json.readString(".AZTEC_SLASH_AMOUNT_SMALL"));
    vm.setEnv("AZTEC_SLASH_AMOUNT_MEDIUM", json.readString(".AZTEC_SLASH_AMOUNT_MEDIUM"));
    vm.setEnv("AZTEC_SLASH_AMOUNT_LARGE", json.readString(".AZTEC_SLASH_AMOUNT_LARGE"));
  }

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
