// SPDX-License-Identifier: UNLICENSED
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Rollup} from "@aztec/core/Rollup.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Slasher, IPayload} from "@aztec/core/slashing/Slasher.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {TestBase} from "@test/base/Base.sol";

import {TestConstants} from "../../../harnesses/TestConstants.sol";

import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {Slasher, IPayload} from "@aztec/core/slashing/Slasher.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Status, AttesterView} from "@aztec/core/interfaces/IStaking.sol";

import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";

import {Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TimeCheater} from "../../../staking/TimeCheater.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {RollupBuilder} from "../../../builder/RollupBuilder.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract SlashingTest is TestBase {
  TestERC20 internal testERC20;
  RewardDistributor internal rewardDistributor;
  Rollup internal rollup;
  Slasher internal slasher;
  SlashFactory internal slashFactory;
  SlashingProposer internal slashingProposer;
  TimeCheater internal timeCheater;

  function test_Slashing() public {
    uint256 validatorCount = 4;

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](validatorCount);

    for (uint256 i = 1; i < validatorCount + 1; i++) {
      uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(attesterPrivateKey);

      initialValidators[i - 1] = CheatDepositArgs({attester: attester, withdrawer: address(this)});
    }

    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();

    rollup = builder.getConfig().rollup;
    testERC20 = builder.getConfig().testERC20;

    slasher = Slasher(rollup.getSlasher());
    slashingProposer = slasher.PROPOSER();
    slashFactory = new SlashFactory(IValidatorSelection(address(rollup)));

    timeCheater = new TimeCheater(
      address(rollup),
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION
    );

    MultiAdder multiAdder = new MultiAdder(address(rollup), address(this));
    testERC20.mint(address(multiAdder), rollup.getMinimumStake() * validatorCount);
    multiAdder.addValidators(initialValidators);

    // Cast a bunch of votes
    timeCheater.cheat__jumpForwardEpochs(2);

    assertEq(rollup.getActiveAttesterCount(), validatorCount, "Invalid attester count");

    // Lets make a proposal to slash! For
    // We jump to perfectly land at the start of the next round
    uint256 desiredSlot = Slot.unwrap(rollup.getCurrentSlot())
      + Slot.unwrap(rollup.getCurrentSlot()) % slashingProposer.M();

    timeCheater.cheat__jumpToSlot(desiredSlot);
    uint256 round = slashingProposer.computeRound(rollup.getCurrentSlot());

    uint96 slashAmount = 10e18;
    address[] memory attesters = rollup.getEpochCommittee(Epoch.wrap(2));
    uint96[] memory amounts = new uint96[](attesters.length);
    uint256[] memory offenses = new uint256[](attesters.length);
    for (uint256 i = 0; i < attesters.length; i++) {
      amounts[i] = slashAmount;
    }

    IPayload payload = slashFactory.createSlashPayload(attesters, amounts, offenses);

    for (uint256 i = 0; i < 10; i++) {
      address proposer = rollup.getCurrentProposer();
      vm.prank(proposer);
      slashingProposer.vote(payload);
      timeCheater.cheat__progressSlot();
    }

    assertEq(attesters.length, validatorCount, "Invalid attester count");
    uint256[] memory stakes = new uint256[](attesters.length);

    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      stakes[i] = attesterView.effectiveBalance;
      assertTrue(attesterView.status == Status.VALIDATING, "Invalid status");
    }

    slashingProposer.executeProposal(round);

    // Make sure that the slash was successful,
    // Meaning that validators are now LIVING and have lost the slash amount
    for (uint256 i = 0; i < attesters.length; i++) {
      AttesterView memory attesterView = rollup.getAttesterView(attesters[i]);
      assertEq(attesterView.effectiveBalance, 0);
      assertEq(attesterView.exit.amount, stakes[i] - slashAmount, "Invalid stake");
      assertTrue(attesterView.status == Status.LIVING, "Invalid status");
    }
  }
}
