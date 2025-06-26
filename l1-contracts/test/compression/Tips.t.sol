// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {
  ChainTips,
  CompressedChainTips,
  ChainTipsLib
} from "@aztec/core/libraries/compressed-data/Tips.sol";

contract TipsTest is Test {
  using ChainTipsLib for CompressedChainTips;
  using ChainTipsLib for ChainTips;

  function test_compress_uncompress(uint128 _pendingBlockNumber, uint128 _provenBlockNumber)
    public
    pure
  {
    ChainTips memory chainTips =
      ChainTips({pendingBlockNumber: _pendingBlockNumber, provenBlockNumber: _provenBlockNumber});

    CompressedChainTips compressedChainTips = chainTips.compress();
    ChainTips memory decompressedChainTips = compressedChainTips.decompress();

    assertEq(
      compressedChainTips.getPendingBlockNumber(),
      chainTips.pendingBlockNumber,
      "getPendingBlockNumber"
    );
    assertEq(
      compressedChainTips.getProvenBlockNumber(),
      chainTips.provenBlockNumber,
      "getProvenBlockNumber"
    );

    assertEq(
      decompressedChainTips.pendingBlockNumber,
      chainTips.pendingBlockNumber,
      "decompressed pendingBlockNumber"
    );
    assertEq(
      decompressedChainTips.provenBlockNumber,
      chainTips.provenBlockNumber,
      "decompressed provenBlockNumber"
    );
  }

  function test_updatePendingBlockNumber(uint128 _pendingBlockNumber, uint128 _provenBlockNumber)
    public
    pure
  {
    uint256 pendingBlockNumber = bound(_pendingBlockNumber, 0, type(uint128).max - 1);
    ChainTips memory a =
      ChainTips({pendingBlockNumber: pendingBlockNumber, provenBlockNumber: _provenBlockNumber});

    CompressedChainTips b = a.compress();
    CompressedChainTips c = b.updatePendingBlockNumber(pendingBlockNumber + 1);

    assertEq(c.getPendingBlockNumber(), pendingBlockNumber + 1, "c.getPendingBlockNumber");
    assertEq(c.getProvenBlockNumber(), _provenBlockNumber, "c.getProvenBlockNumber");
    assertEq(
      c.getPendingBlockNumber(),
      b.getPendingBlockNumber() + 1,
      "c.getPendingBlockNumber != b.getPendingBlockNumber + 1"
    );
  }

  function test_updateProvenBlockNumber(uint128 _pendingBlockNumber, uint128 _provenBlockNumber)
    public
    pure
  {
    uint256 provenBlockNumber = bound(_provenBlockNumber, 0, type(uint128).max - 1);
    ChainTips memory a =
      ChainTips({pendingBlockNumber: _pendingBlockNumber, provenBlockNumber: provenBlockNumber});

    CompressedChainTips b = a.compress();
    CompressedChainTips c = b.updateProvenBlockNumber(provenBlockNumber + 1);

    assertEq(c.getPendingBlockNumber(), _pendingBlockNumber, "c.getPendingBlockNumber");
    assertEq(c.getProvenBlockNumber(), provenBlockNumber + 1, "c.getProvenBlockNumber");
    assertEq(
      c.getProvenBlockNumber(),
      b.getProvenBlockNumber() + 1,
      "c.getProvenBlockNumber != b.getProvenBlockNumber + 1"
    );
  }
}
