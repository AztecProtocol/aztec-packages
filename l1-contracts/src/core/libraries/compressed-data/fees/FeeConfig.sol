// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

// Represents a value denominated in ETH (wei).
type EthValue is uint256;

// Represents a value denominated in the fee asset (e.g., AZTEC token).
type FeeAssetValue is uint256;

/*
 * ETH per fee asset price with 1e12 precision.
 * Higher stored value = more expensive fee asset (more ETH needed per 1 fee asset).
 * actual_eth_per_fee_asset = stored_value / ETH_PER_FEE_ASSET_PRECISION (decimals)
 *
 * We use 1e12 precision because:
 * 1. The value must fit in 48 bits when compressed in FeeHeader (max ~2.8e14)
 * 2. Higher precision allows representing very low prices (down to 1e-10 ETH)
 * 3. Reduces rounding errors during ETH <-> FeeAsset conversions
 *
 * See FeeLib.sol for the MIN/MAX bounds and detailed documentation.
 */
type EthPerFeeAssetE12 is uint256;

// Precision multiplier for ETH per fee asset
uint256 constant ETH_PER_FEE_ASSET_PRECISION = 1e12;

function addEthValue(EthValue _a, EthValue _b) pure returns (EthValue) {
  return EthValue.wrap(EthValue.unwrap(_a) + EthValue.unwrap(_b));
}

function subEthValue(EthValue _a, EthValue _b) pure returns (EthValue) {
  return EthValue.wrap(EthValue.unwrap(_a) - EthValue.unwrap(_b));
}

using {addEthValue as +, subEthValue as -} for EthValue global;

// 32 bit manaTarget, 128 bit congestionUpdateFraction, 64 bit provingCostPerMana
type CompressedFeeConfig is uint256;

struct FeeConfig {
  uint256 manaTarget;
  uint256 congestionUpdateFraction;
  EthValue provingCostPerMana;
}

/// @notice Library for converting between ETH and fee asset values using the price oracle.
library PriceLib {
  /**
   * @notice Converts a fee asset amount to its ETH equivalent.
   * @dev ethValue = feeAssetAmount * ethPerFeeAsset / precision
   * @param _feeAssetValue The amount in fee asset units
   * @param _ethPerFeeAsset The current price (ETH per fee asset with 1e12 precision)
   * @return The equivalent value in ETH (wei), rounded up
   */
  function toEth(FeeAssetValue _feeAssetValue, EthPerFeeAssetE12 _ethPerFeeAsset) internal pure returns (EthValue) {
    return EthValue.wrap(
      Math.mulDiv(
        FeeAssetValue.unwrap(_feeAssetValue),
        EthPerFeeAssetE12.unwrap(_ethPerFeeAsset),
        ETH_PER_FEE_ASSET_PRECISION,
        Math.Rounding.Ceil
      )
    );
  }

  /**
   * @notice Converts an ETH amount to its fee asset equivalent.
   * @dev feeAssetAmount = ethValue * precision / ethPerFeeAsset
   * @param _ethValue The amount in ETH (wei)
   * @param _ethPerFeeAsset The current price (ETH per fee asset with 1e12 precision)
   * @return The equivalent value in fee asset units, rounded up
   */
  function toFeeAsset(EthValue _ethValue, EthPerFeeAssetE12 _ethPerFeeAsset) internal pure returns (FeeAssetValue) {
    return FeeAssetValue.wrap(
      Math.mulDiv(
        EthValue.unwrap(_ethValue),
        ETH_PER_FEE_ASSET_PRECISION,
        EthPerFeeAssetE12.unwrap(_ethPerFeeAsset),
        Math.Rounding.Ceil
      )
    );
  }
}

library FeeConfigLib {
  using SafeCast for uint256;

  uint256 private constant MASK_32_BITS = 0xFFFFFFFF;
  uint256 private constant MASK_64_BITS = 0xFFFFFFFFFFFFFFFF;
  uint256 private constant MASK_128_BITS = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

  function getManaTarget(CompressedFeeConfig _compressedFeeConfig) internal pure returns (uint256) {
    return (CompressedFeeConfig.unwrap(_compressedFeeConfig) >> 192) & MASK_32_BITS;
  }

  function getCongestionUpdateFraction(CompressedFeeConfig _compressedFeeConfig) internal pure returns (uint256) {
    return (CompressedFeeConfig.unwrap(_compressedFeeConfig) >> 64) & MASK_128_BITS;
  }

  function getProvingCostPerMana(CompressedFeeConfig _compressedFeeConfig) internal pure returns (EthValue) {
    return EthValue.wrap(CompressedFeeConfig.unwrap(_compressedFeeConfig) & MASK_64_BITS);
  }

  function compress(FeeConfig memory _config) internal pure returns (CompressedFeeConfig) {
    uint256 value = 0;
    value |= uint256(EthValue.unwrap(_config.provingCostPerMana).toUint64());
    value |= uint256(_config.congestionUpdateFraction.toUint128()) << 64;
    value |= uint256(_config.manaTarget.toUint32()) << 192;

    return CompressedFeeConfig.wrap(value);
  }

  function decompress(CompressedFeeConfig _compressedFeeConfig) internal pure returns (FeeConfig memory) {
    return FeeConfig({
      provingCostPerMana: getProvingCostPerMana(_compressedFeeConfig),
      congestionUpdateFraction: getCongestionUpdateFraction(_compressedFeeConfig),
      manaTarget: getManaTarget(_compressedFeeConfig)
    });
  }
}
