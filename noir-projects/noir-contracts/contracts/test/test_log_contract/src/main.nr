use aztec::macros::aztec;

#[aztec]
pub contract TestLog {
    use aztec::{
        macros::{events::event, functions::external, storage::storage},
        messages::message_delivery::MessageDelivery,
        oracle::random::random,
        protocol::{address::AztecAddress, traits::{FromField, Serialize}},
        state_vars::{Owned, PrivateSet},
    };
    use field_note::FieldNote;

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

    #[derive(Serialize)]
    struct NestedStruct {
        a: Field,
        b: Field,
        c: AztecAddress,
    }

    #[event]
    struct ExampleNestedEvent {
        nested: NestedStruct,
        extra_value: Field,
    }

    #[storage]
    struct Storage<Context> {
        example_set: Owned<PrivateSet<FieldNote, Context>, Context>,
    }

    #[external("private")]
    fn emit_encrypted_events(other: AztecAddress, preimages: [Field; 4]) {
        let event0 = ExampleEvent0 { value0: preimages[0], value1: preimages[1] };

        self.emit(event0).deliver_to(self.msg_sender(), MessageDelivery.ONCHAIN_CONSTRAINED);

        // We duplicate the emission, but swapping the sender and recipient:
        self.emit(event0).deliver_to(other, MessageDelivery.ONCHAIN_CONSTRAINED);

        let event1 = ExampleEvent1 {
            value2: AztecAddress::from_field(preimages[2]),
            value3: preimages[3] as u8,
        };

        self.emit(event1).deliver_to(self.msg_sender(), MessageDelivery.ONCHAIN_CONSTRAINED);
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

    // Emits an event with a nested struct to test that decoding works correctly
    // for events that are not "flat" (i.e., have nested structs as fields).
    #[external("public")]
    fn emit_nested_event(a: Field, b: Field, c: AztecAddress, extra: Field) {
        self.emit(ExampleNestedEvent { nested: NestedStruct { a, b, c }, extra_value: extra });
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

        self.emit(ExampleEvent0 { value0: random_value_0, value1: random_value_1 }).deliver_to(
            other,
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );

        self.emit(ExampleEvent0 { value0: random_value_2, value1: random_value_3 }).deliver_to(
            other,
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );

        if num_nested_calls > 0 {
            self.call_self.emit_encrypted_events_nested(other, num_nested_calls - 1);
        }
    }
}
