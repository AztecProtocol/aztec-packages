use crate::{
    context::{PrivateContext, PublicContext},
    messages::logs::{event::to_encrypted_private_event_message, utils::prefix_with_tag},
};
use dep::protocol_types::{
    abis::event_selector::EventSelector,
    address::AztecAddress,
    traits::{Serialize, ToField},
};

// TODO(#11571): with decryption happening in Noir we can now use the Packable trait instead.

pub fn emit_event_in_private_log<Event, let N: u32>(
    event: Event,
    context: &mut PrivateContext,
    sender: AztecAddress,
    recipient: AztecAddress,
)
where
    Event: EventInterface + Serialize<N>,
{
    let ciphertext = to_encrypted_private_event_message(event, recipient);
    let log_content = prefix_with_tag(ciphertext, sender, recipient);

    context.emit_private_log(log_content, log_content.len());
}

pub fn emit_event_in_public_log<Event, let N: u32>(event: Event, context: &mut PublicContext)
where
    Event: EventInterface + Serialize<N>,
{
    let mut log_content = [0; N + 1];

    let serialized_event = event.serialize();
    for i in 0..serialized_event.len() {
        log_content[i] = serialized_event[i];
    }

    // We put the selector in the "last" place, to avoid reading or assigning to an expression in an index
    log_content[serialized_event.len()] = Event::get_event_type_id().to_field();

    context.emit_public_log(log_content);
}

pub trait EventInterface {
    fn get_event_type_id() -> EventSelector;

    fn emit<Env>(self, _emit: fn[Env](Self) -> ()) {
        _emit(self);
    }
}
