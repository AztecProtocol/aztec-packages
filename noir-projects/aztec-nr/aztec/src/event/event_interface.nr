use dep::protocol_types::abis::event_selector::EventSelector;
use dep::protocol_types::traits::Serialize;

pub trait EventInterface<let N: u32>: Serialize<N> {
    fn get_event_type_id() -> EventSelector;
    fn emit<Env>(self, emit: fn[Env](Self) -> ());
}
