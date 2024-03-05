contract CrowdFunding {
    mod interfaces;

    use dep::aztec::protocol_types::address::AztecAddress;
    use dep::aztec::{
        log::emit_unencrypted_log_from_private,
        state_vars::{PrivateSet, PrivateImmutable},
        protocol_types::traits::Serialize
    };
    use dep::field_note::field_note::FieldNote;
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
        donation_token: PrivateImmutable<FieldNote>,
        operator: PrivateImmutable<FieldNote>,
        donation: PrivateSet<ValueNote>,
    }

    #[aztec(private)]
    fn constructor(donation_token: AztecAddress, operator: AztecAddress) {
        // Add end time
        let mut donation_token = FieldNote::new(donation_token.to_field());
        storage.donation_token.initialize(&mut donation_token, false);

        let mut operator = FieldNote::new(operator.to_field());
        storage.operator.initialize(&mut operator, false);
    }

    #[aztec(private)]
    fn donate(amount: u64) {
        let donation_token_address = AztecAddress::from_field(storage.donation_token.get_note().value);
        let donation_token = Token::at(donation_token_address);

        donation_token.transfer(
            &mut context,
            context.msg_sender(),
            context.this_address(),
            amount as Field,
            0
        );

        let mut note = ValueNote::new(amount as Field, context.msg_sender());
        storage.donation.insert(&mut note, true);
    }

    // Withdraws balance. Requires that msg.sender is registered as an owner.
    #[aztec(private)]
    fn withdraw(amount: Field) {
        let operator_address = AztecAddress::from_field(storage.operator.get_note().value);

        let this = context.this_address();
        let sender = context.msg_sender();

        assert(sender == operator_address, "Invalid sender");

        let donation_token_address = AztecAddress::from_field(storage.donation_token.get_note().value);
        let donation_token = Token::at(donation_token_address);

        donation_token.transfer(&mut context, this, sender, amount as Field, 0);

        let event = WithdrawalProcessed { amount: amount as u64, who: this };
        emit_unencrypted_log_from_private(&mut context, event.serialize());
    }
}
