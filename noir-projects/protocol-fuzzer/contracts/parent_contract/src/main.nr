use aztec::macros::aztec;

/// Forwarding contract for cross-contract call testing.
///
/// Each `forward_*` function calls the corresponding function on the
/// `SideEffect` contract via `call_private_function`. This exercises the
/// kernel's nested private call handling: the side effects (note hashes,
/// nullifiers, logs, etc.) originate from the child's call context, not the
/// parent's, which tests that the protocol correctly attributes them.
#[aztec]
pub contract Parent {
    use aztec::{
        macros::functions::{external, initializer},
        protocol::{
            abis::function_selector::FunctionSelector,
            address::{AztecAddress, EthAddress},
            traits::ToField,
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
        let selector =
            comptime { FunctionSelector::from_signature("emit_nullifier(Field)") };
        let _ = self.context.call_private_function(target, selector, [nullifier]);
    }

    // Forward a call to test_settled_nullifier_inclusion(Field) on the target contract.
    #[external("private")]
    fn forward_test_settled_nullifier_inclusion(target: AztecAddress, nullifier: Field) {
        let selector =
            comptime { FunctionSelector::from_signature("test_settled_nullifier_inclusion(Field)") };
        let _ = self.context.call_private_function(target, selector, [nullifier]);
    }

    // Forward a call to call_destroy_note(AztecAddress, Field) on the target contract.
    #[external("private")]
    fn forward_call_destroy_note(
        target: AztecAddress,
        owner: AztecAddress,
        storage_slot: Field,
    ) {
        let selector =
            comptime { FunctionSelector::from_signature("call_destroy_note((Field),Field)") };
        let _ = self.context.call_private_function(
            target,
            selector,
            [owner.to_field(), storage_slot],
        );
    }

    // Forward a call to test_note_inclusion(AztecAddress, Field) on the target contract.
    #[external("private")]
    fn forward_test_note_inclusion(
        target: AztecAddress,
        owner: AztecAddress,
        storage_slot: Field,
    ) {
        let selector =
            comptime { FunctionSelector::from_signature("test_note_inclusion((Field),Field)") };
        let _ = self.context.call_private_function(
            target,
            selector,
            [owner.to_field(), storage_slot],
        );
    }

    // Forward a call to send_l2_to_l1_message(Field, EthAddress) on the target contract.
    #[external("private")]
    fn forward_send_l2_to_l1_message(
        target: AztecAddress,
        content: Field,
        recipient: EthAddress,
    ) {
        let selector =
            comptime { FunctionSelector::from_signature("send_l2_to_l1_message(Field,(Field))") };
        let _ = self.context.call_private_function(
            target,
            selector,
            [content, recipient.to_field()],
        );
    }

    // Forward a call to emit_private_log(Field, Field) on the target contract.
    #[external("private")]
    fn forward_emit_private_log(target: AztecAddress, tag: Field, content: Field) {
        let selector =
            comptime { FunctionSelector::from_signature("emit_private_log(Field,Field)") };
        let _ = self.context.call_private_function(target, selector, [tag, content]);
    }

    // Forward a call to request_ovsk_app(AztecAddress) on the target contract.
    #[external("private")]
    fn forward_request_ovsk_app(target: AztecAddress, account: AztecAddress) {
        let selector =
            comptime { FunctionSelector::from_signature("request_ovsk_app((Field))") };
        let _ = self.context.call_private_function(
            target,
            selector,
            [account.to_field()],
        );
    }

    // Forward a call to test_setting_teardown() on the target contract.
    #[external("private")]
    fn forward_test_setting_teardown(target: AztecAddress) {
        let selector =
            comptime { FunctionSelector::from_signature("test_setting_teardown()") };
        let _ = self.context.call_private_function(target, selector, []);
    }
}
