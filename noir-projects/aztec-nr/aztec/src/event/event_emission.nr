use crate::{
    context::{PrivateContext, PublicContext},
    event::{event_interface::{compute_private_event_commitment, EventInterface}, EventMessage},
    oracle::random::random,
};
use crate::protocol::{constants::DOM_SEP__EVENT_LOG_TAG, hash::compute_log_tag, traits::{Serialize, ToField}};

/// An event that was emitted in the current contract call.
pub struct NewEvent<Event> {
    pub(crate) event: Event,
    pub(crate) randomness: Field,
}

/// Equivalent to `self.emit(event)`: see [`crate::contract_self::ContractSelfPrivate::emit`].
pub fn emit_event_in_private<Event>(context: &mut PrivateContext, event: Event) -> EventMessage<Event>
where
    Event: EventInterface + Serialize,
{
    // In private events, we automatically inject randomness to prevent event commitment preimage attacks and event
    // commitment collisions (the commitments are included in the nullifier tree and duplicate nullifiers are by
    // definition not allowed).

    // Safety: We use the randomness to preserve the privacy of the event recipient by preventing brute-forcing, so a
    // malicious sender could use non-random values to make the event less private. But they already know the full
    // event pre-image anyway, and so the recipient already trusts them to not disclose this information. We can
    // therefore assume that the sender will cooperate in the random value generation.
    let randomness = unsafe { random() };

    // The event commitment is emitted as a nullifier instead of as a note because these are simpler: nullifiers cannot
    // be squashed, making kernel processing simpler, and they have no nonce that recipients need to discover.
    let commitment = compute_private_event_commitment(event, randomness);
    context.push_nullifier(commitment);

    EventMessage::new(NewEvent { event, randomness }, context)
}

/// Equivalent to `self.emit(event)`: see [`crate::contract_self::ContractSelfPublic::emit`].
pub fn emit_event_in_public<Event>(context: PublicContext, event: Event)
where
    Event: EventInterface + Serialize,
{
    // We prepend a domain-separated tag derived from the event type ID so that clients can filter for specific
    // events without scanning all public logs.
    let log_tag = compute_log_tag(
        Event::get_event_type_id().to_field(),
        DOM_SEP__EVENT_LOG_TAG,
    );
    context.emit_public_log_unsafe(log_tag, event);
}
