use aztec::macros::aztec;

mod invalid_event;

#[aztec]
contract InvalidEventContract {
    use crate::invalid_event::InvalidEvent;
    use aztec::{macros::functions::external, messages::message_delivery::MessageDelivery};

    // Emitting an oversized event privately should fail at compile time because its serialized length exceeds
    // MAX_EVENT_SERIALIZED_LEN.
    #[external("private")]
    fn trigger_event_check() {
        self.emit(InvalidEvent {}).deliver_to(
            self.msg_sender(),
            MessageDelivery::onchain_unconstrained(),
        );
    }
}
