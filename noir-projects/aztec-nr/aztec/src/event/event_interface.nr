use dep::protocol_types::abis::event_selector::EventSelector;

pub trait EventInterface {
    fn get_event_type_id() -> EventSelector;

    fn emit<Env>(self, _emit: fn[Env](Self) -> ()) {
        _emit(self);
    }
}
