// Account contract that uses Schnorr signatures for authentication.
// The signing key is stored in an immutable private note and should be different from the encryption/nullifying key.
contract FeeEnabledSchnorrAccount {
    use dep::std;
    use dep::std::option::Option;

    use dep::aztec::protocol_types::{
        abis::function_selector::FunctionSelector,
        address::AztecAddress
    };

    use dep::aztec::{
        context::{PrivateContext, Context},
        note::{ note_header::NoteHeader, utils as note_utils },
        oracle::get_public_key::get_public_key,
        state_vars::{immutable_singleton::ImmutableSingleton, public_state::PublicState},
        types::type_serialization::address_serialization::{AddressSerializationMethods, AZTEC_ADDRESS_SERIALIZED_LEN},
    };
    use dep::authwit:: {
        entrypoint::{ EntrypointPayload, ENTRYPOINT_PAYLOAD_SIZE },
        account::AccountActions,
        auth_witness::get_auth_witness,
    };

    use dep::schnorr_account_contract::public_key_note::{PublicKeyNote, PublicKeyNoteMethods, PUBLIC_KEY_NOTE_LEN};

    struct Storage {
        signing_public_key: ImmutableSingleton<PublicKeyNote, PUBLIC_KEY_NOTE_LEN>,
        fee_contract_address: PublicState<AztecAddress, AZTEC_ADDRESS_SERIALIZED_LEN>,
    }

    impl Storage {
        fn init(context: Context) -> Self {
            Storage {
                signing_public_key: ImmutableSingleton::new(context, 1, PublicKeyNoteMethods),
                fee_contract_address: PublicState::new(context, 2, AddressSerializationMethods),
            }
        }
    }

    global ACCOUNT_ACTIONS_STORAGE_SLOT = 3;

    // Constructs the contract
    #[aztec(private)]
    fn constructor(
        signing_pub_key_x: pub Field,
        signing_pub_key_y: pub Field,
        fee_contract_address: pub AztecAddress
    ) {
        let this = context.this_address();
        let mut pub_key_note = PublicKeyNote::new(signing_pub_key_x, signing_pub_key_y, this);
        storage.signing_public_key.initialize(&mut pub_key_note, Option::none(), true);
        let selector = FunctionSelector::from_signature("_set_fee_contract_address((Field))");
        let _void = context.call_public_function(
            context.this_address(),
            selector,
            [fee_contract_address.to_field()]);
    }

    #[aztec(public)]
    internal fn _set_fee_contract_address(fee_contract_address: pub AztecAddress) {
        storage.fee_contract_address.write(fee_contract_address);
    }

    // Note: If you globally change the entrypoint signature don't forget to update default_entrypoint.ts file
    #[aztec(private)]
    fn entrypoint(payload: pub EntrypointPayload) {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.entrypoint(payload);
    }

    #[aztec(private)]
    fn is_valid(message_hash: Field) -> Field {
        let actions = AccountActions::private(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.is_valid(message_hash)
    }

    #[aztec(public)]
    fn is_valid_public(message_hash: Field) -> Field {
        let actions = AccountActions::public(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.is_valid_public(message_hash)
    }

    #[aztec(public)]
    internal fn set_is_valid_storage(message_hash: Field, value: bool) {
        let actions = AccountActions::public(&mut context, ACCOUNT_ACTIONS_STORAGE_SLOT, is_valid_impl);
        actions.internal_set_is_valid_storage(message_hash, value)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, message_hash: Field) -> pub bool {
        // Load public key from storage
        let storage = Storage::init(Context::private(context));
        let public_key = storage.signing_public_key.get_note();
        // Load auth witness
        let witness: [Field; 64] = get_auth_witness(message_hash);
        let mut signature: [u8; 64] = [0; 64];
        for i in 0..64 {
            signature[i] = witness[i] as u8;
        }

        // Verify signature of the payload bytes
        let verification = std::schnorr::verify_signature(
            public_key.x,
            public_key.y,
            signature,
            message_hash.to_be_bytes(32)
        );
        assert(verification == true);
        true
    }

    // Computes notes hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(
        contract_address: AztecAddress,
        nonce: Field,
        storage_slot: Field,
        serialized_note: [Field; PUBLIC_KEY_NOTE_LEN]
    ) -> pub [Field; 4] {
        assert(storage_slot == 1);
        let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
        note_utils::compute_note_hash_and_nullifier(PublicKeyNoteMethods, note_header, serialized_note)
    }
}
