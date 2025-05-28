use dep::aztec::macros::aztec;

#[aztec]
pub contract AztecNrTest {
    use dep::aztec::prelude::{
        AztecAddress, Map
    };

    use dep::aztec::{
        macros::{
            functions::private,
            storage::storage,
        },
        messages::logs::{
            note::encode_and_encrypt_note_unconstrained,
        },
    };

    use dep::token::types::balance_set::BalanceSet;
    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, BalanceSet<Context>, Context>,
    }

    #[private]
    fn balance_set_test_setup(recipient: AztecAddress, small_amount: u128, large_amount: u128, small_amount_first: bool) {
        let (first, second) = if (small_amount_first) {
            (small_amount, large_amount)
        } else {
            (large_amount, small_amount)
        };

        storage.balances.at(recipient).add(recipient, first).emit(encode_and_encrypt_note_unconstrained(&mut context, recipient, recipient));
        storage.balances.at(recipient).add(recipient, second).emit(encode_and_encrypt_note_unconstrained(&mut context, recipient, recipient));
    }

    #[private]
    fn balance_set_subtract(recipient: AztecAddress, amount_to_sub: u128) -> u128 {
        let emission = storage.balances.at(recipient).sub(recipient, amount_to_sub);
        emission.emission.unwrap().note.value
    }

    use dep::aztec::test::helpers::test_environment::TestEnvironment;

    global LARGE_AMOUNT: u128 = 50;
    global SMALL_AMOUNT: u128 = 5;

    #[test]
    unconstrained fn balance_set_uses_largest_note_first() {
        let mut env = TestEnvironment::new();
        let owner = env.create_account(1);

        let contract_address =
            env.deploy_self("AztecNrTest").without_initializer().to_address();

        let _ = env.call_private_test(owner, AztecNrTest::at(contract_address).balance_set_test_setup(owner, SMALL_AMOUNT, LARGE_AMOUNT, true));
        let change_note_value = env.call_private_test(owner, AztecNrTest::at(contract_address).balance_set_subtract(owner, SMALL_AMOUNT)).return_value;
        assert_eq(change_note_value, LARGE_AMOUNT - SMALL_AMOUNT);
    }

    #[test]
    unconstrained fn balance_set_uses_largest_note_first_different_order() {
        let mut env = TestEnvironment::new();
        let owner = env.create_account(1);

        let contract_address =
            env.deploy_self("AztecNrTest").without_initializer().to_address();

        let _ = env.call_private_test(owner, AztecNrTest::at(contract_address).balance_set_test_setup(owner, SMALL_AMOUNT, LARGE AMOUNT, false));
        let change_note_value = env.call_private_test(owner, AztecNrTest::at(contract_address).balance_set_subtract(owner, SMALL_AMOUNT)).return_value;
        assert_eq(change_note_value, LARGE_AMOUNT - SMALL_AMOUNT);
    }
}
