// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {DeployAztecL1Contracts} from "../../script/deploy/DeployAztecL1Contracts.s.sol";

contract DeployAztecL1ContractsTest is Test {
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

  // Just exercise the code. It contains assertions internally.
  function test_SmokeTest() public {
    DeployAztecL1Contracts deployScript = new DeployAztecL1Contracts();
    deployScript.run();
  }
}
