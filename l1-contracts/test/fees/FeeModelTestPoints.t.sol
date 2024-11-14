// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable var-name-mixedcase
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

// Remember that foundry json parsing is alphabetically done, so you MUST
// sort the struct fields alphabetically or prepare for a headache.

struct L1Fees {
  uint256 base_fee;
  uint256 blob_fee;
}

struct Header {
  uint256 excess_mana;
  uint256 fee_asset_price_numerator;
  uint256 mana_used;
  uint256 proving_cast_per_mana_numerator;
}

struct OracleInput {
  int256 fee_asset_price_modifier;
  int256 proving_cost_modifier;
}

struct ManaBaseFeeComponents {
  uint256 congestion_cost;
  uint256 congestion_multiplier;
  uint256 data_cost;
  uint256 gas_cost;
  uint256 proving_cost;
}

struct TestPointOutputs {
  uint256 fee_asset_price_at_execution;
  ManaBaseFeeComponents mana_base_fee_components_in_fee_asset;
  ManaBaseFeeComponents mana_base_fee_components_in_wei;
}

struct TestPoint {
  uint256 l1_block_number;
  L1Fees l1_fees;
  Header header;
  OracleInput oracle_input;
  TestPointOutputs outputs;
  Header parent_header;
}

contract FeeModelTestPoints is Test {
  TestPoint[] public points;

  constructor() {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/fee_data_points.json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    TestPoint[] memory dataPoints = abi.decode(jsonBytes, (TestPoint[]));

    for (uint256 i = 0; i < dataPoints.length; i++) {
      points.push(dataPoints[i]);
    }
  }
}
