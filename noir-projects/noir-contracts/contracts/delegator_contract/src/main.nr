// A contract used along with `Parent` contract to test nested calls.
use dep::aztec::macros::aztec;

#[aztec]
contract Delegator {
    use dep::aztec::prelude::{AztecAddress, PublicMutable, PrivateSet, Map, NoteGetterOptions};
    use dep::value_note::value_note::ValueNote;
    use dep::delegated_on::DelegatedOn;
    use dep::aztec::{utils::comparison::Comparator, macros::{storage::storage, functions::{private, public}}};

    #[storage]
    struct Storage<Context> {
        current_value: PublicMutable<Field, Context>,
        a_map_with_private_values: Map<AztecAddress, PrivateSet<ValueNote, Context>, Context>,
    }
    #[private]
    fn private_delegate_set_value(
        target_contract: AztecAddress,
        value: Field,
        owner: AztecAddress
    ) -> Field {
        // Call the target private function
        DelegatedOn::at(target_contract).private_set_value(value, owner).delegate_call(&mut context)
    }
    #[private]
    fn enqueued_delegate_set_value(target_contract: AztecAddress, value: Field) {
        DelegatedOn::at(target_contract).public_set_value(value).delegate_enqueue(&mut context)
    }
    #[public]
    fn public_delegate_set_value(target_contract: AztecAddress, value: Field) -> Field {
        DelegatedOn::at(target_contract).public_set_value(value).delegate_call(&mut context)
    }
    #[private]
    fn get_private_value(amount: Field, owner: AztecAddress) -> Field {
        let mut options = NoteGetterOptions::new();
        options = options.select(ValueNote::properties().value, Comparator.EQ, amount).set_limit(1);
        let notes = storage.a_map_with_private_values.at(owner).get_notes(options);
        notes.get_unchecked(0).value
    }
    unconstrained fn view_public_value() -> Field {
        storage.current_value.read()
    }
}
