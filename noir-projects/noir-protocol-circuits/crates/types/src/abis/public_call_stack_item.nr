use crate::abis::{function_data::FunctionData, public_circuit_public_inputs::PublicCircuitPublicInputs};
use crate::address::AztecAddress;

// TODO(#7124): To be deprecated.
struct PublicCallStackItem {
    contract_address: AztecAddress,
    public_inputs: PublicCircuitPublicInputs,
    function_data: FunctionData,
}
