// A contract used along with `StaticParent` contract to test static calls.
use dep::aztec::macros::aztec;

#[aztec]
contract StaticChild {
    use dep::aztec::prelude::{AztecAddress, FunctionSelector, PublicMutable, PrivateSet, PrivateContext, Deserialize};

    use dep::aztec::{
        context::{PublicContext, gas::GasOpts}, protocol_types::{abis::{call_context::CallContext}},
        note::{note_getter_options::NoteGetterOptions, note_header::NoteHeader},
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note,
        keys::getters::get_current_public_keys, utils::comparison::Comparator,
        macros::{storage::storage, functions::{private, public, view}}
    };
    use dep::value_note::value_note::ValueNote;

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
            + context.block_number()
            + context.timestamp() as Field;

        return_value
    }

    // Sets `current_value` to `new_value`
    #[public]
    fn pub_set_value(new_value: Field) -> Field {
        storage.current_value.write(new_value);
        context.emit_unencrypted_log(new_value);
        new_value
    }

    // View function that attempts to modify state. Should always fail regardless how it's called.
    #[private]
    #[view]
    fn private_illegal_set_value(new_value: Field, owner: AztecAddress) -> Field {
        let owner_npk_m_hash = get_current_public_keys(&mut context, owner).npk_m.hash();
        let mut note = ValueNote::new(new_value, owner_npk_m_hash);
        storage.a_private_value.insert(&mut note).emit(encode_and_encrypt_note(&mut context, context.msg_sender(), owner));
        new_value
    }

    // Modify a note
    #[private]
    fn private_set_value(
        new_value: Field,
        owner: AztecAddress,
        outgoing_viewer: AztecAddress
    ) -> Field {
        let owner_npk_m_hash = get_current_public_keys(&mut context, owner).npk_m.hash();
        let mut note = ValueNote::new(new_value, owner_npk_m_hash);
        storage.a_private_value.insert(&mut note).emit(encode_and_encrypt_note(&mut context, outgoing_viewer, owner));
        new_value
    }

    // Retrieve note value statically
    #[private]
    #[view]
    fn private_get_value(amount: Field, owner: AztecAddress) -> Field {
        let owner_npk_m_hash = get_current_public_keys(&mut context, owner).npk_m.hash();
        let mut options = NoteGetterOptions::new();
        options = options.select(ValueNote::properties().value, Comparator.EQ, amount).select(
            ValueNote::properties().npk_m_hash,
            Comparator.EQ,
            owner_npk_m_hash
        ).set_limit(1);
        let notes = storage.a_private_value.get_notes(options);
        notes.get(0).value
    }

    // Increments `current_value` by `new_value`
    #[public]
    fn pub_inc_value(new_value: Field) -> Field {
        let old_value = storage.current_value.read();
        storage.current_value.write(old_value + new_value);
        context.emit_unencrypted_log(new_value);
        new_value
    }

    // View function that attempts to modify state. Should always fail regardless how it's called.
    #[public]
    #[view]
    fn pub_illegal_inc_value(new_value: Field) -> Field {
        let old_value = storage.current_value.read();
        storage.current_value.write(old_value + new_value);
        context.emit_unencrypted_log(new_value);
        new_value
    }
}
