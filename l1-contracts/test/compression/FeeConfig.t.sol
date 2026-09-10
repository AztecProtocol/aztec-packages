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
    uint32 _manaTarget,
    uint128 _congestionUpdateFraction,
    uint64 _provingCostPerMana,
    uint16 _protocolFeeMarginBps
  ) public pure {
    FeeConfig memory a = FeeConfig({
      manaTarget: _manaTarget,
      congestionUpdateFraction: _congestionUpdateFraction,
      provingCostPerMana: EthValue.wrap(_provingCostPerMana),
      protocolFeeMarginBps: _protocolFeeMarginBps
    });
    CompressedFeeConfig b = a.compress();
    FeeConfig memory c = b.decompress();

    assertEq(c.manaTarget, a.manaTarget, "Mana target");
    assertEq(c.congestionUpdateFraction, a.congestionUpdateFraction, "Congestion update fraction");
    assertEq(EthValue.unwrap(c.provingCostPerMana), EthValue.unwrap(a.provingCostPerMana), "Proving cost per mana");
    assertEq(c.protocolFeeMarginBps, a.protocolFeeMarginBps, "Protocol fee margin bps");

    assertEq(b.getManaTarget(), a.manaTarget, "Mana target");
    assertEq(b.getCongestionUpdateFraction(), a.congestionUpdateFraction, "Congestion update fraction");
    assertEq(EthValue.unwrap(b.getProvingCostPerMana()), EthValue.unwrap(a.provingCostPerMana), "Proving cost per mana");
    assertEq(b.getProtocolFeeMarginBps(), a.protocolFeeMarginBps, "Protocol fee margin bps");
  }
}
