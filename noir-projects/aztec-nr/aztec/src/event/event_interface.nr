use crate::event::event_selector::EventSelector;

pub trait EventInterface {
    fn get_event_type_id() -> EventSelector;
}
