// given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
// copy of https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L36
pub fn get_quote(amountA: u64, reserveA: u64, reserveB: u64) -> u64 {
    assert(amountA > 0, "INSUFFICIENT_AMOUNT");
    assert((reserveA > 0) & (reserveB > 0), "INSUFFICIENT_LIQUIDITY");
    (amountA * reserveB) / reserveA
}

// given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
// copy of https://github.com/Uniswap/v2-periphery/blob/0335e8f7e1bd1e8d8329fd300aea2ef2f36dd19f/contracts/libraries/UniswapV2Library.sol#L43
pub fn get_amount_out(amount_in: u64, reserve_in: u64, reserve_out: u64) -> u64 {
    assert(amount_in > 0, "INSUFFICIENT_INPUT_AMOUNT");
    assert((reserve_in > 0) & (reserve_out > 0), "INSUFFICIENT_LIQUIDITY");
    let amount_in_with_fee = amount_in * 997;
    let numerator = amount_in_with_fee * reserve_out;
    let denominator = reserve_in * 1000 + amount_in_with_fee;
    numerator / denominator
}
