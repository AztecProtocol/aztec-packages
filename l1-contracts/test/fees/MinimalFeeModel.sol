// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  FeeMath,
  OracleInput,
  MANA_TARGET,
  L1_GAS_PER_BLOCK_PROPOSED,
  L1_GAS_PER_EPOCH_VERIFIED,
  MINIMUM_CONGESTION_MULTIPLIER
} from "@aztec/core/libraries/RollupLibs/FeeMath.sol";
import {Timestamp, TimeFns, Slot, SlotLib} from "@aztec/core/libraries/TimeMath.sol";
import {Vm} from "forge-std/Vm.sol";
import {
  ManaBaseFeeComponents, L1Fees, L1GasOracleValues, FeeHeader
} from "./FeeModelTestPoints.t.sol";
import {Math} from "@oz/utils/math/Math.sol";

// The data types are slightly messed up here, the reason is that
// we just want to use the same structs from the test points making
// is simpler to compare etc.

contract MinimalFeeModel is TimeFns {
  using FeeMath for OracleInput;
  using FeeMath for uint256;
  using SlotLib for Slot;

  // This is to allow us to use the cheatcodes for blobbasefee as foundry does not play nice
  // with the block.blobbasefee value if using cheatcodes to alter it.
  Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

  uint256 internal constant BLOB_GAS_PER_BLOB = 2 ** 17;
  uint256 internal constant GAS_PER_BLOB_POINT_EVALUATION = 50_000;

  Slot public constant LIFETIME = Slot.wrap(5);
  Slot public constant LAG = Slot.wrap(2);
  Timestamp public immutable GENESIS_TIMESTAMP;

  uint256 public populatedThrough = 0;
  mapping(uint256 slotNumber => FeeHeader feeHeader) public feeHeaders;

  L1GasOracleValues public l1BaseFees;

  constructor(uint256 _slotDuration, uint256 _epochDuration) TimeFns(_slotDuration, _epochDuration) {
    GENESIS_TIMESTAMP = Timestamp.wrap(block.timestamp);
    feeHeaders[0] = FeeHeader({
      excess_mana: 0,
      fee_asset_price_numerator: 0,
      mana_used: 0,
      proving_cost_per_mana_numerator: 0
    });

    l1BaseFees.pre = L1Fees({base_fee: 1 gwei, blob_fee: 1});
    l1BaseFees.post = L1Fees({base_fee: block.basefee, blob_fee: _getBlobBaseFee()});
    l1BaseFees.slot_of_change = LIFETIME.unwrap();
  }

  function getL1GasOracleValues() public view returns (L1GasOracleValues memory) {
    return l1BaseFees;
  }

  // For all of the estimations we have been using `3` blobs.
  function manaBaseFeeComponents(uint256 _blobsUsed, bool _inFeeAsset)
    public
    view
    returns (ManaBaseFeeComponents memory)
  {
    L1Fees memory fees = getCurrentL1Fees();
    uint256 dataCost =
      Math.mulDiv(_blobsUsed * BLOB_GAS_PER_BLOB, fees.blob_fee, MANA_TARGET, Math.Rounding.Ceil);
    uint256 gasUsed = L1_GAS_PER_BLOCK_PROPOSED + _blobsUsed * GAS_PER_BLOB_POINT_EVALUATION
      + L1_GAS_PER_EPOCH_VERIFIED / EPOCH_DURATION;
    uint256 gasCost = Math.mulDiv(gasUsed, fees.base_fee, MANA_TARGET, Math.Rounding.Ceil);
    uint256 provingCost = getProvingCost();

    uint256 congestionMultiplier = FeeMath.congestionMultiplier(calcExcessMana());

    uint256 total = dataCost + gasCost + provingCost;
    uint256 congestionCost = (total * congestionMultiplier / MINIMUM_CONGESTION_MULTIPLIER) - total;

    uint256 feeAssetPrice = _inFeeAsset ? getFeeAssetPrice() : 1e9;

    return ManaBaseFeeComponents({
      data_cost: Math.mulDiv(dataCost, feeAssetPrice, 1e9, Math.Rounding.Ceil),
      gas_cost: Math.mulDiv(gasCost, feeAssetPrice, 1e9, Math.Rounding.Ceil),
      proving_cost: Math.mulDiv(provingCost, feeAssetPrice, 1e9, Math.Rounding.Ceil),
      congestion_cost: Math.mulDiv(congestionCost, feeAssetPrice, 1e9, Math.Rounding.Ceil),
      congestion_multiplier: congestionMultiplier
    });
  }

  function getFeeHeader(uint256 _slotNumber) public view returns (FeeHeader memory) {
    return feeHeaders[_slotNumber];
  }

  function calcExcessMana() internal view returns (uint256) {
    FeeHeader storage parent = feeHeaders[populatedThrough];
    return (parent.excess_mana + parent.mana_used).clampedAdd(-int256(MANA_TARGET));
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
      proving_cost_per_mana_numerator: parent.proving_cost_per_mana_numerator.clampedAdd(
        _oracleInput.provingCostModifier
      ),
      fee_asset_price_numerator: parent.fee_asset_price_numerator.clampedAdd(
        _oracleInput.feeAssetPriceModifier
      ),
      mana_used: _manaUsed,
      excess_mana: excessMana
    });
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
    l1BaseFees.post = L1Fees({base_fee: block.basefee, blob_fee: _getBlobBaseFee()});
    l1BaseFees.slot_of_change = (slot + LAG).unwrap();
  }

  function getFeeAssetPrice() public view returns (uint256) {
    return FeeMath.feeAssetPriceModifier(feeHeaders[populatedThrough].fee_asset_price_numerator);
  }

  function getProvingCost() public view returns (uint256) {
    return FeeMath.provingCostPerMana(feeHeaders[populatedThrough].proving_cost_per_mana_numerator);
  }

  function getCurrentL1Fees() public view returns (L1Fees memory) {
    Slot slot = getCurrentSlot();
    if (slot < Slot.wrap(l1BaseFees.slot_of_change)) {
      return l1BaseFees.pre;
    }
    return l1BaseFees.post;
  }

  function getCurrentSlot() public view returns (Slot) {
    Timestamp currentTime = Timestamp.wrap(block.timestamp);
    return TimeFns.slotFromTimestamp(currentTime - GENESIS_TIMESTAMP);
  }

  function _getBlobBaseFee() internal view returns (uint256) {
    // This should really be `block.blobbasefee` but that does NOT play well with forge and cheatcodes :)
    return VM.getBlobBaseFee();
  }
}
