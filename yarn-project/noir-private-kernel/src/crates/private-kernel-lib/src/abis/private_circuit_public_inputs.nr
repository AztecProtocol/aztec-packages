use crate::abis::call_context::CallContext;
use crate::constants;
use crate::constants::misc::RETURN_VALUES_LENGTH;
use crate::constants::per_call::{MAX_READ_REQUESTS_PER_CALL,MAX_NEW_COMMITMENTS_PER_CALL,MAX_NEW_NULLIFIERS_PER_CALL,MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,MAX_NEW_L2_TO_L1_MSGS_PER_CALL};
use crate::constants::misc::{NUM_FIELDS_PER_SHA256};
use crate::abis::historical_block_data::HistoricalBlockData;
use crate::contrakt::deployment_data::ContractDeploymentData;

struct PrivateCircuitPublicInputs{
    call_context : CallContext,
    
    args_hash : Field,
    return_values : [Field; RETURN_VALUES_LENGTH],

    read_requests : [Field; MAX_READ_REQUESTS_PER_CALL],

    new_commitments : [Field; MAX_NEW_COMMITMENTS_PER_CALL],
    new_nullifiers : [Field; MAX_NEW_NULLIFIERS_PER_CALL],
    nullified_commitments : [Field; MAX_NEW_NULLIFIERS_PER_CALL],

    private_call_stack : [Field; MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL],
    public_call_stack : [Field; MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL],
    new_l2_to_l1_msgs : [Field; MAX_NEW_L2_TO_L1_MSGS_PER_CALL],

    encrypted_logs_hash : [Field; NUM_FIELDS_PER_SHA256],
    unencrypted_logs_hash : [Field; NUM_FIELDS_PER_SHA256],

    // Here so that the gas cost of this request can be measured by circuits, without actually needing to feed in the
    // variable-length data.
    encrypted_log_preimages_length : Field,
    unencrypted_log_preimages_length : Field,

    historical_block_data : HistoricalBlockData,

    contract_deployment_data : ContractDeploymentData,

    chain_id : Field,
    version : Field,
}

impl PrivateCircuitPublicInputs{
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::PRIVATE_CIRCUIT_PUBLIC_INPUTS;
        0
    }
}