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
// If the costs rose to this point an eth transfer (21000 gas) would be
// 21000 * 2**56-1 = 1.5132094748E21 wei / 1,513 eth in fees.
type CompressedL1FeeData is uint112;

// (56 + 56) * 2 + 32 = 256
struct L1GasOracleValues {
  CompressedL1FeeData pre;
  CompressedL1FeeData post;
  CompressedSlot slotOfChange;
}

library FeeStructsLib {
  using SafeCast for uint256;

  uint256 internal constant MASK_56_BITS = 0xFFFFFFFFFFFFFF;

  function getBlobFee(CompressedL1FeeData _compressedL1FeeData) internal pure returns (uint256) {
    return CompressedL1FeeData.unwrap(_compressedL1FeeData) & MASK_56_BITS;
  }

  function getBaseFee(CompressedL1FeeData _compressedL1FeeData) internal pure returns (uint256) {
    return (CompressedL1FeeData.unwrap(_compressedL1FeeData) >> 56) & MASK_56_BITS;
  }

  function compress(L1FeeData memory _data) internal pure returns (CompressedL1FeeData) {
    uint256 value = 0;
    value |= uint256(_data.blobFee.toUint56()) << 0;
    value |= uint256(_data.baseFee.toUint56()) << 56;
    return CompressedL1FeeData.wrap(value.toUint112());
  }

  function decompress(CompressedL1FeeData _data) internal pure returns (L1FeeData memory) {
    uint256 value = CompressedL1FeeData.unwrap(_data);
    uint256 blobFee = value & MASK_56_BITS;
    uint256 baseFee = (value >> 56) & MASK_56_BITS;
    return L1FeeData({baseFee: uint256(baseFee), blobFee: uint256(blobFee)});
  }
}

library FeeHeaderLib {
  using SafeCast for uint256;

  uint256 internal constant MASK_32_BITS = 0xFFFFFFFF;
  uint256 internal constant MASK_48_BITS = 0xFFFFFFFFFFFF;
  uint256 internal constant MASK_63_BITS = 0x7FFFFFFFFFFFFFFF;
  uint256 internal constant MASK_64_BITS = 0xFFFFFFFFFFFFFFFF;

  function getManaUsed(CompressedFeeHeader _compressedFeeHeader) internal pure returns (uint256) {
    return CompressedFeeHeader.unwrap(_compressedFeeHeader) & MASK_32_BITS;
  }

  function getExcessMana(CompressedFeeHeader _compressedFeeHeader) internal pure returns (uint256) {
    return (CompressedFeeHeader.unwrap(_compressedFeeHeader) >> 32) & MASK_48_BITS;
  }

  function getFeeAssetPriceNumerator(CompressedFeeHeader _compressedFeeHeader) internal pure returns (uint256) {
    return (CompressedFeeHeader.unwrap(_compressedFeeHeader) >> 80) & MASK_48_BITS;
  }

  function getCongestionCost(CompressedFeeHeader _compressedFeeHeader) internal pure returns (uint256) {
    return (CompressedFeeHeader.unwrap(_compressedFeeHeader) >> 128) & MASK_64_BITS;
  }

  function getProverCost(CompressedFeeHeader _compressedFeeHeader) internal pure returns (uint256) {
    // The prover cost is only 63 bits so use mask to remove first bit
    return (CompressedFeeHeader.unwrap(_compressedFeeHeader) >> 192) & MASK_63_BITS;
  }

  function compress(FeeHeader memory _feeHeader) internal pure returns (CompressedFeeHeader) {
    uint256 value = 0;
    value |= uint256(_feeHeader.manaUsed.toUint32());
    value |= uint256(_feeHeader.excessMana.toUint48()) << 32;
    value |= uint256(_feeHeader.feeAssetPriceNumerator.toUint48()) << 80;
    value |= uint256(_feeHeader.congestionCost.toUint64()) << 128;

    uint256 proverCost = uint256(_feeHeader.proverCost.toUint64());
    require(proverCost == proverCost & MASK_63_BITS);
    value |= proverCost << 192;

    // Preheat
    value |= 1 << 255;

    return CompressedFeeHeader.wrap(value);
  }

  function decompress(CompressedFeeHeader _compressedFeeHeader) internal pure returns (FeeHeader memory) {
    uint256 value = CompressedFeeHeader.unwrap(_compressedFeeHeader);

    uint256 manaUsed = value & MASK_32_BITS;
    value >>= 32;
    uint256 excessMana = value & MASK_48_BITS;
    value >>= 48;
    uint256 feeAssetPriceNumerator = value & MASK_48_BITS;
    value >>= 48;
    uint256 congestionCost = value & MASK_64_BITS;
    value >>= 64;
    uint256 proverCost = value & MASK_63_BITS;

    return FeeHeader({
      manaUsed: uint256(manaUsed),
      excessMana: uint256(excessMana),
      feeAssetPriceNumerator: uint256(feeAssetPriceNumerator),
      congestionCost: uint256(congestionCost),
      proverCost: uint256(proverCost)
    });
  }
}
