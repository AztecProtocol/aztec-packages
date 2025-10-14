use aztec::macros::aztec;

#[aztec]
pub contract TestLog {
    use aztec::{
        event::event_emission::{emit_event_in_private, emit_event_in_public},
        macros::{events::event, functions::{private, public}, storage::storage},
        messages::message_delivery::MessageDelivery,
        oracle::random::random,
        protocol_types::{address::AztecAddress, traits::FromField},
        state_vars::PrivateSet,
    };
    use value_note::value_note::ValueNote;

    #[event]
    struct ExampleEvent0 {
        value0: Field,
        value1: Field,
    }

    #[event]
    struct ExampleEvent1 {
        value2: AztecAddress,
        value3: u8,
    }

    #[storage]
    struct Storage<Context> {
        example_set: PrivateSet<ValueNote, Context>,
    }

    #[private]
    fn emit_encrypted_events(other: AztecAddress, preimages: [Field; 4]) {
        let event0 = ExampleEvent0 { value0: preimages[0], value1: preimages[1] };

        emit_event_in_private(
            event0,
            &mut context,
            context.msg_sender(),
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );

        // We duplicate the emission, but swapping the sender and recipient:
        emit_event_in_private(
            event0,
            &mut context,
            other,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );

        let event1 = ExampleEvent1 {
            value2: AztecAddress::from_field(preimages[2]),
            value3: preimages[3] as u8,
        };

        emit_event_in_private(
            event1,
            &mut context,
            context.msg_sender(),
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[public]
    fn emit_unencrypted_events(preimages: [Field; 4]) {
        emit_event_in_public(
            ExampleEvent0 { value0: preimages[0], value1: preimages[1] },
            &mut context,
        );

        emit_event_in_public(
            ExampleEvent1 {
                value2: AztecAddress::from_field(preimages[2]),
                value3: preimages[3] as u8,
            },
            &mut context,
        );
    }

    #[private]
    fn emit_encrypted_events_nested(other: AztecAddress, num_nested_calls: u32) {
        // Safety: We use the following just as an arbitrary test value
        let random_value_0 = unsafe { random() };
        // Safety: We use the following just as an arbitrary test value
        let random_value_1 = unsafe { random() };
        // Safety: We use the following just as an arbitrary test value
        let random_value_2 = unsafe { random() };
        // Safety: We use the following just as an arbitrary test value
        let random_value_3 = unsafe { random() };

        emit_event_in_private(
            ExampleEvent0 { value0: random_value_0, value1: random_value_1 },
            &mut context,
            other,
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );

        emit_event_in_private(
            ExampleEvent0 { value0: random_value_2, value1: random_value_3 },
            &mut context,
            other,
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );

        if num_nested_calls > 0 {
            TestLog::at(context.this_address())
                .emit_encrypted_events_nested(other, num_nested_calls - 1)
                .call(&mut context);
        }
    }
}
