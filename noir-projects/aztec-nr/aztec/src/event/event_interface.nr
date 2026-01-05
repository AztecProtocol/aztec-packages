use crate::event::event_selector::EventSelector;
use protocol_types::{
    constants::DOM_SEP__EVENT_COMMITMENT, hash::poseidon2_hash_with_separator, traits::Serialize,
};

pub trait EventInterface {
    fn get_event_type_id() -> EventSelector;
}

/// A private event's commitment is used to validate that an event was indeed emitted.
///
/// It requires a `randomness` value that must be produced alongside the event in order to perform said validation. This
/// random value prevents attacks in which someone guesses plausible events (e.g. 'Alice transfers to Bob an amount of
/// 10'), since they will not be able to test for existence of their guessed events without brute-forcing the entire
/// `Field` space by guessing `randomness` values.
pub fn compute_private_event_commitment<Event>(event: Event, randomness: Field) -> Field
where
    Event: EventInterface + Serialize,
{
    poseidon2_hash_with_separator(
        [randomness].concat(event.serialize()),
        DOM_SEP__EVENT_COMMITMENT,
    )
}
