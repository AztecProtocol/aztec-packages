contract Crowdfunding {
    mod interfaces;

    use dep::aztec::{
        log::emit_unencrypted_log_from_private,
        protocol_types::{
            abis::function_selector::FunctionSelector,
            address::AztecAddress,
            traits::Serialize
        },
        state_vars::{PrivateSet, SharedImmutable},
    };
    use dep::value_note::value_note::ValueNote;
    use interfaces::Token;

    #[event]
    struct WithdrawalProcessed {
        who: AztecAddress,
        amount: u64,
    }

    impl Serialize<2> for WithdrawalProcessed {
        fn serialize(self: Self) -> [Field; 2] {
            [self.who.to_field(), self.amount as Field]
        }
    }

    struct Storage {
        donation_token: SharedImmutable<AztecAddress>,
        operator: SharedImmutable<AztecAddress>,
        donation: PrivateSet<ValueNote>,
    }

    #[aztec(private)]
    fn constructor(donation_token: AztecAddress, operator: AztecAddress) {
        // TODO: Add end time
        let selector = FunctionSelector::from_signature("_initialize((Field),(Field))");
        context.call_public_function(
            context.this_address(),
            selector,
            [donation_token.to_field(), operator.to_field()]
        );
    }

    #[aztec(public)]
    #[aztec(internal)]
    #[aztec(noinitcheck)]
    fn _initialize(donation_token: AztecAddress, operator: AztecAddress) {
        storage.donation_token.initialize(donation_token);
        storage.operator.initialize(operator);
    }

    #[aztec(private)]
    fn donate(amount: u64) {
        // First we transfer the donation tokens from donor to this contract
        let donation_token = Token::at(storage.donation_token.read_private());
        donation_token.transfer(
            &mut context,
            context.msg_sender(),
            context.this_address(),
            amount as Field,
            0
        );

        // Then we create a value note for the donor so that he can later on claim a rewards token in the Claim
        // contract by proving that the hash of this note exists in the note hash tree.
        let mut note = ValueNote::new(amount as Field, context.msg_sender());
        storage.donation.insert(&mut note, true);
    }

    // Withdraws balance to the operator. Requires that msg_sender() is the operator.
    #[aztec(private)]
    fn withdraw(amount: u64) {
        // First we check that msg_sender() is the operator
        let operator_address = storage.operator.read_private();
        assert(context.msg_sender() == operator_address, "Not an operator");

        // Then we transfer the donation tokens from this contract to the operator
        let donation_token = Token::at(storage.donation_token.read_private());
        donation_token.transfer(&mut context, context.this_address(), operator_address, amount as Field, 0);

        // Finally we emit an unencrypted event so that anyone can verify how much the operator has withdrawn
        let event = WithdrawalProcessed { amount, who: operator_address };
        emit_unencrypted_log_from_private(&mut context, event.serialize());
    }
}
