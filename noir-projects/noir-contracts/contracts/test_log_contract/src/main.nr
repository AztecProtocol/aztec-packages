use dep::aztec::macros::aztec;

#[aztec]
contract TestLog {
    use dep::aztec::encrypted_logs::encrypted_event_emission::encode_and_encrypt_event;
    use dep::aztec::keys::getters::get_public_keys;
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

    // EXAMPLE_EVENT_0_BYTES_LEN + 16
    global EXAMPLE_EVENT_0_CIPHERTEXT_BYTES_LEN: Field = 144;

    #[private]
    fn emit_encrypted_events(other: AztecAddress, preimages: [Field; 4]) {
        let event0 = ExampleEvent0 { value0: preimages[0], value1: preimages[1] };

        let other_ovpk_m = get_public_keys(other).ovpk_m;
        let msg_sender_ovpk_m = get_public_keys(context.msg_sender()).ovpk_m;

        event0.emit(encode_and_encrypt_event(
            &mut context,
            // outgoing is set to other, incoming is set to msg sender
            other_ovpk_m,
            context.msg_sender(),
            other,
        ));

        // We duplicate the emission, but specifying different incoming and outgoing parties
        event0.emit(encode_and_encrypt_event(
            &mut context,
            // outgoing is set to msg sender, incoming is set to other
            msg_sender_ovpk_m,
            other,
            context.msg_sender(),
        ));

        let event1 = ExampleEvent1 {
            value2: AztecAddress::from_field(preimages[2]),
            value3: preimages[3] as u8,
        };

        event1.emit(encode_and_encrypt_event(
            &mut context,
            // outgoing is set to other, incoming is set to msg sender
            other_ovpk_m,
            context.msg_sender(),
            other,
        ));
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
