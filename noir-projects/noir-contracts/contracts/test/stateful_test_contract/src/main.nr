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
        note::{note_getter_options::NoteGetterOptions, note_viewer_options::NoteViewerOptions},
        protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress},
        state_vars::{Map, Owned, PrivateSet, PublicMutable},
    };
    use field_note::field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        notes: Owned<PrivateSet<FieldNote, Context>, Context>,
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
            let note = FieldNote { value };
            self.storage.notes.at(owner).insert(note).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
        }
    }

    #[external("private")]
    #[noinitcheck]
    fn create_note_no_init_check(owner: AztecAddress, value: Field) {
        if (value != 0) {
            let note = FieldNote { value };
            self.storage.notes.at(owner).insert(note).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
        }
    }

    #[external("private")]
    fn destroy_and_create(recipient: AztecAddress) {
        assert_is_initialized_private(self.context);
        let sender = self.msg_sender().unwrap();

        let _ = self.storage.notes.at(sender).pop_notes(NoteGetterOptions::new().set_limit(2));

        self.storage.notes.at(recipient).insert(FieldNote { value: 92 }).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    #[external("private")]
    #[noinitcheck]
    fn destroy_and_create_no_init_check(recipient: AztecAddress) {
        let sender = self.msg_sender().unwrap();

        let _ = self.storage.notes.at(sender).pop_notes(NoteGetterOptions::new().set_limit(2));

        self.storage.notes.at(recipient).insert(FieldNote { value: 92 }).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
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
    unconstrained fn summed_values(owner: AztecAddress) -> pub Field {
        // Return the sum of all notes in the set.
        get_balance_with_offset(self.storage.notes.at(owner), 0)
    }

    #[contract_library_method]
    unconstrained fn get_balance_with_offset(
        set: PrivateSet<FieldNote, aztec::context::UtilityContext>,
        offset: u32,
    ) -> Field {
        let mut balance = 0;
        let options = NoteViewerOptions::new().set_offset(offset);
        let notes = set.view_notes(options);
        for i in 0..options.limit {
            if i < notes.len() {
                balance += notes.get_unchecked(i).value;
            }
        }

        if (notes.len() == options.limit) {
            balance += get_balance_with_offset(set, offset + options.limit);
        }

        balance
    }

    #[external("public")]
    #[noinitcheck]
    #[view]
    fn get_public_value(owner: AztecAddress) -> pub Field {
        self.storage.public_values.at(owner).read()
    }
}
