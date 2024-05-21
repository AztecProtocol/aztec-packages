contract LogTest {

    use dep::aztec::prelude::{
        AztecAddress, EthAddress, FunctionSelector, NoteHeader, NoteGetterOptions, NoteViewerOptions,
        PrivateContext, PrivateImmutable, PrivateSet, SharedImmutable
    };

    use dep::aztec::protocol_types::{
        abis::private_circuit_public_inputs::PrivateCircuitPublicInputs,
        constants::{MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, CANONICAL_KEY_REGISTRY_ADDRESS},
        traits::{Serialize, ToField, FromField}, grumpkin_point::GrumpkinPoint,
        grumpkin_private_key::GrumpkinPrivateKey
    };

    use dep::aztec::encrypted_logs::header::EncryptedLogHeader;
    use dep::aztec::encrypted_logs::incoming_body::EncryptedLogIncomingBody;
    use dep::aztec::encrypted_logs::outgoing_body::EncryptedLogOutgoingBody;

    use dep::aztec::note::constants::MAX_NOTES_PER_PAGE;

    use dep::aztec::state_vars::{shared_mutable::SharedMutablePrivateGetter, map::derive_storage_slot_in_map};

    use dep::aztec::{
        keys::getters::{get_npk_m, get_ivpk_m, get_npk_m_hash},
        context::inputs::private_context_inputs::PrivateContextInputs,
        hash::{pedersen_hash, compute_secret_hash, ArgsHasher},
        note::{
        lifecycle::{create_note, destroy_note}, note_getter::{get_notes, view_notes},
        note_getter_options::NoteStatus
    },
        deploy::deploy_contract as aztec_deploy_contract,
        oracle::{encryption::aes128_encrypt, unsafe_rand::unsafe_rand}
    };
    use dep::token_portal_content_hash_lib::{get_mint_private_content_hash, get_mint_public_content_hash};
    use dep::value_note::value_note::ValueNote;

    #[aztec(event)]
    struct ExampleEvent {
        value: Field,
    }

    #[aztec(storage)]
    struct Storage {
        example_set: PrivateSet<ValueNote>,
    }

    #[aztec(private)]
    fn emit_encrypted_log() {
      let msg_sender_ivpk_m = get_ivpk_m(&mut context, context.msg_sender());

        context.encrypt_and_emit_log(context.this_address(), 0, 0, msg_sender_ivpk_m, [1, 2, 3]);
    }
}
