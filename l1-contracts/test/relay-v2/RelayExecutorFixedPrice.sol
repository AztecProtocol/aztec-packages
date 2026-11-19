// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {RelayExecutor} from "@aztec/relay-v2/RelayExecutor.sol";

/// @notice RelayExecutor with the Rollup price read replaced by a constant, to isolate the oracle's gas.
contract RelayExecutorFixedPrice is RelayExecutor {
  uint256 internal immutable ETH_PER_FEE_ASSET;

  constructor(IRollup _rollup, uint256 _ethPerFeeAsset) RelayExecutor(_rollup) {
    ETH_PER_FEE_ASSET = _ethPerFeeAsset;
  }

  function _price() internal view override returns (uint256 baseFee, uint256 ethPerFeeAsset) {
    return (block.basefee, ETH_PER_FEE_ASSET);
  }
}
