// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
use aztec::macros::aztec;

#[aztec]
pub contract StatefulTest {
    use aztec::macros::{
        functions::{
            external, initialization_utils::assert_is_initialized_private, initializer, noinitcheck,
            view,
        },
        storage::storage,
    };
    use aztec::{
        messages::message_delivery::MessageDelivery,
        note::note_getter_options::NoteGetterOptions,
        protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress},
        state_vars::{Map, PrivateSet, PublicMutable},
    };
    use value_note::{balance_utils, value_note::ValueNote};

    #[storage]
    struct Storage<Context> {
        notes: Map<AztecAddress, PrivateSet<ValueNote, Context>, Context>,
        public_values: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
    }

    #[external("private")]
    #[initializer]
    fn constructor(owner: AztecAddress, value: Field) {
        StatefulTest::at(context.this_address()).create_note_no_init_check(owner, value).call(
            &mut context,
        );
    }

    #[external("private")]
    #[initializer]
    fn wrong_constructor() {
        let selector = FunctionSelector::from_signature("not_exists(Field)");
        let _res = context.call_public_function(context.this_address(), selector, [42], false);
    }

    #[external("public")]
    #[initializer]
    fn public_constructor(owner: AztecAddress, value: Field) {
        StatefulTest::at(context.this_address())
            .increment_public_value_no_init_check(owner, value)
            .call(&mut context);
    }

    #[external("private")]
    fn create_note(owner: AztecAddress, value: Field) {
        if (value != 0) {
            let loc = storage.notes.at(owner);
            let note = ValueNote::new(value, owner);
            loc.insert(note).emit(&mut context, owner, MessageDelivery.CONSTRAINED_ONCHAIN);
        }
    }

    #[external("private")]
    #[noinitcheck]
    fn create_note_no_init_check(owner: AztecAddress, value: Field) {
        if (value != 0) {
            let loc = storage.notes.at(owner);
            let note = ValueNote::new(value, owner);
            loc.insert(note).emit(&mut context, owner, MessageDelivery.CONSTRAINED_ONCHAIN);
        }
    }

    #[external("private")]
    fn destroy_and_create(recipient: AztecAddress) {
        assert_is_initialized_private(&mut context);
        let sender = context.msg_sender().unwrap();

        let sender_notes = storage.notes.at(sender);
        let _ = sender_notes.pop_notes(NoteGetterOptions::new().set_limit(2));

        storage.notes.at(recipient).insert(ValueNote::new(92, recipient)).emit(
            &mut context,
            recipient,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("private")]
    #[noinitcheck]
    fn destroy_and_create_no_init_check(recipient: AztecAddress) {
        let sender = context.msg_sender().unwrap();

        let sender_notes = storage.notes.at(sender);
        let _ = sender_notes.pop_notes(NoteGetterOptions::new().set_limit(2));

        storage.notes.at(recipient).insert(ValueNote::new(92, recipient)).emit(
            &mut context,
            recipient,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("public")]
    fn increment_public_value(owner: AztecAddress, value: Field) {
        let loc = storage.public_values.at(owner);
        loc.write(loc.read() + value);
    }

    #[external("public")]
    #[noinitcheck]
    fn increment_public_value_no_init_check(owner: AztecAddress, value: Field) {
        let loc = storage.public_values.at(owner);
        loc.write(loc.read() + value);
    }

    #[external("utility")]
    unconstrained fn summed_values(owner: AztecAddress) -> Field {
        let owner_balance = storage.notes.at(owner);

        // Return the sum of all notes in the set.
        balance_utils::get_balance(owner_balance)
    }

    #[external("public")]
    #[noinitcheck]
    #[view]
    fn get_public_value(owner: AztecAddress) -> pub Field {
        storage.public_values.at(owner).read()
    }
}
