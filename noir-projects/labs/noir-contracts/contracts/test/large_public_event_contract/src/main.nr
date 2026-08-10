use aztec::macros::aztec;

/// Tests that events with a serialized length exceeding [`MAX_EVENT_SERIALIZED_LEN`] can be emitted publicly.
/// The private emission size limit does not apply to public logs.
#[aztec]
contract LargePublicEvent {
    use aztec::{macros::{events::event, functions::external}, messages::logs::event::MAX_EVENT_SERIALIZED_LEN};

    #[event]
    pub struct LargeEvent {
        data: [Field; MAX_EVENT_SERIALIZED_LEN + 1],
    }

    #[external("public")]
    fn emit_large_event(data: [Field; MAX_EVENT_SERIALIZED_LEN + 1]) {
        self.emit(LargeEvent { data });
    }
}
