// A contract used along with `StaticParent` contract to test static calls.
use dep::aztec::macros::aztec;

#[aztec]
pub contract StaticChild {
    use dep::aztec::{
        macros::{functions::{private, public, view}, storage::storage},
        messages::logs::note::encode_and_encrypt_note,
        note::note_getter_options::NoteGetterOptions,
        protocol_types::address::AztecAddress,
        state_vars::{PrivateSet, PublicMutable},
        utils::comparison::Comparator,
    };
    use dep::value_note::value_note::ValueNote;
    use aztec::note::note_interface::NoteProperties;

    #[storage]
    struct Storage<Context> {
        current_value: PublicMutable<Field, Context>,
        a_private_value: PrivateSet<ValueNote, Context>,
    }

    // Returns base_value + chain_id + version + block_number + timestamp statically
    #[public]
    #[view]
    fn pub_get_value(base_value: Field) -> Field {
        let return_value = base_value
            + context.chain_id()
            + context.version()
            + context.block_number() as Field
            + context.timestamp() as Field;

        return_value
    }

    // Sets `current_value` to `new_value`
    #[public]
    fn pub_set_value(new_value: Field) -> Field {
        storage.current_value.write(new_value);
        context.emit_public_log(new_value);
        new_value
    }

    // View function that attempts to modify state. Should always fail regardless how it's called.
    #[private]
    #[view]
    fn private_illegal_set_value(new_value: Field, owner: AztecAddress) -> Field {
        let note = ValueNote::new(new_value, owner);
        storage.a_private_value.insert(note).emit(encode_and_encrypt_note(&mut context, owner));
        new_value
    }

    // Modify a note
    #[private]
    fn private_set_value(new_value: Field, owner: AztecAddress, sender: AztecAddress) -> Field {
        let note = ValueNote::new(new_value, owner);

        storage.a_private_value.insert(note).emit(encode_and_encrypt_note(&mut context, owner));
        new_value
    }

    // Retrieve note value statically
    #[private]
    #[view]
    fn private_get_value(amount: Field, owner: AztecAddress) -> Field {
        let mut options = NoteGetterOptions::new();
        options = options
            .select(ValueNote::properties().value, Comparator.EQ, amount)
            .select(ValueNote::properties().owner, Comparator.EQ, owner)
            .set_limit(1);
        let retrieved_notes = storage.a_private_value.get_notes(options);
        retrieved_notes.get(0).note.value
    }

    // Increments `current_value` by `new_value`
    #[public]
    fn pub_inc_value(new_value: Field) -> Field {
        let old_value = storage.current_value.read();
        storage.current_value.write(old_value + new_value);
        context.emit_public_log(new_value);
        new_value
    }

    // View function that attempts to modify state. Should always fail regardless how it's called.
    #[public]
    #[view]
    fn pub_illegal_inc_value(new_value: Field) -> Field {
        let old_value = storage.current_value.read();
        storage.current_value.write(old_value + new_value);
        context.emit_public_log(new_value);
        new_value
    }
}
