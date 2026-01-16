use crate::{event::event_selector::EventSelector, messages::logs::event::MAX_EVENT_SERIALIZED_LEN};
use protocol_types::{
    constants::DOM_SEP__EVENT_COMMITMENT,
    hash::{poseidon2_hash_with_separator, poseidon2_hash_with_separator_bounded_vec},
    traits::{Serialize, ToField},
};

pub trait EventInterface {
    fn get_event_type_id() -> EventSelector;
}

/// A private event's commitment is a value stored on-chain which is used to verify that the event was indeed emitted.
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
        [randomness, Event::get_event_type_id().to_field()].concat(event.serialize()),
        DOM_SEP__EVENT_COMMITMENT,
    )
}

/// Unconstrained variant of [compute_private_event_commitment] which takes the event in serialized form.
///
/// This function is unconstrained as the mechanism it uses to compute the commitment would be very inefficient in a
/// constrained environment (due to the hashing of a dynamically sized array). This is not an issue as it is typically
/// invoked when processing event messages, which is an unconstrained operation.
pub unconstrained fn compute_private_serialized_event_commitment(
    serialized_event: BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN>,
    randomness: Field,
    event_type_id: Field,
) -> Field {
    let mut commitment_preimage =
        BoundedVec::<_, 1 + MAX_EVENT_SERIALIZED_LEN>::from_array([randomness, event_type_id]);
    commitment_preimage.extend_from_bounded_vec(serialized_event);

    poseidon2_hash_with_separator_bounded_vec(commitment_preimage, DOM_SEP__EVENT_COMMITMENT)
}

mod test {
    use crate::event::event_interface::{
        compute_private_event_commitment, compute_private_serialized_event_commitment,
        EventInterface,
    };
    use crate::test::mocks::mock_event::MockEvent;
    use protocol_types::traits::{Serialize, ToField};

    global VALUE: Field = 7;
    global RANDOMNESS: Field = 10;

    #[test]
    unconstrained fn event_commitment_equivalence() {
        let event = MockEvent::new(VALUE).build_event();

        assert_eq(
            compute_private_event_commitment(event, RANDOMNESS),
            compute_private_serialized_event_commitment(
                BoundedVec::from_array(event.serialize()),
                RANDOMNESS,
                MockEvent::get_event_type_id().to_field(),
            ),
        );
    }
}
