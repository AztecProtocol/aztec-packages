// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {FeeHeader, CompressedFeeHeader, FeeHeaderLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";

contract FeeStructsTest is Test {
  using FeeHeaderLib for FeeHeader;
  using FeeHeaderLib for CompressedFeeHeader;

  function test_compressAndDecompress(
    uint64 _proverCost,
    uint64 _congestionCost,
    uint48 _ethPerFeeAsset,
    uint48 _excessMana,
    uint32 _manaUsed
  ) public pure {
    FeeHeader memory feeHeader = FeeHeader({
      excessMana: _excessMana,
      manaUsed: _manaUsed,
      ethPerFeeAsset: _ethPerFeeAsset,
      congestionCost: _congestionCost,
      proverCost: bound(_proverCost, 0, 2 ** 63 - 1)
    });

    CompressedFeeHeader compressedFeeHeader = feeHeader.compress();

    FeeHeader memory decompressedFeeHeader = compressedFeeHeader.decompress();

    // Check the getters
    assertEq(compressedFeeHeader.getManaUsed(), feeHeader.manaUsed, "Getter Mana used");
    assertEq(compressedFeeHeader.getExcessMana(), feeHeader.excessMana, "Getter Excess mana");
    assertEq(compressedFeeHeader.getEthPerFeeAsset(), feeHeader.ethPerFeeAsset, "Getter Eth per fee asset");
    assertEq(compressedFeeHeader.getCongestionCost(), feeHeader.congestionCost, "Getter Congestion cost");
    assertEq(compressedFeeHeader.getProverCost(), feeHeader.proverCost, "Getter Prover cost");

    // Check the decompressed value
    assertEq(decompressedFeeHeader.manaUsed, feeHeader.manaUsed, "Decompressed Mana used");
    assertEq(decompressedFeeHeader.excessMana, feeHeader.excessMana, "Decompressed Excess mana");
    assertEq(decompressedFeeHeader.ethPerFeeAsset, feeHeader.ethPerFeeAsset, "Decompressed Eth per fee asset");
    assertEq(decompressedFeeHeader.congestionCost, feeHeader.congestionCost, "Decompressed Congestion cost");
    assertEq(decompressedFeeHeader.proverCost, feeHeader.proverCost, "Decompressed Prover cost");
  }
}
