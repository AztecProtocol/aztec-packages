use aztec::macros::aztec;

/// This contract is used to test that the private event synchronization is working correctly even when the contract
/// doesn't use notes.
#[aztec]
contract EventOnly {
    use aztec::{
        event::event_emission::emit_event_in_private,
        macros::{events::event, functions::private},
        messages::message_delivery::MessageDelivery,
    };

    #[event]
    struct TestEvent {
        value: Field,
    }

    #[private]
    fn emit_event_for_msg_sender(value: Field) {
        let sender = context.msg_sender();
        emit_event_in_private(
            TestEvent { value },
            &mut context,
            sender,
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );
    }
}
