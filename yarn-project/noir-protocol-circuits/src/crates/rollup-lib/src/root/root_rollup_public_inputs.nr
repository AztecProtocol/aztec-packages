use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        global_variables::GlobalVariables,
    },
    constants::{
        NUM_FIELDS_PER_SHA256
    },
    header::Header,
};
use dep::types::mocked::AggregationObject;

struct RootRollupPublicInputs {
    // All below are shared between the base and merge rollups
    aggregation_object : AggregationObject,

    global_variables : GlobalVariables,

    header: Header,

    // Should these really be removed?
    // calldata_hash : [Field; NUM_FIELDS_PER_SHA256],
    // l1_to_l2_messages_hash : [Field; NUM_FIELDS_PER_SHA256],
}
