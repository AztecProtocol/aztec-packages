// A contract used along with `Parent` contract to test nested calls.
contract Delegate {
    use dep::std::option::Option;

    use dep::aztec::{
        log::emit_unencrypted_log, state_vars::{public_state::PublicState, set::Set},
        protocol_types::{abis::{function_selector::FunctionSelector}, address::AztecAddress},
        note::{note_getter_options::NoteGetterOptions}
    };
    use dep::value_note::value_note::ValueNote;

    struct Storage {
        current_value: PublicState<Field>,
        a_private_value: Set<ValueNote>,
    }

    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn private_delegate_set_value(
        targetContract: AztecAddress,
        targetSelector: FunctionSelector,
        args: [Field; 2]
    ) {
        // Call the target private function
        let return_values = context.delegate_call_private_function(targetContract, targetSelector, args);
        // Copy the return value from the call to this function's return values
        return_values[0]
    }

    #[aztec(private)]
    fn private_get_value(amount: Field, owner: AztecAddress) -> Field {
        let options = NoteGetterOptions::new().select(0, amount, Option::none()).select(1, owner.to_field(), Option::none()).set_limit(1);
        let notes = storage.a_private_value.get_notes(options);
        notes[0].unwrap_unchecked().value
    }

    // TODO: remove this placeholder once https://github.com/AztecProtocol/aztec-packages/issues/2918 is implemented
    unconstrained fn compute_note_hash_and_nullifier(
        contract_address: AztecAddress,
        nonce: Field,
        storage_slot: Field,
        note_type_id: Field,
        serialized_note: [Field; 0]
    ) -> pub [Field; 4] {
        [0, 0, 0, 0]
    }
}
