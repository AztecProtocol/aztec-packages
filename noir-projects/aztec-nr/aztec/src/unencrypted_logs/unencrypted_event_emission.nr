use crate::{context::PublicContext, event::event_interface::EventInterface};

fn emit<Event, let N: u32>(context: &mut PublicContext, event: Event)
where
    Event: EventInterface<N>,
{
    let selector = Event::get_event_type_id();

    let serialized_event = event.serialize();
    let mut emitted_log = [0; N + 1];

    // We put the selector in the "last" place, to avoid reading or assigning to an expression in an index
    for i in 0..serialized_event.len() {
        emitted_log[i] = serialized_event[i];
    }

    emitted_log[serialized_event.len()] = selector.to_field();

    context.emit_unencrypted_log(emitted_log);
}

pub fn encode_event<Event, let N: u32>(
    context: &mut PublicContext,
) -> fn[(&mut PublicContext,)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| { emit(context, e); }
}
