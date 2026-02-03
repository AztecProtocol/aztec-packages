// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {ChainTips, CompressedChainTips, ChainTipsLib} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

contract TipsWrapper {
  using ChainTipsLib for CompressedChainTips;

  function updatePending(CompressedChainTips _compressedChainTips, uint256 _pendingCheckpointNumber)
    public
    pure
    returns (CompressedChainTips)
  {
    return _compressedChainTips.updatePending(_pendingCheckpointNumber);
  }

  function updateProven(CompressedChainTips _compressedChainTips, uint256 _provenCheckpointNumber)
    public
    pure
    returns (CompressedChainTips)
  {
    return _compressedChainTips.updateProven(_provenCheckpointNumber);
  }
}

contract TipsTest is Test {
  using ChainTipsLib for CompressedChainTips;
  using ChainTipsLib for ChainTips;

  TipsWrapper public tipsWrapper = new TipsWrapper();

  function test_compress_uncompress(uint128 _pendingCheckpointNumber, uint128 _provenCheckpointNumber) public pure {
    ChainTips memory chainTips = ChainTips({pending: _pendingCheckpointNumber, proven: _provenCheckpointNumber});

    CompressedChainTips compressedChainTips = chainTips.compress();
    ChainTips memory decompressedChainTips = compressedChainTips.decompress();

    assertEq(compressedChainTips.getPending(), chainTips.pending, "getPending");
    assertEq(compressedChainTips.getProven(), chainTips.proven, "getProven");

    assertEq(decompressedChainTips.pending, chainTips.pending, "decompressed pendingCheckpointNumber");
    assertEq(decompressedChainTips.proven, chainTips.proven, "decompressed provenCheckpointNumber");
  }

  function test_updatePendingCheckpointNumber(uint128 _pendingCheckpointNumber, uint128 _provenCheckpointNumber)
    public
    pure
  {
    uint256 pendingCheckpointNumber = bound(_pendingCheckpointNumber, 0, type(uint128).max - 1);
    ChainTips memory a = ChainTips({pending: pendingCheckpointNumber, proven: _provenCheckpointNumber});

    CompressedChainTips b = a.compress();
    CompressedChainTips c = b.updatePending(pendingCheckpointNumber + 1);

    assertEq(c.getPending(), pendingCheckpointNumber + 1, "c.getPending");
    assertEq(c.getProven(), _provenCheckpointNumber, "c.getProven");
    assertEq(c.getPending(), b.getPending() + 1, "c.getPending != b.getPending + 1");
  }

  function test_updatePendingCheckpointNumberOversized(
    uint256 _pendingCheckpointNumber,
    uint128 _provenCheckpointNumber
  ) public {
    ChainTips memory a = ChainTips({pending: 0, proven: _provenCheckpointNumber});
    uint256 pendingCheckpointNumber = bound(_pendingCheckpointNumber, uint256(type(uint128).max) + 1, type(uint256).max);

    CompressedChainTips b = a.compress();
    vm.expectRevert(
      abi.encodeWithSelector(SafeCast.SafeCastOverflowedUintDowncast.selector, 128, pendingCheckpointNumber)
    );
    tipsWrapper.updatePending(b, pendingCheckpointNumber);
  }

  function test_updateProvenCheckpointNumber(uint128 _pendingCheckpointNumber, uint128 _provenCheckpointNumber)
    public
    pure
  {
    uint256 provenCheckpointNumber = bound(_provenCheckpointNumber, 0, type(uint128).max - 1);
    ChainTips memory a = ChainTips({pending: _pendingCheckpointNumber, proven: provenCheckpointNumber});

    CompressedChainTips b = a.compress();
    CompressedChainTips c = b.updateProven(provenCheckpointNumber + 1);

    assertEq(c.getPending(), _pendingCheckpointNumber, "c.getPending");
    assertEq(c.getProven(), provenCheckpointNumber + 1, "c.getProven");
    assertEq(c.getProven(), b.getProven() + 1, "c.getProven != b.getProven + 1");
  }

  function test_updateProvenCheckpointNumberOversized(
    uint128 _pendingCheckpointNumber,
    uint256 _provenCheckpointNumber
  ) public {
    ChainTips memory a = ChainTips({pending: _pendingCheckpointNumber, proven: 0});
    uint256 provenCheckpointNumber = bound(_provenCheckpointNumber, uint256(type(uint128).max) + 1, type(uint256).max);

    CompressedChainTips b = a.compress();
    vm.expectRevert(
      abi.encodeWithSelector(SafeCast.SafeCastOverflowedUintDowncast.selector, 128, provenCheckpointNumber)
    );
    tipsWrapper.updateProven(b, provenCheckpointNumber);
  }
}
