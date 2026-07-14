use crate::{
    abis::{
        accumulated_data::PrivateAccumulatedData, private_tx_constant_data::PrivateTxConstantData,
        public_call_request::PublicCallRequest, validation_requests::PrivateValidationRequests,
    },
    address::AztecAddress,
};

/// Public inputs of the private kernel circuits except for the Tail(-to-Public).
pub struct PrivateKernelCircuitPublicInputs {
    // Constants that remain the same throughout the private execution.
    pub constants: PrivateTxConstantData,
    // The counter that separates non-revertible side effects (which persist even if the tx reverts) from revertible
    // ones. This can only be set at most once by a private call. If not set, all side effects are non-revertible.
    pub min_revertible_side_effect_counter: u32,
    // Validation requests accumulated from private functions.
    pub validation_requests: PrivateValidationRequests,
    // Side effects and call requests accumulated from private functions.
    pub end: PrivateAccumulatedData,
    // The call request for the public teardown function. This can only be set at most once by a private call.
    pub public_teardown_call_request: PublicCallRequest,
    // The address of the fee payer for the transaction. This must be set by one and only one private call.
    pub fee_payer: AztecAddress,
    // The timestamp at which the transaction expires. This value can only decrease with each iteration.
    // It's output from the Tail(-to-Public) circuit and checked in the TxBaseRollup circuit against the timestamp of
    // the block the transaction is included in.
    pub expiration_timestamp: u64,
    // Whether this tx only makes private calls. `false` if at least one public call will be made by any private call.
    // It remains constant throughout the private execution and is checked in the Tail(-to-Public) circuit.
    pub is_private_only: bool,
    // A hint to what will be the first nullifier of the transaction. It's the protocol nullifier if no nullifiers will
    // be emitted by any private call. The first nullifier is used for computing nonces for note hashes. This hint is
    // necessary to avoid the situation where a Reset circuit is used to silo note hashes before the first nullifier is
    // emitted. It remains constant throughout the private execution and is checked in the Tail(-to-Public) circuit.
    // TODO(https://github.com/AztecProtocol/aztec-packages-private/issues/147): this field is no longer needed. Siloing
    // only happens in the terminal reset path, at which point the first nullifier is already present in the accumulated
    // data, so it can be read directly without a separate hint. Remove the field and update every consumer
    // (`private_kernel_circuit_output_composer.nr`, `reset_output_composer.nr`, the TS mirror in
    // `private_kernel_circuit_public_inputs.ts`, and tests).
    pub claimed_first_nullifier: Field,
    // A hint to what will be the `min_revertible_side_effect_counter` of the transaction. It remains constant
    // throughout the private execution and is checked in the Tail(-to-Public) circuit.
    pub claimed_revertible_counter: u32,
}
