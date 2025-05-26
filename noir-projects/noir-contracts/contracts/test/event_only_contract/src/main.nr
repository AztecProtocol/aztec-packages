use aztec::macros::aztec;

/// This contract is used to test that the event emission is working correctly even when the contract doesn't work with
/// notes.
#[aztec]
contract EventOnly {
    use aztec::event::event_interface::EventInterface;
    use aztec::macros::{
        events::event,
        functions::{initializer, private, public, utility},
        storage::storage,
    };
    use aztec::messages::logs::event::encode_and_encrypt_event_unconstrained;
    use aztec::protocol_types::traits::Serialize;
    use std::meta::derive;

    #[derive(Serialize)]
    #[event]
    struct TestEvent {
        value: Field,
    }

    #[private]
    fn emit_event_for_msg_sender() {
        let sender = context.msg_sender();
        TestEvent { value: 42 }.emit(encode_and_encrypt_event_unconstrained(
            &mut context,
            sender,
            sender,
        ));
    }
}
