use dep::types::{
    abis::private_kernel::private_call_data::PrivateCallData,
    address::AztecAddress,
    constants::{
        DEFAULT_UPDATE_DELAY, DEPLOYER_CONTRACT_ADDRESS, MAX_PROTOCOL_CONTRACTS,
        UPDATED_CLASS_IDS_SLOT,
    },
    contract_class_id::ContractClassId,
    hash::private_functions_root_from_siblings,
    merkle_tree::conditionally_assert_check_membership,
    shared_mutable::{
        shared_mutable_values::SharedMutableValues, with_hash::validate_with_hash_hints,
    },
    storage::map::derive_storage_slot_in_map,
    traits::{Empty, Packable, ToField},
};

fn is_protocol_contract(contract_address_field: Field) -> bool {
    // let contract_address_field = contract_address.to_field();
    // Reinstate if we change MAX_PROTOCOL_CONTRACTS to a value larger than 154 (which is the number of constraints of `.lt()`:
    // let is_protocol_contract = contract_address_field.lt(MAX_PROTOCOL_CONTRACTS as Field);
    let mut acc = 1;
    for i in 0..MAX_PROTOCOL_CONTRACTS {
        // If the contract address matches any of the precompile addresses (`i`), then `acc` will be 0.
        acc *= (contract_address_field - (i as Field));
    }
    acc == 0
}

/// Validate that the function that was executed (its vk) exists in the contract_address' current class_id.
pub fn validate_contract_address(
    private_call_data: PrivateCallData,
    protocol_contract_tree_root: Field,
) {
    let contract_address = private_call_data.public_inputs.call_context.contract_address;

    // `hints` is all address preimage data needed to demonstrate that a vk exists in a given contract address.
    // It's a "membership witness" for a vk's existence in an address, if you will.
    let hints = private_call_data.verification_key_hints;

    // ~500 constraints
    let private_functions_root = private_functions_root_from_siblings(
        private_call_data.public_inputs.call_context.function_selector,
        private_call_data.vk.hash, // vk.hash is verified in `PrivateCallData.verify()`
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
    let shared_mutable_values: SharedMutableValues<ContractClassId, DEFAULT_UPDATE_DELAY> =
        Packable::unpack(hints.updated_class_id_shared_mutable_values);

    // A block horizon for this shared mutable should be set separately when generating/validating kernel output.
    // This is a confusingly-named function.
    validate_with_hash_hints(
        private_call_data.public_inputs.historical_header,
        derive_storage_slot_in_map(UPDATED_CLASS_IDS_SLOT as Field, contract_address),
        DEPLOYER_CONTRACT_ADDRESS,
        shared_mutable_values,
        hints.updated_class_id_witness,
        hints.updated_class_id_leaf,
    );

    // Q: How is the private call's vk validated against this updated_contract_class_id?
    // A: below, we assert that the previously-computed contract_class_id == updated_contract_class_id.
    let updated_contract_class_id = shared_mutable_values.svc.get_current_at(
        private_call_data.public_inputs.historical_header.global_variables.block_number as u32,
    );

    let contract_address_field = contract_address.to_field();
    // Reinstate if we change MAX_PROTOCOL_CONTRACTS to a value larger than 154 (which is the number of constraints of `.lt()`:
    // let is_protocol_contract = contract_address_field.lt(MAX_PROTOCOL_CONTRACTS as Field);
    let is_protocol_contract = is_protocol_contract(contract_address_field); // WHY IS THIS MORE EXPENSIVE THAN THE `.lt()`, I DON'T UNDERSTAND. This fn is 13 gates. A lt is 154 gates.
    let is_updated_contract = !updated_contract_class_id.is_empty();

    // Should we use `if` statements to make this more legible? Noir should be good enough to not add any extra constraints.
    let address_derivation_check =
        !is_protocol_contract & (computed_address == contract_address) & !is_updated_contract;
    let updated_class_check = !is_protocol_contract
        & is_updated_contract
        & (contract_class_id == updated_contract_class_id);
    let protocol_contract_check = is_protocol_contract
        & (hints.protocol_contract_membership_witness.leaf_index == contract_address_field)
        & !is_updated_contract;

    // We can have a normal contract address, which must match the calculated address, an updated contract so the class id used must be the updated one, or
    // A computed protocol contract address which exists at the index held in call_context.contract_address.
    assert(
        address_derivation_check | updated_class_check | protocol_contract_check,
        "computed contract address does not match expected one",
    );

    // The protocol contract tree is designed as follows:
    // - The "magic" address is the leaf index.
    // - The computed address (which contains the class_id and stuff) is the leaf's value.
    //
    // Why can't we instead hard-code the contract addresses of magic protocol contracts as circuit constants, so that we can just loop and check for those addresses in the list? This would avoid this tree complexity. If we ever want to upgrade to add a new contract address, is there much difference in updating this circuit's vk (and downstream circuits' vks) vs updating the protocol contract tree root somewhere?
    // Why is this function call needed?
    // A non-protocol computed contract address is checked for non-membership below using protocol_contract_leaf as a low leaf. [Why do we need to check for non-membership? Why can't we just allow a protocol contract to be executed through it's non-magic address form?].
    // A protocol contract address is checked for membership below where protocol_contract_leaf contains the
    // computed_address at the index given by contract_address.
    conditionally_assert_check_membership(
        computed_address.to_field(),
        is_protocol_contract,
        hints.protocol_contract_leaf,
        hints.protocol_contract_membership_witness,
        protocol_contract_tree_root,
    );

    // Saves 680 gates vs the commented-out approach above.
    // I didn't go as far as instating this, although I think we should.
    // if (is_protocol_contract) {
    //     is_computed_protocol_contract_address_correct_relative_to_the_magic_protocol_contract_address(
    //         computed_address.to_field(),
    //         contract_address_field,
    //     );
    // }
}

// global UNDERLYING_PROTOCOL_CONTRACT_ADDRESSES_BY_MAGIC_ADDRESS: [Field; 7] =
//     [0x1234, 0x2345, 0x3456, 0x4567, 0x5678, 0x6789, 0x7890];

// fn is_computed_protocol_contract_address_correct_relative_to_the_magic_protocol_contract_address(
//     computed_address: Field,
//     magic_contract_address: Field,
// ) {
//     // assert(UNDERLYING_PROTOCOL_CONTRACT_ADDRESSES_BY_MAGIC_ADDRESS[magic_contract_address] == computed_address); // casting magic_contract_address to u32 costs an extra 26 gates!

//     // This is cheaper than the commented-out dynamic array access above. If we add more magic contract addresses in future, that might not remain the case.
//     for i in 0..UNDERLYING_PROTOCOL_CONTRACT_ADDRESSES_BY_MAGIC_ADDRESS.len() {
//         if (i as Field == magic_contract_address) {
//             assert(UNDERLYING_PROTOCOL_CONTRACT_ADDRESSES_BY_MAGIC_ADDRESS[i] == computed_address);
//         }
//     }
// }
