// A contract used along with `Parent` contract to test nested calls.
use dep::aztec::macros::aztec;

#[aztec]
pub contract Child {
    use dep::aztec::protocol_types::address::AztecAddress;

    use dep::aztec::{
        macros::{functions::{internal, private, public}, storage::storage},
        messages::logs::note::encode_and_encrypt_note,
        note::{note_getter_options::NoteGetterOptions, note_interface::NoteProperties},
        state_vars::{Map, PrivateSet, PublicMutable},
        utils::comparison::Comparator,
    };
    // docs:start:import_valuenote
    use dep::value_note::value_note::ValueNote;
    // docs:end:import_valuenote

    #[storage]
    struct Storage<Context> {
        current_value: PublicMutable<Field, Context>,
        a_map_with_private_values: Map<AztecAddress, PrivateSet<ValueNote, Context>, Context>,
    }

    // Returns a sum of the input and the chain id and version of the contract in private circuit public input's return_values.
    #[private]
    fn value(input: Field) -> Field {
        input + context.chain_id() + context.version()
    }
    // Returns a sum of the input and the chain id and version of the contract in private circuit public input's return_values.
    // Can only be called from this contract.
    #[private]
    #[internal]
    fn value_internal(input: Field) -> Field {
        input + context.chain_id() + context.version()
    }

    // Returns base_value + chain_id + version + block_number + timestamp
    #[public]
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

    #[private]
    fn private_set_value(new_value: Field, owner: AztecAddress) -> Field {
        // docs:start:valuenote_new
        let note = ValueNote::new(new_value, owner);
        // docs:end:valuenote_new

        storage.a_map_with_private_values.at(owner).insert(note).emit(encode_and_encrypt_note(
            &mut context,
            owner,
        ));
        new_value
    }

    #[private]
    fn private_get_value(amount: Field, owner: AztecAddress) -> Field {
        let mut options = NoteGetterOptions::new();
        options = options.select(ValueNote::properties().value, Comparator.EQ, amount).set_limit(1);
        let retrieved_notes = storage.a_map_with_private_values.at(owner).get_notes(options);
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

    // Increments `current_value` by `new_value`. Can only be called from this contract.
    #[public]
    #[internal]
    fn pub_inc_value_internal(new_value: Field) -> Field {
        let old_value = storage.current_value.read();
        storage.current_value.write(old_value + new_value);
        context.emit_public_log(new_value);

        new_value
    }

    #[public]
    fn set_value_twice_with_nested_first() {
        let _result = Child::at(context.this_address()).pub_set_value(10).call(&mut context);
        storage.current_value.write(20);
        context.emit_public_log(20);
    }

    #[public]
    fn set_value_twice_with_nested_last() {
        storage.current_value.write(20);
        context.emit_public_log(20);
        let _result = Child::at(context.this_address()).pub_set_value(10).call(&mut context);
    }

    #[public]
    fn set_value_with_two_nested_calls() {
        Child::at(context.this_address()).set_value_twice_with_nested_first().call(&mut context);
        Child::at(context.this_address()).set_value_twice_with_nested_last().call(&mut context);
        storage.current_value.write(20);
        context.emit_public_log(20);
    }
}
