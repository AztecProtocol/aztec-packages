contract CrowdFunding {
    mod interfaces;

    use dep::aztec::protocol_types::address::AztecAddress;
    use dep::aztec::{
        context::{PrivateContext, Context}, note::{note_header::NoteHeader, utils as note_utils},
        state_vars::{map::Map, immutable_singleton::ImmutableSingleton}
    };
    use dep::field_note::field_note::FieldNote;
    use interfaces::{Token, PrivateToken};

    struct Storage {
        donation_token: ImmutableSingleton<FieldNote>,
        reward_token: ImmutableSingleton<FieldNote>,
        operator: ImmutableSingleton<FieldNote>,
    }

    #[aztec(private)]
    fn constructor(donation_token: AztecAddress, reward_token: AztecAddress, operator: AztecAddress) {
        let mut donation_token = FieldNote::new(donation_token.to_field());
        storage.donation_token.initialize(&mut donation_token, false);

        let mut reward_token = FieldNote::new(reward_token.to_field());
        storage.reward_token.initialize(&mut reward_token, false);

        let mut operator = FieldNote::new(operator.to_field());
        storage.operator.initialize(&mut operator, false);
    }

    #[aztec(private)]
    fn donate(amount: u64) {
        dep::aztec::oracle::debug_log::debug_log_array_with_prefix("Start donate", [1]);
        let donation_token_address = AztecAddress::from_field(storage.donation_token.get_note().value);
        let donation_token = Token::at(donation_token_address);
        dep::aztec::oracle::debug_log::debug_log_array_with_prefix("Got donation token", [donation_token_address]);

        donation_token.transfer(
            &mut context,
            context.msg_sender(),
            context.this_address(),
            amount as Field,
            0
        );
        dep::aztec::oracle::debug_log::debug_log_array_with_prefix("Transfer done", [1]);

        let reward_token_address = AztecAddress::from_field(storage.reward_token.get_note().value);
        let reward_token = PrivateToken::at(reward_token_address);
        dep::aztec::oracle::debug_log::debug_log_array_with_prefix("Got reward token address", [reward_token_address]);

        reward_token.mint(&mut context, amount, context.msg_sender());
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
        dep::aztec::oracle::debug_log::debug_log_array_with_prefix("Got donation token", [donation_token_address]);

        donation_token.transfer(&mut context, this, sender, amount as Field, 0);
    }
}
