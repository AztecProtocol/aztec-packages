use crate::event::{event_emission::emit_event_in_private, event_interface::EventInterface};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_event::MockEvent};
use protocol_types::traits::Serialize;

global VALUE: Field = 7;

#[test]
unconstrained fn emit_and_discover_event() {
    let mut env = TestEnvironment::new();

    let recipient = env.create_light_account();

    let event = MockEvent::new(VALUE).build_event();

    let event_message = env.private_context(|context| emit_event_in_private(context, event));

    env.discover_event(event_message, recipient);

    let events = crate::test::helpers::txe_oracles::get_private_events(
        MockEvent::get_event_type_id(),
        TestEnvironment::get_default_address(),
        recipient,
    );

    assert_eq(events.len(), 1);
    assert_eq(events.get(0), BoundedVec::from_array(event.serialize()));
}

#[test]
unconstrained fn emit_and_discover_multiple_events() {
    let mut env = TestEnvironment::new();

    let recipient = env.create_light_account();

    let event = MockEvent::new(VALUE).build_event();
    let other_event = MockEvent::new(VALUE + 1).build_event();

    let event_messages = env.private_context(|context| {
        (emit_event_in_private(context, event), emit_event_in_private(context, other_event))
    });

    env.discover_event(event_messages.0, recipient);
    env.discover_event(event_messages.1, recipient);

    let events = crate::test::helpers::txe_oracles::get_private_events(
        MockEvent::get_event_type_id(),
        TestEnvironment::get_default_address(),
        recipient,
    );

    assert_eq(events.len(), 2);
    assert(events.any(|ev| ev == BoundedVec::from_array(event.serialize())));
    assert(events.any(|ev| ev == BoundedVec::from_array(other_event.serialize())));
}

#[test]
unconstrained fn emit_and_discover_same_event_multiple_times() {
    let mut env = TestEnvironment::new();

    let recipient = env.create_light_account();

    let event = MockEvent::new(VALUE).build_event();

    let event_message = env.private_context(|context| emit_event_in_private(context, event));

    env.discover_event(event_message, recipient);
    env.discover_event(event_message, recipient);

    let events = crate::test::helpers::txe_oracles::get_private_events(
        MockEvent::get_event_type_id(),
        TestEnvironment::get_default_address(),
        recipient,
    );

    assert_eq(events.len(), 1);
    assert_eq(events.get(0), BoundedVec::from_array(event.serialize()));
}

#[test]
unconstrained fn emit_and_fail_to_discover_event_as_other_recipient() {
    let mut env = TestEnvironment::new();

    let recipient = env.create_light_account();
    let other_recipient = env.create_light_account();

    let event = MockEvent::new(VALUE).build_event();

    let event_message = env.private_context(|context| emit_event_in_private(context, event));

    env.discover_event(event_message, recipient);

    let events = crate::test::helpers::txe_oracles::get_private_events(
        MockEvent::get_event_type_id(),
        TestEnvironment::get_default_address(),
        other_recipient,
    );

    assert_eq(events.len(), 0);
}

#[test]
unconstrained fn emit_and_discover_event_multiple_recipients() {
    let mut env = TestEnvironment::new();

    let recipient = env.create_light_account();
    let other_recipient = env.create_light_account();

    let event = MockEvent::new(VALUE).build_event();

    let event_message = env.private_context(|context| emit_event_in_private(context, event));

    env.discover_event(event_message, recipient);
    env.discover_event(event_message, other_recipient);

    let events = crate::test::helpers::txe_oracles::get_private_events(
        MockEvent::get_event_type_id(),
        TestEnvironment::get_default_address(),
        recipient,
    );

    assert_eq(events.len(), 1);
    assert_eq(events.get(0), BoundedVec::from_array(event.serialize()));
}
