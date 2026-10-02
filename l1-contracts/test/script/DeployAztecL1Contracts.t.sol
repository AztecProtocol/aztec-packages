// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {DeployAztecL1Contracts} from "../../script/deploy/DeployAztecL1Contracts.s.sol";
import {RollupConfiguration} from "../../script/deploy/RollupConfiguration.sol";

contract RollupConfigurationHarness is RollupConfiguration {
  function getSequencerRewardCalculator(string memory _envName) external view returns (address) {
    return _getSequencerRewardCalculator(_envName);
  }
}

contract DeployAztecL1ContractsTest is Test {
  using stdJson for string;

  modifier skipWhenCoverage() {
    if (isCoverage()) {
      vm.skip(true);
    }
    _;
  }

  function isCoverage() internal view returns (bool) {
    return vm.envOr("FORGE_COVERAGE", false);
  }

  // Load environment variables from scripts/network-defaults.json (the canonical L1 config defaults).
  function setUp() public skipWhenCoverage {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/scripts/network-defaults.json");
    string memory json = vm.readFile(path);

    // Genesis roots are required by the deployer; any non-zero field element will do here.
    vm.setEnv("VK_TREE_ROOT", vm.toString(uint256(keccak256("vk_tree_root")) >> 8));
    vm.setEnv("PROTOCOL_CONTRACTS_HASH", vm.toString(uint256(keccak256("protocol_contracts_hash")) >> 8));
    vm.setEnv("GENESIS_ARCHIVE_ROOT", vm.toString(uint256(keccak256("genesis_archive_root")) >> 8));

    // Timing config
    vm.setEnv("ETHEREUM_SLOT_DURATION", vm.toString(json.readUint(".ETHEREUM_SLOT_DURATION")));
    vm.setEnv("AZTEC_SLOT_DURATION", vm.toString(json.readUint(".AZTEC_SLOT_DURATION")));
    vm.setEnv("AZTEC_EPOCH_DURATION", vm.toString(json.readUint(".AZTEC_EPOCH_DURATION")));
    vm.setEnv("AZTEC_PROOF_SUBMISSION_EPOCHS", vm.toString(json.readUint(".AZTEC_PROOF_SUBMISSION_EPOCHS")));

    // Validator config
    vm.setEnv("AZTEC_TARGET_COMMITTEE_SIZE", vm.toString(json.readUint(".AZTEC_TARGET_COMMITTEE_SIZE")));
    vm.setEnv(
      "AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET", vm.toString(json.readUint(".AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET"))
    );
    vm.setEnv("AZTEC_LAG_IN_EPOCHS_FOR_RANDAO", vm.toString(json.readUint(".AZTEC_LAG_IN_EPOCHS_FOR_RANDAO")));
    vm.setEnv("AZTEC_LOCAL_EJECTION_THRESHOLD", json.readString(".AZTEC_LOCAL_EJECTION_THRESHOLD"));
    vm.setEnv("AZTEC_EXIT_DELAY_SECONDS", vm.toString(json.readUint(".AZTEC_EXIT_DELAY_SECONDS")));

    // Entry queue config
    vm.setEnv(
      "AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE",
      vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE"))
    );
    vm.setEnv(
      "AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE", vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE"))
    );
    vm.setEnv("AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN", vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN")));
    vm.setEnv(
      "AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT", vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT"))
    );
    vm.setEnv("AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE", vm.toString(json.readUint(".AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE")));

    // Fees config
    vm.setEnv("AZTEC_MANA_TARGET", vm.toString(json.readUint(".AZTEC_MANA_TARGET")));
    vm.setEnv("AZTEC_PROVING_COST_PER_MANA", vm.toString(json.readUint(".AZTEC_PROVING_COST_PER_MANA")));
    vm.setEnv("AZTEC_INITIAL_ETH_PER_FEE_ASSET", vm.toString(json.readUint(".AZTEC_INITIAL_ETH_PER_FEE_ASSET")));
    vm.setEnv("AZTEC_SEQUENCER_REWARD_CALCULATOR", json.readString(".AZTEC_SEQUENCER_REWARD_CALCULATOR"));

    // Slashing config
    vm.setEnv("AZTEC_SLASHER_ENABLED", vm.toString(json.readBool(".AZTEC_SLASHER_ENABLED")));
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

  // Just exercise the code. It contains assertions internally.
  function test_SmokeTest() public {
    DeployAztecL1Contracts deployScript = new DeployAztecL1Contracts();
    deployScript.run();

    // The network defaults deploy without a sequencer reward calculator.
    assertEq(deployScript.output().rollup.rollup.getSequencerRewardCalculator(), address(0));
  }

  // Unique variable names: the environment is shared with the deployments other tests run concurrently.
  function test_SequencerRewardCalculatorConfiguration() public {
    RollupConfigurationHarness configuration = new RollupConfigurationHarness();

    assertEq(configuration.getSequencerRewardCalculator("TEST_UNSET_SEQUENCER_REWARD_CALCULATOR"), address(0));

    address calculator = makeAddr("calculator");
    vm.setEnv("TEST_SET_SEQUENCER_REWARD_CALCULATOR", vm.toString(calculator));
    assertEq(configuration.getSequencerRewardCalculator("TEST_SET_SEQUENCER_REWARD_CALCULATOR"), calculator);
  }
}
