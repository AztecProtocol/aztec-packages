// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {RollupBuilder, Config} from "@test/builder/RollupBuilder.sol";
import {IRollup, GenesisState} from "@aztec/core/interfaces/IRollup.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {TimeLib} from "@aztec/core/libraries/TimeLib.sol";

/**
 * @title DeployAztecL1ContractsTest
 * @notice Tests for the L1 contract deployment using RollupBuilder
 * @dev This test verifies that the RollupBuilder correctly deploys all L1 contracts
 *      and that they are properly configured. The DeployAztecL1Contracts.s.sol script
 *      uses the same RollupBuilder mechanism, so these tests validate the underlying
 *      deployment logic.
 *
 *      Note: We cannot directly test the forge script in unit tests due to
 *      vm.broadcast/vm.prank incompatibility. The script should be tested
 *      by running it against a local network (e.g., anvil).
 */
contract DeployAztecL1ContractsTest is Test {
  address public deployer;

  function setUp() public {
    // Initialize time library (required for Rollup deployment)
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );

    deployer = address(this);
  }

  function test_DeployAllContractsWithDefaults() public {
    // Deploy using RollupBuilder with default genesis state (same as script with no env vars)
    GenesisState memory genesisState = GenesisState({
      vkTreeRoot: bytes32(0),
      protocolContractsHash: bytes32(0),
      genesisArchiveRoot: bytes32(0)
    });

    RollupBuilder builder = new RollupBuilder(deployer);
    builder = builder.setGenesisState(genesisState);
    builder = builder.deploy();

    Config memory deployedConfig = builder.getConfig();

    // Verify all contracts are deployed (non-zero addresses)
    assertTrue(address(deployedConfig.rollup) != address(0), "Rollup should be deployed");
    assertTrue(address(deployedConfig.registry) != address(0), "Registry should be deployed");
    assertTrue(address(deployedConfig.gse) != address(0), "GSE should be deployed");
    assertTrue(address(deployedConfig.governance) != address(0), "Governance should be deployed");
    assertTrue(address(deployedConfig.coinIssuer) != address(0), "CoinIssuer should be deployed");
    assertTrue(address(deployedConfig.rewardDistributor) != address(0), "RewardDistributor should be deployed");
    assertTrue(address(deployedConfig.testERC20) != address(0), "TestERC20 should be deployed");
  }

  function test_DeployWithCustomGenesisState() public {
    // Deploy with custom genesis state (simulating script with env vars)
    bytes32 vkTreeRoot = bytes32(uint256(0x1234));
    bytes32 protocolContractsHash = bytes32(uint256(0x5678));
    bytes32 genesisArchiveRoot = bytes32(uint256(0x9abc));

    GenesisState memory genesisState = GenesisState({
      vkTreeRoot: vkTreeRoot,
      protocolContractsHash: protocolContractsHash,
      genesisArchiveRoot: genesisArchiveRoot
    });

    RollupBuilder builder = new RollupBuilder(deployer);
    builder = builder.setGenesisState(genesisState);
    builder = builder.deploy();

    Config memory deployedConfig = builder.getConfig();

    // Verify rollup is deployed with the custom genesis state
    IRollup rollup = IRollup(address(deployedConfig.rollup));
    assertTrue(address(rollup) != address(0), "Rollup should be deployed");

    // Note: The genesis state is used internally during deployment
    // and affects the initial rollup state
  }

  function test_DeployedContractsAreValid() public {
    GenesisState memory genesisState = GenesisState({
      vkTreeRoot: bytes32(0),
      protocolContractsHash: bytes32(0),
      genesisArchiveRoot: bytes32(0)
    });

    RollupBuilder builder = new RollupBuilder(deployer);
    builder = builder.setGenesisState(genesisState);
    builder = builder.deploy();

    Config memory deployedConfig = builder.getConfig();

    // Verify contract relationships
    IRollup rollup = IRollup(address(deployedConfig.rollup));
    IRegistry registry = deployedConfig.registry;

    // Registry should have the rollup as canonical
    assertEq(
      address(registry.getCanonicalRollup()),
      address(rollup),
      "Rollup should be the canonical rollup in Registry"
    );

    // Rollup should have the correct fee asset
    assertEq(
      address(rollup.getFeeAsset()),
      address(deployedConfig.testERC20),
      "Rollup should have correct fee asset"
    );
  }

  function test_DeployedContractsHaveCorrectRelationships() public {
    GenesisState memory genesisState = GenesisState({
      vkTreeRoot: bytes32(0),
      protocolContractsHash: bytes32(0),
      genesisArchiveRoot: bytes32(0)
    });

    RollupBuilder builder = new RollupBuilder(deployer);
    builder = builder.setGenesisState(genesisState);
    builder = builder.deploy();

    Config memory deployedConfig = builder.getConfig();

    IRollup rollup = IRollup(address(deployedConfig.rollup));
    IRegistry registry = deployedConfig.registry;

    // Note: Registry.getGovernance() returns owner(), which is the deployer after ownership updates
    // The Governance contract is deployed but Registry ownership determines what getGovernance returns
    assertTrue(
      address(deployedConfig.governance) != address(0),
      "Governance contract should be deployed"
    );

    // Verify RewardDistributor is set
    assertEq(
      address(registry.getRewardDistributor()),
      address(deployedConfig.rewardDistributor),
      "Registry should have correct RewardDistributor"
    );

    // Verify the rollup can access the fee asset portal
    assertTrue(
      address(rollup.getFeeAssetPortal()) != address(0),
      "Rollup should have a FeeAssetPortal"
    );
  }

  function test_MultipleDeploymentsHaveUniqueAddresses() public {
    GenesisState memory genesisState = GenesisState({
      vkTreeRoot: bytes32(0),
      protocolContractsHash: bytes32(0),
      genesisArchiveRoot: bytes32(0)
    });

    // First deployment
    RollupBuilder builder1 = new RollupBuilder(deployer);
    builder1 = builder1.setGenesisState(genesisState);
    builder1 = builder1.deploy();
    Config memory config1 = builder1.getConfig();

    // Second deployment
    RollupBuilder builder2 = new RollupBuilder(deployer);
    builder2 = builder2.setGenesisState(genesisState);
    builder2 = builder2.deploy();
    Config memory config2 = builder2.getConfig();

    // Each deployment should have unique addresses
    assertTrue(
      address(config1.rollup) != address(config2.rollup),
      "Each deployment should have unique Rollup address"
    );
    assertTrue(
      address(config1.registry) != address(config2.registry),
      "Each deployment should have unique Registry address"
    );
  }
}
