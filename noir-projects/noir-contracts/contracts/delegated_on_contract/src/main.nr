// A contract used along with `Parent` contract to test nested calls.
contract DelegatedOn {
    use dep::aztec::prelude::{
        AztecAddress, FunctionSelector, NoteHeader, NoteGetterOptions, NoteViewerOptions, PublicMutable,
        PrivateSet, PrivateContext
    };
    use dep::value_note::value_note::ValueNote;
    use dep::aztec::keys::getters::get_npk_m_hash;

    #[aztec(storage)]
    struct Storage {
        current_value: PublicMutable<Field>,
        a_private_value: PrivateSet<ValueNote>,
    }

    #[aztec(private)]
    fn private_set_value(new_value: Field, owner: AztecAddress) -> Field {
        let owner_nullifier_public_key_hash = get_npk_m_hash(&mut context, owner);

        let mut note = ValueNote::new(new_value, owner_nullifier_public_key_hash);
        storage.a_private_value.insert(&mut note, true);
        new_value
    }

    #[aztec(public)]
    fn public_set_value(new_value: Field) -> Field {
        storage.current_value.write(new_value);
        new_value
    }

    #[aztec(private)]
    fn view_private_value(amount: Field, owner: AztecAddress) -> Field {
        let owner_nullifier_public_key_hash = get_npk_m_hash(&mut context, owner);

        let mut options = NoteGetterOptions::new();
        options = options.select(ValueNote::properties().value, amount, Option::none()).select(
            ValueNote::properties().owner_nullifying_public_key_hash,
            owner_nullifier_public_key_hash,
            Option::none()
        ).set_limit(1);
        let notes = storage.a_private_value.get_notes(options);
        notes[0].unwrap_unchecked().value
    }

    unconstrained fn view_public_value() -> pub Field {
        storage.current_value.read()
    }
}

