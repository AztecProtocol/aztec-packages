use aztec::{
    macros::events::event,
    messages::logs::event::MAX_EVENT_SERIALIZED_LEN,
    protocol::traits::Serialize,
};

#[event]
pub struct InvalidEvent {
}

impl Serialize<{MAX_EVENT_SERIALIZED_LEN + 1}> for InvalidEvent {
    fn serialize(self) -> [Field; MAX_EVENT_SERIALIZED_LEN + 1] {
        std::mem::zeroed()
    }
}
