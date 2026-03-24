// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";

import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {
  AttestationLib,
  Signature,
  CommitteeAttestation,
  CommitteeAttestations
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Rollup, CheckpointLog} from "@aztec/core/Rollup.sol";
import {IEconomics} from "@aztec/core/interfaces/IEconomics.sol";
import {
  IRollup,
  SubmitEpochRootProofArgs,
  PublicInputArgs,
  RollupConfigInput
} from "@aztec/core/interfaces/IRollup.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";
import {MerkleTestUtil} from "../merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {ProposeArgs, OracleInput, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {EthPerFeeAssetE12} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {FeeHeader, L1FeeData} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {ManaMinFeeComponents} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";

import {FeeModelTestPoints, TestPoint, FeeHeaderModel, ManaMinFeeComponentsModel} from "./FeeModelTestPoints.t.sol";

import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";

import {MinimalFeeModel} from "./MinimalFeeModel.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";

// solhint-disable comprehensive-interface

uint256 constant MANA_TARGET = TestConstants.AZTEC_MANA_TARGET;
uint256 constant MINIMUM_CONGESTION_MULTIPLIER = 1e9;
uint256 constant MAGIC_CONGESTION_VALUE_DIVISOR = 1e8;
uint256 constant MAGIC_CONGESTION_VALUE_MULTIPLIER = 854_700_854;

contract FeeRollupTest is FeeModelTestPoints, DecoderBase {
  using stdStorage for StdStorage;
  using TimeLib for Timestamp;
  // We need to build a checkpoint that we can submit. We will be using some values from
  // the empty checkpoints, but otherwise populate using the fee model test points.

  struct Checkpoint {
    bytes32 archive;
    ProposedHeader header;
    bytes body;
    bytes blobInputs;
    CommitteeAttestation[] attestations;
    address[] signers;
    Signature attestationsAndSignersSignature;
  }

  DecoderBase.Full full = load("empty_checkpoint_1");

  uint256 internal constant SLOT_DURATION = 36;
  uint256 internal constant EPOCH_DURATION = 32;

  Rollup internal rollup;

  address internal coinbase = address(bytes20("MONEY MAKER"));
  TestERC20 internal asset;
  RewardDistributor internal rewardDistributor;

  function _economics() internal view returns (IEconomics) {
    return IEconomics(address(rollup.getEconomicsForEpoch(rollup.getCurrentEpoch())));
  }

  function _checkpointOfInterest(Timestamp _timestamp) internal view returns (uint256) {
    return rollup.canPruneAtTime(_timestamp) ? rollup.getProvenCheckpointNumber() : rollup.getPendingCheckpointNumber();
  }

  function _getManaMinFeeAt(Timestamp _timestamp, bool _inFeeAsset) internal view returns (uint256) {
    IEconomics economics = IEconomics(address(rollup.getEconomicsForEpoch(rollup.getEpochAt(_timestamp))));
    return economics.getProposalFeeParameters(_checkpointOfInterest(_timestamp), _timestamp, _inFeeAsset).manaMinFee;
  }

  function _getManaMinFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    internal
    view
    returns (ManaMinFeeComponents memory)
  {
    IEconomics economics = IEconomics(address(rollup.getEconomicsForEpoch(rollup.getEpochAt(_timestamp))));
    return economics.getManaMinFeeComponentsAt(_checkpointOfInterest(_timestamp), _timestamp, _inFeeAsset);
  }

  function _summedMinFee(ManaMinFeeComponents memory _components) internal pure returns (uint256) {
    return Math.min(_components.sequencerCost + _components.proverCost + _components.congestionCost, type(uint128).max);
  }

  function _pricingParentFeeHeader(uint256 _checkpointNumber) internal view returns (FeeHeader memory) {
    if (_checkpointNumber == 0) {
      return FeeHeader({
        excessMana: 0,
        manaUsed: 0,
        ethPerFeeAsset: EthPerFeeAssetE12.unwrap(TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET),
        congestionCost: 0,
        proverCost: 0
      });
    }

    return _economics().getFeeHeader(_checkpointNumber);
  }

  function setUp() public {
    // We deploy a the rollup and sets the time and all to

    vm.warp(l1Metadata[0].timestamp - SLOT_DURATION);
    vm.fee(l1Metadata[0].base_fee);
    vm.blobBaseFee(l1Metadata[0].blob_fee);

    RollupBuilder builder = new RollupBuilder(address(this)).setProvingCostPerMana(provingCost)
      .setManaTarget(MANA_TARGET).setSlotDuration(SLOT_DURATION).setEpochDuration(EPOCH_DURATION).setMintFeeAmount(1e30)
      .setTargetCommitteeSize(0);
    builder.deploy();

    rollup = builder.getConfig().rollup;
    rewardDistributor = builder.getConfig().rewardDistributor;
    asset = builder.getConfig().testERC20;

    vm.label(coinbase, "coinbase");
    vm.label(address(rollup), "ROLLUP");
    vm.label(address(rewardDistributor), "REWARD DISTRIBUTOR");
    vm.label(address(rollup.getFeeAssetPortal()), "FEE ASSET PORTAL");
    vm.label(address(asset), "ASSET");
    vm.label(_economics().getBurnAddress(), "BURN_ADDRESS");
  }

  function _loadL1Metadata(uint256 index) internal {
    vm.roll(l1Metadata[index].block_number);
    vm.warp(l1Metadata[index].timestamp);
    vm.fee(l1Metadata[index].base_fee);
    vm.blobBaseFee(l1Metadata[index].blob_fee);
  }

  /**
   * @notice Constructs a fake checkpoint that is not possible to prove, but passes the L1 checks.
   */
  function getCheckpoint() internal view returns (Checkpoint memory) {
    // We will be using the genesis for both before and after. This will be impossible
    // to prove, but we don't need to prove anything here.
    bytes32 archiveRoot = bytes32(Constants.GENESIS_ARCHIVE_ROOT);

    CommitteeAttestation[] memory attestations = new CommitteeAttestation[](0);
    address[] memory signers = new address[](0);

    bytes memory body = full.checkpoint.body;
    ProposedHeader memory header = full.checkpoint.header;

    Slot slotNumber = rollup.getCurrentSlot();
    TestPoint memory point = points[Slot.unwrap(slotNumber) - 1];

    Timestamp ts = rollup.getTimestampForSlot(slotNumber);

    uint128 manaMinFee = SafeCast.toUint128(
      point.outputs.mana_min_fee_components_in_fee_asset.sequencer_cost
        + point.outputs.mana_min_fee_components_in_fee_asset.prover_cost
        + point.outputs.mana_min_fee_components_in_fee_asset.congestion_cost
    );

    assertEq(_getManaMinFeeAt(Timestamp.wrap(block.timestamp), true), manaMinFee, "mana min fee mismatch");

    uint256 manaSpent = point.checkpoint_header.mana_spent;

    // Put coinbase onto the stack
    address cb = coinbase;

    // Updating the header with important information!
    header.lastArchiveRoot = archiveRoot;
    header.slotNumber = slotNumber;
    header.timestamp = ts;
    header.coinbase = cb;
    header.feeRecipient = bytes32(0);
    header.gasFees.feePerL2Gas = manaMinFee;
    header.totalManaUsed = manaSpent;

    return Checkpoint({
      archive: archiveRoot,
      header: header,
      body: body,
      blobInputs: full.checkpoint.blobCommitments,
      attestations: attestations,
      signers: signers,
      attestationsAndSignersSignature: Signature({v: 0, r: 0, s: 0})
    });
  }

  function _getEpochSize(uint256 _start, uint256 _pendingCheckpointNumber) internal view returns (uint256 epochSize) {
    while (
      _start + epochSize <= _pendingCheckpointNumber
        && rollup.getEpochForCheckpoint(_start) == rollup.getEpochForCheckpoint(_start + epochSize)
    ) {
      epochSize++;
    }
  }

  function _getExpectedCheckpointFees(uint256 _checkpointNumber)
    internal
    view
    returns (uint256 fee, uint256 burn, uint256 proverFee)
  {
    TestPoint memory point = points[_checkpointNumber - 1];
    uint256 minFee =
      point.outputs.mana_min_fee_components_in_fee_asset.sequencer_cost
      + point.outputs.mana_min_fee_components_in_fee_asset.prover_cost
      + point.outputs.mana_min_fee_components_in_fee_asset.congestion_cost;
    uint256 manaUsed = _economics().getFeeHeader(_checkpointNumber).manaUsed;

    fee = manaUsed * minFee;
    burn = manaUsed * point.outputs.mana_min_fee_components_in_fee_asset.congestion_cost;
    proverFee = Math.min(manaUsed * point.outputs.mana_min_fee_components_in_fee_asset.prover_cost, fee - burn);
  }

  function _buildEpochFees(uint256 _start, uint256 _epochSize)
    internal
    view
    returns (bytes32[] memory fees, uint256 burnSum, uint256 proverFees, uint256 sequencerFees)
  {
    fees = new bytes32[](Constants.MAX_CHECKPOINTS_PER_EPOCH * 2);

    for (uint256 feeIndex = 0; feeIndex < _epochSize; feeIndex++) {
      (uint256 fee, uint256 burn, uint256 proverFee) = _getExpectedCheckpointFees(_start + feeIndex);
      burnSum += burn;
      proverFees += proverFee;
      sequencerFees += (fee - burn - proverFee);
      fees[feeIndex * 2] = bytes32(uint256(uint160(bytes20(coinbase))));
      fees[feeIndex * 2 + 1] = bytes32(fee);
    }
  }

  function _submitEpochProof(uint256 _start, uint256 _epochSize, bytes32[] memory _fees) internal {
    CheckpointLog memory endCheckpoint = rollup.getCheckpoint(_start + _epochSize - 1);
    PublicInputArgs memory args = PublicInputArgs({
      previousArchive: rollup.getCheckpoint(_start).archive,
      endArchive: endCheckpoint.archive,
      outHash: endCheckpoint.outHash,
      proverId: address(0)
    });

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: _start,
        end: _start + _epochSize - 1,
        args: args,
        fees: _fees,
        attestations: CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
        blobInputs: full.checkpoint.batchedBlobInputs,
        proof: ""
      })
    );
  }

  function test__FeeModelPrune() public {
    // Submit a few checkpoints, then compute what the fees would be with/without a potential prune
    // and ensure that they match what happens.
    Slot nextSlot = Slot.wrap(1);
    for (uint256 i = 0; i < SLOT_DURATION / 12 * 5; i++) {
      _loadL1Metadata(i);

      if (rollup.getCurrentSlot() == nextSlot) {
        TestPoint memory point = points[Slot.unwrap(nextSlot) - 1];
        Checkpoint memory b = getCheckpoint();
        skipBlobCheck(address(rollup));
        rollup.propose(
          ProposeArgs({
            header: b.header,
            archive: b.archive,
            oracleInput: OracleInput({feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier})
          }),
          AttestationLibHelper.packAttestations(b.attestations),
          b.signers,
          b.attestationsAndSignersSignature,
          b.blobInputs
        );
        nextSlot = nextSlot + Slot.wrap(1);
      }
    }

    FeeHeader memory parentFeeHeaderNoPrune = _pricingParentFeeHeader(rollup.getPendingCheckpointNumber());
    uint256 excessManaNoPrune =
      _clampedAdd(parentFeeHeaderNoPrune.excessMana + parentFeeHeaderNoPrune.manaUsed, -int256(MANA_TARGET));

    FeeHeader memory parentFeeHeaderPrune = _pricingParentFeeHeader(rollup.getProvenCheckpointNumber());
    uint256 excessManaPrune =
      _clampedAdd(parentFeeHeaderPrune.excessMana + parentFeeHeaderPrune.manaUsed, -int256(MANA_TARGET));

    assertGt(excessManaNoPrune, excessManaPrune, "excess mana should be lower if we prune");

    // Find the point in time where we can prune. We can be smarter, but I'm not trying to be smart here
    // trying to be foolproof, for I am a fool.
    uint256 timeOfPrune = block.timestamp;
    while (!rollup.canPruneAtTime(Timestamp.wrap(timeOfPrune))) {
      timeOfPrune += SLOT_DURATION;
    }

    ManaMinFeeComponents memory componentsPrune = _getManaMinFeeComponentsAt(Timestamp.wrap(timeOfPrune), true);

    // If we assume that everything is proven, we will see what the fee would be if we did not prune.
    stdstore.enable_packed_slots().target(address(rollup)).sig("getProvenCheckpointNumber()")
      .checked_write(rollup.getPendingCheckpointNumber());

    ManaMinFeeComponents memory componentsNoPrune = _getManaMinFeeComponentsAt(Timestamp.wrap(timeOfPrune), true);

    // The congestion multipliers should be different, with the no-prune being higher
    // as it is based on the accumulated excess mana.
    assertGt(
      componentsNoPrune.congestionMultiplier,
      componentsPrune.congestionMultiplier,
      "congestion multiplier should be higher if we do not prune"
    );

    assertEq(
      componentsPrune.congestionMultiplier,
      _congestionMultiplier(excessManaPrune),
      "congestion multiplier mismatch for prune"
    );
    assertEq(
      componentsNoPrune.congestionMultiplier,
      _congestionMultiplier(excessManaNoPrune),
      "congestion multiplier mismatch for no-prune"
    );
  }

  function test_FeeModelEquivalence() public {
    Slot nextSlot = Slot.wrap(1);
    Epoch nextEpoch = Epoch.wrap(1);

    // Loop through all of the L1 metadata
    for (uint256 i = 0; i < l1Metadata.length; i++) {
      // Predict what the fee will be before we jump in time!
      uint256 minFeePrediction = _getManaMinFeeAt(Timestamp.wrap(l1Metadata[i].timestamp), true);

      _loadL1Metadata(i);

      // For every "new" slot we encounter, we construct a checkpoint using current L1 Data
      // and part of the `empty_checkpoint_1.json` file. The checkpoint cannot be proven, but it
      // will be accepted as a proposal so very useful for testing a long range of checkpoints.
      if (rollup.getCurrentSlot() == nextSlot) {
        TestPoint memory point = points[Slot.unwrap(nextSlot) - 1];

        L1FeeData memory fees = _economics().getL1FeesAt(Timestamp.wrap(block.timestamp));
        uint256 ethPerFeeAsset = _pricingParentFeeHeader(rollup.getPendingCheckpointNumber()).ethPerFeeAsset;

        ManaMinFeeComponents memory components = _getManaMinFeeComponentsAt(Timestamp.wrap(block.timestamp), false);
        ManaMinFeeComponents memory componentsFeeAsset =
          _getManaMinFeeComponentsAt(Timestamp.wrap(block.timestamp), true);
        FeeHeader memory parentFeeHeader = _pricingParentFeeHeader(Slot.unwrap(nextSlot) - 1);

        Checkpoint memory b = getCheckpoint();

        skipBlobCheck(address(rollup));
        rollup.propose(
          ProposeArgs({
            header: b.header,
            archive: b.archive,
            oracleInput: OracleInput({feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier})
          }),
          AttestationLibHelper.packAttestations(b.attestations),
          b.signers,
          b.attestationsAndSignersSignature,
          b.blobInputs
        );

        FeeHeader memory feeHeader = _economics().getFeeHeader(Slot.unwrap(nextSlot));

        assertEq(minFeePrediction, _summedMinFee(componentsFeeAsset), "mana min fee mismatch");

        assertEq(componentsFeeAsset.congestionCost, feeHeader.congestionCost, "congestion cost mismatch");
        // Want to check the fee header to see if they are as we want them.

        assertEq(point.checkpoint_header.checkpoint_number, nextSlot, "invalid checkpoint number");
        assertEq(point.checkpoint_header.l1_block_number, block.number, "invalid l1 block number");
        assertEq(point.checkpoint_header.slot_number, nextSlot, "invalid l2 slot number");
        assertEq(point.checkpoint_header.timestamp, block.timestamp, "invalid timestamp");

        assertEq(point.fee_header, feeHeader);

        assertEq(point.outputs.eth_per_fee_asset_at_execution, ethPerFeeAsset, "eth per fee asset mismatch");
        assertEq(point.outputs.l1_fee_oracle_output.base_fee, fees.baseFee, "base fee mismatch");
        assertEq(point.outputs.l1_fee_oracle_output.blob_fee, fees.blobFee, "blob fee mismatch");

        assertEq(point.outputs.mana_min_fee_components_in_wei, components, "in_wei");
        assertEq(point.outputs.mana_min_fee_components_in_fee_asset, componentsFeeAsset, "in_fee_asset");

        assertEq(point.parent_fee_header, parentFeeHeader);

        nextSlot = nextSlot + Slot.wrap(1);
      }

      // If we are entering a new epoch, we will post a proof
      // Ensure that the fees are split correctly between sequencers and burns etc.
      if (rollup.getCurrentEpoch() == nextEpoch) {
        nextEpoch = nextEpoch + Epoch.wrap(1);
        uint256 pendingCheckpointNumber = rollup.getPendingCheckpointNumber();
        uint256 start = rollup.getProvenCheckpointNumber() + 1;
        uint256 epochSize = _getEpochSize(start, pendingCheckpointNumber);
        (bytes32[] memory fees, uint256 burnSum, uint256 proverFees, uint256 sequencerFees) =
          _buildEpochFees(start, epochSize);

        uint256 burnAddressBalanceBefore = asset.balanceOf(_economics().getBurnAddress());
        uint256 sequencerRewardsBefore = _economics().getSequencerRewards(coinbase);
        _submitEpochProof(start, epochSize, fees);

        uint256 burned = asset.balanceOf(_economics().getBurnAddress()) - burnAddressBalanceBefore;
        assertEq(burnSum, burned, "Sum of burned does not match");

        // The reward is not yet distributed, but only accumulated.
        {
          uint256 newFees = _economics().getRewardConfig().checkpointReward * epochSize / 2 + sequencerFees;
          assertEq(_economics().getSequencerRewards(coinbase), sequencerRewardsBefore + newFees, "sequencer rewards");
        }
        {
          assertEq(
            _economics().getCollectiveProverRewardsForEpoch(rollup.getEpochForCheckpoint(start)),
            _economics().getRewardConfig().checkpointReward * epochSize / 2 + proverFees,
            "prover rewards"
          );
        }
      }
    }
  }

  function assertEq(FeeHeaderModel memory a, FeeHeader memory b) internal pure {
    FeeHeaderModel memory bModel =
      FeeHeaderModel({eth_per_fee_asset: b.ethPerFeeAsset, excess_mana: b.excessMana, mana_used: b.manaUsed});
    assertEq(a, bModel);
  }

  function _clampedAdd(uint256 _a, int256 _b) internal pure returns (uint256) {
    if (_b >= 0) {
      return _a + uint256(_b);
    }

    uint256 sub = uint256(-_b);
    return _a > sub ? _a - sub : 0;
  }

  function _congestionMultiplier(uint256 _excessMana) internal pure returns (uint256) {
    uint256 denominator = MANA_TARGET * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR;
    uint256 cappedNumerator = Math.min(_excessMana, denominator * 100);
    return _fakeExponential(MINIMUM_CONGESTION_MULTIPLIER, cappedNumerator, denominator);
  }

  function _fakeExponential(uint256 _factor, uint256 _numerator, uint256 _denominator) internal pure returns (uint256) {
    uint256 term = _factor * _denominator;
    uint256 sum = term;

    for (uint256 i = 1; term > 0; i++) {
      term = term * _numerator / (_denominator * i);
      sum += term;
    }

    return sum / _denominator;
  }

  function assertEq(ManaMinFeeComponentsModel memory a, ManaMinFeeComponents memory b, string memory _message)
    internal
    pure
  {
    ManaMinFeeComponentsModel memory bModel = ManaMinFeeComponentsModel({
      congestion_cost: b.congestionCost,
      congestion_multiplier: b.congestionMultiplier,
      prover_cost: b.proverCost,
      sequencer_cost: b.sequencerCost
    });
    assertEq(a, bModel, _message);
  }
}
