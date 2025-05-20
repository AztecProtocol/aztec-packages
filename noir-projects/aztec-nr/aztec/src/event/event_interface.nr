use crate::context::PublicContext;
use dep::protocol_types::{abis::event_selector::EventSelector, traits::{Serialize, ToField}};

pub trait EventInterface {
    fn get_event_type_id() -> EventSelector;

    fn emit<Env>(self, _emit: fn[Env](Self) -> ()) {
        _emit(self);
    }

    fn emit_in_public_log<let N: u32>(self, context: &mut PublicContext)
    where
        Self: Serialize<N>,
    {
        let selector = Self::get_event_type_id();

        let serialized_event = self.serialize();

        let mut log_content = [0; N + 1];

        // We put the selector in the "last" place, to avoid reading or assigning to an expression in an index
        for i in 0..serialized_event.len() {
            log_content[i] = serialized_event[i];
        }

        log_content[serialized_event.len()] = selector.to_field();

        context.emit_public_log(log_content);
    }
}
