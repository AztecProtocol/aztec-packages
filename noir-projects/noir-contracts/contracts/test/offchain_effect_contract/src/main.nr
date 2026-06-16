mod test;

use aztec::macros::aztec;

/// This contract is used to test that emitting offchain effects works correctly.
#[aztec]
contract OffchainEffect {
    use aztec::{
        macros::{events::event, functions::{external, view}, storage::storage},
        messages::{
            delivery::MessageDelivery, encoding::MESSAGE_CIPHERTEXT_LEN, offchain_messages::deliver_offchain_message,
        },
        note::note_viewer_options::NoteViewerOptions,
        oracle::offchain_effect::emit_offchain_effect,
        protocol::{address::AztecAddress, traits::{Deserialize, Serialize}},
        state_vars::{Owned, PrivateSet},
    };
    use uint_note::UintNote;

    #[event]
    struct TestEvent {
        pub a: u64,
        pub b: u64,
        pub c: u64,
    }

    #[derive(Deserialize, Serialize)]
    pub struct EffectPayload {
        pub data: [Field; 5],
        pub next_contract: AztecAddress,
    }

    #[storage]
    struct Storage<Context> {
        balances: Owned<PrivateSet<UintNote, Context>, Context>,
    }

    #[external("private")]
    fn emit_offchain_effects(effects: BoundedVec<EffectPayload, 6>) {
        if effects.len() > 0 {
            let mut effects = effects;
            let payload = effects.pop();
            // Safety: Offchain effects are by definition unconstrained. They are emitted via an oracle
            // which we don't use for anything besides its side effects, therefore this is safe to call.
            unsafe { emit_offchain_effect(payload.data) };

            if effects.len() > 0 {
                OffchainEffect::at(payload.next_contract).emit_offchain_effects(effects).call(self.context);
            }
        }
    }

    #[external("private")]
    fn emit_event_as_offchain_message_for_msg_sender(a: u64, b: u64, c: u64) {
        self.emit(TestEvent { a, b, c }).deliver_to(self.msg_sender(), MessageDelivery::offchain());
    }

    #[external("private")]
    fn emit_note_as_offchain_message(value: u128, owner: AztecAddress) {
        let note = UintNote { value };

        self.storage.balances.at(owner).insert(note).deliver_to(self.msg_sender(), MessageDelivery::offchain());
    }

    /// Emits a single offchain message in a regular (non-static) private call. The matching
    /// view function below lets tests contrast the two call shapes.
    #[external("private")]
    fn call_deliver_offchain_message(ciphertext: [Field; MESSAGE_CIPHERTEXT_LEN], recipient: AztecAddress) {
        deliver_offchain_message(ciphertext, recipient);
    }

    /// Static variant of `call_deliver_offchain_message`. Used to verify that TXE correctly captures and exposes the
    /// call context
    /// of offchain effects emitted during a static call.
    #[external("private")]
    #[view]
    fn view_deliver_offchain_message(ciphertext: [Field; MESSAGE_CIPHERTEXT_LEN], recipient: AztecAddress) {
        deliver_offchain_message(ciphertext, recipient);
    }

    #[external("utility")]
    unconstrained fn emitting_offchain_effect_from_utility_reverts() {
        emit_offchain_effect([0; 5]);
    }

    #[external("utility")]
    unconstrained fn get_note_value(owner: AztecAddress) -> u128 {
        let notes = self.storage.balances.at(owner).view_notes(NoteViewerOptions::new());
        assert(notes.len() == 1, "No note found");
        notes.get(0).value
    }
}
