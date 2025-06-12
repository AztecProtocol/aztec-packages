use aztec::macros::aztec;

/// This contract is used to test that emitting offchain messages works correctly.
#[aztec]
contract OffchainMessage {
    use aztec::{
        event::event_interface::emit_event_as_offchain_message,
        macros::{events::event, functions::{private, utility}, storage::storage},
        messages::logs::note::encode_and_encrypt_note_and_emit_as_offchain_message,
        note::note_viewer_options::NoteViewerOptions,
        oracle::offchain_message::emit_offchain_message,
        prelude::{AztecAddress, Map, PrivateSet},
        protocol_types::traits::Serialize,
    };
    use uint_note::uint_note::UintNote;

    #[event]
    struct TestEvent {
        pub a: u64,
        pub b: u64,
        pub c: u64,
    }

    #[derive(Serialize)]
    pub struct MessagePayload {
        pub message: [Field; 5],
        pub recipient: AztecAddress,
        pub next_contract: AztecAddress,
    }

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, PrivateSet<UintNote, Context>, Context>,
    }

    #[private]
    fn emit_offchain_message_for_recipient(messages: BoundedVec<MessagePayload, 6>) {
        if messages.len() > 0 {
            let mut messages = messages;
            let messagePayload = messages.pop();
            emit_offchain_message(messagePayload.message, messagePayload.recipient);

            if messages.len() > 0 {
                OffchainMessage::at(messagePayload.next_contract)
                    .emit_offchain_message_for_recipient(messages)
                    .call(&mut context);
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
    unconstrained fn emitting_offchain_message_from_utility_reverts() {
        emit_offchain_message([0; 5], AztecAddress::zero());
    }

    #[utility]
    unconstrained fn get_note_value(owner: AztecAddress) -> u128 {
        let notes = storage.balances.at(owner).view_notes(NoteViewerOptions::new());
        assert(notes.len() == 1, "No note found");
        notes.get(0).get_value()
    }
}
