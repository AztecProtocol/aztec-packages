use aztec::macros::aztec;

#[aztec]
<<<<<<< HEAD
pub contract InvalidEventContract {
    use aztec::{
        event::event_interface::EventInterface,
        macros::{events::event, functions::external},
        messages::logs::event::MAX_EVENT_SERIALIZED_LEN,
        protocol::{traits::Serialize, utils::writer::Writer},
    };

    #[event]
    pub struct InvalidEvent {}

    impl Serialize for InvalidEvent {
        let N: u32 = MAX_EVENT_SERIALIZED_LEN + 1;

        fn serialize(self) -> [Field; Self::N] {
            std::mem::zeroed()
        }

        fn stream_serialize<let K: u32>(self, _writer: &mut Writer<K>) {}
    }
=======
contract InvalidEventContract {
    use crate::invalid_event::InvalidEvent;
    use aztec::{macros::functions::external, messages::message_delivery::MessageDelivery};
>>>>>>> ed8f9f9272 (feat: move event size check from declaration to private emission (#22168))

    // Emitting an oversized event privately should fail at compile time because its serialized length exceeds
    // MAX_EVENT_SERIALIZED_LEN.
    #[external("private")]
    fn trigger_event_check() {
        self.emit(InvalidEvent {}).deliver_to(
            self.msg_sender(),
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );
    }
}
