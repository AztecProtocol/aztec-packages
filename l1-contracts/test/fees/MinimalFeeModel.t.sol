// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {OracleInput, FeeMath} from "@aztec/core/libraries/FeeMath.sol";
import {FeeModelTestPoints, TestPoint} from "./FeeModelTestPoints.t.sol";
import {MinimalFeeModel, BaseFees, L1BaseFees} from "./MinimalFeeModel.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, SlotLib, Slot} from "@aztec/core/libraries/TimeMath.sol";

contract MinimalFeeModelTest is FeeModelTestPoints {
  using SlotLib for Slot;

  uint256 internal constant SLOT_DURATION = 36;
  uint256 internal constant EPOCH_DURATION = 32;

  MinimalFeeModel internal model;

  function _loadL1Metadata(uint256 index) internal {
    vm.roll(l1Metadata[index].block_number);
    vm.warp(l1Metadata[index].timestamp);
    vm.fee(l1Metadata[index].base_fee);
    vm.blobBaseFee(l1Metadata[index].blob_fee);
  }

  function setUp() public {
    // We modify the time such that slot 0 is SLOT_DURATION before
    // our first l1 block and set the fees to match our first l1 block
    // such that it matches with the initial values of our python code.
    vm.warp(l1Metadata[0].timestamp - SLOT_DURATION);
    vm.fee(l1Metadata[0].base_fee);
    vm.blobBaseFee(l1Metadata[0].blob_fee);

    model = new MinimalFeeModel(SLOT_DURATION, EPOCH_DURATION);
  }

  function test_computeProvingCost() public {
    // For every test point, add the oracle input to the model
    // Then check that we get the same proving costs as the python model

    for (uint256 i = 0; i < points.length; i++) {
      model.addSlot(
        OracleInput({
          provingCostModifier: points[i].oracle_input.proving_cost_modifier,
          feeAssetPriceModifier: points[i].oracle_input.fee_asset_price_modifier
        })
      );
      assertEq(
        model.getProvingCost(i),
        points[i].outputs.mana_base_fee_components_in_wei.proving_cost,
        "Computed proving cost does not match expected value"
      );
    }
  }

  function test_computeFeeAssetPrice() public {
    // For every test point, add the oracle input to the model
    // Then check that we get the same fee asset price as the python model

    for (uint256 i = 0; i < points.length; i++) {
      model.addSlot(
        OracleInput({
          provingCostModifier: points[i].oracle_input.proving_cost_modifier,
          feeAssetPriceModifier: points[i].oracle_input.fee_asset_price_modifier
        })
      );
      assertEq(
        model.getFeeAssetPrice(i),
        points[i].outputs.fee_asset_price_at_execution,
        "Computed fee asset price does not match expected value"
      );
    }
  }

  function test_invalidOracleInput() public {
    uint256 provingBoundary = FeeMath.MAX_PROVING_COST_MODIFIER + 1;
    uint256 feeAssetPriceBoundary = FeeMath.MAX_FEE_ASSET_PRICE_MODIFIER + 1;

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeMath__InvalidProvingCostModifier.selector));
    model.addSlot(
      OracleInput({provingCostModifier: int256(provingBoundary), feeAssetPriceModifier: 0})
    );

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeMath__InvalidProvingCostModifier.selector));
    model.addSlot(
      OracleInput({provingCostModifier: -int256(provingBoundary), feeAssetPriceModifier: 0})
    );

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeMath__InvalidFeeAssetPriceModifier.selector));
    model.addSlot(
      OracleInput({provingCostModifier: 0, feeAssetPriceModifier: int256(feeAssetPriceBoundary)})
    );

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeMath__InvalidFeeAssetPriceModifier.selector));
    model.addSlot(
      OracleInput({provingCostModifier: 0, feeAssetPriceModifier: -int256(feeAssetPriceBoundary)})
    );
  }

  function test_photograph() public {
    // Because of the time jump at the deployment, the first l1 block metadata
    // should be at slot 1.
    Slot nextSlot = Slot.wrap(1);

    // Loop over all of our l1 blocks and test points
    // For every l1 block, we modify the l1 state and try to take a photograph
    // For every l2 block, we try checking the current fee, and make sure that it
    // matches what we have generated in python.
    for (uint256 i = 0; i < l1Metadata.length; i++) {
      _loadL1Metadata(i);
      model.photograph();

      if (model.getCurrentSlot() == nextSlot) {
        TestPoint memory expected = points[nextSlot.unwrap() - 1];
        BaseFees memory fees = model.getCurrentFee();

        assertEq(expected.l1_block_number, block.number, "invalid l1 block number");
        assertEq(expected.l2_block_number, nextSlot.unwrap(), "invalid l2 block number");
        assertEq(expected.l2_slot_number, nextSlot.unwrap(), "invalid l2 slot number");
        assertEq(expected.outputs.l1_fee_oracle_output.base_fee, fees.baseFee, "baseFee mismatch");
        assertEq(expected.outputs.l1_fee_oracle_output.blob_fee, fees.blobFee, "blobFee mismatch");
        nextSlot = nextSlot + Slot.wrap(1);
      }
    }
  }
}
