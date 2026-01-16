use crate::{
    abis::{
        accumulated_data::PrivateAccumulatedData, private_tx_constant_data::PrivateTxConstantData,
        public_call_request::PublicCallRequest, validation_requests::PrivateValidationRequests,
    },
    address::AztecAddress,
    traits::Empty,
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
    pub include_by_timestamp: u64,
    // Whether this tx only makes private calls. `false` if at least one public call will be made by any private call.
    // It remains constant throughout the private execution and is checked in the Tail(-to-Public) circuit.
    pub is_private_only: bool,
    // A hint to what will be the first nullifier of the transaction. It's the protocol nullifier if no nullifiers will
    // be emitted by any private call. The first nullifier is used for computing nonces for note hashes. This hint is
    // necessary to avoid the situation where a Reset circuit is used to silo note hashes before the first nullifier is
    // emitted. It remains constant throughout the private execution and is checked in the Tail(-to-Public) circuit.
    pub claimed_first_nullifier: Field,
    // A hint to what will be the `min_revertible_side_effect_counter` of the transaction. It remains constant
    // throughout the private execution and is checked in the Tail(-to-Public) circuit.
    pub claimed_revertible_counter: u32,
}

impl Eq for PrivateKernelCircuitPublicInputs {
    fn eq(self, other: Self) -> bool {
        (self.constants.eq(other.constants))
            & (self.min_revertible_side_effect_counter == other.min_revertible_side_effect_counter)
            & (self.validation_requests.eq(other.validation_requests))
            & (self.end.eq(other.end))
            & (self.public_teardown_call_request.eq(other.public_teardown_call_request))
            & (self.fee_payer.eq(other.fee_payer))
            & (self.include_by_timestamp == other.include_by_timestamp)
            & (self.is_private_only == other.is_private_only)
            & (self.claimed_first_nullifier == other.claimed_first_nullifier)
            & (self.claimed_revertible_counter == other.claimed_revertible_counter)
    }
}

impl Empty for PrivateKernelCircuitPublicInputs {
    fn empty() -> Self {
        Self {
            constants: PrivateTxConstantData::empty(),
            min_revertible_side_effect_counter: 0,
            validation_requests: PrivateValidationRequests::empty(),
            end: PrivateAccumulatedData::empty(),
            public_teardown_call_request: PublicCallRequest::empty(),
            fee_payer: AztecAddress::empty(),
            include_by_timestamp: 0,
            is_private_only: false,
            claimed_first_nullifier: 0,
            claimed_revertible_counter: 0,
        }
    }
}
