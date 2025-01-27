use dep::aztec::prelude::FunctionSelector;
use dep::aztec::protocol_types::{
    constants::{
        ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
        MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS,
        REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS,
        REGISTERER_UNCONSTRAINED_FUNCTION_BROADCASTED_MAGIC_VALUE,
    },
    contract_class_id::ContractClassId,
    traits::Serialize,
};
use std::meta::derive;

#[derive(Serialize)]
pub struct InnerUnconstrainedFunction {
    selector: FunctionSelector,
    metadata_hash: Field,
}

#[derive(Serialize)]
pub struct UnconstrainedFunction {
    selector: FunctionSelector,
    metadata_hash: Field,
    bytecode: [Field; MAX_PACKED_BYTECODE_SIZE_PER_UNCONSTRAINED_FUNCTION_IN_FIELDS],
}

// #[event]
#[derive(Serialize)]
pub struct ClassUnconstrainedFunctionBroadcasted {
    contract_class_id: ContractClassId,
    artifact_metadata_hash: Field,
    private_functions_artifact_tree_root: Field,
    artifact_function_tree_sibling_path: [Field; ARTIFACT_FUNCTION_TREE_MAX_HEIGHT],
    artifact_function_tree_leaf_index: Field,
    function: UnconstrainedFunction,
}
