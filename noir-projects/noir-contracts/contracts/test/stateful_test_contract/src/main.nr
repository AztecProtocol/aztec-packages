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
        notes: PrivateSet<ValueNote, Context>,
        public_values: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
    }

    #[external("private")]
    #[initializer]
    fn constructor(owner: AztecAddress, value: Field) {
        self.call_self.create_note_no_init_check(owner, value);
    }

    #[external("private")]
    #[initializer]
    fn wrong_constructor() {
        let selector = FunctionSelector::from_signature("not_exists(Field)");
        let _res = self.context.call_public_function(self.address, selector, [42], false);
    }

    #[external("public")]
    #[initializer]
    fn public_constructor(owner: AztecAddress, value: Field) {
        self.call_self.increment_public_value_no_init_check(owner, value);
    }

    #[external("private")]
    fn create_note(owner: AztecAddress, value: Field) {
        if (value != 0) {
            let note = ValueNote::new(value);
            self.storage.notes.at(owner).insert(note).emit(
                owner,
                MessageDelivery.CONSTRAINED_ONCHAIN,
            );
        }
    }

    #[external("private")]
    #[noinitcheck]
    fn create_note_no_init_check(owner: AztecAddress, value: Field) {
        if (value != 0) {
            let note = ValueNote::new(value);
            self.storage.notes.at(owner).insert(note).emit(
                owner,
                MessageDelivery.CONSTRAINED_ONCHAIN,
            );
        }
    }

    #[external("private")]
    fn destroy_and_create(recipient: AztecAddress) {
        assert_is_initialized_private(self.context);
        let sender = self.msg_sender().unwrap();

        let _ = self.storage.notes.at(sender).pop_notes(NoteGetterOptions::new().set_limit(2));

        self.storage.notes.at(recipient).insert(ValueNote::new(92)).emit(
            recipient,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("private")]
    #[noinitcheck]
    fn destroy_and_create_no_init_check(recipient: AztecAddress) {
        let sender = self.msg_sender().unwrap();

        let _ = self.storage.notes.at(sender).pop_notes(NoteGetterOptions::new().set_limit(2));

        self.storage.notes.at(recipient).insert(ValueNote::new(92)).emit(
            recipient,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("public")]
    fn increment_public_value(owner: AztecAddress, value: Field) {
        let loc = self.storage.public_values.at(owner);
        loc.write(loc.read() + value);
    }

    #[external("public")]
    #[noinitcheck]
    fn increment_public_value_no_init_check(owner: AztecAddress, value: Field) {
        let loc = self.storage.public_values.at(owner);
        loc.write(loc.read() + value);
    }

    #[external("utility")]
    unconstrained fn summed_values(owner: AztecAddress) -> Field {
        // Return the sum of all notes in the set.
        balance_utils::get_balance(self.storage.notes, owner)
    }

    #[external("public")]
    #[noinitcheck]
    #[view]
    fn get_public_value(owner: AztecAddress) -> pub Field {
        self.storage.public_values.at(owner).read()
    }
}
