// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {
  FeeModelTestPoints,
  TestPoint,
  ManaBaseFeeComponentsModel,
  L1FeesModel,
  FeeHeaderModel
} from "./FeeModelTestPoints.t.sol";
import {MinimalFeeModel} from "./MinimalFeeModel.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Slot} from "@aztec/core/libraries/TimeLib.sol";
import {
  OracleInput,
  FeeLib,
  MAX_FEE_ASSET_PRICE_MODIFIER,
  MINIMUM_CONGESTION_MULTIPLIER,
  EthValue,
  FeeAssetPerEthE9
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Math} from "@oz/utils/math/Math.sol";

contract MinimalFeeModelTest is FeeModelTestPoints {
  using Math for uint256;

  uint256 internal constant SLOT_DURATION = 36;
  uint256 internal constant EPOCH_DURATION = 32;
  uint256 internal constant PROOF_SUBMISSION_EPOCHS = 1;

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

    model = new MinimalFeeModel(SLOT_DURATION, EPOCH_DURATION, PROOF_SUBMISSION_EPOCHS);
    model.setProvingCost(provingCost);
  }

  function test_computeFeeAssetPerEth() public {
    // For every test point, add the oracle input to the model
    // Then check that we get the same fee asset price as the python model

    for (uint256 i = 0; i < points.length; i++) {
      assertEq(
        FeeAssetPerEthE9.unwrap(model.getFeeAssetPerEth()),
        points[i].outputs.fee_asset_price_at_execution,
        "Computed fee asset price does not match expected value"
      );
      model.addSlot(
        OracleInput({feeAssetPriceModifier: points[i].oracle_input.fee_asset_price_modifier})
      );
    }
  }

  function test_invalidOracleInput() public {
    uint256 feeAssetPriceBoundary = MAX_FEE_ASSET_PRICE_MODIFIER + 1;

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__InvalidFeeAssetPriceModifier.selector));
    model.addSlot(OracleInput({feeAssetPriceModifier: int256(feeAssetPriceBoundary)}));

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__InvalidFeeAssetPriceModifier.selector));
    model.addSlot(OracleInput({feeAssetPriceModifier: -int256(feeAssetPriceBoundary)}));
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
        TestPoint memory expected = points[Slot.unwrap(nextSlot) - 1];
        L1FeesModel memory fees = model.getCurrentL1Fees();

        assertEq(expected.block_header.l1_block_number, block.number, "invalid l1 block number");
        assertEq(
          expected.block_header.block_number, Slot.unwrap(nextSlot), "invalid l2 block number"
        );
        assertEq(expected.block_header.slot_number, Slot.unwrap(nextSlot), "invalid l2 slot number");
        assertEq(expected.outputs.l1_fee_oracle_output.base_fee, fees.base_fee, "baseFee mismatch");
        assertEq(expected.outputs.l1_fee_oracle_output.blob_fee, fees.blob_fee, "blobFee mismatch");
        nextSlot = nextSlot + Slot.wrap(1);
      }
    }
  }

  function test_full() public {
    // Because of the time jump at the deployment, the first l1 block metadata
    // should be at slot 1.
    Slot nextSlot = Slot.wrap(1);

    for (uint256 i = 0; i < l1Metadata.length; i++) {
      _loadL1Metadata(i);
      model.photograph();

      if (model.getCurrentSlot() == nextSlot) {
        uint256 index = Slot.unwrap(nextSlot) - 1;
        TestPoint memory point = points[index];

        // Get a hold of the values that is used for the next block
        L1FeesModel memory fees = model.getCurrentL1Fees();
        uint256 feeAssetPrice = FeeAssetPerEthE9.unwrap(model.getFeeAssetPerEth());
        // We are assuming 3 blobs for all of these computations, as per the model.
        // 3 blobs because that can fit ~360 txs, or 10 tps.
        ManaBaseFeeComponentsModel memory components = model.manaBaseFeeComponents(false);
        ManaBaseFeeComponentsModel memory componentsFeeAsset = model.manaBaseFeeComponents(true);
        FeeHeaderModel memory parentFeeHeader =
          model.getFeeHeader(point.block_header.slot_number - 1);

        model.addSlot(
          OracleInput({feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier}),
          point.block_header.mana_spent
        );

        // The fee header is the state that we are storing, so it is the value written at the block submission.
        FeeHeaderModel memory feeHeader = model.getFeeHeader(point.block_header.slot_number);

        // Ensure that we can reproduce the main parts of our test points.
        // For now, most of the block header is not actually stored in the fee model
        // but just needed to influence the other values and used for L1 state.
        assertEq(point.block_header.block_number, nextSlot, "invalid l2 block number");
        assertEq(point.block_header.l1_block_number, block.number, "invalid l1 block number");
        assertEq(point.block_header.slot_number, nextSlot, "invalid l2 slot number");
        assertEq(point.block_header.timestamp, block.timestamp, "invalid timestamp");

        assertEq(point.fee_header, feeHeader);

        assertEq(
          point.outputs.fee_asset_price_at_execution, feeAssetPrice, "feeAssetPrice mismatch"
        );
        assertEq(point.outputs.l1_fee_oracle_output, fees, "l1 fee oracle output");
        assertEq(point.outputs.l1_gas_oracle_values, model.getL1GasOracleValues());
        assertEq(point.outputs.mana_base_fee_components_in_wei, components, "in_wei");
        assertEq(
          point.outputs.mana_base_fee_components_in_fee_asset, componentsFeeAsset, "in_fee_asset"
        );

        assertEq(point.parent_fee_header, parentFeeHeader);

        nextSlot = nextSlot + Slot.wrap(1);
      }
    }
  }
}
