use dep::types::{
    abis::{
        block_header::BlockHeader, private_kernel::private_call_data::PrivateCallData,
        protocol_contracts::ProtocolContracts,
    },
    address::AztecAddress,
    constants::{
        CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, DEFAULT_UPDATE_DELAY, PUBLIC_DATA_TREE_HEIGHT,
        UPDATED_CLASS_IDS_SLOT,
    },
    contract_class_id::ContractClassId,
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    delayed_public_mutable::{
        delayed_public_mutable_values::DelayedPublicMutableValues,
        with_hash::read_current_value_of_delayed_public_mutable_with_hash,
    },
    hash::private_functions_root_from_siblings,
    merkle_tree::membership::MembershipWitness,
    storage::map::derive_storage_slot_in_map,
    traits::{Empty, Packable},
};

/// Validates that a private function belongs to the contract being called.
///
/// This function handles three types of contracts:
/// 1. **Regular contracts**: The contract address is derived from the contract class id, salt, and public keys.
///    We verify that the function's VK hash is part of the contract's private functions tree.
/// 2. **Protocol contracts**: Canonical addresses defined by the protocol (e.g., contract instance registry).
///    These have a fixed "magic" address that maps to a derived address containing the actual code.
/// 3. **Updated contracts**: Contracts whose class id has been changed via the contract instance registry.
///    We read the updated class id from the public data tree and verify the function belongs to that class.
///
/// The validation flow:
/// 1. Compute the private_functions_root from the function selector and VK hash
/// 2. Compute the contract_class_id from the private_functions_root
/// 3. Compute the expected contract_address from the class id
/// 4. Check if the address matches as a protocol contract, updated contract, or regular contract
///
/// See `noir-contracts/contracts/protocol/contract_instance_registry/src/main.nr > update` for more details on how the
/// contract upgrade is performed.
pub fn validate_contract_address(
    private_call_data: PrivateCallData,
    protocol_contracts: ProtocolContracts,
) {
    let contract_address = private_call_data.public_inputs.call_context.contract_address;

    // Step 1: Compute the class id and contract address from the function being executed.

    let function_selector = private_call_data.public_inputs.call_context.function_selector;
    // vk.hash is validated against vk.key in Barretenberg during proof verification.
    let vk_hash = private_call_data.vk.hash;

    // The hints provide preimage data for computing the class id and address.
    // These cannot be manipulated to derive values that don't contain this function.
    let hints = private_call_data.verification_key_hints;

    // Prove the function exists in the contract's private functions tree.
    // ~500 constraints
    let private_functions_root = private_functions_root_from_siblings(
        function_selector,
        vk_hash,
        hints.function_leaf_membership_witness.leaf_index,
        hints.function_leaf_membership_witness.sibling_path,
    );

    // Compute the class id from the private functions root and other class metadata.
    let computed_contract_class_id = ContractClassId::compute(
        hints.contract_class_artifact_hash,
        private_functions_root,
        hints.contract_class_public_bytecode_commitment,
    );

    // Compute the expected contract address from the class id.
    // ~1300 constraints
    let computed_address = AztecAddress::compute_from_class_id(
        computed_contract_class_id,
        hints.salted_initialization_hash,
        hints.public_keys,
    );

    // Step 2: Check if it's a protocol contract (has a "magic" canonical address).

    let is_protocol_contract = ProtocolContracts::is_protocol_contract_address(contract_address);

    let expected_protocol_contract_derived_address = if is_protocol_contract {
        protocol_contracts.get_derived_address(contract_address)
    } else {
        AztecAddress::zero()
    };
    let protocol_contract_check_ok = computed_address == expected_protocol_contract_derived_address;

    assert(
        !is_protocol_contract | protocol_contract_check_ok,
        "computed contract address does not match protocol contract derived address",
    );

    // Step 3: Check if it's an updated contract (class id changed via registry).

    let updated_contract_class_id = get_updated_contract_class_id(
        contract_address,
        private_call_data.public_inputs.anchor_block_header,
        hints.updated_class_id_delayed_public_mutable_values,
        hints.updated_class_id_witness,
        hints.updated_class_id_leaf,
    );

    let is_updated_contract = !updated_contract_class_id.is_empty();

    let updated_class_check_ok = computed_contract_class_id == updated_contract_class_id;

    assert(
        !is_updated_contract | updated_class_check_ok,
        "computed contract class id does not match updated contract class id",
    );

    // Step 4: If not protocol or updated, it must be a regular contract.

    let is_regular_contract = !is_protocol_contract & !is_updated_contract;

    let address_derivation_check_ok = computed_address == contract_address;

    assert(
        !is_regular_contract | address_derivation_check_ok,
        "computed contract address does not match expected one",
    );
}

/// Reads the updated class id from the contract instance registry, if one exists.
/// Uses a delayed public mutable to ensure updates have taken effect.
/// Returns Some(class_id) if the contract has been updated, None otherwise.
fn get_updated_contract_class_id(
    contract_address: AztecAddress,
    anchor_block_header: BlockHeader,
    delayed_public_mutable_values: [Field; 3],
    witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    leaf_preimage: PublicDataTreeLeafPreimage,
) -> ContractClassId {
    // ~900 constraints
    let delayed_public_mutable: DelayedPublicMutableValues<ContractClassId, DEFAULT_UPDATE_DELAY> =
        Packable::unpack(delayed_public_mutable_values);

    // Derive the storage slot for the `updated_class_ids` state variable in the contract instance registry.
    // The correct `delayed_public_mutable_values`, `witness`, and `leaf_preimage` are provided as hints to prove
    // whether the hash of the delayed public mutable value exists in the tree. This value is located at a fixed
    // offset from the derived `storage_slot`.
    // These hints cannot be manipulated to produce a different result.
    let storage_slot =
        derive_storage_slot_in_map(UPDATED_CLASS_IDS_SLOT as Field, contract_address);

    // Read the current value, proving it exists (or doesn't) in the public data tree.
    // A time horizon for this delayed public mutable should be set separately when generating/validating kernel output.
    read_current_value_of_delayed_public_mutable_with_hash(
        anchor_block_header,
        storage_slot,
        CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
        delayed_public_mutable,
        witness,
        leaf_preimage,
    )
}
