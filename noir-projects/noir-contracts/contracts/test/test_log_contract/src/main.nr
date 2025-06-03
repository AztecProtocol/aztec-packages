use aztec::macros::aztec;

#[aztec]
pub contract TestLog {
    use aztec::{
        event::event_interface::{
            emit_event_in_private_log, emit_event_in_public_log, PrivateLogContent,
        },
        macros::{events::event, functions::{private, public}, storage::storage},
        oracle::random::random,
        prelude::PrivateSet,
        protocol_types::{address::AztecAddress, traits::FromField},
    };
    use value_note::value_note::ValueNote;

    #[event]
    struct ExampleEvent0 {
        value0: Field,
        value1: Field,
        // All events need to contain randomness to prevent event hash preimage attacks and to prevent event hash
        // collisions (event hashes are included in the nullifier tree and duplicate nullifiers are not allowed).
        // TODO(#8999): Auto-inject the randomness into the event hash instead of requiring it explicitly here.
        randomness: Field,
    }

    #[event]
    struct ExampleEvent1 {
        value2: AztecAddress,
        value3: u8,
        // All events need to contain randomness to prevent event hash preimage attacks and to prevent event hash
        // collisions (event hashes are included in the nullifier tree and duplicate nullifiers are not allowed).
        // TODO(#8999): Auto-inject the randomness into the event hash instead of requiring it explicitly here.
        randomness: Field,
    }

    #[storage]
    struct Storage<Context> {
        example_set: PrivateSet<ValueNote, Context>,
    }

    #[private]
    fn emit_encrypted_events(other: AztecAddress, preimages: [Field; 4]) {
        // Safety: This is just a test.
        let randomness0 = unsafe { random() };

        emit_event_in_private_log(
            ExampleEvent0 { value0: preimages[0], value1: preimages[1], randomness: randomness0 },
            &mut context,
            other,
            context.msg_sender(),
            PrivateLogContent.CONSTRAINED_ENCRYPTION,
        );

        // We duplicate the emission, but with different randomness and swapping the sender and recipient:
        // Safety: This is just a test.
        let randomness1 = unsafe { random() };
        emit_event_in_private_log(
            ExampleEvent0 { value0: preimages[0], value1: preimages[1], randomness: randomness1 },
            &mut context,
            context.msg_sender(),
            other,
            PrivateLogContent.CONSTRAINED_ENCRYPTION,
        );

        // Safety: This is just a test.
        let randomness2 = unsafe { random() };

        emit_event_in_private_log(
            ExampleEvent1 {
                value2: AztecAddress::from_field(preimages[2]),
                value3: preimages[3] as u8,
                randomness: randomness2,
            },
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
            ExampleEvent0 {
                value0: preimages[0],
                value1: preimages[1],
                randomness: 0, // Public events don't need randomness.
            },
            &mut context,
        );
        // docs:end:emit_public

        emit_event_in_public_log(
            ExampleEvent1 {
                value2: AztecAddress::from_field(preimages[2]),
                value3: preimages[3] as u8,
                randomness: 0, // Public events don't need randomness.
            },
            &mut context,
        );
    }
}
