use crate::mocked::AggregationObject;
use crate::constants::misc::NUM_FIELDS_PER_SHA256;
use crate::constants::per_transaction::{MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX,MAX_NEW_CONTRACTS_PER_TX,MAX_NEW_L2_TO_L1_MSGS_PER_TX,MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,MAX_NEW_NULLIFIERS_PER_TX,MAX_NEW_COMMITMENTS_PER_TX};
use crate::abis::new_contract_data::NewContractData;
use crate::abis::optionally_revealed_data::OptionallyRevealedData;

struct FinalAccumulatedData{

    aggregation_object : AggregationObject,

    new_commitments : [Field; MAX_NEW_COMMITMENTS_PER_TX],
    new_nullifiers : [Field; MAX_NEW_NULLIFIERS_PER_TX],
    nullified_commitments : [Field; MAX_NEW_NULLIFIERS_PER_TX],

    // For pending nullifiers, we have:
    // nullifiedCommitments[j] != 0 <==> newNullifiers[j] nullifies nullifiedCommitments[j]

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
    optionally_revealed_data : [OptionallyRevealedData; MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX]
}
