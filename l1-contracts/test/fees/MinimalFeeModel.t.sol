// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {OracleInput, FeeMath} from "@aztec/core/libraries/FeeMath.sol";
import {FeeModelTestPoints} from "./FeeModelTestPoints.t.sol";
import {MinimalFeeModel} from "./MinimalFeeModel.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract MinimalFeeModelTest is FeeModelTestPoints {
  MinimalFeeModel internal feeContract;

  function setUp() public {
    feeContract = new MinimalFeeModel();

    for (uint256 i = 0; i < points.length; i++) {
      feeContract.addSlot(
        OracleInput({
          provingCostModifier: points[i].oracle_input.proving_cost_modifier,
          feeAssetPriceModifier: points[i].oracle_input.fee_asset_price_modifier
        })
      );
    }
  }

  function test_computeProvingCost() public {
    for (uint256 i = 0; i < points.length; i++) {
      assertEq(
        feeContract.getProvingCost(i),
        points[i].outputs.mana_base_fee_components_in_wei.proving_cost,
        "Computed proving cost does not match expected value"
      );
    }
  }

  function test_computeFeeAssetPrice() public {
    for (uint256 i = 0; i < points.length; i++) {
      assertEq(
        feeContract.getFeeAssetPrice(i),
        points[i].outputs.fee_asset_price_at_execution,
        "Computed fee asset price does not match expected value"
      );
    }
  }

  function test_invalidOracleInput() public {
    uint256 provingBoundary = FeeMath.MAX_PROVING_COST_MODIFIER + 1;
    uint256 feeAssetPriceBoundary = FeeMath.MAX_FEE_ASSET_PRICE_MODIFIER + 1;

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeMath__InvalidProvingCostModifier.selector));
    feeContract.addSlot(
      OracleInput({provingCostModifier: int256(provingBoundary), feeAssetPriceModifier: 0})
    );

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeMath__InvalidProvingCostModifier.selector));
    feeContract.addSlot(
      OracleInput({provingCostModifier: -int256(provingBoundary), feeAssetPriceModifier: 0})
    );

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeMath__InvalidFeeAssetPriceModifier.selector));
    feeContract.addSlot(
      OracleInput({provingCostModifier: 0, feeAssetPriceModifier: int256(feeAssetPriceBoundary)})
    );

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeMath__InvalidFeeAssetPriceModifier.selector));
    feeContract.addSlot(
      OracleInput({provingCostModifier: 0, feeAssetPriceModifier: -int256(feeAssetPriceBoundary)})
    );
  }
}
