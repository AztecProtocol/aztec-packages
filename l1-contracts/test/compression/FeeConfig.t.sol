// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {
  EthValue,
  FeeConfig,
  CompressedFeeConfig,
  FeeConfigLib
} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";

contract FeeConfigTest is Test {
  using FeeConfigLib for FeeConfig;
  using FeeConfigLib for CompressedFeeConfig;

  function test_compressAndDecompress(
    uint64 _manaTarget,
    uint128 _congestionUpdateFraction,
    uint64 _provingCostPerMana
  ) public pure {
    FeeConfig memory a = FeeConfig({
      manaTarget: _manaTarget,
      congestionUpdateFraction: _congestionUpdateFraction,
      provingCostPerMana: EthValue.wrap(_provingCostPerMana)
    });
    CompressedFeeConfig b = a.compress();
    FeeConfig memory c = b.decompress();

    assertEq(c.manaTarget, a.manaTarget, "Mana target");
    assertEq(c.congestionUpdateFraction, a.congestionUpdateFraction, "Congestion update fraction");
    assertEq(
      EthValue.unwrap(c.provingCostPerMana),
      EthValue.unwrap(a.provingCostPerMana),
      "Proving cost per mana"
    );

    assertEq(b.getManaTarget(), a.manaTarget, "Mana target");
    assertEq(
      b.getCongestionUpdateFraction(), a.congestionUpdateFraction, "Congestion update fraction"
    );
    assertEq(
      EthValue.unwrap(b.getProvingCostPerMana()),
      EthValue.unwrap(a.provingCostPerMana),
      "Proving cost per mana"
    );
  }
}
