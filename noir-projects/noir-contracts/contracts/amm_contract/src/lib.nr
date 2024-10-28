// given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
// copy of https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L36
pub fn get_quote(amountA: U128, reserveA: U128, reserveB: U128) -> U128 {
    assert(amountA > U128::zero(), "INSUFFICIENT_AMOUNT");
    assert((reserveA > U128::zero()) & (reserveB > U128::zero()), "INSUFFICIENT_LIQUIDITY");
    (amountA * reserveB) / reserveA
}

// given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
// copy of https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L43
pub fn get_amount_out(amount_in: U128, reserve_in: U128, reserve_out: U128) -> U128 {
    assert(amount_in > U128::zero(), "INSUFFICIENT_INPUT_AMOUNT");
    assert((reserve_in > U128::zero()) & (reserve_out > U128::zero()), "INSUFFICIENT_LIQUIDITY");
    let amount_in_with_fee = amount_in * U128::from_integer(997);
    let numerator = amount_in_with_fee * reserve_out;
    let denominator = reserve_in * U128::from_integer(1000) + amount_in_with_fee;
    numerator / denominator
}

// given an output amount of an asset and pair reserves, returns a required input amount of the other asset
// copy of https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L53
pub fn get_amount_in(amount_out: U128, reserve_in: U128, reserve_out: U128) -> U128 {
    assert(amount_out > U128::zero(), "INSUFFICIENT_OUTPUT_AMOUNT");
    assert((reserve_in > U128::zero()) & (reserve_out > U128::zero()), "INSUFFICIENT_LIQUIDITY");
    let numerator = reserve_in * amount_out * U128::from_integer(1000);
    let denominator = (reserve_out - amount_out) * U128::from_integer(997);
    (numerator / denominator) + U128::from_integer(1)
}
