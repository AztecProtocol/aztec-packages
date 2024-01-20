mod public_key_note;

// Account contract that uses Schnorr signatures for authentication.
// The signing key is stored in an immutable private note and should be different from the encryption/nullifying key.
contract SchnorrAccount {
    use dep::std;

    use dep::aztec::protocol_types::address::AztecAddress;

    use dep::aztec::{
        context::{PrivateContext, Context},
        note::{ note_header::NoteHeader, utils as note_utils },
        oracle::get_public_key::get_public_key,
        state_vars::{immutable_singleton::ImmutableSingleton, singleton::Singleton}
    };

    use dep::address_note::address_note::{
        AddressNote,
        AddressNoteMethods,
        ADDRESS_NOTE_LEN,
    };

    use dep::authwit:: {
        entrypoint::{ EntrypointPayload, ENTRYPOINT_PAYLOAD_SIZE },
        account::AccountActions,
        auth_witness::get_auth_witness,
    };

    use crate::public_key_note::{PublicKeyNote, PublicKeyNoteMethods, PUBLIC_KEY_NOTE_LEN};

    struct Storage {
        // docs:start:storage
        signing_public_key: ImmutableSingleton<PublicKeyNote, PUBLIC_KEY_NOTE_LEN>,
        // docs:end:storage
        fee_contract_address: Singleton<AddressNote, ADDRESS_NOTE_LEN>,
    }

    impl Storage {
        fn init(context: Context) -> Self {
            Storage {
                // docs:start:storage_init
                signing_public_key: ImmutableSingleton::new(context, 1, PublicKeyNoteMethods),
                fee_contract_address: Singleton::new(context, 2, AddressNoteMethods),
                // docs:end:storage_init
            }
        }
    }

    global ACCOUNT_ACTIONS_STORAGE_SLOT = 3;

    // Constructs the contract
    #[aztec(private)]
    fn constructor(signing_pub_key_x: pub Field, signing_pub_key_y: pub Field) {
        let this = context.this_address();
        // docs:start:initialize
        let mut pub_key_note = PublicKeyNote::new(signing_pub_key_x, signing_pub_key_y, this);
        storage.signing_public_key.initialize(&mut pub_key_note, Option::none(), true);
        let mut address_note = AddressNote::new(AztecAddress::zero(), this);
        storage.fee_contract_address.initialize(&mut address_note, Option::none(), true);
        // docs:end:initialize
    }

    // Sets the fee contract address
    #[aztec(private)]
    fn set_fee_contract_address(fee_contract_address: AztecAddress) {
        let this = context.this_address();
        let mut address_note = AddressNote::new(fee_contract_address, this);
        storage.fee_contract_address.replace(&mut address_note, true);
    }

    // Note: If you globally change the entrypoint signature don't forget to update default_entrypoint.ts file
    #[aztec(private)]
    fn entrypoint(payload: pub EntrypointPayload) {
        let note = storage.fee_contract_address.get_note(true);
        context.fee_variables.fee_preparation_address = note.address;
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
        // docs:start:entrypoint
        // Load public key from storage
        let storage = Storage::init(Context::private(context));
        // docs:start:get_note
        let public_key = storage.signing_public_key.get_note();
        // docs:end:get_note
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
        // docs:end:entrypoint
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
        let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
        assert((storage_slot == 1) | (storage_slot == 2));
        if (storage_slot == 1) {
            note_utils::compute_note_hash_and_nullifier(PublicKeyNoteMethods, note_header, serialized_note)
        } else {
            note_utils::compute_note_hash_and_nullifier(AddressNoteMethods, note_header, serialized_note)
        }
    }
}
