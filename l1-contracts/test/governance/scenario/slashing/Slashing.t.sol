// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Rollup, Config} from "@aztec/core/Rollup.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {MockFeeJuicePortal} from "@aztec/mock/MockFeeJuicePortal.sol";
import {TestConstants} from "../../../harnesses/TestConstants.sol";
import {CheatDepositArgs} from "@aztec/core/interfaces/IRollup.sol";

import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {Slasher, IPayload} from "@aztec/core/staking/Slasher.sol";
import {ILeonidas} from "@aztec/core/interfaces/ILeonidas.sol";
import {Status, ValidatorInfo} from "@aztec/core/interfaces/IStaking.sol";

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

import {CheatDepositArgs} from "@aztec/core/interfaces/IRollup.sol";
import {SlashingProposer} from "@aztec/core/staking/SlashingProposer.sol";

import {Slot, SlotLib, Epoch} from "@aztec/core/libraries/TimeMath.sol";

contract SlashingScenario is TestBase {
  using SlotLib for Slot;

  TestERC20 internal testERC20;
  RewardDistributor internal rewardDistributor;
  Rollup internal rollup;
  Slasher internal slasher;
  SlashFactory internal slashFactory;
  SlashingProposer internal slashingProposer;

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
    Registry registry = new Registry(address(this));
    rewardDistributor = new RewardDistributor(testERC20, registry, address(this));
    rollup = new Rollup({
      _fpcJuicePortal: new MockFeeJuicePortal(),
      _rewardDistributor: rewardDistributor,
      _stakingAsset: testERC20,
      _vkTreeRoot: bytes32(0),
      _protocolContractTreeRoot: bytes32(0),
      _ares: address(this),
      _config: Config({
        aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
        aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
        targetCommitteeSize: TestConstants.AZTEC_TARGET_COMMITTEE_SIZE,
        aztecEpochProofClaimWindowInL2Slots: TestConstants.AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS,
        minimumStake: TestConstants.AZTEC_MINIMUM_STAKE,
        slashingQuorum: TestConstants.AZTEC_SLASHING_QUORUM,
        slashingRoundSize: TestConstants.AZTEC_SLASHING_ROUND_SIZE,
        rollupVersion: TestConstants.ROLLUP_VERSION
      })
    });
    slasher = rollup.SLASHER();
    slashingProposer = slasher.PROPOSER();
    slashFactory = new SlashFactory(ILeonidas(address(rollup)));

    testERC20.mint(address(this), TestConstants.AZTEC_MINIMUM_STAKE * validatorCount);
    testERC20.approve(address(rollup), TestConstants.AZTEC_MINIMUM_STAKE * validatorCount);
    rollup.cheat__InitialiseValidatorSet(initialValidators);

    // Lets make a proposal to slash!

    uint256 slashAmount = 10e18;
    IPayload payload = slashFactory.createSlashPayload(Epoch.wrap(0), slashAmount);

    // Cast a bunch of votes
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(1))));

    for (uint256 i = 0; i < 10; i++) {
      address proposer = rollup.getCurrentProposer();
      vm.prank(proposer);
      slashingProposer.vote(payload);
      vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(rollup.getCurrentSlot() + Slot.wrap(1))));
    }

    address[] memory attesters = rollup.getAttesters();
    uint256[] memory stakes = new uint256[](attesters.length);

    for (uint256 i = 0; i < attesters.length; i++) {
      ValidatorInfo memory info = rollup.getInfo(attesters[i]);
      stakes[i] = info.stake;
      assertTrue(info.status == Status.VALIDATING, "Invalid status");
    }

    slashingProposer.executeProposal(0);

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
