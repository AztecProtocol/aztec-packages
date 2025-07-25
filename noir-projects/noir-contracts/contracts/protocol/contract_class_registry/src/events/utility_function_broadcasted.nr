use dep::aztec::protocol_types::{
    abis::function_selector::FunctionSelector,
    constants::{
        ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
        CLASS_REGISTRY_UTILITY_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS,
        CONTRACT_CLASS_REGISTRY_UTILITY_FUNCTION_BROADCASTED_MAGIC_VALUE,
        MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS,
    },
    contract_class_id::ContractClassId,
    traits::Serialize,
};
use dep::aztec::protocol_types::traits::ToField;
use std::meta::derive;

#[derive(Serialize)]
pub struct InnerUtilityFunction {
    pub selector: FunctionSelector,
    pub metadata_hash: Field,
}

#[derive(Serialize)]
pub struct UtilityFunction {
    pub selector: FunctionSelector,
    pub metadata_hash: Field,
    pub bytecode: [Field; MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS],
}

// #[event]
pub struct ClassUtilityFunctionBroadcasted {
    pub contract_class_id: ContractClassId,
    pub artifact_metadata_hash: Field,
    pub private_functions_artifact_tree_root: Field,
    pub artifact_function_tree_sibling_path: [Field; ARTIFACT_FUNCTION_TREE_MAX_HEIGHT],
    pub artifact_function_tree_leaf_index: Field,
    pub function: UtilityFunction,
}

impl ClassUtilityFunctionBroadcasted {
    pub fn serialize_non_standard(
        self: Self,
    ) -> [Field; MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS + CLASS_REGISTRY_UTILITY_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS] {
        let mut packed = [
            0; MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS
                + CLASS_REGISTRY_UTILITY_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS
        ];
        // Since we are not yet emitting selectors we'll use this magic value to identify events emitted by the ClassRegistry.
        packed[0] = CONTRACT_CLASS_REGISTRY_UTILITY_FUNCTION_BROADCASTED_MAGIC_VALUE;
        packed[1] = self.contract_class_id.to_field();
        packed[2] = self.artifact_metadata_hash;
        packed[3] = self.private_functions_artifact_tree_root;
        for i in 0..ARTIFACT_FUNCTION_TREE_MAX_HEIGHT {
            packed[i + 4] = self.artifact_function_tree_sibling_path[i];
        }
        packed[4 + ARTIFACT_FUNCTION_TREE_MAX_HEIGHT] = self.artifact_function_tree_leaf_index;
        let packed_function = self.function.serialize();
        for i in 0..MAX_PACKED_BYTECODE_SIZE_PER_UTILITY_FUNCTION_IN_FIELDS + 2 {
            packed[i + 5 + ARTIFACT_FUNCTION_TREE_MAX_HEIGHT] = packed_function[i];
        }
        packed
    }
}
