// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  FeeMath,
  OracleInput,
  MANA_TARGET,
  L1_GAS_PER_BLOCK_PROPOSED,
  L1_GAS_PER_EPOCH_VERIFIED,
  MINIMUM_CONGESTION_MULTIPLIER,
  EthValue,
  FeeAssetValue,
  FeeAssetPerEthE9,
  PriceLib,
  FeeHeader,
  L1FeeData,
  ManaBaseFeeComponents
} from "@aztec/core/libraries/RollupLibs/FeeMath.sol";
import {Vm} from "forge-std/Vm.sol";
import {
  ManaBaseFeeComponentsModel,
  L1FeesModel,
  L1GasOracleValuesModel,
  FeeHeaderModel
} from "./FeeModelTestPoints.t.sol";
import {Math} from "@oz/utils/math/Math.sol";

import {Timestamp, TimeLib, Slot, SlotLib} from "@aztec/core/libraries/TimeLib.sol";

// The data types are slightly messed up here, the reason is that
// we just want to use the same structs from the test points making
// is simpler to compare etc.
contract MinimalFeeModel {
  using FeeMath for OracleInput;
  using FeeMath for uint256;
  using PriceLib for EthValue;
  using SlotLib for Slot;
  using TimeLib for Timestamp;

  // This is to allow us to use the cheatcodes for blobbasefee as foundry does not play nice
  // with the block.blobbasefee value if using cheatcodes to alter it.
  Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

  uint256 internal constant BLOB_GAS_PER_BLOB = 2 ** 17;
  uint256 internal constant GAS_PER_BLOB_POINT_EVALUATION = 50_000;

  Slot public constant LIFETIME = Slot.wrap(5);
  Slot public constant LAG = Slot.wrap(2);

  uint256 public populatedThrough = 0;
  mapping(uint256 slotNumber => FeeHeader feeHeader) public feeHeaders;

  L1GasOracleValuesModel public l1BaseFees;

  EthValue public provingCost = EthValue.wrap(100);

  constructor(uint256 _slotDuration, uint256 _epochDuration) {
    feeHeaders[0] = FeeHeader(0, 0, 0, 0);

    l1BaseFees.pre = L1FeesModel({base_fee: 1 gwei, blob_fee: 1});
    l1BaseFees.post = L1FeesModel({base_fee: block.basefee, blob_fee: _getBlobBaseFee()});
    l1BaseFees.slot_of_change = LIFETIME.unwrap();

    TimeLib.initialize(block.timestamp, _slotDuration, _epochDuration);
  }

  function getL1GasOracleValues() public view returns (L1GasOracleValuesModel memory) {
    return l1BaseFees;
  }

  // For all of the estimations we have been using `3` blobs.
  function manaBaseFeeComponents(bool _inFeeAsset)
    public
    view
    returns (ManaBaseFeeComponentsModel memory)
  {
    L1FeesModel memory fees = getCurrentL1Fees();
    FeeAssetPerEthE9 feeAssetPrice = _inFeeAsset ? getFeeAssetPerEth() : FeeAssetPerEthE9.wrap(1e9);

    ManaBaseFeeComponents memory components = FeeMath.getManaBaseFeeComponentsAt(
      feeHeaders[populatedThrough],
      L1FeeData({baseFee: fees.base_fee, blobFee: fees.blob_fee}),
      provingCost,
      feeAssetPrice,
      TimeLib.getStorage().epochDuration
    );

    return ManaBaseFeeComponentsModel({
      data_cost: components.dataCost,
      gas_cost: components.gasCost,
      proving_cost: components.provingCost,
      congestion_cost: components.congestionCost,
      congestion_multiplier: components.congestionMultiplier
    });
  }

  function getFeeHeader(uint256 _slotNumber) public view returns (FeeHeaderModel memory) {
    FeeHeader memory feeHeader = feeHeaders[_slotNumber];
    return FeeHeaderModel({
      fee_asset_price_numerator: feeHeader.feeAssetPriceNumerator,
      excess_mana: feeHeader.excessMana,
      mana_used: feeHeader.manaUsed
    });
  }

  function calcExcessMana() internal view returns (uint256) {
    FeeHeader storage parent = feeHeaders[populatedThrough];
    return (parent.excessMana + parent.manaUsed).clampedAdd(-int256(MANA_TARGET));
  }

  function addSlot(OracleInput memory _oracleInput) public {
    addSlot(_oracleInput, 0);
  }

  // The `_manaUsed` is all the data we needed to know to calculate the excess mana.
  function addSlot(OracleInput memory _oracleInput, uint256 _manaUsed) public {
    _oracleInput.assertValid();

    FeeHeader memory parent = feeHeaders[populatedThrough];

    uint256 excessMana = calcExcessMana();

    feeHeaders[++populatedThrough] = FeeHeader({
      feeAssetPriceNumerator: parent.feeAssetPriceNumerator.clampedAdd(
        _oracleInput.feeAssetPriceModifier
      ),
      manaUsed: _manaUsed,
      excessMana: excessMana,
      congestionCost: 0
    });
  }

  function setProvingCost(EthValue _provingCost) public {
    provingCost = _provingCost;
  }

  /**
   * @notice  Take a snapshot of the l1 fees
   * @dev     Can only be called AFTER the scheduled change has passed.
   *          This is to ensure that the block proposers have time to react and it will not change
   *          under their feet, while also ensuring that the "queued" will not be waiting indefinitely.
   */
  function photograph() public {
    Slot slot = getCurrentSlot();
    // The slot where we find a new queued value acceptable
    Slot acceptableSlot = Slot.wrap(l1BaseFees.slot_of_change) + (LIFETIME - LAG);

    if (slot < acceptableSlot) {
      return;
    }

    // If we are at or beyond the scheduled change, we need to update the "current" value
    l1BaseFees.pre = l1BaseFees.post;
    l1BaseFees.post = L1FeesModel({base_fee: block.basefee, blob_fee: _getBlobBaseFee()});
    l1BaseFees.slot_of_change = (slot + LAG).unwrap();
  }

  function getFeeAssetPerEth() public view returns (FeeAssetPerEthE9) {
    return FeeMath.getFeeAssetPerEth(feeHeaders[populatedThrough].feeAssetPriceNumerator);
  }

  function getCurrentL1Fees() public view returns (L1FeesModel memory) {
    Slot slot = getCurrentSlot();
    if (slot < Slot.wrap(l1BaseFees.slot_of_change)) {
      return l1BaseFees.pre;
    }
    return l1BaseFees.post;
  }

  function getCurrentSlot() public view returns (Slot) {
    return Timestamp.wrap(block.timestamp).slotFromTimestamp();
  }

  function _getBlobBaseFee() internal view returns (uint256) {
    // This should really be `block.blobbasefee` but that does NOT play well with forge and cheatcodes :)
    return VM.getBlobBaseFee();
  }
}
