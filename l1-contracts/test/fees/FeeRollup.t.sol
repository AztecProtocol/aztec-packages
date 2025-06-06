// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";

import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {
  SignatureLib,
  Signature,
  CommitteeAttestation
} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Rollup, BlockLog} from "@aztec/core/Rollup.sol";
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
import {
  FeeLib,
  FeeAssetPerEthE9,
  EthValue,
  FeeHeader,
  L1FeeData,
  ManaBaseFeeComponents
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Math} from "@oz/utils/math/Math.sol";

import {
  FeeModelTestPoints,
  TestPoint,
  FeeHeaderModel,
  ManaBaseFeeComponentsModel
} from "./FeeModelTestPoints.t.sol";

import {Timestamp, Slot, Epoch, SlotLib, EpochLib} from "@aztec/core/libraries/TimeLib.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";

import {MinimalFeeModel} from "./MinimalFeeModel.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";

// solhint-disable comprehensive-interface

uint256 constant MANA_TARGET = 100000000;

contract FeeRollupTest is FeeModelTestPoints, DecoderBase {
  using stdStorage for StdStorage;

  using SlotLib for Slot;
  using EpochLib for Epoch;
  using FeeLib for uint256;
  using FeeLib for ManaBaseFeeComponents;
  // We need to build a block that we can submit. We will be using some values from
  // the empty blocks, but otherwise populate using the fee model test points.

  struct Block {
    bytes32 archive;
    ProposedHeader header;
    bytes body;
    bytes blobInputs;
    bytes32[] txHashes;
    CommitteeAttestation[] attestations;
  }

  DecoderBase.Full full = load("empty_block_1");

  uint256 internal constant SLOT_DURATION = 36;
  uint256 internal constant EPOCH_DURATION = 32;

  Rollup internal rollup;

  address internal coinbase = address(bytes20("MONEY MAKER"));
  TestERC20 internal asset;
  RewardDistributor internal rewardDistributor;

  constructor() {
    FeeLib.initialize(MANA_TARGET, EthValue.wrap(100));
  }

  function setUp() public {
    // We deploy a the rollup and sets the time and all to

    vm.warp(l1Metadata[0].timestamp - SLOT_DURATION);
    vm.fee(l1Metadata[0].base_fee);
    vm.blobBaseFee(l1Metadata[0].blob_fee);

    RollupBuilder builder = new RollupBuilder(address(this)).setProvingCostPerMana(provingCost)
      .setManaTarget(MANA_TARGET).setSlotDuration(SLOT_DURATION).setEpochDuration(EPOCH_DURATION)
      .setProofSubmissionWindow(EPOCH_DURATION * 2 - 1).setMintFeeAmount(1e30);
    builder.deploy();

    rollup = builder.getConfig().rollup;
    rewardDistributor = builder.getConfig().rewardDistributor;
    asset = builder.getConfig().testERC20;

    vm.label(coinbase, "coinbase");
    vm.label(address(rollup), "ROLLUP");
    vm.label(address(rewardDistributor), "REWARD DISTRIBUTOR");
    vm.label(address(rollup.getFeeAssetPortal()), "FEE ASSET PORTAL");
    vm.label(address(asset), "ASSET");
    vm.label(rollup.getBurnAddress(), "BURN_ADDRESS");
  }

  function _loadL1Metadata(uint256 index) internal {
    vm.roll(l1Metadata[index].block_number);
    vm.warp(l1Metadata[index].timestamp);
    vm.fee(l1Metadata[index].base_fee);
    vm.blobBaseFee(l1Metadata[index].blob_fee);
  }

  /**
   * @notice Constructs a fake block that is not possible to prove, but passes the L1 checks.
   */
  function getBlock() internal view returns (Block memory) {
    // We will be using the genesis for both before and after. This will be impossible
    // to prove, but we don't need to prove anything here.
    bytes32 archiveRoot = bytes32(Constants.GENESIS_ARCHIVE_ROOT);

    bytes32[] memory txHashes = new bytes32[](0);
    CommitteeAttestation[] memory attestations = new CommitteeAttestation[](0);

    bytes memory body = full.block.body;
    ProposedHeader memory header = full.block.header;

    Slot slotNumber = rollup.getCurrentSlot();
    TestPoint memory point = points[slotNumber.unwrap() - 1];

    Timestamp ts = rollup.getTimestampForSlot(slotNumber);

    uint128 manaBaseFee = SafeCast.toUint128(
      point.outputs.mana_base_fee_components_in_fee_asset.sequencer_cost
        + point.outputs.mana_base_fee_components_in_fee_asset.prover_cost
        + point.outputs.mana_base_fee_components_in_fee_asset.congestion_cost
    );

    assertEq(
      rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true),
      manaBaseFee,
      "mana base fee mismatch"
    );

    uint256 manaSpent = point.block_header.mana_spent;

    // Put coinbase onto the stack
    address cb = coinbase;

    // Updating the header with important information!
    header.lastArchiveRoot = archiveRoot;
    header.slotNumber = slotNumber;
    header.timestamp = ts;
    header.coinbase = cb;
    header.feeRecipient = bytes32(0);
    header.gasFees.feePerL2Gas = manaBaseFee;
    header.totalManaUsed = manaSpent;

    return Block({
      archive: archiveRoot,
      header: header,
      body: body,
      blobInputs: full.block.blobInputs,
      txHashes: txHashes,
      attestations: attestations
    });
  }

  function test__FeeModelPrune() public {
    // Submit a few blocks, then compute what the fees would be with/without a potential prune
    // and ensure that they match what happens.
    Slot nextSlot = Slot.wrap(1);
    for (uint256 i = 0; i < SLOT_DURATION / 12 * 5; i++) {
      _loadL1Metadata(i);

      if (rollup.getCurrentSlot() == nextSlot) {
        TestPoint memory point = points[nextSlot.unwrap() - 1];
        Block memory b = getBlock();
        skipBlobCheck(address(rollup));
        rollup.propose(
          ProposeArgs({
            header: b.header,
            archive: b.archive,
            stateReference: EMPTY_STATE_REFERENCE,
            oracleInput: OracleInput({
              feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier
            }),
            txHashes: b.txHashes
          }),
          b.attestations,
          b.blobInputs
        );
        nextSlot = nextSlot + Slot.wrap(1);
      }
    }

    FeeHeader memory parentFeeHeaderNoPrune = rollup.getFeeHeader(rollup.getPendingBlockNumber());
    uint256 excessManaNoPrune = (
      parentFeeHeaderNoPrune.excessMana + parentFeeHeaderNoPrune.manaUsed
    ).clampedAdd(-int256(MANA_TARGET));

    FeeHeader memory parentFeeHeaderPrune = rollup.getFeeHeader(rollup.getProvenBlockNumber());
    uint256 excessManaPrune = (parentFeeHeaderPrune.excessMana + parentFeeHeaderPrune.manaUsed)
      .clampedAdd(-int256(MANA_TARGET));

    assertGt(excessManaNoPrune, excessManaPrune, "excess mana should be lower if we prune");

    // Find the point in time where we can prune. We can be smarter, but I'm not trying to be smart here
    // trying to be foolproof, for I am a fool.
    uint256 timeOfPrune = block.timestamp;
    while (!rollup.canPruneAtTime(Timestamp.wrap(timeOfPrune))) {
      timeOfPrune += SLOT_DURATION;
    }

    ManaBaseFeeComponents memory componentsPrune =
      rollup.getManaBaseFeeComponentsAt(Timestamp.wrap(timeOfPrune), true);

    // If we assume that everything is proven, we will see what the fee would be if we did not prune.
    stdstore.target(address(rollup)).sig("getProvenBlockNumber()").checked_write(
      rollup.getPendingBlockNumber()
    );

    ManaBaseFeeComponents memory componentsNoPrune =
      rollup.getManaBaseFeeComponentsAt(Timestamp.wrap(timeOfPrune), true);

    // The congestion multipliers should be different, with the no-prune being higher
    // as it is based on the accumulated excess mana.
    assertGt(
      componentsNoPrune.congestionMultiplier,
      componentsPrune.congestionMultiplier,
      "congestion multiplier should be higher if we do not prune"
    );

    assertEq(
      componentsPrune.congestionMultiplier,
      FeeLib.congestionMultiplier(excessManaPrune),
      "congestion multiplier mismatch for prune"
    );
    assertEq(
      componentsNoPrune.congestionMultiplier,
      FeeLib.congestionMultiplier(excessManaNoPrune),
      "congestion multiplier mismatch for no-prune"
    );
  }

  function test_FeeModelEquivalence() public {
    Slot nextSlot = Slot.wrap(1);
    Epoch nextEpoch = Epoch.wrap(1);

    // Loop through all of the L1 metadata
    for (uint256 i = 0; i < l1Metadata.length; i++) {
      // Predict what the fee will be before we jump in time!
      uint256 baseFeePrediction =
        rollup.getManaBaseFeeAt(Timestamp.wrap(l1Metadata[i].timestamp), true);

      _loadL1Metadata(i);

      // For every "new" slot we encounter, we construct a block using current L1 Data
      // and part of the `empty_block_1.json` file. The block cannot be proven, but it
      // will be accepted as a proposal so very useful for testing a long range of blocks.
      if (rollup.getCurrentSlot() == nextSlot) {
        TestPoint memory point = points[nextSlot.unwrap() - 1];

        L1FeeData memory fees = rollup.getL1FeesAt(Timestamp.wrap(block.timestamp));
        uint256 feeAssetPrice = FeeAssetPerEthE9.unwrap(rollup.getFeeAssetPerEth());

        ManaBaseFeeComponents memory components =
          rollup.getManaBaseFeeComponentsAt(Timestamp.wrap(block.timestamp), false);
        ManaBaseFeeComponents memory componentsFeeAsset =
          rollup.getManaBaseFeeComponentsAt(Timestamp.wrap(block.timestamp), true);
        FeeHeader memory parentFeeHeader = rollup.getFeeHeader(nextSlot.unwrap() - 1);

        Block memory b = getBlock();

        skipBlobCheck(address(rollup));
        rollup.propose(
          ProposeArgs({
            header: b.header,
            archive: b.archive,
            stateReference: EMPTY_STATE_REFERENCE,
            oracleInput: OracleInput({
              feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier
            }),
            txHashes: b.txHashes
          }),
          b.attestations,
          b.blobInputs
        );

        FeeHeader memory feeHeader = rollup.getFeeHeader(nextSlot.unwrap());

        assertEq(baseFeePrediction, componentsFeeAsset.summedBaseFee(), "mana base fee mismatch");

        assertEq(
          componentsFeeAsset.congestionCost, feeHeader.congestionCost, "congestion cost mismatch"
        );
        // Want to check the fee header to see if they are as we want them.

        assertEq(point.block_header.block_number, nextSlot, "invalid l2 block number");
        assertEq(point.block_header.l1_block_number, block.number, "invalid l1 block number");
        assertEq(point.block_header.slot_number, nextSlot, "invalid l2 slot number");
        assertEq(point.block_header.timestamp, block.timestamp, "invalid timestamp");

        assertEq(point.fee_header, feeHeader);

        assertEq(
          point.outputs.fee_asset_price_at_execution, feeAssetPrice, "fee asset price mismatch"
        );
        assertEq(point.outputs.l1_fee_oracle_output.base_fee, fees.baseFee, "base fee mismatch");
        assertEq(point.outputs.l1_fee_oracle_output.blob_fee, fees.blobFee, "blob fee mismatch");

        assertEq(point.outputs.mana_base_fee_components_in_wei, components, "in_wei");
        assertEq(
          point.outputs.mana_base_fee_components_in_fee_asset, componentsFeeAsset, "in_fee_asset"
        );

        assertEq(point.parent_fee_header, parentFeeHeader);

        nextSlot = nextSlot + Slot.wrap(1);
      }

      // If we are entering a new epoch, we will post a proof
      // Ensure that the fees are split correctly between sequencers and burns etc.
      if (rollup.getCurrentEpoch() == nextEpoch) {
        nextEpoch = nextEpoch + Epoch.wrap(1);
        uint256 pendingBlockNumber = rollup.getPendingBlockNumber();
        uint256 start = rollup.getProvenBlockNumber() + 1;
        uint256 epochSize = 0;
        while (
          start + epochSize <= pendingBlockNumber
            && rollup.getEpochForBlock(start) == rollup.getEpochForBlock(start + epochSize)
        ) {
          epochSize++;
        }

        uint256 proverFees = 0;
        uint256 sequencerFees = 0;
        uint256 burnSum = 0;
        bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

        for (uint256 feeIndex = 0; feeIndex < epochSize; feeIndex++) {
          TestPoint memory point = points[start + feeIndex - 1];

          // We assume that everyone PERFECTLY pays their fees with 0 priority fees and no
          // overpaying on teardown.
          uint256 baseFee = point.outputs.mana_base_fee_components_in_fee_asset.sequencer_cost
            + point.outputs.mana_base_fee_components_in_fee_asset.prover_cost
            + point.outputs.mana_base_fee_components_in_fee_asset.congestion_cost;

          uint256 manaUsed = rollup.getFeeHeader(start + feeIndex).manaUsed;
          uint256 fee = manaUsed * baseFee;
          uint256 burn =
            manaUsed * point.outputs.mana_base_fee_components_in_fee_asset.congestion_cost;
          burnSum += burn;

          uint256 proverFee = Math.min(
            manaUsed * point.outputs.mana_base_fee_components_in_fee_asset.prover_cost, fee - burn
          );
          proverFees += proverFee;
          sequencerFees += (fee - burn - proverFee);

          fees[feeIndex * 2] = bytes32(uint256(uint160(bytes20(coinbase))));
          fees[feeIndex * 2 + 1] = bytes32(fee);
        }

        uint256 burnAddressBalanceBefore = asset.balanceOf(rollup.getBurnAddress());
        uint256 sequencerRewardsBefore = rollup.getSequencerRewards(coinbase);

        PublicInputArgs memory args = PublicInputArgs({
          previousArchive: rollup.getBlock(start).archive,
          endArchive: rollup.getBlock(start + epochSize - 1).archive,
          proverId: address(0)
        });

        bytes memory blobPublicInputs;
        for (uint256 j = 0; j < epochSize; j++) {
          // For each block in the epoch, add its blob public inputs
          // Since we are reusing the same block, they are the same
          blobPublicInputs =
            abi.encodePacked(blobPublicInputs, this.getBlobPublicInputs(full.block.blobInputs));
        }

        {
          rollup.submitEpochRootProof(
            SubmitEpochRootProofArgs({
              start: start,
              end: start + epochSize - 1,
              args: args,
              fees: fees,
              blobPublicInputs: blobPublicInputs,
              proof: ""
            })
          );
        }

        uint256 burned = asset.balanceOf(rollup.getBurnAddress()) - burnAddressBalanceBefore;
        assertEq(burnSum, burned, "Sum of burned does not match");

        // The reward is not yet distributed, but only accumulated.
        {
          uint256 newFees = rewardDistributor.BLOCK_REWARD() * epochSize / 2 + sequencerFees;
          assertEq(
            rollup.getSequencerRewards(coinbase),
            sequencerRewardsBefore + newFees,
            "sequencer rewards"
          );
        }
        {
          assertEq(
            rollup.getCollectiveProverRewardsForEpoch(rollup.getEpochForBlock(start)),
            rewardDistributor.BLOCK_REWARD() * epochSize / 2 + proverFees,
            "prover rewards"
          );
        }
      }
    }
  }

  function assertEq(FeeHeaderModel memory a, FeeHeader memory b) internal pure {
    FeeHeaderModel memory bModel = FeeHeaderModel({
      excess_mana: b.excessMana,
      fee_asset_price_numerator: b.feeAssetPriceNumerator,
      mana_used: b.manaUsed
    });
    assertEq(a, bModel);
  }

  function assertEq(
    ManaBaseFeeComponentsModel memory a,
    ManaBaseFeeComponents memory b,
    string memory _message
  ) internal pure {
    ManaBaseFeeComponentsModel memory bModel = ManaBaseFeeComponentsModel({
      congestion_cost: b.congestionCost,
      congestion_multiplier: b.congestionMultiplier,
      prover_cost: b.proverCost,
      sequencer_cost: b.sequencerCost
    });
    assertEq(a, bModel, _message);
  }

  // This is duplicated from Rollup.t.sol because we need to call it as this.getBlobPublicInputs
  // so it accepts the input as calldata
  function getBlobPublicInputs(bytes calldata _blobsInput)
    public
    pure
    returns (bytes memory blobPublicInputs)
  {
    uint8 numBlobs = uint8(_blobsInput[0]);
    blobPublicInputs = abi.encodePacked(numBlobs, blobPublicInputs);
    for (uint256 i = 0; i < numBlobs; i++) {
      // Add 1 for the numBlobs prefix
      uint256 blobInputStart = i * 192 + 1;
      // We want to extract the bytes we use for public inputs:
      //  * input[32:64]   - z
      //  * input[64:96]   - y
      //  * input[96:144]  - commitment C
      // Out of 192 bytes per blob.
      blobPublicInputs =
        abi.encodePacked(blobPublicInputs, _blobsInput[blobInputStart + 32:blobInputStart + 144]);
    }
  }
}
