use dep::aztec::protocol_types::{
    abis::function_selector::FunctionSelector,
    constants::{
        ARTIFACT_FUNCTION_TREE_MAX_HEIGHT,
        CLASS_REGISTRY_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS,
        CONTRACT_CLASS_REGISTRY_PRIVATE_FUNCTION_BROADCASTED_MAGIC_VALUE, FUNCTION_TREE_HEIGHT,
        MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS,
    },
    contract_class_id::ContractClassId,
    traits::Serialize,
};
use dep::aztec::protocol_types::traits::ToField;
use std::meta::derive;

#[derive(Serialize)]
pub struct InnerPrivateFunction {
    selector: FunctionSelector,
    metadata_hash: Field,
    vk_hash: Field,
}

#[derive(Serialize)]
pub struct PrivateFunction {
    selector: FunctionSelector,
    metadata_hash: Field,
    vk_hash: Field,
    bytecode: [Field; MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS],
}

// #[event]
pub struct ClassPrivateFunctionBroadcasted {
    contract_class_id: ContractClassId,
    artifact_metadata_hash: Field,
    utility_functions_artifact_tree_root: Field,
    private_function_tree_sibling_path: [Field; FUNCTION_TREE_HEIGHT],
    private_function_tree_leaf_index: Field,
    artifact_function_tree_sibling_path: [Field; ARTIFACT_FUNCTION_TREE_MAX_HEIGHT],
    artifact_function_tree_leaf_index: Field,
    function: PrivateFunction,
}

impl ClassPrivateFunctionBroadcasted {
    fn serialize_non_standard(
        self: Self,
    ) -> [Field; MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS + CLASS_REGISTRY_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS] {
        let mut packed = [
            0; MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS
                + CLASS_REGISTRY_PRIVATE_FUNCTION_BROADCASTED_ADDITIONAL_FIELDS
        ];
        // Since we are not yet emitting selectors we'll use this magic value to identify events emitted by the ClassRegistry.
        packed[0] = CONTRACT_CLASS_REGISTRY_PRIVATE_FUNCTION_BROADCASTED_MAGIC_VALUE;
        packed[1] = self.contract_class_id.to_field();
        packed[2] = self.artifact_metadata_hash;
        packed[3] = self.utility_functions_artifact_tree_root;
        for i in 0..FUNCTION_TREE_HEIGHT {
            packed[i + 4] = self.private_function_tree_sibling_path[i];
        }
        packed[4 + FUNCTION_TREE_HEIGHT] = self.private_function_tree_leaf_index;
        for i in 0..ARTIFACT_FUNCTION_TREE_MAX_HEIGHT {
            packed[i + 5 + FUNCTION_TREE_HEIGHT] = self.artifact_function_tree_sibling_path[i];
        }
        packed[5 + ARTIFACT_FUNCTION_TREE_MAX_HEIGHT + FUNCTION_TREE_HEIGHT] =
            self.artifact_function_tree_leaf_index;
        let packed_function = self.function.serialize();
        for i in 0..MAX_PACKED_BYTECODE_SIZE_PER_PRIVATE_FUNCTION_IN_FIELDS + 3 {
            packed[i + 6 + ARTIFACT_FUNCTION_TREE_MAX_HEIGHT + FUNCTION_TREE_HEIGHT] =
                packed_function[i];
        }
        packed
    }
}
