// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

struct RegistrationData {
  address attester;
  G1Point proofOfPossession;
  G1Point publicKeyInG1;
  G2Point publicKeyInG2;
}

contract MigrationScript is Test {
  address internal constant ME = address(0xf8d7d601759CBcfB78044bA7cA9B0c0D6301A54f);

  address public constant WITHDRAWER = address(0xdead);

  // Update ME!
  IInstance public INSTANCE;
  TestERC20 public STAKING_ASSET;
  // No more!

  MultiAdder public ADDER;

  RegistrationData[] public $registrations;

  function setUp() public {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/script/registration_data.json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    RegistrationData[] memory registrations = abi.decode(jsonBytes, (RegistrationData[]));

    for (uint256 i = 0; i < registrations.length; i++) {
      $registrations.push(registrations[i]);
    }
  }

  function emulate() public {
    // If emulating we will deploy a rollup and other components ahead of time, otherwise
    // you should provide them by updating the values above.
    RollupBuilder builder = new RollupBuilder(ME).setUpdateOwnerships(false).setCheckProofOfPossession(true).deploy();

    INSTANCE = IInstance(address(builder.getConfig().rollup));
    STAKING_ASSET = builder.getConfig().testERC20;

    vm.prank(STAKING_ASSET.owner());
    STAKING_ASSET.addMinter(ME);

    migrate();
  }

  function print() public {
    RegistrationData memory r = $registrations[0];
    emit log_named_address("Attester", r.attester);
    emit log_named_address("Withdrawer", WITHDRAWER);
    emit log_named_bytes32("PublicKeyInG1.x", bytes32(r.publicKeyInG1.x));
    emit log_named_bytes32("PublicKeyInG1.y", bytes32(r.publicKeyInG1.y));
    emit log_named_bytes32("PublicKeyInG2.x0", bytes32(r.publicKeyInG2.x0));
    emit log_named_bytes32("PublicKeyInG2.x1", bytes32(r.publicKeyInG2.x1));
    emit log_named_bytes32("PublicKeyInG2.y0", bytes32(r.publicKeyInG2.y0));
    emit log_named_bytes32("PublicKeyInG2.y1", bytes32(r.publicKeyInG2.y1));
    emit log_named_bytes32("ProofOfPossession.x", bytes32(r.proofOfPossession.x));
    emit log_named_bytes32("ProofOfPossession.y", bytes32(r.proofOfPossession.y));
  }

  function migrate() public {
    uint256 activationThreshold = INSTANCE.getActivationThreshold();

    vm.startBroadcast(ME);
    ADDER = new MultiAdder(address(INSTANCE), ME);
    STAKING_ASSET.mint(address(ADDER), activationThreshold * $registrations.length);
    vm.stopBroadcast();

    uint256 start = 0;
    uint256 end = $registrations.length;
    uint256 batchSize = 10;

    uint256 sizeBefore = INSTANCE.getActiveAttesterCount() + INSTANCE.getEntryQueueLength();

    while (start < end) {
      uint256 batchEnd = start + batchSize;
      if (batchEnd > end) {
        batchEnd = end;
      }

      CheatDepositArgs[] memory args = new CheatDepositArgs[](batchEnd - start);

      for (uint256 i = start; i < batchEnd; i++) {
        emit log_named_address("Adding validator", $registrations[i].attester);
        args[i - start] = CheatDepositArgs(
          $registrations[i].attester,
          WITHDRAWER,
          $registrations[i].publicKeyInG1,
          $registrations[i].publicKeyInG2,
          $registrations[i].proofOfPossession
        );
      }

      vm.startBroadcast(ME);
      ADDER.addValidators(args);
      vm.stopBroadcast();
      start = batchEnd;
    }

    uint256 sizeAfter = INSTANCE.getActiveAttesterCount() + INSTANCE.getEntryQueueLength();

    assertGe(sizeAfter, sizeBefore + end);
  }
}
