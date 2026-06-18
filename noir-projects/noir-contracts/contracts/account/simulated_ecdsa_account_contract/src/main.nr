use aztec::macros::aztec;

// Stub account contract for ECDSA accounts (both secp256k1 and secp256r1) used during simulation.
// Matches the constructor signature of EcdsaKAccount / EcdsaRAccount so that deployment
// simulations using this stub as an override do not fail on selector lookup.
// Mirrors the EcdsaKAccount/EcdsaRAccount storage layout so simulation sync can decode
// the real account's signing_public_key note.
#[aztec]
pub contract SimulatedEcdsaAccount {
    use aztec::{
        authwit::{account::AccountActions, auth::IS_VALID_SELECTOR, entrypoint::app::AppPayload},
        context::PrivateContext,
        macros::{functions::{allow_phase_change, external, view}, storage::storage},
        messages::encoding::MESSAGE_CIPHERTEXT_LEN,
        oracle::random::random,
        state_vars::SinglePrivateImmutable,
    };

    use ecdsa_public_key_note::EcdsaPublicKeyNote;

    #[storage]
    struct Storage<Context> {
        signing_public_key: SinglePrivateImmutable<EcdsaPublicKeyNote, Context>,
    }

    // Stub constructor matching the EcdsaKAccount / EcdsaRAccount constructor signature.
    // Does NOT use #[initializer] so that the macro does not inject
    // assert_initialization_matches_address_preimage_private, which would fail during kernelless
    // simulation because the stub instance has a different initialization hash than the real account.
    // Emits the same shape of side effects as the real constructor (one nullifier for
    // SinglePrivateImmutable initialization, one note hash for the key note, and one private
    // log tied to that note hash) so that gas estimation produces accurate results.
    #[external("private")]
    fn constructor(_signing_pub_key_x: [u8; 32], _signing_pub_key_y: [u8; 32]) {
        // Safety: Random seeds are only used to produce dummy side effects that match the shape of
        // the real EcdsaKAccount / EcdsaRAccount constructor. The values are never constrained or
        // used for any security purpose.
        let seed = unsafe { random() };

        // Emit the initialization nullifier for the contract itself.
        self.context.push_nullifier_unsafe(seed);

        // Emit the initialization nullifier for the signing_public_key SinglePrivateImmutable.
        self.context.push_nullifier_unsafe(seed + 1);

        // Emit the note hash for the signing key note.
        self.context.push_note_hash(seed + 2);

        // Emit a private log tied to the note hash, matching the length of a real note delivery
        // log (MESSAGE_CIPHERTEXT_LEN fields). The signing key note is a SinglePrivateImmutable
        // and is therefore never nullified, so in practice the log will never be squashed. We
        // pass the note hash counter anyway for correctness.
        let dummy_log: [Field; MESSAGE_CIPHERTEXT_LEN] = [seed + 2; MESSAGE_CIPHERTEXT_LEN];
        self.context.emit_raw_note_log_unsafe(
            seed + 3,
            BoundedVec::from_array(dummy_log),
            self.context.side_effect_counter,
        );
    }

    // @dev: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts
    #[external("private")]
    #[allow_phase_change]
    fn entrypoint(app_payload: AppPayload, fee_payment_method: u8) {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payment_method);
    }

    #[external("private")]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        IS_VALID_SELECTOR
    }

    #[contract_library_method]
    fn is_valid_impl(_context: &mut PrivateContext, _outer_hash: Field) -> bool {
        true
    }
}
