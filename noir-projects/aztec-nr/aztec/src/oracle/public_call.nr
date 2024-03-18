use dep::protocol_types::{
    abis::function_selector::FunctionSelector, address::AztecAddress,
    abis::public_call_stack_item::PublicCallStackItem, constants::PUBLIC_CALL_STACK_ITEM_LENGTH
};

#[oracle(callPublicFunction)]
fn call_public_function_oracle(
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args_hash: Field,
    _side_effect_counter: u32,
    _is_static_call: bool,
    _is_delegate_call: bool
) -> [Field; PUBLIC_CALL_STACK_ITEM_LENGTH] {}

unconstrained pub fn call_public_function_internal(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args_hash: Field,
    side_effect_counter: u32,
    is_static_call: bool,
    is_delegate_call: bool
) -> PublicCallStackItem {
    let fields = call_public_function_oracle(
        contract_address,
        function_selector,
        args_hash,
        side_effect_counter,
        is_static_call,
        is_delegate_call
    );

    PublicCallStackItem::deserialize(fields)
}
