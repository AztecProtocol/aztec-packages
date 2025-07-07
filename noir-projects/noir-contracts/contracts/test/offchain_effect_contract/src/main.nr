use aztec::macros::aztec;

/// This contract is used to test that emitting offchain effects works correctly.
#[aztec]
contract OffchainEffect {
    use aztec::{
        event::event_interface::emit_event_as_offchain_message,
        macros::{events::event, functions::{private, utility}, storage::storage},
        messages::logs::note::encode_and_encrypt_note_and_emit_as_offchain_message,
        note::note_viewer_options::NoteViewerOptions,
        oracle::offchain_effect::emit_offchain_effect,
        protocol_types::{address::AztecAddress, traits::Serialize},
        state_vars::{Map, PrivateSet},
    };
    use uint_note::uint_note::UintNote;

    #[event]
    struct TestEvent {
        pub a: u64,
        pub b: u64,
        pub c: u64,
    }

    // #[derive(Serialize)]
    pub struct EffectPayload {
        pub data: [Field; 5],
        pub next_contract: AztecAddress,
    }

    impl Serialize for EffectPayload {
        let N: u32 = 6; // 5 for data array + 1 for next_contract

        fn serialize(self) -> [Field; Self::N] {
            let mut fields = [0; Self::N];
            
            // Copy data array fields
            for i in 0..5 {
                fields[i] = self.data[i];
            }

            // Add next_contract field
            fields[5] = self.next_contract.serialize()[0];

            fields
        }
    }

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, PrivateSet<UintNote, Context>, Context>,
    }

    #[private]
    fn emit_offchain_effects(effects: BoundedVec<EffectPayload, 6>) {
        if effects.len() > 0 {
            let mut effects = effects;
            let payload = effects.pop();
            // Safety: Offchain effects are by definition unconstrained. They are emitted via an oracle
            // which we don't use for anything besides its side effects, therefore this is safe to call.
            unsafe { emit_offchain_effect(payload.data) };

            if effects.len() > 0 {
                OffchainEffect::at(payload.next_contract).emit_offchain_effects(effects).call(
                    &mut context,
                );
            }
        }
    }

    #[private]
    fn emit_event_as_offchain_message_for_msg_sender(a: u64, b: u64, c: u64) {
        emit_event_as_offchain_message(TestEvent { a, b, c }, &mut context, context.msg_sender());
    }

    #[private]
    fn emit_note_as_offchain_message(value: u128, owner: AztecAddress) {
        let note = UintNote::new(value, owner);

        storage.balances.at(owner).insert(note).emit(
            encode_and_encrypt_note_and_emit_as_offchain_message(
                &mut context,
                context.msg_sender(),
                context.msg_sender(),
            ),
        );
    }

    #[utility]
    unconstrained fn emitting_offchain_effect_from_utility_reverts() {
        emit_offchain_effect([0; 5]);
    }

    #[utility]
    unconstrained fn get_note_value(owner: AztecAddress) -> u128 {
        let notes = storage.balances.at(owner).view_notes(NoteViewerOptions::new());
        assert(notes.len() == 1, "No note found");
        notes.get(0).get_value()
    }
}
