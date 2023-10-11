use crate::mocked::AggregationObject;
use crate::abis::new_contract_data::NewContractData;
use crate::abis::optionally_revealed_data::OptionallyRevealedData;
use crate::abis::public_data_update_request::PublicDataUpdateRequest;
use crate::abis::public_data_read::PublicDataRead;
use dep::aztec::constants_gen::{
    MAX_READ_REQUESTS_PER_TX,
    MAX_NEW_COMMITMENTS_PER_TX,
    MAX_NEW_NULLIFIERS_PER_TX,
    MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
    MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
    MAX_NEW_L2_TO_L1_MSGS_PER_TX,
    MAX_NEW_CONTRACTS_PER_TX,
    MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX,
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    MAX_PUBLIC_DATA_READS_PER_TX
};
use crate::hash::NUM_FIELDS_PER_SHA256;
use crate::utils::bounded_vec::BoundedVec;

struct CombinedAccumulatedData {
    aggregation_object : AggregationObject,

    read_requests : BoundedVec<Field,MAX_READ_REQUESTS_PER_TX>,

    new_commitments : BoundedVec<Field, MAX_NEW_COMMITMENTS_PER_TX>,
    new_nullifiers : BoundedVec<Field, MAX_NEW_NULLIFIERS_PER_TX>,
    nullified_commitments : BoundedVec<Field, MAX_NEW_NULLIFIERS_PER_TX>,

    private_call_stack : BoundedVec<Field, MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX>,
    public_call_stack : BoundedVec<Field, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    new_l2_to_l1_msgs : BoundedVec<Field, MAX_NEW_L2_TO_L1_MSGS_PER_TX>,

    encrypted_logs_hash : [Field; NUM_FIELDS_PER_SHA256],
    unencrypted_logs_hash : [Field; NUM_FIELDS_PER_SHA256],

    // Here so that the gas cost of this request can be measured by circuits, without actually needing to feed in the
    // variable-length data.
    encrypted_log_preimages_length : Field,
    unencrypted_log_preimages_length : Field,

    new_contracts : BoundedVec<NewContractData, MAX_NEW_CONTRACTS_PER_TX>,

    optionally_revealed_data : BoundedVec<OptionallyRevealedData, MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX>,

    public_data_update_requests : BoundedVec<PublicDataUpdateRequest, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX>,

    public_data_reads : BoundedVec<PublicDataRead, MAX_PUBLIC_DATA_READS_PER_TX>
}
