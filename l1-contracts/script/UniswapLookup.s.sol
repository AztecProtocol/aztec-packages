// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Math} from "@oz/utils/math/Math.sol";

interface IStateView {
  function getSlot0(bytes32 poolId)
    external
    view
    returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee);
}

contract UniswapLookupScript is Test {
  function lookAtUniswap() public {
    // Uniswap V4 StateView contract on mainnet
    IStateView stateView = IStateView(0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227);

    address currency0 = address(0); // Native ETH
    address currency1 = 0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2; // Fee asset token
    uint24 fee = 500; // 0.05%
    int24 tickSpacing = 10;
    address hooks = 0xd53006d1e3110fD319a79AEEc4c527a0d265E080;

    // Compute pool ID: keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
    bytes32 poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks));
    emit log_named_bytes32("Pool ID", poolId);

    // Query the real pool state
    (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee) = stateView.getSlot0(poolId);

    emit log_named_uint("sqrtPriceX96", sqrtPriceX96);
    emit log_named_int("tick", tick);
    emit log_named_uint("protocolFee", protocolFee);
    emit log_named_uint("lpFee", lpFee);

    // Convert to ethPerFeeAssetE12
    // ethPerFeeAssetE12 = 1e12 * 2^192 / sqrtPriceX96^2
    uint256 Q192 = 2 ** 192;
    uint256 sqrtPriceSquared = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
    uint256 ethPerFeeAssetE12 = (1e12 * Q192) / sqrtPriceSquared;

    emit log_named_decimal_uint("ethPerFeeAssetE12 (computed)", ethPerFeeAssetE12, 12);

    // Compute what sqrtPriceX96 would give us a price 0.5% higher
    uint256 targetPriceHalfPercentHigher = (ethPerFeeAssetE12 * 1005) / 1000;
    emit log_named_decimal_uint("Target price (0.5% higher)", targetPriceHalfPercentHigher, 12);

    // sqrtPriceX96^2 = 1e12 * 2^192 / targetPrice
    uint256 targetSqrtSquared = (1e12 * Q192) / targetPriceHalfPercentHigher;
    uint256 targetSqrtPriceX96 = Math.sqrt(targetSqrtSquared);
    emit log_named_uint("Target sqrtPriceX96", targetSqrtPriceX96);

    // Verify: compute the price back from the sqrt
    uint256 verifyPrice = (1e12 * Q192) / (targetSqrtPriceX96 * targetSqrtPriceX96);
    assertEq(verifyPrice, targetPriceHalfPercentHigher);
  }
}
