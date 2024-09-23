use dep::aztec::{
    prelude::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

pub fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let account_1 = env.create_account();
    let account_2 = env.create_account();

    let card_game_contract = env.deploy("./@card_game_contract", "CardGame").without_initializer();

    env.advance_block_by(1);
    (&mut env, card_game_contract.to_address(), account_1, account_2)
}
