use aztec::macros::aztec;

#[aztec]
pub contract Parent {
    use aztec::{
        macros::functions::{external, initializer},
        protocol::{
            abis::function_selector::FunctionSelector, address::AztecAddress, traits::ToField,
        },
    };

    #[initializer]
    #[external("private")]
    fn initialize() {}

    // Forward a call to call_create_note(u128, AztecAddress, Field) on the target contract.
    // Emits a note hash in the child call context.
    #[external("private")]
    fn forward_call_create_note(
        target: AztecAddress,
        value: Field,
        owner: AztecAddress,
        storage_slot: Field,
    ) {
        let selector =
            comptime { FunctionSelector::from_signature("call_create_note(u128,(Field),Field)") };
        let _ = self.context.call_private_function(
            target,
            selector,
            [value, owner.to_field(), storage_slot],
        );
    }

    // Forward a call to emit_nullifier(Field) on the target contract.
    #[external("private")]
    fn forward_emit_nullifier(target: AztecAddress, nullifier: Field) {
        let selector = comptime { FunctionSelector::from_signature("emit_nullifier(Field)") };
        let _ = self.context.call_private_function(target, selector, [nullifier]);
    }

    // Forward a call to test_settled_nullifier_inclusion(Field) on the target contract.
    #[external("private")]
    fn forward_test_settled_nullifier_inclusion(target: AztecAddress, nullifier: Field) {
        let selector = comptime {
            FunctionSelector::from_signature("test_settled_nullifier_inclusion(Field)")
        };
        let _ = self.context.call_private_function(target, selector, [nullifier]);
    }

    // Forward a call to call_destroy_note(AztecAddress, Field) on the target contract.
    #[external("private")]
    fn forward_call_destroy_note(target: AztecAddress, owner: AztecAddress, storage_slot: Field) {
        let selector =
            comptime { FunctionSelector::from_signature("call_destroy_note((Field),Field)") };
        let _ =
            self.context.call_private_function(target, selector, [owner.to_field(), storage_slot]);
    }

    // Forward a call to test_note_inclusion(AztecAddress, Field) on the target contract.
    #[external("private")]
    fn forward_test_note_inclusion(target: AztecAddress, owner: AztecAddress, storage_slot: Field) {
        let selector =
            comptime { FunctionSelector::from_signature("test_note_inclusion((Field),Field)") };
        let _ =
            self.context.call_private_function(target, selector, [owner.to_field(), storage_slot]);
    }
}
