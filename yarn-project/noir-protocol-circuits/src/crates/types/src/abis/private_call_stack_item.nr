use crate::abis::{
    function_data::FunctionData,
    private_circuit_public_inputs::PrivateCircuitPublicInputs,
};
use crate::address::AztecAddress;
use crate::constants::GENERATOR_INDEX__CALL_STACK_ITEM;
use crate::traits::Hash;

struct PrivateCallStackItem {
    // This is the _actual_ contract address relating to where this function's code resides in the
    // contract tree. Regardless of whether this is a call or delegatecall, this
    // `contract_address` _does not change_. Amongst other things, it's used as a lookup for
    // getting the correct code from the tree. There is a separate `storage_contract_address`
    // within a CallStackItem which varies depending on whether this is a call or delegatecall.
    contract_address: AztecAddress,
    public_inputs: PrivateCircuitPublicInputs,
    function_data: FunctionData,
    // Not really needed for PrivateCallStackItem.
    is_execution_request: bool,
}

impl Hash for PrivateCallStackItem {
    fn hash(self) -> Field {
        dep::std::hash::pedersen_hash_with_separator([
            self.contract_address.to_field(),
            self.function_data.hash(),
            self.public_inputs.hash(),
        ], GENERATOR_INDEX__CALL_STACK_ITEM)
    }
}
