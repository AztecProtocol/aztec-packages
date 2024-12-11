use dep::aztec::macros::aztec;

#[aztec]
contract TestLog {
    use dep::aztec::encrypted_logs::encrypted_event_emission::encode_and_encrypt_event;
    use dep::aztec::macros::{events::event, functions::{private, public}, storage::storage};
    use dep::aztec::prelude::PrivateSet;
    use dep::aztec::protocol_types::{address::AztecAddress, traits::Serialize};
    use dep::aztec::unencrypted_logs::unencrypted_event_emission::encode_event;
    use dep::value_note::value_note::ValueNote;
    use std::meta::derive;

    use std::embedded_curve_ops::EmbeddedCurveScalar;

    #[event]
    #[derive(Serialize)]
    struct ExampleEvent0 {
        value0: Field,
        value1: Field,
    }

    #[event]
    #[derive(Serialize)]
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

        event0.emit(encode_and_encrypt_event(&mut context, context.msg_sender(), other));

        // We duplicate the emission, but swapping the sender and recipient:
        event0.emit(encode_and_encrypt_event(&mut context, other, context.msg_sender()));

        let event1 = ExampleEvent1 {
            value2: AztecAddress::from_field(preimages[2]),
            value3: preimages[3] as u8,
        };

        event1.emit(encode_and_encrypt_event(&mut context, context.msg_sender(), other));
    }

    #[public]
    fn emit_unencrypted_events(preimages: [Field; 4]) {
        let event0 = ExampleEvent0 { value0: preimages[0], value1: preimages[1] };

        event0.emit(encode_event(&mut context));

        let event1 = ExampleEvent1 {
            value2: AztecAddress::from_field(preimages[2]),
            value3: preimages[3] as u8,
        };

        event1.emit(encode_event(&mut context));
    }
}
