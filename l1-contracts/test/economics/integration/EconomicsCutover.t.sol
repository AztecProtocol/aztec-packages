// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../../base/DecoderBase.sol";
import {RollupBase, IInstance} from "../../base/RollupBase.sol";
import {RollupBuilder} from "../../builder/RollupBuilder.sol";
import {Economics} from "@aztec/core/Economics.sol";
import {IEconomics} from "@aztec/core/interfaces/IEconomics.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {TestConstants} from "../../harnesses/TestConstants.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {EconomicsInitArgs} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {Epoch, Slot, TimeLib, Timestamp} from "@aztec/core/libraries/TimeLib.sol";

contract EconomicsCutoverTest is RollupBase {
  using TimeLib for Timestamp;

  TestERC20 internal testERC20;

  uint256 internal constant SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;

  modifier setUpFor(string memory _name) {
    {
      DecoderBase.Full memory full = load(_name);
      uint256 slotNumber = Slot.unwrap(full.checkpoint.header.slotNumber);
      uint256 initialTime = Timestamp.unwrap(full.checkpoint.header.timestamp) - slotNumber * SLOT_DURATION;
      vm.warp(initialTime);
    }

    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );

    RollupBuilder builder = new RollupBuilder(address(this)).setTargetCommitteeSize(0);
    builder.deploy();

    rollup = IInstance(address(builder.getConfig().rollup));
    testERC20 = builder.getConfig().testERC20;
    _;
  }

  function test_epochPinnedEconomicsRoutesProposalsAndProofsAcrossCutover() external setUpFor("empty_checkpoint_1") {
    IEconomics oldEconomics = _economics();
    IEconomics replacement = _newEconomics(TestConstants.AZTEC_MANA_TARGET * 2);
    address owner = Ownable(address(rollup)).owner();
    uint256 firstManaUsed = 17;
    uint256 secondManaUsed = 29;
    address firstProver = address(0xA11CE);
    address secondProver = address(0xB0B);
    Epoch firstEpoch = Epoch.wrap(0);
    Epoch secondEpoch = firstEpoch + Epoch.wrap(1);
    uint256 roundaboutSize = oldEconomics.getEpochDuration() * (oldEconomics.getProofSubmissionEpochs() + 1) + 1;

    deal(address(testERC20), address(rollup.getFeeAssetPortal()), 1e24);

    _proposeCheckpoint("empty_checkpoint_1", 1, firstManaUsed);

    vm.prank(owner);
    rollup.setEconomics(replacement);

    _proposeCheckpoint("empty_checkpoint_2", rollup.getEpochDuration(), secondManaUsed);

    assertEq(address(rollup.getEconomicsForEpoch(firstEpoch)), address(oldEconomics), "old epoch economics");
    assertEq(address(rollup.getEconomicsForEpoch(secondEpoch)), address(replacement), "new epoch economics");
    assertEq(rollup.getEpochForCheckpoint(1), firstEpoch, "checkpoint one epoch");
    assertEq(rollup.getEpochForCheckpoint(2), secondEpoch, "checkpoint two epoch");

    assertEq(oldEconomics.getFeeHeader(1).manaUsed, firstManaUsed, "checkpoint one on old economics");
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Economics__UnavailableFeeHeader.selector, 1, 2, 2, 1 + roundaboutSize)
    );
    replacement.getFeeHeader(1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Economics__UnavailableFeeHeader.selector, 2, 1, 1, 2 + roundaboutSize)
    );
    oldEconomics.getFeeHeader(2);
    assertEq(replacement.getFeeHeader(2).manaUsed, secondManaUsed, "checkpoint two on new economics");

    assertEq(testERC20.balanceOf(address(oldEconomics)), 0, "old economics balance before proof");
    assertEq(testERC20.balanceOf(address(replacement)), 0, "new economics balance before proof");

    _proveCheckpoints("empty_checkpoint_", 1, 1, firstProver);

    assertEq(rollup.getProvenCheckpointNumber(), 1, "checkpoint one proven");
    assertEq(oldEconomics.getLongestProvenLength(firstEpoch), 1, "old economics settled old epoch");
    assertEq(replacement.getLongestProvenLength(firstEpoch), 0, "new economics untouched for old epoch");
    assertGt(testERC20.balanceOf(address(oldEconomics)), 0, "old economics received settlement funds");
    assertEq(testERC20.balanceOf(address(replacement)), 0, "new economics not funded by old epoch proof");

    _proveCheckpoints("empty_checkpoint_", 2, 2, secondProver);

    assertEq(rollup.getProvenCheckpointNumber(), 2, "checkpoint two proven");
    assertEq(oldEconomics.getLongestProvenLength(secondEpoch), 0, "old economics untouched for new epoch");
    assertEq(replacement.getLongestProvenLength(secondEpoch), 1, "new economics settled new epoch");
    assertGt(testERC20.balanceOf(address(replacement)), 0, "new economics received settlement funds");
  }

  function _newEconomics(uint256 _manaTarget) internal returns (IEconomics) {
    Epoch currentEpoch = rollup.getCurrentEpoch();
    IEconomics currentEconomics = IEconomics(address(rollup.getEconomicsForEpoch(currentEpoch)));
    address governance = Ownable(address(rollup)).owner();

    return IEconomics(
      address(
        new Economics(
          governance,
          address(rollup),
          testERC20,
          EconomicsInitArgs({
            manaTarget: _manaTarget,
            provingCostPerMana: currentEconomics.getFeeConfig().provingCostPerMana,
            initialEthPerFeeAsset: TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET,
            rewardConfig: currentEconomics.getRewardConfig(),
            rewardBoostConfig: currentEconomics.getRewardBoostConfig(),
            genesisTime: Timestamp.unwrap(rollup.getGenesisTime()),
            aztecSlotDuration: rollup.getSlotDuration(),
            aztecEpochDuration: rollup.getEpochDuration(),
            aztecProofSubmissionEpochs: rollup.getProofSubmissionEpochs()
          })
        )
      )
    );
  }
}
