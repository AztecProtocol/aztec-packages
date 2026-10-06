// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {RegistrationData, RegistrationDataLib} from "@test/shared/RegistrationData.sol";

contract TestTMNT221 is TestBase {
  IInstance public INSTANCE;
  TestERC20 public STAKING_ASSET;
  address public WITHDRAWER = address(bytes20("WITHDRAWER"));

  RegistrationData[] public $registrations;

  uint256 public constant VALIDATOR_COUNT = 32;
  bool public constant SEPARATE_FLUSH = true;
  uint256 public constant GAS_LIMIT = 16_000_000;

  function setUp() public {
    RegistrationData[] memory registrations = RegistrationDataLib.load(vm, VALIDATOR_COUNT);
    for (uint256 i = 0; i < registrations.length; i++) {
      $registrations.push(registrations[i]);
    }

    RollupBuilder builder = new RollupBuilder(address(this))
      .setUpdateOwnerships(false)
      .setCheckProofOfPossession(true)
      .setEntryQueueFlushSizeMin(VALIDATOR_COUNT)
      .deploy();

    INSTANCE = IInstance(address(builder.getConfig().rollup));
    STAKING_ASSET = builder.getConfig().testERC20;

    vm.prank(STAKING_ASSET.owner());
    STAKING_ASSET.addMinter(address(this));
  }

  /// forge-config: default.isolate = true
  function test_tmnt221() external {
    uint256 activationThreshold = INSTANCE.getActivationThreshold();

    MultiAdder adder = new MultiAdder(address(INSTANCE), address(this));

    STAKING_ASSET.mint(address(adder), activationThreshold * 2 * VALIDATOR_COUNT);

    CheatDepositArgs[] memory args = new CheatDepositArgs[](VALIDATOR_COUNT);

    for (uint256 i = 0; i < VALIDATOR_COUNT; i++) {
      args[i] = CheatDepositArgs(
        $registrations[i].attester,
        WITHDRAWER,
        $registrations[i].publicKeyInG1,
        $registrations[i].publicKeyInG2,
        $registrations[i].proofOfPossession
      );
    }

    adder.addValidators{gas: GAS_LIMIT}(args, SEPARATE_FLUSH ? 0 : type(uint256).max);

    if (SEPARATE_FLUSH) {
      INSTANCE.flushEntryQueue{gas: GAS_LIMIT}();
    }

    emit log_named_uint("Validator count", INSTANCE.getActiveAttesterCount());
    assertEq(INSTANCE.getActiveAttesterCount(), VALIDATOR_COUNT);
  }
}
