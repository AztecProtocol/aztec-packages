use aztec::macros::aztec;

/// This contract is used to test that the private event synchronization is working correctly even when the contract
/// doesn't use notes.
#[aztec]
contract EventOnly {
    use aztec::{
        event::event_interface::EventInterface,
        macros::{events::event, functions::private},
        messages::logs::event::encode_and_encrypt_event_unconstrained,
        protocol_types::traits::Serialize,
    };
    use std::meta::derive;

    #[derive(Serialize)]
    #[event]
    struct TestEvent {
        value: Field,
    }

    #[private]
    fn emit_event_for_msg_sender(value: Field) {
        let sender = context.msg_sender();
        TestEvent { value }.emit(encode_and_encrypt_event_unconstrained(
            &mut context,
            sender,
            sender,
        ));
    }
}
