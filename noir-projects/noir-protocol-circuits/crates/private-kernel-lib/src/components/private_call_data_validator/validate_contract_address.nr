use dep::types::{
    abis::private_kernel::private_call_data::PrivateCallData, address::AztecAddress,
    constants::MAX_PROTOCOL_CONTRACTS, merkle_tree::conditionally_assert_check_membership,
    traits::ToField,
};

pub fn validate_contract_address(
    private_call_data: PrivateCallData,
    protocol_contract_tree_root: Field,
) {
    let contract_address = private_call_data.public_inputs.call_context.contract_address;
    assert(!contract_address.is_zero(), "contract address cannot be zero");

    private_call_data.vk.check_hash();

    let computed_address = AztecAddress::compute_from_private_function(
        private_call_data.public_inputs.call_context.function_selector,
        private_call_data.vk.hash,
        private_call_data.function_leaf_membership_witness,
        private_call_data.contract_class_artifact_hash,
        private_call_data.contract_class_public_bytecode_commitment,
        private_call_data.salted_initialization_hash,
        private_call_data.public_keys,
    );

    let contract_address_field = contract_address.to_field();
    let is_protocol_contract = contract_address_field.lt(MAX_PROTOCOL_CONTRACTS as Field);

    // We either have a normal contract address, which must match the calculated address, or
    // A computed protocol contract address which exists at the index held in call_context.contract_address.
    assert(
        (!is_protocol_contract & computed_address.eq(contract_address))
            | (
                is_protocol_contract
                    & private_call_data.protocol_contract_membership_witness.leaf_index.eq(
                        contract_address_field,
                    )
            ),
        "computed contract address does not match expected one",
    );

    // A normal computed contract address
    conditionally_assert_check_membership(
        computed_address.to_field(),
        is_protocol_contract,
        private_call_data.protocol_contract_leaf,
        private_call_data.protocol_contract_membership_witness,
        protocol_contract_tree_root,
    );
}
