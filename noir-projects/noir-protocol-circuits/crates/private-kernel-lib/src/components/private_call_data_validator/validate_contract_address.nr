use dep::types::{
    abis::{
        private_kernel::private_call_data::PrivateCallData, protocol_contracts::ProtocolContracts,
    },
    address::AztecAddress,
    constants::{
        CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, DEFAULT_UPDATE_DELAY, UPDATED_CLASS_IDS_SLOT,
    },
    contract_class_id::ContractClassId,
    delayed_public_mutable::{
        delayed_public_mutable_values::DelayedPublicMutableValues,
        with_hash::validate_with_hash_hints,
    },
    hash::private_functions_root_from_siblings,
    storage::map::derive_storage_slot_in_map,
    traits::{Empty, Packable},
};

/// Validate that the function that was executed (its vk) exists in the contract_address' current class_id.
pub fn validate_contract_address(
    private_call_data: PrivateCallData,
    protocol_contracts: ProtocolContracts,
) {
    let contract_address = private_call_data.public_inputs.call_context.contract_address;

    // `hints` is all address preimage data needed to demonstrate that a vk exists in a given contract address.
    // It's a "membership witness" for a vk's existence in an address, if you will.
    let hints = private_call_data.verification_key_hints;

    // ~500 constraints
    let private_functions_root = private_functions_root_from_siblings(
        private_call_data.public_inputs.call_context.function_selector,
        private_call_data.vk.hash, // vk.hash is verified in bb when verifying the proof.
        hints.function_leaf_membership_witness.leaf_index,
        hints.function_leaf_membership_witness.sibling_path,
    );

    let contract_class_id = ContractClassId::compute(
        hints.contract_class_artifact_hash,
        private_functions_root,
        hints.contract_class_public_bytecode_commitment,
    );

    // ~1300 constraints
    let computed_address = AztecAddress::compute_from_class_id(
        contract_class_id,
        hints.salted_initialization_hash,
        hints.public_keys,
    );

    // We will only conditionally check that `computed_address` against the `contract_address` of the private call.
    // There are cases where the above derivation is not relevant:
    // - It could be that the private call was at a "magic" precompile address,
    // - It could be that the contract's class_id has been _upgraded_ from the original class_id
    // to a newer one stored within the contract upgrade registry.

    // Here, we directly read a storage slot of the contract upgrade registry, in case it
    // contains an updated contract_class_id.
    // ~900 constraints
    let delayed_public_mutable_values: DelayedPublicMutableValues<ContractClassId, DEFAULT_UPDATE_DELAY> =
        Packable::unpack(hints.updated_class_id_delayed_public_mutable_values);

    // A time horizon for this delayed public mutable should be set separately when generating/validating kernel output.
    // This is a confusingly-named function.
    validate_with_hash_hints(
        private_call_data.public_inputs.anchor_block_header,
        derive_storage_slot_in_map(UPDATED_CLASS_IDS_SLOT as Field, contract_address),
        CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
        delayed_public_mutable_values,
        hints.updated_class_id_witness,
        hints.updated_class_id_leaf,
    );

    // Q: How is the private call's vk validated against this updated_contract_class_id?
    // A: below, we assert that the previously-computed contract_class_id == updated_contract_class_id.
    let updated_contract_class_id = delayed_public_mutable_values.svc.get_current_at(
        private_call_data.public_inputs.anchor_block_header.global_variables.timestamp,
    );

    let is_protocol_contract = ProtocolContracts::is_protocol_contract_address(contract_address);

    let is_updated_contract = !updated_contract_class_id.is_empty();

    let address_derivation_check =
        !is_protocol_contract & (computed_address == contract_address) & !is_updated_contract;
    let updated_class_check = !is_protocol_contract
        & is_updated_contract
        & (contract_class_id == updated_contract_class_id);

    let expected_protocol_contract_derived_address = if is_protocol_contract {
        protocol_contracts.get_derived_address(contract_address)
    } else {
        AztecAddress::zero()
    };

    let protocol_contract_check = is_protocol_contract
        & (expected_protocol_contract_derived_address == computed_address) // If the protocol contract doesn't exist yet, its derived address will be zero and a proof won't be generated.
        & !is_updated_contract;

    // We can have a normal contract address, which must match the calculated address, an updated contract so the class id used must be the updated one, or
    // A computed protocol contract address which exists at the index held in call_context.contract_address.
    assert(
        address_derivation_check | updated_class_check | protocol_contract_check,
        "computed contract address does not match expected one",
    );
}
