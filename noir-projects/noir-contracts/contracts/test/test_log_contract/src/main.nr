use aztec::macros::aztec;

#[aztec]
pub contract TestLog {
    use aztec::{
        macros::{events::event, functions::external, storage::storage},
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

    #[external("private")]
    fn emit_encrypted_events(other: AztecAddress, preimages: [Field; 4]) {
        let event0 = ExampleEvent0 { value0: preimages[0], value1: preimages[1] };

        self.emit(event0, self.context.msg_sender().unwrap(), MessageDelivery.CONSTRAINED_ONCHAIN);

        // We duplicate the emission, but swapping the sender and recipient:
        self.emit(event0, other, MessageDelivery.CONSTRAINED_ONCHAIN);

        let event1 = ExampleEvent1 {
            value2: AztecAddress::from_field(preimages[2]),
            value3: preimages[3] as u8,
        };

        self.emit(event1, self.context.msg_sender().unwrap(), MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    #[external("public")]
    fn emit_unencrypted_events(preimages: [Field; 4]) {
        self.emit(ExampleEvent0 { value0: preimages[0], value1: preimages[1] });

        self.emit(
            ExampleEvent1 {
                value2: AztecAddress::from_field(preimages[2]),
                value3: preimages[3] as u8,
            },
        );
    }

    #[external("private")]
    fn emit_encrypted_events_nested(other: AztecAddress, num_nested_calls: u32) {
        // Safety: We use the following just as an arbitrary test value
        let random_value_0 = unsafe { random() };
        // Safety: We use the following just as an arbitrary test value
        let random_value_1 = unsafe { random() };
        // Safety: We use the following just as an arbitrary test value
        let random_value_2 = unsafe { random() };
        // Safety: We use the following just as an arbitrary test value
        let random_value_3 = unsafe { random() };

        self.emit(
            ExampleEvent0 { value0: random_value_0, value1: random_value_1 },
            other,
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );

        self.emit(
            ExampleEvent0 { value0: random_value_2, value1: random_value_3 },
            other,
            MessageDelivery.UNCONSTRAINED_ONCHAIN,
        );

        if num_nested_calls > 0 {
            self.call_self.emit_encrypted_events_nested(other, num_nested_calls - 1);
        }
    }
}
