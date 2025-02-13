// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable var-name-mixedcase
pragma solidity >=0.8.27;

import {TestBase} from "../base/Base.sol";
import {OracleInput as FeeMathOracleInput} from "@aztec/core/libraries/RollupLibs/FeeMath.sol";

// Remember that foundry json parsing is alphabetically done, so you MUST
// sort the struct fields alphabetically or prepare for a headache.

struct L1Metadata {
  uint256 base_fee;
  uint256 blob_fee;
  uint256 block_number;
  uint256 timestamp;
}

struct L1Fees {
  uint256 base_fee;
  uint256 blob_fee;
}

struct FeeHeader {
  uint256 excess_mana;
  uint256 fee_asset_price_numerator;
  uint256 mana_used;
  uint256 proving_cost_per_mana_numerator;
}

struct OracleInput {
  int256 fee_asset_price_modifier;
  int256 proving_cost_modifier;
}

struct L1GasOracleValues {
  L1Fees post;
  L1Fees pre;
  uint256 slot_of_change;
}

struct ManaBaseFeeComponents {
  uint256 congestion_cost;
  uint256 congestion_multiplier;
  uint256 data_cost;
  uint256 gas_cost;
  uint256 proving_cost;
}

struct BlockHeader {
  uint256 blobs_needed;
  uint256 block_number;
  uint256 l1_block_number;
  uint256 mana_spent;
  uint256 size_in_fields;
  uint256 slot_number;
  uint256 timestamp;
}

struct TestPointOutputs {
  uint256 fee_asset_price_at_execution;
  L1Fees l1_fee_oracle_output;
  L1GasOracleValues l1_gas_oracle_values;
  ManaBaseFeeComponents mana_base_fee_components_in_fee_asset;
  ManaBaseFeeComponents mana_base_fee_components_in_wei;
}

struct TestPoint {
  BlockHeader block_header;
  FeeHeader fee_header;
  OracleInput oracle_input;
  TestPointOutputs outputs;
  FeeHeader parent_fee_header;
}

struct FullFeeData {
  L1Metadata[] l1_metadata;
  TestPoint[] points;
}

contract FeeModelTestPoints is TestBase {
  L1Metadata[] public l1Metadata;
  TestPoint[] public points;

  constructor() {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/fee_data_points.json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    FullFeeData memory data = abi.decode(jsonBytes, (FullFeeData));

    for (uint256 i = 0; i < data.l1_metadata.length; i++) {
      l1Metadata.push(data.l1_metadata[i]);
    }

    for (uint256 i = 0; i < data.points.length; i++) {
      points.push(data.points[i]);
    }
  }

  function assertEq(L1Fees memory a, L1Fees memory b) internal pure {
    assertEq(a.base_fee, b.base_fee, "base_fee mismatch");
    assertEq(a.blob_fee, b.blob_fee, "blob_fee mismatch");
  }

  function assertEq(L1Fees memory a, L1Fees memory b, string memory _message) internal pure {
    assertEq(a.base_fee, b.base_fee, string.concat(_message, "base_fee mismatch"));
    assertEq(a.blob_fee, b.blob_fee, string.concat(_message, "blob_fee mismatch"));
  }

  function assertEq(L1GasOracleValues memory a, L1GasOracleValues memory b) internal pure {
    assertEq(a.post, b.post, "post ");
    assertEq(a.pre, b.pre, "pre ");
    assertEq(a.slot_of_change, b.slot_of_change, "slot_of_change mismatch");
  }

  function assertEq(OracleInput memory a, FeeMathOracleInput memory b) internal pure {
    assertEq(
      a.fee_asset_price_modifier, b.feeAssetPriceModifier, "fee_asset_price_modifier mismatch"
    );
    assertEq(a.proving_cost_modifier, b.provingCostModifier, "proving_cost_modifier mismatch");
  }

  function assertEq(FeeHeader memory a, FeeHeader memory b) internal pure {
    assertEq(a.excess_mana, b.excess_mana, "excess_mana mismatch");
    assertEq(
      a.fee_asset_price_numerator, b.fee_asset_price_numerator, "fee_asset_price_numerator mismatch"
    );
    assertEq(a.mana_used, b.mana_used, "mana_used mismatch");
    assertEq(
      a.proving_cost_per_mana_numerator,
      b.proving_cost_per_mana_numerator,
      "proving_cost_per_mana_numerator mismatch"
    );
  }

  function assertEq(ManaBaseFeeComponents memory a, ManaBaseFeeComponents memory b) internal pure {
    assertEq(a.congestion_cost, b.congestion_cost, "congestion_cost mismatch");
    assertEq(a.congestion_multiplier, b.congestion_multiplier, "congestion_multiplier mismatch");
    assertEq(a.data_cost, b.data_cost, "data_cost mismatch");
    assertEq(a.gas_cost, b.gas_cost, "gas_cost mismatch");
    assertEq(a.proving_cost, b.proving_cost, "proving_cost mismatch");
  }
}
