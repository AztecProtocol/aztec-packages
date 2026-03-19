use aztec::macros::aztec;

#[aztec]
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

    // We have here this function in order for the static_assert in `get_event_type_id` to get triggered.
    #[external("private")]
    fn trigger_event_check() {
        let _ = InvalidEvent::get_event_type_id();
    }
}
