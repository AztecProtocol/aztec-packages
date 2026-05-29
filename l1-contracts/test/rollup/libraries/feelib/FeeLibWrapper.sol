// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {FeeStore, FeeLib, EthValue, EthPerFeeAssetE12} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {BlobLib} from "@aztec/core/libraries/rollup/BlobLib.sol";
import {FeeConfigLib, FeeConfig, CompressedFeeConfig} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {L1GasOracleValues, FeeStructsLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";

contract FeeLibWrapper {
  using FeeConfigLib for FeeConfig;
  using FeeConfigLib for CompressedFeeConfig;

  function initialize(uint256 _manaTarget, EthPerFeeAssetE12 _initialEthPerFeeAsset) external {
    FeeLib.initialize(_manaTarget, EthValue.wrap(100), _initialEthPerFeeAsset);
  }

  function initialize(uint256 _manaTarget, EthValue _provingCostPerMana, EthPerFeeAssetE12 _initialEthPerFeeAsset)
    external
  {
    FeeLib.initialize(_manaTarget, _provingCostPerMana, _initialEthPerFeeAsset);
  }

  function updateManaTarget(uint256 _manaTarget) external {
    FeeLib.updateManaTarget(_manaTarget);
  }

  function getManaTarget() external view returns (uint256) {
    return FeeLib.getManaTarget();
  }

  function getManaLimit() external view returns (uint256) {
    return FeeLib.getManaLimit();
  }

  function getConfig() external view returns (FeeConfig memory) {
    return FeeLib.getStorage().config.decompress();
  }

  function getL1GasOracleValues() external view returns (L1GasOracleValues memory) {
    return FeeLib.getStorage().l1GasOracleValues;
  }

  function computeNewEthPerFeeAsset(uint256 _currentPrice, int256 _modifierBps) external pure returns (uint256) {
    return FeeLib.computeNewEthPerFeeAsset(_currentPrice, _modifierBps);
  }
}
