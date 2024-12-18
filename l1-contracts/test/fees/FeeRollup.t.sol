// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../decoders/Base.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {SignatureLib, Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {EpochProofQuoteLib} from "@aztec/core/libraries/RollupLibs/EpochProofQuoteLib.sol";
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
  ManaBaseFeeComponents,
  SubmitEpochRootProofArgs
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
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {
  ProposeArgs, OracleInput, ProposeLib
} from "@aztec/core/libraries/RollupLibs/ProposeLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {FeeMath, MANA_TARGET} from "@aztec/core/libraries/RollupLibs/FeeMath.sol";

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
  uint256 public constant BLOCK_REWARD = 50e18;
  IERC20 public immutable UNDERLYING;

  address public canonicalRollup;

  constructor(IERC20 _asset) {
    UNDERLYING = _asset;
  }

  function setCanonicalRollup(address _rollup) external {
    canonicalRollup = _rollup;
  }

  function claim(address _recipient) external returns (uint256) {
    TestERC20(address(UNDERLYING)).mint(_recipient, BLOCK_REWARD);
    return BLOCK_REWARD;
  }

  function distributeFees(address _recipient, uint256 _amount) external {
    TestERC20(address(UNDERLYING)).mint(_recipient, _amount);
  }
}

contract FeeRollupTest is FeeModelTestPoints, DecoderBase {
  using SlotLib for Slot;
  using EpochLib for Epoch;
  using FeeMath for uint256;
  using FeeMath for ManaBaseFeeComponents;
  // We need to build a block that we can submit. We will be using some values from
  // the empty blocks, but otherwise populate using the fee model test points.

  struct Block {
    bytes32 archive;
    bytes32 blockHash;
    bytes header;
    bytes body;
    bytes blobInputs;
    bytes32[] txHashes;
    Signature[] signatures;
  }

  DecoderBase.Full full = load("empty_block_1");

  uint256 internal constant SLOT_DURATION = 36;
  uint256 internal constant EPOCH_DURATION = 32;

  Rollup internal rollup;

  address internal coinbase = address(bytes20("MONEY MAKER"));
  TestERC20 internal asset;
  FakeCanonical internal fakeCanonical;

  function setUp() public {
    // We deploy a the rollup and sets the time and all to

    vm.warp(l1Metadata[0].timestamp - SLOT_DURATION);
    vm.fee(l1Metadata[0].base_fee);
    vm.blobBaseFee(l1Metadata[0].blob_fee);

    asset = new TestERC20("test", "TEST", address(this));

    fakeCanonical = new FakeCanonical(IERC20(address(asset)));
    asset.transferOwnership(address(fakeCanonical));

    rollup = new Rollup(
      IFeeJuicePortal(address(fakeCanonical)),
      IRewardDistributor(address(fakeCanonical)),
      asset,
      bytes32(0),
      bytes32(0),
      address(this),
      Config({
        rollupVersion: "1",
        aztecSlotDuration: SLOT_DURATION,
        aztecEpochDuration: EPOCH_DURATION,
        targetCommitteeSize: 48,
        aztecEpochProofClaimWindowInL2Slots: 16,
        minimumStake: TestConstants.AZTEC_MINIMUM_STAKE,
        slashingQuorum: TestConstants.AZTEC_SLASHING_QUORUM,
        slashingRoundSize: TestConstants.AZTEC_SLASHING_ROUND_SIZE
      })
    );
    fakeCanonical.setCanonicalRollup(address(rollup));

    vm.label(coinbase, "coinbase");
    vm.label(address(rollup), "ROLLUP");
    vm.label(address(fakeCanonical), "FAKE CANONICAL");
    vm.label(address(asset), "ASSET");
    vm.label(rollup.CUAUHXICALLI(), "CUAUHXICALLI");
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
    bytes32 blockHash = bytes32(Constants.GENESIS_BLOCK_HASH);

    bytes32[] memory txHashes = new bytes32[](0);
    Signature[] memory signatures = new Signature[](0);

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

    assertEq(
      manaBaseFee,
      rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true),
      "mana base fee mismatch"
    );

    uint256 manaSpent = point.block_header.mana_spent;

    // Put coinbase onto the stack
    address cb = coinbase;

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
      mstore(add(headerRef, 0x01d4), cb) // coinbase
      mstore(add(headerRef, 0x01e8), 0) // fee recipient
      mstore(add(headerRef, 0x0208), 0) // fee per da gas
      mstore(add(headerRef, 0x0228), manaBaseFee) // fee per l2 gas
      mstore(add(headerRef, 0x0268), manaSpent) // total mana used
    }

    return Block({
      archive: archiveRoot,
      blockHash: blockHash,
      header: header,
      body: body,
      blobInputs: full.block.blobInputs,
      txHashes: txHashes,
      signatures: signatures
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
            blockHash: b.blockHash,
            oracleInput: OracleInput({
              provingCostModifier: point.oracle_input.proving_cost_modifier,
              feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier
            }),
            txHashes: b.txHashes
          }),
          b.signatures,
          b.body,
          b.blobInputs
        );
        nextSlot = nextSlot + Slot.wrap(1);
      }
    }

    FeeHeader memory parentFeeHeaderNoPrune =
      rollup.getBlock(rollup.getPendingBlockNumber()).feeHeader;
    uint256 excessManaNoPrune = (
      parentFeeHeaderNoPrune.excessMana + parentFeeHeaderNoPrune.manaUsed
    ).clampedAdd(-int256(MANA_TARGET));

    FeeHeader memory parentFeeHeaderPrune = rollup.getBlock(rollup.getProvenBlockNumber()).feeHeader;
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
    rollup.setAssumeProvenThroughBlockNumber(10000);
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
      FeeMath.congestionMultiplier(excessManaPrune),
      "congestion multiplier mismatch for prune"
    );
    assertEq(
      componentsNoPrune.congestionMultiplier,
      FeeMath.congestionMultiplier(excessManaNoPrune),
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
        uint256 feeAssetPrice = rollup.getFeeAssetPrice();

        ManaBaseFeeComponents memory components =
          rollup.getManaBaseFeeComponentsAt(Timestamp.wrap(block.timestamp), false);
        ManaBaseFeeComponents memory componentsFeeAsset =
          rollup.getManaBaseFeeComponentsAt(Timestamp.wrap(block.timestamp), true);
        BlockLog memory parentBlockLog = rollup.getBlock(nextSlot.unwrap() - 1);

        Block memory b = getBlock();

        skipBlobCheck(address(rollup));
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
          b.body,
          b.blobInputs
        );

        BlockLog memory blockLog = rollup.getBlock(nextSlot.unwrap());

        assertEq(
          baseFeePrediction, componentsFeeAsset.summedBaseFee(), "base fee prediction mismatch"
        );

        assertEq(
          componentsFeeAsset.congestionCost,
          blockLog.feeHeader.congestionCost,
          "congestion cost mismatch"
        );
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

        uint256 feeSum = 0;
        uint256 burnSum = 0;
        bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

        for (uint256 feeIndex = 0; feeIndex < epochSize; feeIndex++) {
          TestPoint memory point = points[start + feeIndex - 1];

          // We assume that everyone PERFECTLY pays their fees with 0 priority fees and no
          // overpaying on teardown.
          uint256 baseFee = point.outputs.mana_base_fee_components_in_fee_asset.data_cost
            + point.outputs.mana_base_fee_components_in_fee_asset.gas_cost
            + point.outputs.mana_base_fee_components_in_fee_asset.proving_cost
            + point.outputs.mana_base_fee_components_in_fee_asset.congestion_cost;

          uint256 fee = rollup.getBlock(start + feeIndex).feeHeader.manaUsed * baseFee;
          feeSum += fee;
          burnSum += rollup.getBlock(start + feeIndex).feeHeader.manaUsed
            * point.outputs.mana_base_fee_components_in_fee_asset.congestion_cost;

          fees[feeIndex * 2] = bytes32(uint256(uint160(coinbase)));
          fees[feeIndex * 2 + 1] = bytes32(fee);
        }

        bytes memory aggregationObject = "";
        bytes memory proof = "";

        uint256 cuauhxicalliBalanceBefore = asset.balanceOf(rollup.CUAUHXICALLI());
        uint256 coinbaseBalanceBefore = asset.balanceOf(coinbase);

        bytes32[7] memory args = [
          rollup.getBlock(start).archive,
          rollup.getBlock(start + epochSize - 1).archive,
          rollup.getBlock(start).blockHash,
          rollup.getBlock(start + epochSize - 1).blockHash,
          bytes32(0),
          bytes32(0),
          bytes32(0)
        ];

        bytes memory blobPublicInputs;
        for (uint256 j = 0; j < epochSize; j++) {
          // For each block in the epoch, add its blob public inputs
          // Since we are reusing the same block, they are the same
          blobPublicInputs =
            abi.encodePacked(blobPublicInputs, this.getBlobPublicInputs(full.block.blobInputs));
        }

        rollup.submitEpochRootProof(
          SubmitEpochRootProofArgs({
            epochSize: epochSize,
            args: args,
            fees: fees,
            blobPublicInputs: blobPublicInputs,
            aggregationObject: aggregationObject,
            proof: proof
          })
        );

        uint256 burned = asset.balanceOf(rollup.CUAUHXICALLI()) - cuauhxicalliBalanceBefore;
        assertEq(
          asset.balanceOf(coinbase) - coinbaseBalanceBefore
            - fakeCanonical.BLOCK_REWARD() * epochSize + burned,
          feeSum,
          "Sum of fees does not match"
        );
        assertEq(burnSum, burned, "Sum of burned does not match");
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
