// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {FeeMath, OracleInput} from "@aztec/core/libraries/FeeMath.sol";
import {Timestamp, TimeFns, Slot} from "@aztec/core/libraries/TimeMath.sol";
import {Vm} from "forge-std/Vm.sol";

struct BaseFees {
  uint256 baseFee;
  uint256 blobFee;
}

// This actually behaves pretty close to the slow updates.
struct L1BaseFees {
  BaseFees pre;
  BaseFees post;
  Slot slotOfChange;
}

struct DataPoint {
  uint256 provingCostNumerator;
  uint256 feeAssetPriceNumerator;
}

contract MinimalFeeModel is TimeFns {
  using FeeMath for OracleInput;
  using FeeMath for uint256;

  // This is to allow us to use the cheatcodes for blobbasefee as foundry does not play nice
  // with the block.blobbasefee value if using cheatcodes to alter it.
  Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

  // The L1 base fees are "fixed" for a period of 5 slots.
  // and is lagging 5 slots behind the current slot.
  Slot public constant LIFETIME = Slot.wrap(5);
  Slot public constant LAG = Slot.wrap(2);
  Timestamp public immutable GENESIS_TIMESTAMP;

  uint256 public populatedThrough = 0;
  mapping(uint256 _slotNumber => DataPoint _dataPoint) public dataPoints;

  L1BaseFees public l1BaseFees;

  constructor(uint256 _slotDuration, uint256 _epochDuration) TimeFns(_slotDuration, _epochDuration) {
    GENESIS_TIMESTAMP = Timestamp.wrap(block.timestamp);
    dataPoints[0] = DataPoint({provingCostNumerator: 0, feeAssetPriceNumerator: 0});

    l1BaseFees.pre = BaseFees({baseFee: 1 gwei, blobFee: 1});
    l1BaseFees.post = BaseFees({baseFee: block.basefee, blobFee: _getBlobBaseFee()});
    l1BaseFees.slotOfChange = LIFETIME;
  }

  // See the `add_slot` function in the `fee-model.ipynb` notebook for more context.
  function addSlot(OracleInput memory _oracleInput) public {
    _oracleInput.assertValid();

    DataPoint memory parent = dataPoints[populatedThrough];

    dataPoints[++populatedThrough] = DataPoint({
      provingCostNumerator: parent.provingCostNumerator.clampedAdd(_oracleInput.provingCostModifier),
      feeAssetPriceNumerator: parent.feeAssetPriceNumerator.clampedAdd(
        _oracleInput.feeAssetPriceModifier
      )
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
    Slot acceptableSlot = l1BaseFees.slotOfChange + (LIFETIME - LAG);

    if (slot < acceptableSlot) {
      return;
    }

    // If we are at or beyond the scheduled change, we need to update the "current" value
    l1BaseFees.pre = l1BaseFees.post;
    l1BaseFees.post = BaseFees({baseFee: block.basefee, blobFee: _getBlobBaseFee()});
    l1BaseFees.slotOfChange = slot + LAG;
  }

  function getFeeAssetPrice(uint256 _slotNumber) public view returns (uint256) {
    return FeeMath.feeAssetPriceModifier(dataPoints[_slotNumber].feeAssetPriceNumerator);
  }

  function getProvingCost(uint256 _slotNumber) public view returns (uint256) {
    return FeeMath.provingCostPerMana(dataPoints[_slotNumber].provingCostNumerator);
  }

  function getCurrentL1Fees() public view returns (BaseFees memory) {
    Slot slot = getCurrentSlot();
    if (slot < l1BaseFees.slotOfChange) {
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
