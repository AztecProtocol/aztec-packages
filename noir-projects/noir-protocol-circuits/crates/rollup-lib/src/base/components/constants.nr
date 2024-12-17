use types::abis::{
    combined_constant_data::CombinedConstantData, constant_rollup_data::ConstantRollupData,
};

pub(crate) fn validate_combined_constant_data(
    constants: CombinedConstantData,
    rollup_constants: ConstantRollupData,
) {
    // Verify the kernel chain_id and versions
    assert(
        constants.tx_context.chain_id == rollup_constants.global_variables.chain_id,
        "kernel chain_id does not match the rollup chain_id",
    );
    assert(
        constants.tx_context.version == rollup_constants.global_variables.version,
        "kernel version does not match the rollup version",
    );
    assert(
        constants.vk_tree_root == rollup_constants.vk_tree_root,
        "kernel vk_tree_root does not match the rollup vk_tree_root",
    );
    assert(
        constants.protocol_contract_tree_root == rollup_constants.protocol_contract_tree_root,
        "kernel protocol_contract_tree_root does not match the rollup protocol_contract_tree_root",
    );

    // Verify the kernel global variables if set, note these can be empty if this is a request coming directly from the private kernel tail.
    // TODO(@spalladino) How can we check that this is a request coming from the private kernel tail?
    assert(
        constants.global_variables.is_empty()
            | (constants.global_variables == rollup_constants.global_variables),
        "kernel global variables do not match the rollup global variables",
    );
}
