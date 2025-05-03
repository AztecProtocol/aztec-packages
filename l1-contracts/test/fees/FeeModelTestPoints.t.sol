// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable var-name-mixedcase
pragma solidity >=0.8.27;

import {TestBase} from "../base/Base.sol";
import {OracleInput} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {
  MAX_FEE_ASSET_PRICE_MODIFIER,
  MINIMUM_CONGESTION_MULTIPLIER,
  EthValue
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Math} from "@oz/utils/math/Math.sol";

// Remember that foundry json parsing is alphabetically done, so you MUST
// sort the struct fields alphabetically or prepare for a headache.
// We keep these structs separate from the ones used in the rollup, to avoid issues
// due to this quirk. For example, it might be the cheapest to storage the vars
// in certain order for packing purposes, but this a headache if they must be alphabetical.
struct L1Metadata {
  uint256 base_fee;
  uint256 blob_fee;
  uint256 block_number;
  uint256 timestamp;
}

struct L1FeesModel {
  uint256 base_fee;
  uint256 blob_fee;
}

struct FeeHeaderModel {
  uint256 excess_mana;
  uint256 fee_asset_price_numerator;
  uint256 mana_used;
}

struct OracleInputModel {
  int256 fee_asset_price_modifier;
}

struct L1GasOracleValuesModel {
  L1FeesModel post;
  L1FeesModel pre;
  uint256 slot_of_change;
}

struct ManaBaseFeeComponentsModel {
  uint256 congestion_cost;
  uint256 congestion_multiplier;
  uint256 prover_cost;
  uint256 sequencer_cost;
}

struct BlockHeaderModel {
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
  L1FeesModel l1_fee_oracle_output;
  L1GasOracleValuesModel l1_gas_oracle_values;
  ManaBaseFeeComponentsModel mana_base_fee_components_in_fee_asset;
  ManaBaseFeeComponentsModel mana_base_fee_components_in_wei;
}

struct TestPoint {
  BlockHeaderModel block_header;
  FeeHeaderModel fee_header;
  OracleInputModel oracle_input;
  TestPointOutputs outputs;
  FeeHeaderModel parent_fee_header;
}

struct FullFeeData {
  L1Metadata[] l1_metadata;
  TestPoint[] points;
  uint256 proving_cost;
}

contract FeeModelTestPoints is TestBase {
  L1Metadata[] public l1Metadata;
  TestPoint[] public points;
  EthValue public provingCost;

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

    provingCost = EthValue.wrap(data.proving_cost);
  }

  function assertEq(L1FeesModel memory a, L1FeesModel memory b) internal pure {
    assertEq(a.base_fee, b.base_fee, "base_fee mismatch");
    assertEq(a.blob_fee, b.blob_fee, "blob_fee mismatch");
  }

  function assertEq(L1FeesModel memory a, L1FeesModel memory b, string memory _message)
    internal
    pure
  {
    assertEq(a.base_fee, b.base_fee, string.concat(_message, "base_fee mismatch"));
    assertEq(a.blob_fee, b.blob_fee, string.concat(_message, "blob_fee mismatch"));
  }

  function assertEq(L1GasOracleValuesModel memory a, L1GasOracleValuesModel memory b) internal pure {
    assertEq(a.post, b.post, "post ");
    assertEq(a.pre, b.pre, "pre ");
    assertEq(a.slot_of_change, b.slot_of_change, "slot_of_change mismatch");
  }

  function assertEq(OracleInputModel memory a, OracleInput memory b) internal pure {
    assertEq(
      a.fee_asset_price_modifier, b.feeAssetPriceModifier, "fee_asset_price_modifier mismatch"
    );
  }

  function assertEq(FeeHeaderModel memory a, FeeHeaderModel memory b) internal pure {
    assertEq(a.excess_mana, b.excess_mana, "excess_mana mismatch");
    assertEq(
      a.fee_asset_price_numerator, b.fee_asset_price_numerator, "fee_asset_price_numerator mismatch"
    );
    assertEq(a.mana_used, b.mana_used, "mana_used mismatch");
  }

  function assertEq(
    ManaBaseFeeComponentsModel memory a,
    ManaBaseFeeComponentsModel memory b,
    string memory _message
  ) internal pure {
    assertEq(
      a.congestion_cost, b.congestion_cost, string.concat(_message, " congestion_cost mismatch")
    );
    assertEq(
      a.congestion_multiplier,
      b.congestion_multiplier,
      string.concat(_message, " congestion_multiplier mismatch")
    );
    assertEq(a.prover_cost, b.prover_cost, string.concat(_message, " prover_cost mismatch"));
    assertEq(
      a.sequencer_cost, b.sequencer_cost, string.concat(_message, " sequencer_cost mismatch")
    );
  }
}
