contract CrowdFunding {
    mod interfaces;

    use dep::aztec::protocol_types::address::AztecAddress;
    use dep::aztec::{
        context::{PrivateContext, Context}, note::{note_header::NoteHeader, utils as note_utils},
        state_vars::{map::Map, immutable_singleton::ImmutableSingleton}
    };
    use dep::field_note::field_note::FieldNote;
    use interfaces::Token;

    struct Storage {
        donation_token: ImmutableSingleton<FieldNote>,
        reward_token: ImmutableSingleton<FieldNote>,
        escrow_contract: ImmutableSingleton<FieldNote>,
    }

    #[aztec(private)]
    fn constructor(
        donation_token: AztecAddress,
        reward_token: AztecAddress,
        escrow_contract: AztecAddress
    ) {
        let mut donation_token = FieldNote::new(donation_token.to_field());
        storage.donation_token.initialize(&mut donation_token, false);

        let mut reward_token = FieldNote::new(reward_token.to_field());
        storage.reward_token.initialize(&mut reward_token, false);

        let mut escrow_contract = FieldNote::new(escrow_contract.to_field());
        storage.escrow_contract.initialize(&mut escrow_contract, false);
    }

    #[aztec(private)]
    fn donate(amount: u64) {
        let escrow_address = AztecAddress::from_field(storage.escrow_contract.get_note().value);
        let donation_token = Token::at(AztecAddress::from_field(storage.donation_token.get_note().value));
        donation_token.transfer(
            &mut context,
            context.msg_sender(),
            escrow_address,
            amount as Field,
            0
        );

        let reward_token = Token::at(AztecAddress::from_field(storage.reward_token.get_note().value));
        reward_token.transfer(
            &mut context,
            escrow_address,
            context.msg_sender(),
            amount as Field,
            0
        );
    }
}
