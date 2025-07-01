use aztec::macros::aztec;

#[aztec]
pub contract TestLog {
    use aztec::{
        event::event_interface::{
            emit_event_in_private_log, emit_event_in_public_log, PrivateLogContent,
        },
        macros::{events::event, functions::{private, public}, storage::storage},
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

        emit_event_in_private_log(
            event0,
            &mut context,
            other,
            context.msg_sender(),
            PrivateLogContent.CONSTRAINED_ENCRYPTION,
        );

        // We duplicate the emission, but swapping the sender and recipient:
        emit_event_in_private_log(
            event0,
            &mut context,
            context.msg_sender(),
            other,
            PrivateLogContent.CONSTRAINED_ENCRYPTION,
        );

        let event1 = ExampleEvent1 {
            value2: AztecAddress::from_field(preimages[2]),
            value3: preimages[3] as u8,
        };

        emit_event_in_private_log(
            event1,
            &mut context,
            other,
            context.msg_sender(),
            PrivateLogContent.CONSTRAINED_ENCRYPTION,
        );
    }

    #[public]
    fn emit_unencrypted_events(preimages: [Field; 4]) {
        // docs:start:emit_public
        emit_event_in_public_log(
            ExampleEvent0 { value0: preimages[0], value1: preimages[1] },
            &mut context,
        );
        // docs:end:emit_public

        emit_event_in_public_log(
            ExampleEvent1 {
                value2: AztecAddress::from_field(preimages[2]),
                value3: preimages[3] as u8,
            },
            &mut context,
        );
    }
}
