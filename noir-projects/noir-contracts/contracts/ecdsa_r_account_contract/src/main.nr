// Account contract that uses ECDSA signatures for authentication on random version of the p256 curve (to use with touchID).
use dep::aztec::macros::aztec;

#[aztec]
contract EcdsaRAccount {
    use dep::aztec::{
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note,
        macros::{functions::{initializer, noinitcheck, private, view}, storage::storage},
    };
    use dep::aztec::prelude::{PrivateContext, PrivateImmutable};

    use dep::authwit::{
        account::AccountActions,
        auth_witness::get_auth_witness,
        entrypoint::{app::AppPayload, fee::FeePayload},
    };

    use dep::ecdsa_public_key_note::EcdsaPublicKeyNote;

    #[storage]
    struct Storage<Context> {
        public_key: PrivateImmutable<EcdsaPublicKeyNote, Context>,
    }

    // Creates a new account out of an ECDSA public key to use for signature verification
    #[private]
    #[initializer]
    fn constructor(signing_pub_key_x: [u8; 32], signing_pub_key_y: [u8; 32]) {
        let this = context.this_address();
        let mut pub_key_note = EcdsaPublicKeyNote::new(signing_pub_key_x, signing_pub_key_y, this);
        storage.public_key.initialize(&mut pub_key_note).emit(encode_and_encrypt_note(
            &mut context,
            this,
            this,
        ));
    }

    // Note: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts
    #[private]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payload, cancellable);
    }

    #[private]
    #[noinitcheck]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
        // Load public key from storage
        let storage = Storage::init(context);
        let public_key = storage.public_key.get_note();

        // Load auth witness
        /// Safety: The witness is only used as a "magical value" that makes the signature verification below pass.
        /// Hence it's safe.
        let witness: [Field; 64] = unsafe { get_auth_witness(outer_hash) };
        let mut signature: [u8; 64] = [0; 64];
        for i in 0..64 {
            signature[i] = witness[i] as u8;
        }

        // Verify payload signature using Ethereum's signing scheme
        // Note that noir expects the hash of the message/challenge as input to the ECDSA verification.
        let outer_hash_bytes: [u8; 32] = outer_hash.to_be_bytes();
        let hashed_message: [u8; 32] = std::hash::sha256(outer_hash_bytes);
        std::ecdsa_secp256r1::verify_signature(
            public_key.x,
            public_key.y,
            signature,
            hashed_message,
        )
    }
}
