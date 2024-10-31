use crate::{AMM, test::utils::setup};
use dep::token::Token;
use dep::uint_note::uint_note::UintNote;
use aztec::prelude::AztecAddress;

#[test]
unconstrained fn full_flow() {
    // Setup
    let (env, amm_address, token0_address, token1_address, liquidity_token_address, token_admin, liquidity_provider, lp_balance_0, lp_balance_1, swapper_balance_0) =
        setup();
    // let amm = AMM::at(amm_address);
    // Now we add liquidity
}
