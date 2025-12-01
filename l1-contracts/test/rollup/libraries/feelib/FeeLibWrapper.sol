// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {FeeStore, FeeLib, EthValue} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {BlobLib} from "@aztec/core/libraries/rollup/BlobLib.sol";
import {FeeConfigLib, FeeConfig, CompressedFeeConfig} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {L1GasOracleValues, FeeStructsLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";

contract FeeLibWrapper {
  using FeeConfigLib for FeeConfig;
  using FeeConfigLib for CompressedFeeConfig;

  function initialize(uint256 _manaTarget) external {
    FeeLib.initialize(_manaTarget, EthValue.wrap(100));
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
}
