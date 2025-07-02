// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {CompressedSlot} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

// We are using a type instead of a struct as we don't want to throw away a full 8 bits
// for the bool.
/*struct CompressedFeeHeader {
  uint1 preHeat;
  uint63 proverCost; Max value: 9.2233720369E18
  uint64 congestionCost;
  uint48 feeAssetPriceNumerator;
  uint48 excessMana;
  uint32 manaUsed;
}*/
type CompressedFeeHeader is uint256;

struct FeeHeader {
  uint256 excessMana;
  uint256 manaUsed;
  uint256 feeAssetPriceNumerator;
  uint256 congestionCost;
  uint256 proverCost;
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

  function isPreheated(CompressedFeeHeader _compressedFeeHeader) internal pure returns (bool) {
    return (CompressedFeeHeader.unwrap(_compressedFeeHeader) >> 255) == 1;
  }

  function getManaUsed(CompressedFeeHeader _compressedFeeHeader) internal pure returns (uint256) {
    // Reads the bits 224-256
    return CompressedFeeHeader.unwrap(_compressedFeeHeader) & 0xFFFFFFFF;
  }

  function getExcessMana(CompressedFeeHeader _compressedFeeHeader) internal pure returns (uint256) {
    // Reads the bits 176-223
    return (CompressedFeeHeader.unwrap(_compressedFeeHeader) >> 32) & 0xFFFFFFFFFFFF;
  }

  function getFeeAssetPriceNumerator(CompressedFeeHeader _compressedFeeHeader)
    internal
    pure
    returns (uint256)
  {
    // Reads the bits 128-175
    return (CompressedFeeHeader.unwrap(_compressedFeeHeader) >> 80) & 0xFFFFFFFFFFFF;
  }

  function getCongestionCost(CompressedFeeHeader _compressedFeeHeader)
    internal
    pure
    returns (uint256)
  {
    // Reads the bits 64-127
    return (CompressedFeeHeader.unwrap(_compressedFeeHeader) >> 128) & 0xFFFFFFFFFFFFFFFF;
  }

  function getProverCost(CompressedFeeHeader _compressedFeeHeader) internal pure returns (uint256) {
    // The prover cost is only 63 bits so use mask to remove first bit
    // Reads the bits 1-63
    return (CompressedFeeHeader.unwrap(_compressedFeeHeader) >> 192) & 0x7FFFFFFFFFFFFFFF;
  }

  function compress(FeeHeader memory _feeHeader) internal pure returns (CompressedFeeHeader) {
    uint256 value = 0;
    value |= uint256(_feeHeader.manaUsed.toUint32());
    value |= uint256(_feeHeader.excessMana.toUint48()) << 32;
    value |= uint256(_feeHeader.feeAssetPriceNumerator.toUint48()) << 80;
    value |= uint256(_feeHeader.congestionCost.toUint64()) << 128;

    uint256 proverCost = uint256(_feeHeader.proverCost.toUint64());
    require(proverCost == proverCost & 0x7FFFFFFFFFFFFFFF);
    value |= proverCost << 192;

    // Preheat
    value |= 1 << 255;

    return CompressedFeeHeader.wrap(value);
  }

  function decompress(CompressedFeeHeader _compressedFeeHeader)
    internal
    pure
    returns (FeeHeader memory)
  {
    uint256 value = CompressedFeeHeader.unwrap(_compressedFeeHeader);

    uint256 manaUsed = value & 0xFFFFFFFF;
    value >>= 32;
    uint256 excessMana = value & 0xFFFFFFFFFFFF;
    value >>= 48;
    uint256 feeAssetPriceNumerator = value & 0xFFFFFFFFFFFF;
    value >>= 48;
    uint256 congestionCost = value & 0xFFFFFFFFFFFFFFFF;
    value >>= 64;
    uint256 proverCost = value & 0x7FFFFFFFFFFFFFFF;

    return FeeHeader({
      manaUsed: uint256(manaUsed),
      excessMana: uint256(excessMana),
      feeAssetPriceNumerator: uint256(feeAssetPriceNumerator),
      congestionCost: uint256(congestionCost),
      proverCost: uint256(proverCost)
    });
  }

  function preheat(CompressedFeeHeader _compressedFeeHeader)
    internal
    pure
    returns (CompressedFeeHeader)
  {
    uint256 value = CompressedFeeHeader.unwrap(_compressedFeeHeader);
    value |= 1 << 255;
    return CompressedFeeHeader.wrap(value);
  }
}
