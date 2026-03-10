use aztec::macros::aztec;

mod invalid_event;

#[aztec]
pub contract InvalidEventContract {
    use crate::invalid_event::InvalidEvent;
    use aztec::{event::event_interface::EventInterface, macros::functions::external};

    // We have here this function in order for the static_assert in `get_event_type_id` to get triggered.
    #[external("private")]
    fn trigger_event_check() {
        let _ = InvalidEvent::get_event_type_id();
    }
}
