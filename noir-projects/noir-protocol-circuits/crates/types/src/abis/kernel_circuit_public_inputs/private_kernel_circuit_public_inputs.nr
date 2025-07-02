use crate::{
    abis::{
        accumulated_data::PrivateAccumulatedData,
        include_by_timestamp_option::IncludeByTimestampOption,
        public_call_request::PublicCallRequest, tx_constant_data::TxConstantData,
        validation_requests::PrivateValidationRequests,
    },
    address::AztecAddress,
    traits::Empty,
};

pub struct PrivateKernelCircuitPublicInputs {
    pub constants: TxConstantData,
    pub min_revertible_side_effect_counter: u32,
    pub validation_requests: PrivateValidationRequests,
    pub end: PrivateAccumulatedData,
    pub public_teardown_call_request: PublicCallRequest,
    pub fee_payer: AztecAddress,
    pub include_by_timestamp: IncludeByTimestampOption,
    pub is_private_only: bool, // What does this mean? Oh, only private functions?
    pub claimed_first_nullifier: Field,
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
    }
}

impl Empty for PrivateKernelCircuitPublicInputs {
    fn empty() -> Self {
        Self {
            constants: TxConstantData::empty(),
            min_revertible_side_effect_counter: 0,
            validation_requests: PrivateValidationRequests::empty(),
            end: PrivateAccumulatedData::empty(),
            public_teardown_call_request: PublicCallRequest::empty(),
            fee_payer: AztecAddress::empty(),
            include_by_timestamp: IncludeByTimestampOption::none(),
            is_private_only: false,
            claimed_first_nullifier: 0,
        }
    }
}
