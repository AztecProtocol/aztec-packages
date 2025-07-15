// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
use dep::aztec::macros::aztec;

#[aztec]
pub contract StatefulTest {
    use dep::aztec::macros::{
        functions::{
            initialization_utils::assert_is_initialized_private, initializer, noinitcheck, private,
            public, utility, view,
        },
        storage::storage,
    };
    use dep::aztec::{
        protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress},
        state_vars::{Map, PrivateSet, PublicMutable},
    };
    use dep::value_note::{balance_utils, utils::{decrement, increment}, value_note::ValueNote};

    #[storage]
    struct Storage<Context> {
        notes: Map<AztecAddress, PrivateSet<ValueNote, Context>, Context>,
        public_values: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
    }

    #[private]
    #[initializer]
    fn constructor(owner: AztecAddress, value: Field) {
        StatefulTest::at(context.this_address()).create_note_no_init_check(owner, value).call(
            &mut context,
        );
    }

    #[private]
    #[initializer]
    fn wrong_constructor() {
        let selector = FunctionSelector::from_signature("not_exists(Field)");
        let _res = context.call_public_function(context.this_address(), selector, [42]);
    }

    #[public]
    #[initializer]
    fn public_constructor(owner: AztecAddress, value: Field) {
        StatefulTest::at(context.this_address())
            .increment_public_value_no_init_check(owner, value)
            .call(&mut context);
    }

    #[private]
    fn create_note(owner: AztecAddress, value: Field) {
        if (value != 0) {
            let loc = storage.notes.at(owner);
            increment(loc, value, owner);
        }
    }

    #[private]
    #[noinitcheck]
    fn create_note_no_init_check(owner: AztecAddress, value: Field) {
        if (value != 0) {
            let loc = storage.notes.at(owner);
            increment(loc, value, owner);
        }
    }

    #[private]
    fn destroy_and_create(recipient: AztecAddress, amount: Field) {
        assert_is_initialized_private(&mut context);
        let sender = context.msg_sender();

        let sender_notes = storage.notes.at(sender);
        decrement(sender_notes, amount, sender);

        let recipient_notes = storage.notes.at(recipient);
        increment(recipient_notes, amount, recipient);
    }

    #[private]
    #[noinitcheck]
    fn destroy_and_create_no_init_check(recipient: AztecAddress, amount: Field) {
        let sender = context.msg_sender();

        let sender_notes = storage.notes.at(sender);
        decrement(sender_notes, amount, sender);

        let recipient_notes = storage.notes.at(recipient);
        increment(recipient_notes, amount, recipient);
    }

    #[public]
    fn increment_public_value(owner: AztecAddress, value: Field) {
        let loc = storage.public_values.at(owner);
        loc.write(loc.read() + value);
    }

    #[public]
    #[noinitcheck]
    fn increment_public_value_no_init_check(owner: AztecAddress, value: Field) {
        let loc = storage.public_values.at(owner);
        loc.write(loc.read() + value);
    }

    #[utility]
    unconstrained fn summed_values(owner: AztecAddress) -> Field {
        let owner_balance = storage.notes.at(owner);

        // docs:start:get_balance
        // Return the sum of all notes in the set.
        balance_utils::get_balance(owner_balance)
        // docs:end:get_balance
    }

    #[public]
    #[noinitcheck]
    #[view]
    fn get_public_value(owner: AztecAddress) -> pub Field {
        storage.public_values.at(owner).read()
    }
}
