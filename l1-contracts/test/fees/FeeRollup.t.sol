// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../decoders/Base.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {EpochProofQuoteLib} from "@aztec/core/libraries/EpochProofQuoteLib.sol";
import {Math} from "@oz/utils/math/Math.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  Rollup,
  Config,
  BlockLog,
  L1FeeData,
  FeeHeader,
  ManaBaseFeeComponents
} from "@aztec/core/Rollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {FeeJuicePortal} from "@aztec/core/FeeJuicePortal.sol";
import {Leonidas} from "@aztec/core/Leonidas.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";
import {MerkleTestUtil} from "../merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {TxsDecoderHelper} from "../decoders/helpers/TxsDecoderHelper.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {OracleInput} from "@aztec/core/libraries/FeeMath.sol";
import {ProposeArgs, OracleInput, ProposeLib} from "@aztec/core/libraries/ProposeLib.sol";

import {
  FeeHeader as FeeHeaderModel,
  ManaBaseFeeComponents as ManaBaseFeeComponentsModel
} from "./FeeModelTestPoints.t.sol";

import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeFns
} from "@aztec/core/libraries/TimeMath.sol";

import {FeeModelTestPoints, TestPoint} from "./FeeModelTestPoints.t.sol";
import {MinimalFeeModel} from "./MinimalFeeModel.sol";
// solhint-disable comprehensive-interface

contract FakeCanonical {
  function canonicalRollup() external view returns (address) {
    return msg.sender;
  }

  function UNDERLYING() external pure returns (address) {
    return address(0);
  }
}

contract FeeRollupTest is FeeModelTestPoints, DecoderBase {
  using SlotLib for Slot;
  // We need to build a block that we can submit. We will be using some values from
  // the empty blocks, but otherwise populate using the fee model test points.

  struct Block {
    bytes32 archive;
    bytes32 blockHash;
    bytes header;
    bytes body;
    bytes32[] txHashes;
    SignatureLib.Signature[] signatures;
  }

  DecoderBase.Full full = load("empty_block_1");

  uint256 internal constant SLOT_DURATION = 36;
  uint256 internal constant EPOCH_DURATION = 32;

  Rollup internal rollup;

  function setUp() public {
    // We deploy a the rollup and sets the time and all to

    vm.warp(l1Metadata[0].timestamp - SLOT_DURATION);
    vm.fee(l1Metadata[0].base_fee);
    vm.blobBaseFee(l1Metadata[0].blob_fee);

    FakeCanonical fakeCanonical = new FakeCanonical();
    rollup = new Rollup(
      IFeeJuicePortal(address(fakeCanonical)),
      IRewardDistributor(address(fakeCanonical)),
      bytes32(0),
      bytes32(0),
      address(this),
      new address[](0),
      Config({
        aztecSlotDuration: SLOT_DURATION,
        aztecEpochDuration: EPOCH_DURATION,
        targetCommitteeSize: 48,
        aztecEpochProofClaimWindowInL2Slots: 16
      })
    );
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
    bytes32 blockHash = 0x267f79fe7e757b20e924fac9f78264a0d1c8c4b481fea21d0bbe74650d87a1f1;

    bytes32[] memory txHashes = new bytes32[](0);
    SignatureLib.Signature[] memory signatures = new SignatureLib.Signature[](0);

    bytes memory body = full.block.body;
    bytes memory header = full.block.header;

    Slot slotNumber = rollup.getCurrentSlot();
    TestPoint memory point = points[slotNumber.unwrap() - 1];

    Timestamp ts = rollup.getTimestampForSlot(slotNumber);
    uint256 bn = rollup.getPendingBlockNumber() + 1;

    uint256 manaBaseFee = (
      point.outputs.mana_base_fee_components_in_fee_asset.data_cost
        + point.outputs.mana_base_fee_components_in_fee_asset.gas_cost
        + point.outputs.mana_base_fee_components_in_fee_asset.proving_cost
        + point.outputs.mana_base_fee_components_in_fee_asset.congestion_cost
    );

    assertEq(manaBaseFee, rollup.getManaBaseFee(true), "mana base fee mismatch");

    // Updating the header with important information!
    assembly {
      let headerRef := add(header, 0x20)

      mstore(add(headerRef, 0x0000), archiveRoot)
      // Load the full word at 0x20 (which contains lastArchive.nextAvailableLeafIndex and start of numTxs)
      let word := mload(add(headerRef, 0x20))
      // Clear just the first 4 bytes from the left (most significant bytes)
      word := and(word, 0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff)
      // Set the new value for nextAvailableLeafIndex (bn) in the first 4 bytes from left
      word := or(word, shl(224, bn))
      // Store the modified word back
      mstore(add(headerRef, 0x20), word)

      mstore(add(headerRef, 0x0174), bn)
      mstore(add(headerRef, 0x0194), slotNumber)
      mstore(add(headerRef, 0x01b4), ts)
      mstore(add(headerRef, 0x01d4), 0)
      mstore(add(headerRef, 0x01e8), 0)
      mstore(add(headerRef, 0x0208), 0)
      mstore(add(headerRef, 0x0228), manaBaseFee)
    }

    // We extend the with 20 bytes of mana spent information.
    header = bytes.concat(header, bytes32(point.block_header.mana_spent));

    return Block({
      archive: archiveRoot,
      blockHash: blockHash,
      header: header,
      body: body,
      txHashes: txHashes,
      signatures: signatures
    });
  }

  function test_BigBrainTime() public {
    rollup.setAssumeProvenThroughBlockNumber(10000);

    Slot nextSlot = Slot.wrap(1);

    // Loop through all of the L1 metadata
    for (uint256 i = 0; i < l1Metadata.length; i++) {
      _loadL1Metadata(i);

      // For every "new" slot we encounter, we construct a block using current L1 Data
      // and part of the `empty_block_1.json` file. The block cannot be proven, but it
      // will be accepted as a proposal so very useful for testing a long range of blocks.
      if (rollup.getCurrentSlot() == nextSlot) {
        TestPoint memory point = points[nextSlot.unwrap() - 1];

        L1FeeData memory fees = rollup.getCurrentL1Fees();
        uint256 feeAssetPrice = rollup.getFeeAssetPrice();

        ManaBaseFeeComponents memory components = rollup.manaBaseFeeComponents(false);
        ManaBaseFeeComponents memory componentsFeeAsset = rollup.manaBaseFeeComponents(true);
        BlockLog memory parentBlockLog = rollup.getBlock(nextSlot.unwrap() - 1);

        Block memory b = getBlock();

        rollup.propose(
          ProposeArgs({
            header: b.header,
            archive: b.archive,
            blockHash: b.blockHash,
            oracleInput: OracleInput({
              provingCostModifier: point.oracle_input.proving_cost_modifier,
              feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier
            }),
            txHashes: b.txHashes
          }),
          b.signatures,
          b.body
        );

        BlockLog memory blockLog = rollup.getBlock(nextSlot.unwrap());

        // Want to check the fee header to see if they are as we want them.

        assertEq(point.block_header.block_number, nextSlot, "invalid l2 block number");
        assertEq(point.block_header.l1_block_number, block.number, "invalid l1 block number");
        assertEq(point.block_header.slot_number, nextSlot, "invalid l2 slot number");
        assertEq(point.block_header.timestamp, block.timestamp, "invalid timestamp");

        assertEq(point.fee_header, blockLog.feeHeader);

        assertEq(
          point.outputs.fee_asset_price_at_execution, feeAssetPrice, "fee asset price mismatch"
        );
        assertEq(point.outputs.l1_fee_oracle_output.base_fee, fees.baseFee, "base fee mismatch");
        assertEq(point.outputs.l1_fee_oracle_output.blob_fee, fees.blobFee, "blob fee mismatch");

        assertEq(point.outputs.mana_base_fee_components_in_wei, components);
        assertEq(point.outputs.mana_base_fee_components_in_fee_asset, componentsFeeAsset);

        assertEq(point.parent_fee_header, parentBlockLog.feeHeader);

        nextSlot = nextSlot + Slot.wrap(1);
      }
    }
  }

  function assertEq(FeeHeaderModel memory a, FeeHeader memory b) internal pure {
    FeeHeaderModel memory bModel = FeeHeaderModel({
      excess_mana: b.excessMana,
      fee_asset_price_numerator: b.feeAssetPriceNumerator,
      mana_used: b.manaUsed,
      proving_cost_per_mana_numerator: b.provingCostPerManaNumerator
    });
    assertEq(a, bModel);
  }

  function assertEq(ManaBaseFeeComponentsModel memory a, ManaBaseFeeComponents memory b)
    internal
    pure
  {
    ManaBaseFeeComponentsModel memory bModel = ManaBaseFeeComponentsModel({
      congestion_cost: b.congestionCost,
      congestion_multiplier: b.congestionMultiplier,
      data_cost: b.dataCost,
      gas_cost: b.gasCost,
      proving_cost: b.provingCost
    });
    assertEq(a, bModel);
  }
}
