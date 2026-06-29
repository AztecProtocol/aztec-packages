// A contract used along with `Parent` contract to test nested calls.
use aztec::macros::aztec;

#[aztec]
pub contract Child {
    use aztec::protocol::address::AztecAddress;

    use aztec::{
        macros::{functions::external, storage::storage},
        messages::delivery::MessageDelivery,
        note::{note_getter_options::NoteGetterOptions, note_interface::NoteProperties},
        state_vars::{Owned, PrivateSet, PublicMutable},
        utils::comparison::Comparator,
    };
    use field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        current_value: PublicMutable<Field, Context>,
        private_values: Owned<PrivateSet<FieldNote, Context>, Context>,
    }

    // Returns a sum of the input and the chain id and version of the contract in private circuit public input's
    // return_values.
    #[external("private")]
    fn value(input: Field) -> Field {
        input + self.context.chain_id() + self.context.version()
    }

    // Returns base_value + chain_id + version + block_number + timestamp
    #[external("public")]
    fn pub_get_value(base_value: Field) -> Field {
        let return_value = base_value
            + self.context.chain_id()
            + self.context.version()
            + self.context.block_number() as Field
            + self.context.timestamp() as Field;

        return_value
    }

    // Sets `current_value` to `new_value`
    #[external("public")]
    fn pub_set_value(new_value: Field) -> Field {
        self.storage.current_value.write(new_value);
        self.context.emit_public_log_unsafe(0, new_value);

        new_value
    }

    #[external("private")]
    fn private_set_value(new_value: Field, owner: AztecAddress) -> Field {
        let note = FieldNote { value: new_value };

        self.storage.private_values.at(owner).insert(note).deliver(MessageDelivery::onchain_unconstrained());
        new_value
    }

    #[external("private")]
    fn private_get_value(amount: Field, owner: AztecAddress) -> Field {
        let options =
            NoteGetterOptions::new().select(FieldNote::properties().value, Comparator.EQ, amount).set_limit(1);
        let hinted_notes = self.storage.private_values.at(owner).get_notes(options);
        hinted_notes.get(0).note.value
    }

    // Increments `current_value` by `new_value`
    #[external("public")]
    fn pub_inc_value(new_value: Field) -> Field {
        let old_value = self.storage.current_value.read();
        self.storage.current_value.write(old_value + new_value);
        self.context.emit_public_log_unsafe(0, new_value);

        new_value
    }

    #[external("public")]
    fn set_value_twice_with_nested_first() {
        let _result = self.call_self.pub_set_value(10);
        self.storage.current_value.write(20);
        self.context.emit_public_log_unsafe(0, 20);
    }

    #[external("public")]
    fn set_value_twice_with_nested_last() {
        self.storage.current_value.write(20);
        self.context.emit_public_log_unsafe(0, 20);
        let _result = self.call_self.pub_set_value(10);
    }

    #[external("public")]
    fn set_value_with_two_nested_calls() {
        self.call_self.set_value_twice_with_nested_first();
        self.call_self.set_value_twice_with_nested_last();
        self.storage.current_value.write(20);
        self.context.emit_public_log_unsafe(0, 20);
    }
}
