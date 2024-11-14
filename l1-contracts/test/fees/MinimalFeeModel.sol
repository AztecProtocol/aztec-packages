// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {FeeMath, OracleInput} from "@aztec/core/libraries/FeeMath.sol";

contract MinimalFeeModel {
  using FeeMath for OracleInput;
  using FeeMath for uint256;

  struct DataPoint {
    uint256 provingCostNumerator;
    uint256 feeAssetPriceNumerator;
  }

  uint256 public populatedThrough = 0;
  mapping(uint256 _slotNumber => DataPoint _dataPoint) public dataPoints;

  constructor() {
    dataPoints[0] = DataPoint({provingCostNumerator: 0, feeAssetPriceNumerator: 0});
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

  function getFeeAssetPrice(uint256 _slotNumber) public view returns (uint256) {
    return FeeMath.feeAssetPriceModifier(dataPoints[_slotNumber].feeAssetPriceNumerator);
  }

  function getProvingCost(uint256 _slotNumber) public view returns (uint256) {
    return FeeMath.provingCostPerMana(dataPoints[_slotNumber].provingCostNumerator);
  }
}
