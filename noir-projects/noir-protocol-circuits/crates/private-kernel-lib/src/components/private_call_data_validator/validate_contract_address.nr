use dep::types::{
    abis::private_kernel::private_call_data::PrivateCallData,
    address::AztecAddress,
    constants::{DEFAULT_UPDATE_DELAY, DEPLOYER_CONTRACT_ADDRESS, MAX_PROTOCOL_CONTRACTS},
    contract_class_id::ContractClassId,
    hash::private_functions_root_from_siblings,
    merkle_tree::root::root_from_sibling_path,
    shared_mutable::{
        scheduled_delay_change::ScheduledDelayChange, scheduled_value_change::ScheduledValueChange,
        validate_shared_mutable_hints,
    },
    storage::map::derive_storage_slot_in_map,
    traits::{Deserialize, ToField},
};

pub fn validate_contract_address(
    private_call_data: PrivateCallData,
    protocol_contract_tree_root: Field,
) {
    let contract_address = private_call_data.public_inputs.call_context.contract_address;
    assert(!contract_address.is_zero(), "contract address cannot be zero");

    private_call_data.vk.check_hash();

    let hints = private_call_data.verification_key_hints;

    let private_functions_root = private_functions_root_from_siblings(
        private_call_data.public_inputs.call_context.function_selector,
        private_call_data.vk.hash,
        hints.function_leaf_membership_witness.leaf_index,
        hints.function_leaf_membership_witness.sibling_path,
    );

    let contract_class_id = ContractClassId::compute(
        hints.contract_class_artifact_hash,
        private_functions_root,
        hints.contract_class_public_bytecode_commitment,
    );

    let computed_address = AztecAddress::compute_from_class_id(
        contract_class_id,
        hints.salted_initialization_hash,
        hints.public_keys,
    );

    let protocol_contract_index = contract_address.to_field();
    let computed_protocol_contract_tree_root = if (MAX_PROTOCOL_CONTRACTS as Field).lt(
        protocol_contract_index,
    ) {
        0
    } else {
        root_from_sibling_path(
            computed_address.to_field(),
            protocol_contract_index,
            private_call_data.verification_key_hints.protocol_contract_sibling_path,
        )
    };

    let value_change: ScheduledValueChange<ContractClassId> =
        Deserialize::deserialize(hints.updated_class_id_value_change);
    let delay_change: ScheduledDelayChange<DEFAULT_UPDATE_DELAY> =
        Deserialize::deserialize(hints.updated_class_id_delay_change);

    // A block horizon for this shared mutable should be set separately when generating/validating kernel output
    validate_shared_mutable_hints(
        private_call_data.public_inputs.historical_header,
        derive_storage_slot_in_map(1, contract_address),
        DEPLOYER_CONTRACT_ADDRESS,
        value_change,
        delay_change,
        hints.updated_class_id_witness,
        hints.updated_class_id_leaf,
    );

    let updated_contract_class_id = value_change.get_current_at(
        private_call_data.public_inputs.historical_header.global_variables.block_number as u32,
    );

    assert(
        computed_address.eq(contract_address)
            | computed_protocol_contract_tree_root.eq(protocol_contract_tree_root)
            | contract_class_id.eq(updated_contract_class_id),
        "computed contract address does not match expected one",
    );
}

