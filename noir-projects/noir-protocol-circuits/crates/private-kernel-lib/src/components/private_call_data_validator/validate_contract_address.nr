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
///
/// Decision tree:
/// - Does the contract address have an updated class_id entry in the ContractInstanceRegistry?
///     - Yes:
///         - Is it a magic protocol contract address?
///             - Yes:
///                 - This should be unreachable. Ignore the updated class_id.
///             - No:
///                 - Then a function (vk & fn selector) from this _updated_ class_id must be executed.
///     - No:
///         - Is it a magic protocol contract address?
///             - Yes:
///                 - Then a function (vk & fn selector) from the class_id contained within the preimage
///                   of the protocol contract's _derived_ address must be executed. (The magic address
///                   has no known preimage).
///             - No:
///                 Is it a _derived_ protocol contract address?
///                     - Yes:
///                         - It is technically callable in the same way as a "regular" address is callable
///                           (see next bullet point), but it doesn't share the same state as the
///                           magic protocol address (because the states will be siloed with different
///                           addresses: magic vs derived), so it's effectively a useless address to call.
///                     - No:
///                         - Then this is a "Regular" contract: the contract is not a protocol contract
///                           and it's not been updated, so the class_id lives within the preimage of the
///                           `contract_address`. A function (vk & fn selector) from that class_id must be
///                           executed.
///
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
    // Note: if the `contract_address` belongs to an Upgraded contract, then the `hints`
    // of `salted_initialization_hash` and `public_keys` provided below can be dummy hints: the resulting
    // `computed_address` will be inconsequential and will be ignored by this function.
    let computed_address = AztecAddress::compute_from_class_id(
        computed_contract_class_id,
        hints.salted_initialization_hash,
        hints.public_keys,
    );

    // Step 2: Check if it's a protocol contract (has a "magic" canonical address).

    let is_protocol_contract =
        ProtocolContracts::is_magic_protocol_contract_address(contract_address);

    // We explicitly disallow private calls to the private functions of _derived_ protocol contract addresses,
    // and instead demand that the _magic_ address be used.
    //
    // Important note:
    // Derived addresses have _different state_ from their magic counterparts, since all state
    // is siloed (in the reset kernel) by the address of the contract which emits that state, and a derived
    // address is a different value from its corresponding magic address.
    // So, even if derived protocol contracts were callable (which they are not, due to this assertion),
    // the act of calling a _derived_ protocol contract and changing its state ought to have been ignored by
    // all, and should have been universally recognized as meaningless. But it certainly could have been
    // a potential footgun if users / wallets / apps were to accidentally make calls to derived addresses instead
    // of magic addresses. It's this fear of footguns which has led to this explicit rejection of derived
    // contract addresses.
    //
    // It's also important to think about whether the _public_ functions of derived addresses are callable,
    // to avoid accidental inconsistencies between private and public execution.
    // We have designed derived addresses in such a way that their _public_ functions are _not_ callable:
    // All addresses contain a `deployer` field in their preimage, which can either be an actual address or 0.
    // For each _derived_ protocol contract address, we intentionally set its `deployer` to be its
    // corresponding magic address.
    // So the _derived_ protocol contract for magic address 2 will have `deployer = 2`, etc.
    // Only the `deployer` of a contract can make a call to the ContractInstanceRegistry to publish that
    // contract's public functions for public execution.
    // This means no one will be able to _publish_ the _derived_ version of any protocol contract, because no one
    // can impersonate a magic protocol contract address. The inability to _publish_ any derived contract
    // via the ContractInstanceRegistry means the _public_ functions of _derived_ protocol contracts will be
    // impossible to execute, because the AVM can only execute a public function if its contract instance has
    // been registered.
    // (This slightly convoluted approach to preventing public execution of derived protocol contract functions
    // was preferred over adding explicit checks within the AVM).
    protocol_contracts.assert_not_derived_protocol_contract_address(contract_address);

    let expected_protocol_contract_derived_address = if is_protocol_contract {
        protocol_contracts.get_derived_address(contract_address)
    } else {
        AztecAddress::zero()
    };
    let protocol_contract_address_derivation_check_ok =
        computed_address == expected_protocol_contract_derived_address;

    assert(
        !is_protocol_contract | protocol_contract_address_derivation_check_ok,
        "computed contract address does not match protocol contract derived address",
    );

    // Step 3: Check if it's an updated contract (class_id changed via the ContractInstanceRegistry).

    let updated_contract_class_id = get_updated_contract_class_id(
        contract_address,
        private_call_data.public_inputs.anchor_block_header,
        hints.updated_class_id_delayed_public_mutable_values,
        hints.updated_class_id_witness,
        hints.updated_class_id_leaf,
    );

    // If the ContractInstanceRegistry's mapping from `contract_address` to an updated class_id is
    // nonempty, then we consider the contract to have been updated and we demand that the function
    // being processed by this kernel belongs to that _updated_ class_id. (That is, we demand that
    // the called function_selector -- and the vk_hash that we have used to verify the app circuit's
    // proof -- belong to the updated class_id).
    //
    // Caveat (for protocol contracts): We expect that it's impossible for protocol contracts to be
    // upgradeable, because there are no functions within any of the protocol contracts which are
    // capable of making a call to the ContractInstanceRegistry::update function. Nevertheless, in
    // the (expected-to-be-impossible) event that someone manages to update a protocol contract entry
    // in the registry (through some bug exploit), we would prefer for that updated class_id to be
    // ignored.
    // Thankfully, if the contract_address is a protocol contract, the code above ensures that
    // the `computed_contract_class_id` represents that of the _derived_ protocol contract's class_id
    // and not that of any `updated_contract_class_id`. So if someone attempts to somehow execute
    // an updated protocol contract, the `updated_class_check_ok` assertion below will fail.
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

/// Reads the updated class id of this contract_address from the appropriate storage slot of the
/// contract instance registry, if one exists.
/// Uses a delayed public mutable, which enables a public value to be safely read in private with
/// guarantees that the value cannot be changed for some time.
///
/// Returns the updated class_id if the contract has been updated, or a ContractClassId::empty()
/// otherwise.
///
/// See `noir-projects/noir-contracts/protocol/contract_instance_registry/src/main.nr` for the ContractInstanceRegistry and its storage layout.
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
    // A time horizon for this delayed public mutable should be set separately when generating/validating kernel output: see `private_kernel_circuit_output_validator.nr`.
    read_current_value_of_delayed_public_mutable_with_hash(
        anchor_block_header,
        storage_slot,
        CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
        delayed_public_mutable,
        witness,
        leaf_preimage,
    )
}
