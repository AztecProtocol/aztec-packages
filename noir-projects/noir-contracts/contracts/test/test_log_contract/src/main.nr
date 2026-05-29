mod test;

use aztec::macros::aztec;

#[aztec]
pub contract TestLog {
    use aztec::{
        macros::{events::event, functions::external, storage::storage},
        messages::message_delivery::MessageDelivery,
        note::note_getter_options::NoteGetterOptions,
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

    /// Emits a single private log with the given raw tag and a one-field payload.
    #[external("private")]
    fn emit_raw_private_log(tag: Field, payload: Field) {
        self.context.emit_private_log_unsafe(tag, BoundedVec::from_array([payload]));
    }

    /// Emits three private logs with payloads of different lengths (1, 3, and 5 fields). Used to
    /// exercise the nested `BoundedVec<BoundedVec<Field, _>, _>` serialization between TXE and Noir.
    #[external("private")]
    fn emit_three_raw_private_logs_diff_lengths(
        tag1: Field,
        payload1: Field,
        tag2: Field,
        payload2: [Field; 3],
        tag3: Field,
        payload3: [Field; 5],
    ) {
        self.context.emit_private_log_unsafe(tag1, BoundedVec::from_array([payload1]));
        self.context.emit_private_log_unsafe(tag2, BoundedVec::from_array(payload2));
        self.context.emit_private_log_unsafe(tag3, BoundedVec::from_array(payload3));
    }

    #[external("private")]
    fn emit_encrypted_events(other: AztecAddress, preimages: [Field; 4]) {
        let event0 = ExampleEvent0 { value0: preimages[0], value1: preimages[1] };

        self.emit(event0).deliver_to(self.msg_sender(), MessageDelivery::onchain_constrained());

        // We duplicate the emission, but swapping the sender and recipient:
        self.emit(event0).deliver_to(other, MessageDelivery::onchain_constrained());

        let event1 = ExampleEvent1 { value2: AztecAddress::from_field(preimages[2]), value3: preimages[3] as u8 };

        self.emit(event1).deliver_to(self.msg_sender(), MessageDelivery::onchain_constrained());
    }

    #[external("public")]
    fn emit_unencrypted_events(preimages: [Field; 4]) {
        self.emit(ExampleEvent0 { value0: preimages[0], value1: preimages[1] });

        self.emit(ExampleEvent1 { value2: AztecAddress::from_field(preimages[2]), value3: preimages[3] as u8 });
    }

    // Emits an event with a nested struct to test that decoding works correctly
    // for events that are not "flat" (i.e., have nested structs as fields).
    #[external("public")]
    fn emit_nested_event(a: Field, b: Field, c: AztecAddress, extra: Field) {
        self.emit(ExampleNestedEvent { nested: NestedStruct { a, b, c }, extra_value: extra });
    }

    /// This emits two note messages using unconstrained onchain delivery, consuming two tag indices. The note
    /// from the first message is nullified in the same transaction, resulting in note, nullifier and logs being
    /// squashed.
    ///
    /// Used to verify that PXE successfully handles scenarios where used tagging indices don't make it their way to the
    /// tx effects due to squashing.
    #[external("private")]
    fn deliver_squashed_and_surviving_notes(other: AztecAddress) {
        let note_set = self.storage.example_set.at(other);

        // Create the first note and message, then immediately nullify. This squashes all effects.
        note_set.insert(FieldNote { value: 0 }).deliver(MessageDelivery::onchain_unconstrained());
        let _ = note_set.pop_notes(NoteGetterOptions::new());

        // Deliver a second note message. Only this one will be included in the logs.
        note_set.insert(FieldNote { value: 1 }).deliver(MessageDelivery::onchain_unconstrained());
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
            MessageDelivery::onchain_unconstrained(),
        );

        self.emit(ExampleEvent0 { value0: random_value_2, value1: random_value_3 }).deliver_to(
            other,
            MessageDelivery::onchain_unconstrained(),
        );

        if num_nested_calls > 0 {
            self.call_self.emit_encrypted_events_nested(other, num_nested_calls - 1);
        }
    }
}
