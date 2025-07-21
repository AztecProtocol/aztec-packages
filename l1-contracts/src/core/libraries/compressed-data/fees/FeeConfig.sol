// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

type EthValue is uint256;

type FeeAssetValue is uint256;

// Precision of 1e9
type FeeAssetPerEthE9 is uint256;

function addEthValue(EthValue _a, EthValue _b) pure returns (EthValue) {
  return EthValue.wrap(EthValue.unwrap(_a) + EthValue.unwrap(_b));
}

function subEthValue(EthValue _a, EthValue _b) pure returns (EthValue) {
  return EthValue.wrap(EthValue.unwrap(_a) - EthValue.unwrap(_b));
}

using {addEthValue as +, subEthValue as -} for EthValue global;

// 64 bit manaTarget, 128 bit congestionUpdateFraction, 64 bit provingCostPerMana
type CompressedFeeConfig is uint256;

struct FeeConfig {
  uint256 manaTarget;
  uint256 congestionUpdateFraction;
  EthValue provingCostPerMana;
}

library PriceLib {
  function toEth(FeeAssetValue _feeAssetValue, FeeAssetPerEthE9 _feeAssetPerEth)
    internal
    pure
    returns (EthValue)
  {
    return EthValue.wrap(
      Math.mulDiv(
        FeeAssetValue.unwrap(_feeAssetValue),
        1e9,
        FeeAssetPerEthE9.unwrap(_feeAssetPerEth),
        Math.Rounding.Ceil
      )
    );
  }

  function toFeeAsset(EthValue _ethValue, FeeAssetPerEthE9 _feeAssetPerEth)
    internal
    pure
    returns (FeeAssetValue)
  {
    return FeeAssetValue.wrap(
      Math.mulDiv(
        EthValue.unwrap(_ethValue),
        FeeAssetPerEthE9.unwrap(_feeAssetPerEth),
        1e9,
        Math.Rounding.Ceil
      )
    );
  }
}

library FeeConfigLib {
  using SafeCast for uint256;

  uint256 private constant MASK_64_BITS = 0xFFFFFFFFFFFFFFFF;
  uint256 private constant MASK_128_BITS = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

  function getManaTarget(CompressedFeeConfig _compressedFeeConfig) internal pure returns (uint256) {
    return (CompressedFeeConfig.unwrap(_compressedFeeConfig) >> 192) & MASK_64_BITS;
  }

  function getCongestionUpdateFraction(CompressedFeeConfig _compressedFeeConfig)
    internal
    pure
    returns (uint256)
  {
    return
      (CompressedFeeConfig.unwrap(_compressedFeeConfig) >> 64) & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
  }

  function getProvingCostPerMana(CompressedFeeConfig _compressedFeeConfig)
    internal
    pure
    returns (EthValue)
  {
    return EthValue.wrap(CompressedFeeConfig.unwrap(_compressedFeeConfig) & MASK_64_BITS);
  }

  function compress(FeeConfig memory _config) internal pure returns (CompressedFeeConfig) {
    uint256 value = 0;
    value |= uint256(EthValue.unwrap(_config.provingCostPerMana).toUint64());
    value |= uint256(_config.congestionUpdateFraction.toUint128()) << 64;
    value |= uint256(_config.manaTarget.toUint64()) << 192;

    return CompressedFeeConfig.wrap(value);
  }

  function decompress(CompressedFeeConfig _compressedFeeConfig)
    internal
    pure
    returns (FeeConfig memory)
  {
    return FeeConfig({
      provingCostPerMana: getProvingCostPerMana(_compressedFeeConfig),
      congestionUpdateFraction: getCongestionUpdateFraction(_compressedFeeConfig),
      manaTarget: getManaTarget(_compressedFeeConfig)
    });
  }
}
