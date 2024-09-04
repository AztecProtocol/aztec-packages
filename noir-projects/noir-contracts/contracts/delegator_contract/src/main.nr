// A contract used along with `Parent` contract to test nested calls.
contract Delegator {
    use dep::aztec::prelude::{AztecAddress, NoteGetterOptions, PublicMutable, PrivateSet, Map};
    use dep::value_note::value_note::ValueNote;
    use dep::delegated_on::DelegatedOn;

    #[aztec(storage)]
    struct Storage {
        a_map_with_private_values: Map<AztecAddress, PrivateSet<ValueNote>>,
    }

    #[aztec(private)]
    fn private_delegate_set_value(
        target_contract: AztecAddress,
        value: Field,
        owner: AztecAddress
    ) -> Field {
        // Call the target private function
        DelegatedOn::at(target_contract).private_set_value(value, owner).delegate_call(&mut context)
    }

    #[aztec(private)]
    fn get_private_value(amount: Field, owner: AztecAddress) -> pub Field {
        let mut options = NoteGetterOptions::new();
        options = options.select(ValueNote::properties().value, amount, Option::none()).set_limit(1);
        let notes = storage.a_map_with_private_values.at(owner).get_notes(options);
        notes.get_unchecked(0).value
    }
}
