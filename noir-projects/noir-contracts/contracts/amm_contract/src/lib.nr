/// Given an input amount of an asset and pair balances, returns the maximum output amount of the other asset.
pub fn get_amount_out(amount_in: U128, balance_in: U128, balance_out: U128) -> U128 {
    // Based on Uniswap v2: https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L43
    assert(amount_in > U128::zero(), "INSUFFICIENT_INPUT_AMOUNT");
    assert((balance_in > U128::zero()) & (balance_out > U128::zero()), "INSUFFICIENT_LIQUIDITY");
    let amount_in_with_fee = amount_in * U128::from_integer(997);
    let numerator = amount_in_with_fee * balance_out;
    let denominator = balance_in * U128::from_integer(1000) + amount_in_with_fee;
    numerator / denominator
}

/// Given an output amount of an asset and pair balances, returns a required input amount of the other asset.
pub fn get_amount_in(amount_out: U128, balance_in: U128, balance_out: U128) -> U128 {
    // Based on Uniswap v2: https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L53
    assert(amount_out > U128::zero(), "INSUFFICIENT_OUTPUT_AMOUNT");
    assert((balance_in > U128::zero()) & (balance_out > U128::zero()), "INSUFFICIENT_LIQUIDITY");
    let numerator = balance_in * amount_out * U128::from_integer(1000);
    let denominator = (balance_out - amount_out) * U128::from_integer(997);
    (numerator / denominator) + U128::from_integer(1)
}

/// Given the desired amounts and balances of token0 and token1 returns the optimal amount of token0 and token1 to be added to the pool.
pub fn get_amounts_to_add(
    amount0_max: U128,
    amount1_max: U128,
    amount0_min: U128,
    amount1_min: U128,
    balance0: U128,
    balance1: U128,
) -> (U128, U128) {
    // When adding tokens, both balances must grow by the same ratio, which means that their spot price is unchanged.
    // Since any swaps would affect these ratios, liquidity providers supply a range of minimum and maximum balances
    // they are willing to supply for each token (which translates to minimum and maximum relative prices of the
    // tokens, preventing loss of value outside of this range due to e.g. front-running).

    if (balance0 == U128::zero()) | (balance1 == U128::zero()) {
        // The token balances should only be zero when initializing the pool. In this scenario there is no prior ratio
        // to follow so we simply transfer the full maximum balance - it is up to the caller to make sure that the ratio
        // they've chosen results in a a reasonable spot price.
        (amount0_max, amount1_max)
    } else {
        // There is a huge number of amount combinations that respect the minimum and maximum for each token, but we'll
        // only consider the two scenarios in which one of the amounts is the maximum amount.

        // First we calculate the token1 amount that'd need to be supplied if we used the maximum amount for token0.
        let amount1_equivalent = get_equivalent_amount(amount0_max, balance0, balance1);
        if (amount1_equivalent <= amount1_max) {
            assert(amount1_equivalent >= amount1_min, "AMOUNT_1_BELOW_MINIMUM");
            (amount0_max, amount1_equivalent)
        } else {
            // If the max amount for token0 results in a token1 amount larger than the maximum, then we try with the
            // maximum token1 amount, hoping that it'll result in a token0 amount larger than the minimum.
            let amount0_equivalent = get_equivalent_amount(amount1_max, balance1, balance0);
            // This should never happen, as it'd imply that the maximum is lower than the minimum.
            assert(amount0_equivalent <= amount0_max);

            assert(amount0_equivalent >= amount0_min, "AMOUNT_0_BELOW_MINIMUM");
            (amount0_equivalent, amount1_max)
        }
    }
}

/// Given some amount of an asset and pair balances, returns an equivalent amount of the other asset. Tokens should be
/// added and removed from the Pool respecting this ratio.
fn get_equivalent_amount(amount0: U128, balance0: U128, balance1: U128) -> U128 {
    // Based on Uniswap v2:  https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L36
    assert((balance0 > U128::zero()) & (balance1 > U128::zero()), "INSUFFICIENT_LIQUIDITY");

    // This is essentially the Rule of Three, since we're computing proportional ratios. Note we divide at the end to
    // avoid introducing too much error due to truncation.
    (amount0 * balance1) / balance0
}
