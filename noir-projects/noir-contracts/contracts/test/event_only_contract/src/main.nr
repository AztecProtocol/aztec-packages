use aztec::macros::aztec;

/// This contract is used to test that the private event synchronization is working correctly even when the contract
/// doesn't use notes.
#[aztec]
contract EventOnly {
    use aztec::{
        event::event_interface::{emit_event_in_private_log, PrivateLogContent},
        macros::{events::event, functions::private},
    };

    #[event]
    struct TestEvent {
        value: Field,
    }

    #[private]
    fn emit_event_for_msg_sender(value: Field) {
        let sender = context.msg_sender();
        emit_event_in_private_log(
            TestEvent { value },
            &mut context,
            sender,
            sender,
            PrivateLogContent.NO_CONSTRAINTS,
        );
    }
}
