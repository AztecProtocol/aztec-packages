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
    // ones. Set at most once, by the private call that ends the setup phase, and strictly inside that call's counter
    // range, so it is always greater than 2 when set. Zero means no call has ended setup: at the tail that is legal
    // only for a private-only tx, in which case every side effect is non-revertible. A tx with public calls must
    // set it.
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
    // A hint to what will be the `min_revertible_side_effect_counter` of the transaction. It remains constant
    // throughout the private execution and is checked in the Tail(-to-Public) circuit. The Init circuit checks that
    // it is 0 only when `is_private_only`, and otherwise greater than 2 and above the first call's start counter, so
    // no circuit uses a value the Tail(-to-Public) circuit would reject.
    pub claimed_revertible_counter: u32,
}
