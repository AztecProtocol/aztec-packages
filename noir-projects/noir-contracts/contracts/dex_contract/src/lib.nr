// given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
pub fn get_quote(amountA: u32, reserveA: u32, reserveB: u32) -> u32 {
    assert(amountA > 0, "INSUFFICIENT_AMOUNT");
    assert((reserveA > 0) & (reserveB > 0), "INSUFFICIENT_LIQUIDITY");
    (amountA * reserveB) / reserveA
}
