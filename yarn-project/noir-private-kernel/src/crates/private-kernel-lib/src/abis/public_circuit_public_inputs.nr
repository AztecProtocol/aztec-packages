use crate::contrakt::storage_read::StorageRead;
use crate::contrakt::storage_update_request::StorageUpdateRequest;
use crate::address::Address;
use crate::abis::historical_block_data::HistoricalBlockData;
use crate::constants;
use crate::constants::misc::{NUM_FIELDS_PER_SHA256};
use crate::constants::per_call::{MAX_NEW_L2_TO_L1_MSGS_PER_CALL,MAX_NEW_NULLIFIERS_PER_CALL,MAX_NEW_COMMITMENTS_PER_CALL,MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,MAX_PUBLIC_DATA_READS_PER_CALL,MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL};
use crate::constants::misc::{RETURN_VALUES_LENGTH};
use crate::abis::call_context::CallContext;

struct PublicCircuitPublicInputs{
    call_context : CallContext,

    args_hash : Field,
    return_values : [Field; RETURN_VALUES_LENGTH],

    contract_storage_update_requests : [StorageUpdateRequest;MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL],
    contract_storage_reads : [StorageRead; MAX_PUBLIC_DATA_READS_PER_CALL],

    public_call_stack : [Field; MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL],
    new_commitments : [Field; MAX_NEW_COMMITMENTS_PER_CALL],
    new_nullifiers : [Field; MAX_NEW_NULLIFIERS_PER_CALL],
    new_l2_to_l1_msgs : [Field; MAX_NEW_L2_TO_L1_MSGS_PER_CALL],

    unencrypted_logs_hash : [Field; NUM_FIELDS_PER_SHA256],

    // Here so that the gas cost of this request can be measured by circuits, without actually needing to feed in the
    // variable-length data.
    unencrypted_log_preimages_length : Field,

    historical_block_data : HistoricalBlockData,

    prover_address : Address,
}


impl PublicCircuitPublicInputs{
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::PUBLIC_CIRCUIT_PUBLIC_INPUTS;
        0
    }
}