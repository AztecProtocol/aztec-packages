contract Claim {
    mod interfaces;

    use dep::aztec::protocol_types::address::AztecAddress;
    use dep::aztec::{
        context::{PrivateContext, Context}, note::{note_header::NoteHeader, utils as note_utils},
        state_vars::{map::Map, set::Set, immutable_singleton::ImmutableSingleton}
    };
    use dep::field_note::field_note::FieldNote;
    use dep::value_note::value_note::ValueNote;
    use interfaces::{Token};

    use dep::aztec::history::{
        contract_inclusion::{prove_contract_inclusion, prove_contract_inclusion_at},
        note_inclusion::{prove_note_inclusion, prove_note_inclusion_at},
        note_validity::{prove_note_validity, prove_note_validity_at},
        nullifier_inclusion::{
        prove_nullifier_inclusion, prove_nullifier_inclusion_at, prove_note_is_nullified,
        prove_note_is_nullified_at
    },
        nullifier_non_inclusion::{
        prove_nullifier_not_included, prove_nullifier_not_included_at, prove_note_not_nullified,
        prove_note_not_nullified_at
    },
        public_value_inclusion::{prove_public_value_inclusion, prove_public_value_inclusion_at}
    };

    struct Storage {
      campaign_contract: ImmutableSingleton<FieldNote>,
      reward_token: ImmutableSingleton<FieldNote>,
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
        dep::aztec::oracle::debug_log::debug_log_array_with_prefix("Called Claim", [1]);

        prove_note_inclusion(proof_note, context); // Contract A
        context.push_new_nullifier(proof_note.compute_nullifier(&mut context), 0);

        let reward_token_address = AztecAddress::from_field(storage.reward_token.get_note().value);
        let reward_token = Token::at(reward_token_address);

        reward_token.mint_public(&mut context, context.msg_sender(), proof_note.value);
    }
}
