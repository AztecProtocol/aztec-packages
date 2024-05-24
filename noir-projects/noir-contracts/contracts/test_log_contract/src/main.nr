contract TestLog {
    use dep::aztec::prelude::PrivateSet;
    use dep::value_note::value_note::ValueNote;

    #[aztec(event)]
    struct ExampleEvent {
        value: Field,
    }

    #[aztec(storage)]
    struct Storage {
        example_set: PrivateSet<ValueNote>,
    }

    #[aztec(private)]
    fn emit_encrypted_log(randomness: Field, event_type_id: Field, preimage: [Field; 6]) {
        let header = context.get_header();
        let msg_sender_ivpk_m = header.get_ivpk_m(&mut context, context.msg_sender());
        let msg_sender_ovpk_m = header.get_ovpk_m(&mut context, context.msg_sender());

        context.encrypt_and_emit_log(
            context.this_address(),
            randomness,
            event_type_id,
            msg_sender_ovpk_m,
            msg_sender_ivpk_m,
            preimage
        );
    }
}
