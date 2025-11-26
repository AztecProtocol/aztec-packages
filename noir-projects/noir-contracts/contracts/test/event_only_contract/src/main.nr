use aztec::macros::aztec;

/// This contract is used to test that the private event synchronization is working correctly even when the contract
/// doesn't use notes.
#[aztec]
contract EventOnly {
    use aztec::{
        macros::{events::event, functions::external},
        messages::message_delivery::MessageDelivery,
    };

    #[event]
    struct TestEvent {
        value: Field,
    }

    #[external("private")]
    fn emit_event_for_msg_sender(value: Field) {
        let sender = self.msg_sender().unwrap();
        self.emit(TestEvent { value }, sender, MessageDelivery.UNCONSTRAINED_ONCHAIN);
    }
}
