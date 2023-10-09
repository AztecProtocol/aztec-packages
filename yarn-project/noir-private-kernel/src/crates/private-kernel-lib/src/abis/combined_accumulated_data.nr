use crate::mocked::AggregationObject;
use crate::abis::new_contract_data::NewContractData;
use crate::abis::optionally_revealed_data::OptionallyRevealedData;
use crate::abis::public_data_update_request::PublicDataUpdateRequest;
use crate::abis::public_data_read::PublicDataRead;
use crate::constants::per_transaction::{MAX_READ_REQUESTS_PER_TX,MAX_NEW_COMMITMENTS_PER_TX,MAX_NEW_NULLIFIERS_PER_TX,
                                        MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
                                        MAX_NEW_L2_TO_L1_MSGS_PER_TX,MAX_NEW_CONTRACTS_PER_TX,
                                        MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX,MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
                                        MAX_PUBLIC_DATA_READS_PER_TX
                                        };
use crate::constants::misc::NUM_FIELDS_PER_SHA256;

struct CombinedAccumulatedData {
    aggregation_object : AggregationObject,

    read_requests : [Field;MAX_READ_REQUESTS_PER_TX],

    new_commitments : [Field; MAX_NEW_COMMITMENTS_PER_TX],
    new_nullifiers : [Field; MAX_NEW_NULLIFIERS_PER_TX],
    nullified_commitments : [Field; MAX_NEW_NULLIFIERS_PER_TX],

    private_call_stack : [Field; MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX],
    public_call_stack : [Field; MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX],
    new_l2_to_l1_msgs : [Field; MAX_NEW_L2_TO_L1_MSGS_PER_TX],

    encrypted_logs_hash : [Field; NUM_FIELDS_PER_SHA256],
    unencrypted_logs_hash : [Field; NUM_FIELDS_PER_SHA256],

    // Here so that the gas cost of this request can be measured by circuits, without actually needing to feed in the
    // variable-length data.
    encrypted_log_preimages_length : Field,
    unencrypted_log_preimages_length : Field,

    new_contracts : [NewContractData; MAX_NEW_CONTRACTS_PER_TX],

    optionally_revealed_data : [OptionallyRevealedData; MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX],

    public_data_update_requests : [PublicDataUpdateRequest; MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],

    public_data_reads : [PublicDataRead; MAX_PUBLIC_DATA_READS_PER_TX]
}