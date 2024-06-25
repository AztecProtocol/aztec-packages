use crate::test::utils;
use dep::aztec::{test::helpers::cheatcodes, oracle::unsafe_rand::unsafe_rand, hash::compute_secret_hash};
use crate::PrivateToken;

#[test]
unconstrained fn mint_private_success() {
    let _ = utils::setup_and_mint(true);
}
