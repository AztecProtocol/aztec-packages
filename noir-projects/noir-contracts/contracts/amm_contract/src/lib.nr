/// Given some amount of an asset and pair reserves, returns an equivalent amount of the other asset.
/// copy of https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L36
pub fn get_quote(amountA: U128, reserveA: U128, reserveB: U128) -> U128 {
    assert(amountA > U128::zero(), "INSUFFICIENT_AMOUNT");
    assert((reserveA > U128::zero()) & (reserveB > U128::zero()), "INSUFFICIENT_LIQUIDITY");
    (amountA * reserveB) / reserveA
}

/// Given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset.
/// copy of https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L43
pub fn get_amount_out(amount_in: U128, reserve_in: U128, reserve_out: U128) -> U128 {
    assert(amount_in > U128::zero(), "INSUFFICIENT_INPUT_AMOUNT");
    assert((reserve_in > U128::zero()) & (reserve_out > U128::zero()), "INSUFFICIENT_LIQUIDITY");
    let amount_in_with_fee = amount_in * U128::from_integer(997);
    let numerator = amount_in_with_fee * reserve_out;
    let denominator = reserve_in * U128::from_integer(1000) + amount_in_with_fee;
    numerator / denominator
}

/// Given an output amount of an asset and pair reserves, returns a required input amount of the other asset.
/// copy of https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L53
pub fn get_amount_in(amount_out: U128, reserve_in: U128, reserve_out: U128) -> U128 {
    assert(amount_out > U128::zero(), "INSUFFICIENT_OUTPUT_AMOUNT");
    assert((reserve_in > U128::zero()) & (reserve_out > U128::zero()), "INSUFFICIENT_LIQUIDITY");
    let numerator = reserve_in * amount_out * U128::from_integer(1000);
    let denominator = (reserve_out - amount_out) * U128::from_integer(997);
    (numerator / denominator) + U128::from_integer(1)
}

/// Given the desired amounts and reserves of token0 and token1 returns the optimal amount of token0 and token1 to be added to the pool.
pub fn get_amounts_to_add(
    amount0_desired: U128,
    amount1_desired: U128,
    amount0_min: U128,
    amount1_min: U128,
    reserve0: U128,
    reserve1: U128,
) -> (U128, U128) {
    let mut amount0 = amount0_desired;
    let mut amount1 = amount1_desired;
    if ((reserve0 != U128::zero()) | (reserve1 != U128::zero())) {
        // First calculate the optimal amount of token1 based on the desired amount of token0.
        let amount1_optimal = get_quote(amount0_desired, reserve0, reserve1);
        if (amount1_optimal <= amount1_desired) {
            // Revert if the optimal amount of token1 is less than the desired amount of token1.
            assert(amount1_optimal >= amount1_min, "INSUFFICIENT_1_AMOUNT");
            amount0 = amount0_desired;
            amount1 = amount1_optimal;
        } else {
            // We got more amount of token1 than desired so we try repeating the process but this time by quoting
            // based on token1.
            let amount0_optimal = get_quote(amount1_desired, reserve1, reserve0);
            assert(amount0_optimal <= amount0_desired);
            assert(amount0_optimal >= amount0_min, "INSUFFICIENT_0_AMOUNT");
            amount0 = amount0_optimal;
            amount1 = amount1_desired;
        }
    }

    (amount0, amount1)
}
