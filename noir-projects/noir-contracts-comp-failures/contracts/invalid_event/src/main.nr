use aztec::macros::aztec;

mod invalid_event;

#[aztec]
contract InvalidEventContract {
    use crate::invalid_event::InvalidEvent;
    use aztec::macros::functions::external;

    // Emitting an oversized event privately should fail at compile time because its serialized length exceeds
    // MAX_EVENT_SERIALIZED_LEN.
    #[external("private")]
    fn trigger_event_check() {
        self.emit(InvalidEvent {});
    }
}
