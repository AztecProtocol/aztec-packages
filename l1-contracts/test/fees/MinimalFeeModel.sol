// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  FeeLib,
  FeeHeaderLib,
  OracleInput,
  L1_GAS_PER_BLOCK_PROPOSED,
  L1_GAS_PER_EPOCH_VERIFIED,
  EthValue,
  FeeAssetValue,
  FeeAssetPerEthE9,
  PriceLib,
  FeeHeader,
  L1FeeData,
  ManaBaseFeeComponents,
  L1GasOracleValues,
  CompressedFeeHeader
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Vm} from "forge-std/Vm.sol";
import {
  ManaBaseFeeComponentsModel,
  L1FeesModel,
  L1GasOracleValuesModel,
  FeeHeaderModel
} from "./FeeModelTestPoints.t.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Timestamp, TimeLib, Slot} from "@aztec/core/libraries/TimeLib.sol";

// The data types are slightly messed up here, the reason is that
// we just want to use the same structs from the test points making
// is simpler to compare etc.
contract MinimalFeeModel {
  using FeeLib for OracleInput;
  using FeeLib for uint256;
  using PriceLib for EthValue;
  using TimeLib for Timestamp;
  using FeeHeaderLib for CompressedFeeHeader;
  using CompressedTimeMath for CompressedSlot;
  using CompressedTimeMath for Slot;

  // This is to allow us to use the cheatcodes for blobbasefee as foundry does not play nice
  // with the block.blobbasefee value if using cheatcodes to alter it.
  Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

  uint256 internal constant BLOB_GAS_PER_BLOB = 2 ** 17;
  uint256 internal constant GAS_PER_BLOB_POINT_EVALUATION = 50_000;

  uint256 internal constant MANA_TARGET = 100000000;

  Slot public constant LIFETIME = Slot.wrap(5);
  Slot public constant LAG = Slot.wrap(2);

  uint256 public populatedThrough = 0;

  constructor(uint256 _slotDuration, uint256 _epochDuration, uint256 _proofSubmissionEpochs) {
    TimeLib.initialize(block.timestamp, _slotDuration, _epochDuration, _proofSubmissionEpochs);
    FeeLib.initialize(MANA_TARGET, EthValue.wrap(100));
  }

  function getL1GasOracleValues() public view returns (L1GasOracleValuesModel memory) {
    L1GasOracleValues memory values = FeeLib.getStorage().l1GasOracleValues;
    return L1GasOracleValuesModel({
      pre: L1FeesModel({base_fee: values.pre.baseFee, blob_fee: values.pre.blobFee}),
      post: L1FeesModel({base_fee: values.post.baseFee, blob_fee: values.post.blobFee}),
      slot_of_change: Slot.unwrap(values.slotOfChange.decompress())
    });
  }

  // For all of the estimations we have been using `3` blobs.
  function manaBaseFeeComponents(bool _inFeeAsset)
    public
    view
    returns (ManaBaseFeeComponentsModel memory)
  {
    ManaBaseFeeComponents memory components = FeeLib.getManaBaseFeeComponentsAt(
      populatedThrough, Timestamp.wrap(block.timestamp), _inFeeAsset
    );

    return ManaBaseFeeComponentsModel({
      congestion_cost: components.congestionCost,
      congestion_multiplier: components.congestionMultiplier,
      prover_cost: components.proverCost,
      sequencer_cost: components.sequencerCost
    });
  }

  function getFeeHeader(uint256 _slotNumber) public view returns (FeeHeaderModel memory) {
    FeeHeader memory feeHeader = FeeLib.getFeeHeader(_slotNumber).decompress();
    return FeeHeaderModel({
      fee_asset_price_numerator: feeHeader.feeAssetPriceNumerator,
      excess_mana: feeHeader.excessMana,
      mana_used: feeHeader.manaUsed
    });
  }

  function addSlot(OracleInput memory _oracleInput) public {
    addSlot(_oracleInput, 0);
  }

  // The `_manaUsed` is all the data we needed to know to calculate the excess mana.
  function addSlot(OracleInput memory _oracleInput, uint256 _manaUsed) public {
    FeeLib.writeFeeHeader(++populatedThrough, _oracleInput.feeAssetPriceModifier, _manaUsed, 0, 0);
  }

  function setProvingCost(EthValue _provingCost) public {
    FeeLib.updateProvingCostPerMana(_provingCost);
  }

  /**
   * @notice  Take a snapshot of the l1 fees
   * @dev     Can only be called AFTER the scheduled change has passed.
   *          This is to ensure that the block proposers have time to react and it will not change
   *          under their feet, while also ensuring that the "queued" will not be waiting indefinitely.
   */
  function photograph() public {
    FeeLib.updateL1GasFeeOracle();
  }

  function getFeeAssetPerEth() public view returns (FeeAssetPerEthE9) {
    return FeeLib.getFeeAssetPerEthAtBlock(populatedThrough);
  }

  function getCurrentL1Fees() public view returns (L1FeesModel memory) {
    L1FeeData memory fees = FeeLib.getL1FeesAt(Timestamp.wrap(block.timestamp));
    return L1FeesModel({base_fee: fees.baseFee, blob_fee: fees.blobFee});
  }

  function getCurrentSlot() public view returns (Slot) {
    return Timestamp.wrap(block.timestamp).slotFromTimestamp();
  }

  function _getBlobBaseFee() internal view returns (uint256) {
    // This should really be `block.blobbasefee` but that does NOT play well with forge and cheatcodes :)
    return VM.getBlobBaseFee();
  }
}
