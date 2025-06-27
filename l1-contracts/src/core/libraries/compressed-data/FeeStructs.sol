// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {CompressedSlot} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

struct FeeHeader {
  uint256 excessMana;
  uint256 manaUsed;
  uint256 feeAssetPriceNumerator;
  uint256 congestionCost;
  uint256 proverCost;
}

struct CompressedFeeHeader {
  uint64 congestionCost;
  uint64 proverCost;
  uint48 feeAssetPriceNumerator;
  uint48 excessMana;
  uint32 manaUsed;
}

struct L1FeeData {
  uint256 baseFee;
  uint256 blobFee;
}

// We compress the L1 fee data heavily, capping out at `2**56-1` (7.2057594038E16)
struct CompressedL1FeeData {
  uint56 baseFee;
  uint56 blobFee;
}

// (56 + 56) * 2 + 32 = 256
struct L1GasOracleValues {
  CompressedL1FeeData pre;
  CompressedL1FeeData post;
  CompressedSlot slotOfChange;
}

library FeeStructsLib {
  using SafeCast for uint256;

  function compress(L1FeeData memory _data) internal pure returns (CompressedL1FeeData memory) {
    return
      CompressedL1FeeData({baseFee: _data.baseFee.toUint56(), blobFee: _data.blobFee.toUint56()});
  }

  function decompress(CompressedL1FeeData memory _data) internal pure returns (L1FeeData memory) {
    return L1FeeData({baseFee: uint256(_data.baseFee), blobFee: uint256(_data.blobFee)});
  }
}

library FeeHeaderLib {
  using SafeCast for uint256;

  function getManaUsed(CompressedFeeHeader storage _compressedFeeHeader)
    internal
    view
    returns (uint256)
  {
    return _compressedFeeHeader.manaUsed;
  }

  function getCongestionCost(CompressedFeeHeader storage _compressedFeeHeader)
    internal
    view
    returns (uint256)
  {
    return _compressedFeeHeader.congestionCost;
  }

  function getProverCost(CompressedFeeHeader storage _compressedFeeHeader)
    internal
    view
    returns (uint256)
  {
    return _compressedFeeHeader.proverCost;
  }

  function compress(FeeHeader memory _feeHeader) internal pure returns (CompressedFeeHeader memory) {
    return CompressedFeeHeader({
      excessMana: _feeHeader.excessMana.toUint48(),
      manaUsed: _feeHeader.manaUsed.toUint32(),
      feeAssetPriceNumerator: _feeHeader.feeAssetPriceNumerator.toUint48(),
      congestionCost: _feeHeader.congestionCost.toUint64(),
      proverCost: _feeHeader.proverCost.toUint64()
    });
  }

  function decompress(CompressedFeeHeader memory _compressedFeeHeader)
    internal
    pure
    returns (FeeHeader memory)
  {
    return FeeHeader({
      excessMana: _compressedFeeHeader.excessMana,
      manaUsed: _compressedFeeHeader.manaUsed,
      feeAssetPriceNumerator: _compressedFeeHeader.feeAssetPriceNumerator,
      congestionCost: _compressedFeeHeader.congestionCost,
      proverCost: _compressedFeeHeader.proverCost
    });
  }
}
