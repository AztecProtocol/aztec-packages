//! Event mocking utilities.

use crate::{
    event::{
        event_emission::NewEvent, event_interface::EventInterface, event_selector::EventSelector,
    },
    oracle::random::random,
};

use dep::protocol_types::traits::{FromField, Serialize};

#[derive(Eq, Serialize)]
pub(crate) struct MockEvent {
    pub(crate) value: Field,
}

impl EventInterface for MockEvent {
    fn get_event_type_id() -> EventSelector {
        // randomly chosen event type id --> has to fit within 32 bits
        EventSelector::from_field(89)
    }
}

pub(crate) struct MockEventBuilder {
    value: Field,
    randomness: Option<Field>,
}

impl MockEventBuilder {
    pub(crate) fn new(value: Field) -> Self {
        MockEventBuilder { value, randomness: Option::none() }
    }

    pub(crate) fn randomness(&mut self, randomness: Field) -> &mut Self {
        self.randomness = Option::some(randomness);
        self
    }

    pub(crate) fn build_event(self) -> MockEvent {
        MockEvent { value: self.value }
    }

    pub(crate) fn build_new_event(self) -> NewEvent<MockEvent> {
        NewEvent {
            event: self.build_event(),
            randomness: self.randomness.unwrap_or(
                // Safety: this is meant to be used in tests.
                unsafe { random() },
            ),
        }
    }
}

impl MockEvent {
    pub(crate) fn new(value: Field) -> MockEventBuilder {
        MockEventBuilder::new(value)
    }
}
