// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {MockFeeJuicePortal} from "@aztec/mock/MockFeeJuicePortal.sol";
import {TestConstants} from "../../../harnesses/TestConstants.sol";
import {CheatDepositArgs} from "@aztec/core/interfaces/IRollup.sol";

import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {Slasher, IPayload} from "@aztec/core/slashing/Slasher.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Status, ValidatorInfo} from "@aztec/core/interfaces/IStaking.sol";

import {CheatDepositArgs} from "@aztec/core/interfaces/IRollup.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";

import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TimeCheater} from "../../../staking/TimeCheater.sol";

contract SlashingScenario is TestBase {
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
      uint256 proposerPrivateKey = uint256(keccak256(abi.encode("proposer", i)));
      address proposer = vm.addr(proposerPrivateKey);

      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        proposer: proposer,
        withdrawer: address(this),
        amount: TestConstants.AZTEC_MINIMUM_STAKE
      });
    }

    testERC20 = new TestERC20("test", "TEST", address(this));
    Registry registry = new Registry(address(this), testERC20);
    rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));
    rollup = new Rollup({
      _feeAsset: testERC20,
      _rewardDistributor: rewardDistributor,
      _stakingAsset: testERC20,
      _governance: address(this),
      _genesisState: TestConstants.getGenesisState(),
      _config: TestConstants.getRollupConfigInput()
    });
    slasher = Slasher(rollup.getSlasher());
    slashingProposer = slasher.PROPOSER();
    slashFactory = new SlashFactory(IValidatorSelection(address(rollup)));

    timeCheater = new TimeCheater(
      address(rollup),
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION
    );

    testERC20.mint(address(this), TestConstants.AZTEC_MINIMUM_STAKE * validatorCount);
    testERC20.approve(address(rollup), TestConstants.AZTEC_MINIMUM_STAKE * validatorCount);
    rollup.cheat__InitialiseValidatorSet(initialValidators);

    // Cast a bunch of votes
    timeCheater.cheat__jumpForwardEpochs(1);

    assertEq(rollup.getActiveAttesterCount(), validatorCount, "Invalid attester count");

    // Lets make a proposal to slash! For
    // We jump to perfectly land at the start of the next round
    uint256 desiredSlot = Slot.unwrap(rollup.getCurrentSlot())
      + Slot.unwrap(rollup.getCurrentSlot()) % slashingProposer.M();

    timeCheater.cheat__jumpToSlot(desiredSlot);
    uint256 round = slashingProposer.computeRound(rollup.getCurrentSlot());

    uint256 slashAmount = 10e18;
    IPayload payload = slashFactory.createSlashPayload(Epoch.wrap(1), slashAmount);

    for (uint256 i = 0; i < 10; i++) {
      address proposer = rollup.getCurrentProposer();
      vm.prank(proposer);
      slashingProposer.vote(payload);
      timeCheater.cheat__progressSlot();
    }

    address[] memory attesters = rollup.getEpochCommittee(Epoch.wrap(1));
    assertEq(attesters.length, validatorCount, "Invalid attester count");
    uint256[] memory stakes = new uint256[](attesters.length);

    for (uint256 i = 0; i < attesters.length; i++) {
      ValidatorInfo memory info = rollup.getInfo(attesters[i]);
      stakes[i] = info.stake;
      assertTrue(info.status == Status.VALIDATING, "Invalid status");
    }

    slashingProposer.executeProposal(round);

    // Make sure that the slash was successful,
    // Meaning that validators are now LIVING and have lost the slash amount
    for (uint256 i = 0; i < attesters.length; i++) {
      ValidatorInfo memory info = rollup.getInfo(attesters[i]);
      uint256 stake = info.stake;
      assertEq(stake, stakes[i] - slashAmount, "Invalid stake");
      assertTrue(info.status == Status.LIVING, "Invalid status");
    }
  }
}
