mod public_key_note;

use aztec::macros::aztec;

// Stub account contract for Schnorr accounts used during simulation.
// Matches the constructor signature of SchnorrAccount so that deployment
// simulations using this stub as an override do not fail on selector lookup.
// Mirrors the SchnorrAccount storage layout so simulation sync can decode
// the real account's signing_public_key note.
#[aztec]
pub contract SimulatedSchnorrAccount {
    use aztec::{
        authwit::{account::AccountActions, auth::IS_VALID_SELECTOR, entrypoint::app::AppPayload},
        context::PrivateContext,
        macros::{functions::{allow_phase_change, external, view}, storage::storage},
        messages::encoding::MESSAGE_CIPHERTEXT_LEN,
        oracle::random::random,
        state_vars::SinglePrivateImmutable,
    };

    use crate::public_key_note::PublicKeyNote;

    #[storage]
    struct Storage<Context> {
        signing_public_key: SinglePrivateImmutable<PublicKeyNote, Context>,
    }

    // Stub constructor matching the SchnorrAccount constructor signature.
    // Does NOT use #[initializer] so that the macro does not inject
    // assert_initialization_matches_address_preimage_private, which would fail during kernelless
    // simulation because the stub instance has a different initialization hash than the real account.
    // Emits side effects matching the *shape* of the real SchnorrAccount constructor (the key-note storage
    // plus the constrained-delivery handshake bootstrap it triggers) so that kernelless gas estimation
    // produces accurate results. See the body for the per-effect breakdown and the coupling this creates.
    #[external("private")]
    fn constructor(_signing_pub_key_x: Field, _signing_pub_key_y: Field) {
        // Safety: Random seeds are only used to produce dummy side effects that match the shape of
        // the real SchnorrAccount constructor. The values are never constrained or used for any
        // security purpose.
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

        // The real constructor delivers the key note with `MessageDelivery::onchain_unconstrained()`, and a
        // first send bootstraps a handshake: a nested call to `HandshakeRegistry::non_interactive_handshake`
        // inserts a handshake note (note hash + initialization nullifier) and emits two logs (the note-delivery
        // log and the recipient discovery log), and the constrained send emits a chain nullifier. We reproduce
        // only the shape of those side effects so gas estimation stays accurate without running the real
        // handshake.
        //
        // This couples the stub to constrained delivery's emitted shape: if the handshake bootstrap or
        // chain-nullifier emission changes, update these dummies to match or the gas-parity assertion in
        // e2e_kernelless_simulation.test.ts will fail.

        // Handshake note hash and its initialization nullifier.
        self.context.push_note_hash(seed + 4);
        self.context.push_nullifier_unsafe(seed + 5);

        // Chain nullifier emitted by the constrained send.
        self.context.push_nullifier_unsafe(seed + 6);

        // Handshake note-delivery log and recipient discovery log.
        let dummy_handshake_note_log: [Field; MESSAGE_CIPHERTEXT_LEN] = [seed + 7; MESSAGE_CIPHERTEXT_LEN];
        self.context.emit_private_log_unsafe(seed + 8, BoundedVec::from_array(dummy_handshake_note_log));
        let dummy_handshake_discovery_log: [Field; MESSAGE_CIPHERTEXT_LEN] = [seed + 9; MESSAGE_CIPHERTEXT_LEN];
        self.context.emit_private_log_unsafe(seed + 10, BoundedVec::from_array(dummy_handshake_discovery_log));
    }

    // @dev: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts
    #[external("private")]
    #[allow_phase_change]
    fn entrypoint(app_payload: AppPayload, fee_payment_method: u8, cancellable: bool) {
        let actions = AccountActions::init(self.context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payment_method, cancellable);
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
