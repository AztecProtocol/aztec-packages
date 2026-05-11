use aztec::{
    macros::events::event,
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
