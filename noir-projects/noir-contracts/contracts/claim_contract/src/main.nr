contract Claim {
    mod interfaces;

    use dep::aztec::{
        protocol_types::address::AztecAddress,
        state_vars::PrivateImmutable,
    };
    use dep::field_note::field_note::FieldNote;
    use dep::value_note::value_note::ValueNote;
    use interfaces::Token;
    use dep::aztec::history::note_inclusion::prove_note_inclusion;

    struct Storage {
      campaign_contract: PrivateImmutable<FieldNote>,
      reward_token: PrivateImmutable<FieldNote>,
    }

    #[aztec(private)]
    fn constructor(campaign_contract: AztecAddress, reward_token: AztecAddress) {
        let mut campaign_contract = FieldNote::new(campaign_contract.to_field());
        storage.campaign_contract.initialize(&mut campaign_contract, false);

        let mut reward_token = FieldNote::new(reward_token.to_field());
        storage.reward_token.initialize(&mut reward_token, false);
    }

    #[aztec(private)]
    fn claim(proof_note: ValueNote) {
        prove_note_inclusion(proof_note, context); // Contract A
        context.push_new_nullifier(proof_note.compute_nullifier(&mut context), 0);

        let reward_token_address = AztecAddress::from_field(storage.reward_token.get_note().value);
        let reward_token = Token::at(reward_token_address);

        reward_token.mint_public(&mut context, context.msg_sender(), proof_note.value);
    }
}
