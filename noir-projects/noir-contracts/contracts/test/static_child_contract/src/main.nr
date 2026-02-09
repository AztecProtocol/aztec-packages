// A contract used along with `StaticParent` contract to test static calls.
use ::aztec::macros::aztec;

#[aztec]
pub contract StaticChild {
    use ::aztec::{
        macros::{functions::{external, view}, storage::storage},
        messages::message_delivery::MessageDelivery,
        note::note_getter_options::NoteGetterOptions,
        protocol::address::AztecAddress,
        state_vars::{Owned, PrivateSet, PublicMutable},
        utils::comparison::Comparator,
    };
    use aztec::note::note_interface::NoteProperties;
    use field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        current_value: PublicMutable<Field, Context>,
        a_private_value: Owned<PrivateSet<FieldNote, Context>, Context>,
    }

    // Returns base_value + chain_id + version + block_number + timestamp statically
    #[external("public")]
    #[view]
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
        self.context.emit_public_log(new_value);
        new_value
    }

    // View function that attempts to modify state. Should always fail regardless how it's called.
    #[external("private")]
    #[view]
    fn private_illegal_set_value(new_value: Field, owner: AztecAddress) -> Field {
        let note = FieldNote { value: new_value };
        self.storage.a_private_value.at(owner).insert(note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
        new_value
    }

    // Modify a note
    #[external("private")]
    fn private_set_value(new_value: Field, owner: AztecAddress, sender: AztecAddress) -> Field {
        let note = FieldNote { value: new_value };

        self.storage.a_private_value.at(owner).insert(note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
        new_value
    }

    // Retrieve note value statically
    #[external("private")]
    #[view]
    fn private_get_value(amount: Field, owner: AztecAddress) -> Field {
        let options = NoteGetterOptions::new()
            .select(FieldNote::properties().value, Comparator.EQ, amount)
            .set_limit(1);
        let hinted_notes = self.storage.a_private_value.at(owner).get_notes(options);
        hinted_notes.get(0).note.value
    }

    // Increments `current_value` by `new_value`
    #[external("public")]
    fn pub_inc_value(new_value: Field) -> Field {
        let old_value = self.storage.current_value.read();
        self.storage.current_value.write(old_value + new_value);
        self.context.emit_public_log(new_value);
        new_value
    }

    // View function that attempts to modify state. Should always fail regardless how it's called.
    #[external("public")]
    #[view]
    fn pub_illegal_inc_value(new_value: Field) -> Field {
        let old_value = self.storage.current_value.read();
        self.storage.current_value.write(old_value + new_value);
        self.context.emit_public_log(new_value);
        new_value
    }
}
