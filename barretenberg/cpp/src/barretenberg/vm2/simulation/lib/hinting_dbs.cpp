#include "barretenberg/vm2/simulation/lib/hinting_dbs.hpp"

#include <cstdint>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

// HintingContractsDB starts.
std::optional<ContractInstance> HintingContractsDB::get_contract_instance(const AztecAddress& address) const
{
    std::optional<ContractInstance> instance = db.get_contract_instance(address);
    // If we don't find the instance hint, this is not a catastrophic failure. The inner db should handle it, and
    // here we simply don't store any hint:
    if (instance.has_value()) {
        GetContractInstanceKey key = { checkpoint_action_counter, address };
        contract_hints.contract_instances[key] = ContractInstanceHint{
            .hint_key = checkpoint_action_counter,
            .address = address,
            .salt = instance->salt,
            .deployer = instance->deployer,
            .current_contract_class_id = instance->current_contract_class_id,
            .original_contract_class_id = instance->original_contract_class_id,
            .initialization_hash = instance->initialization_hash,
            .public_keys =
                PublicKeysHint{ .master_nullifier_public_key = instance->public_keys.nullifier_key,
                                .master_incoming_viewing_public_key = instance->public_keys.incoming_viewing_key,
                                .master_outgoing_viewing_public_key = instance->public_keys.outgoing_viewing_key,
                                .master_tagging_public_key = instance->public_keys.tagging_key }

        };
    }

    return instance;
}

std::optional<ContractClass> HintingContractsDB::get_contract_class(const ContractClassId& class_id) const
{
    std::optional<ContractClass> klass = db.get_contract_class(class_id);
    // If we don't find the instance hint, this is not a catastrophic failure. The inner db should handle it, and
    // here we simply don't store any hint:
    if (klass.has_value()) {
        GetContractClassKey key = { checkpoint_action_counter, class_id };
        contract_hints.contract_classes[key] = ContractClassHint{
            .hint_key = checkpoint_action_counter,
            .class_id = class_id,
            .artifact_hash = klass->artifact_hash,
            .private_functions_root = klass->private_functions_root,
            // TODO(fcarreiro): find out why moving things here breaks things
            .packed_bytecode = klass->packed_bytecode,
        };
    }

    return klass;
}

std::optional<FF> HintingContractsDB::get_bytecode_commitment(const ContractClassId& class_id) const
{
    std::optional<FF> commitment = db.get_bytecode_commitment(class_id);
    if (commitment.has_value()) {
        GetBytecodeCommitmentKey key = { checkpoint_action_counter, class_id };
        contract_hints.bytecode_commitments[key] = BytecodeCommitmentHint{ .hint_key = checkpoint_action_counter,
                                                                           .class_id = class_id,
                                                                           .commitment = commitment.value() };
    }

    return commitment;
}

std::optional<std::string> HintingContractsDB::get_debug_function_name(const AztecAddress& address,
                                                                       const FunctionSelector& selector) const
{
    std::optional<std::string> name = db.get_debug_function_name(address, selector);
    if (name.has_value()) {
        GetDebugFunctionNameKey key = { address, selector };
        contract_hints.debug_function_names[key] =
            DebugFunctionNameHint{ .address = address, .selector = selector, .name = name.value() };
    }

    return name;
}

void HintingContractsDB::add_contracts(const ContractDeploymentData& contract_deployment_data)
{
    // Adding contracts does not require any hints
    db.add_contracts(contract_deployment_data);
}

void HintingContractsDB::create_checkpoint()
{
    uint32_t old_checkpoint_id = get_checkpoint_id();
    // Update underlying db:
    db.create_checkpoint();
    // Update this db:
    checkpoint_stack.push(next_checkpoint_id++);
    // Store hint:
    contract_hints.create_checkpoint_hints[checkpoint_action_counter] = {
        .action_counter = checkpoint_action_counter,
        .old_checkpoint_id = old_checkpoint_id,
        .new_checkpoint_id = get_checkpoint_id(),
    };

    // Update this db:
    checkpoint_action_counter++;
}

void HintingContractsDB::commit_checkpoint()
{
    uint32_t old_checkpoint_id = get_checkpoint_id();
    // Update underlying db:
    db.commit_checkpoint();
    // Update this db:
    checkpoint_stack.pop();
    // Store hint:
    contract_hints.commit_checkpoint_hints[checkpoint_action_counter] = {
        .action_counter = checkpoint_action_counter,
        .old_checkpoint_id = old_checkpoint_id,
        .new_checkpoint_id = get_checkpoint_id(),
    };

    // Update this db:
    checkpoint_action_counter++;
}

void HintingContractsDB::revert_checkpoint()
{
    uint32_t old_checkpoint_id = get_checkpoint_id();
    // Update underlying db:
    db.revert_checkpoint();
    // Update this db:
    checkpoint_stack.pop();
    // Store hint:
    contract_hints.revert_checkpoint_hints[checkpoint_action_counter] = {
        .action_counter = checkpoint_action_counter,
        .old_checkpoint_id = old_checkpoint_id,
        .new_checkpoint_id = get_checkpoint_id(),
    };

    // Update this db:
    checkpoint_action_counter++;
}

uint32_t HintingContractsDB::get_checkpoint_id() const
{
    return checkpoint_stack.top();
}

void HintingContractsDB::dump_hints(ExecutionHints& hints)
{
    std::ranges::transform(contract_hints.contract_instances,
                           std::back_inserter(hints.contract_instances),
                           [](const auto& mapped_contract_instance) { return mapped_contract_instance.second; });

    std::ranges::transform(contract_hints.contract_classes,
                           std::back_inserter(hints.contract_classes),
                           [](const auto& mapped_contract_class) { return mapped_contract_class.second; });

    std::ranges::transform(contract_hints.bytecode_commitments,
                           std::back_inserter(hints.bytecode_commitments),
                           [](const auto& mapped_bytecode_commitment) { return mapped_bytecode_commitment.second; });

    std::ranges::transform(contract_hints.debug_function_names,
                           std::back_inserter(hints.debug_function_names),
                           [](const auto& mapped_debug_function_name) { return mapped_debug_function_name.second; });

    std::ranges::transform(
        contract_hints.create_checkpoint_hints,
        std::back_inserter(hints.contract_db_create_checkpoint_hints),
        [](const auto& mapped_create_checkpoint_hint) { return mapped_create_checkpoint_hint.second; });

    std::ranges::transform(
        contract_hints.commit_checkpoint_hints,
        std::back_inserter(hints.contract_db_commit_checkpoint_hints),
        [](const auto& mapped_commit_checkpoint_hint) { return mapped_commit_checkpoint_hint.second; });

    std::ranges::transform(
        contract_hints.revert_checkpoint_hints,
        std::back_inserter(hints.contract_db_revert_checkpoint_hints),
        [](const auto& mapped_revert_checkpoint_hint) { return mapped_revert_checkpoint_hint.second; });
}

// Hinting MerkleDB starts.
AppendOnlyTreeSnapshot HintingRawDB::get_tree_info(world_state::MerkleTreeId tree_id) const
{
    auto roots = db.get_tree_roots();
    return get_tree_info_helper(tree_id, roots);
}

SiblingPath HintingRawDB::get_sibling_path(world_state::MerkleTreeId tree_id, index_t leaf_index) const
{
    AppendOnlyTreeSnapshot tree_info = get_tree_info(tree_id);
    SiblingPath path = db.get_sibling_path(tree_id, leaf_index);
    GetSiblingPathKey key = { tree_info, tree_id, leaf_index };
    merkle_hints.get_sibling_path_hints[key] =
        GetSiblingPathHint{ .hint_key = tree_info, .tree_id = tree_id, .index = leaf_index, .path = path };

    return path;
}

GetLowIndexedLeafResponse HintingRawDB::get_low_indexed_leaf(world_state::MerkleTreeId tree_id, const FF& value) const
{
    AppendOnlyTreeSnapshot tree_info = get_tree_info(tree_id);
    GetLowIndexedLeafResponse resp = db.get_low_indexed_leaf(tree_id, value);
    GetPreviousValueIndexKey key = { tree_info, tree_id, value };
    merkle_hints.get_previous_value_index_hints[key] = GetPreviousValueIndexHint{
        .hint_key = tree_info,
        .tree_id = tree_id,
        .value = value,
        .index = resp.index,
        .already_present = resp.is_already_present,
    };

    // Note: We may need a sibling path hint so must collect it in case - see comments in public_db_sources.ts
    get_sibling_path(tree_id, resp.index);

    if (tree_id == world_state::MerkleTreeId::NULLIFIER_TREE) {
        // Note: We may need a GetLeafPreimageHint for the nullifier tree when calling nullifier_exists, so collect it
        // in case. NB: The PureMerkleDB does not perform this, but the nullifier check gadget requires a leaf preimage.
        // Ts gathers the hint: (state_manager -> checkNullifierExists() -> doMerkleOperations -> public_db_sources ->
        // checkNullifierExists())
        get_leaf_preimage_nullifier_tree(resp.index);
    } else if ((tree_id == world_state::MerkleTreeId::PUBLIC_DATA_TREE) && (!resp.is_already_present)) {
        // Note: We may need a GetLeafPreimageHint for the public data tree when calling storage_read, so collect it in
        // case. NB: The PureMerkleDB does not perform this if !is_already_present, but MerkleDB and ts perform it
        // unconditionally. Ts gathers the hint: (public_db_sources -> storageRead())
        get_leaf_preimage_public_data_tree(resp.index);
    }
    return resp;
}

FF HintingRawDB::get_leaf_value(world_state::MerkleTreeId tree_id, index_t leaf_index) const
{
    AppendOnlyTreeSnapshot tree_info = get_tree_info(tree_id);
    FF value = db.get_leaf_value(tree_id, leaf_index);
    GetLeafValueKey key = { tree_info, tree_id, leaf_index };
    merkle_hints.get_leaf_value_hints[key] =
        GetLeafValueHint{ .hint_key = tree_info, .tree_id = tree_id, .index = leaf_index, .value = value };
    // Note: We may need a sibling path hint so must collect it in case - see comments in public_db_sources.ts
    get_sibling_path(tree_id, leaf_index);
    return value;
}

IndexedLeaf<PublicDataLeafValue> HintingRawDB::get_leaf_preimage_public_data_tree(index_t leaf_index) const
{
    AppendOnlyTreeSnapshot tree_info = get_tree_info(world_state::MerkleTreeId::PUBLIC_DATA_TREE);
    IndexedLeaf<PublicDataLeafValue> preimage = db.get_leaf_preimage_public_data_tree(leaf_index);

    GetLeafPreimageKey key = { tree_info, leaf_index };
    merkle_hints.get_leaf_preimage_hints_public_data_tree[key] = GetLeafPreimageHint<PublicDataTreeLeafPreimage>{
        .hint_key = tree_info, .index = leaf_index, .leaf_preimage = preimage
    };
    // Note: We may need a sibling path hint so must collect it in case - see comments in public_db_sources.ts
    get_sibling_path(world_state::MerkleTreeId::PUBLIC_DATA_TREE, leaf_index);
    return preimage;
}

IndexedLeaf<NullifierLeafValue> HintingRawDB::get_leaf_preimage_nullifier_tree(index_t leaf_index) const
{
    AppendOnlyTreeSnapshot tree_info = get_tree_info(world_state::MerkleTreeId::NULLIFIER_TREE);
    IndexedLeaf<NullifierLeafValue> preimage = db.get_leaf_preimage_nullifier_tree(leaf_index);
    GetLeafPreimageKey key = { tree_info, leaf_index };
    merkle_hints.get_leaf_preimage_hints_nullifier_tree[key] = GetLeafPreimageHint<NullifierTreeLeafPreimage>{
        .hint_key = tree_info, .index = leaf_index, .leaf_preimage = preimage
    };
    // Note: We may need a sibling path hint so must collect it in case - see comments in public_db_sources.ts
    get_sibling_path(world_state::MerkleTreeId::NULLIFIER_TREE, leaf_index);
    return preimage;
}

SequentialInsertionResult<PublicDataLeafValue> HintingRawDB::insert_indexed_leaves_public_data_tree(
    const PublicDataLeafValue& leaf_value)
{
    AppendOnlyTreeSnapshot tree_info = get_tree_info(world_state::MerkleTreeId::PUBLIC_DATA_TREE);
    SequentialInsertionResult<PublicDataLeafValue> result = db.insert_indexed_leaves_public_data_tree(leaf_value);
    // The underlying db should update its state post insertion:
    AppendOnlyTreeSnapshot state_after = db.get_tree_roots().public_data_tree;

    SequentialInsertHintPublicDataTreeKey key = { tree_info, world_state::MerkleTreeId::PUBLIC_DATA_TREE, leaf_value };
    SequentialInsertHint<PublicDataLeafValue> sequential_insert_hint = {
        .hint_key = tree_info,
        .tree_id = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
        .leaf = leaf_value,
        .low_leaves_witness_data = result.low_leaf_witness_data.back(),
        .insertion_witness_data = result.insertion_witness_data.back(),
        .state_after = state_after
    };
    merkle_hints.sequential_insert_hints_public_data_tree[key] = sequential_insert_hint;

    return result;
}

SequentialInsertionResult<NullifierLeafValue> HintingRawDB::insert_indexed_leaves_nullifier_tree(
    const NullifierLeafValue& leaf_value)
{
    AppendOnlyTreeSnapshot tree_info = get_tree_info(world_state::MerkleTreeId::NULLIFIER_TREE);
    SequentialInsertionResult<NullifierLeafValue> result = db.insert_indexed_leaves_nullifier_tree(leaf_value);
    // The underlying db should update its state post insertion:
    auto state_after = db.get_tree_roots().nullifier_tree;

    SequentialInsertHintNullifierTreeKey key = { tree_info, world_state::MerkleTreeId::NULLIFIER_TREE, leaf_value };
    SequentialInsertHint<NullifierLeafValue> sequential_insert_hint = {
        .hint_key = tree_info,
        .tree_id = world_state::MerkleTreeId::NULLIFIER_TREE,
        .leaf = leaf_value,
        .low_leaves_witness_data = result.low_leaf_witness_data.back(),
        .insertion_witness_data = result.insertion_witness_data.back(),
        .state_after = state_after
    };
    merkle_hints.sequential_insert_hints_nullifier_tree[key] = sequential_insert_hint;

    return result;
}

void HintingRawDB::create_checkpoint()
{
    uint32_t old_checkpoint_id = db.get_checkpoint_id();
    // Update underlying db:
    db.create_checkpoint();

    // Store hint:
    merkle_hints.create_checkpoint_hints[checkpoint_action_counter] = {
        .action_counter = checkpoint_action_counter,
        .old_checkpoint_id = old_checkpoint_id,
        .new_checkpoint_id = db.get_checkpoint_id(),
    };

    // Update this db:
    checkpoint_action_counter++;
}

void HintingRawDB::commit_checkpoint()
{
    uint32_t old_checkpoint_id = db.get_checkpoint_id();
    // Update underlying db:
    db.commit_checkpoint();
    // Store hint:
    merkle_hints.commit_checkpoint_hints[checkpoint_action_counter] = {
        .action_counter = checkpoint_action_counter,
        .old_checkpoint_id = old_checkpoint_id,
        .new_checkpoint_id = db.get_checkpoint_id(),
    };

    // Update this db:
    checkpoint_action_counter++;
}

void HintingRawDB::revert_checkpoint()
{
    TreeSnapshots state_before = db.get_tree_roots();
    uint32_t old_checkpoint_id = db.get_checkpoint_id();
    // Update underlying db:
    db.revert_checkpoint();
    TreeSnapshots state_after = db.get_tree_roots();
    // Store hint:
    merkle_hints.revert_checkpoint_hints[checkpoint_action_counter] = {
        .action_counter = checkpoint_action_counter,
        .old_checkpoint_id = old_checkpoint_id,
        .new_checkpoint_id = db.get_checkpoint_id(),
        .state_before = state_before,
        .state_after = state_after,
    };

    // Update this db:
    checkpoint_action_counter++;
}

void HintingRawDB::pad_tree(world_state::MerkleTreeId tree_id, size_t num_leaves)
{
    // Padding the tree does not require any hints:
    db.pad_tree(tree_id, num_leaves);
}

std::vector<AppendLeafResult> HintingRawDB::append_leaves(world_state::MerkleTreeId tree_id, std::span<const FF> leaves)
{
    AppendOnlyTreeSnapshot tree_info = get_tree_info(tree_id);
    // Update underlying db:
    std::vector<AppendLeafResult> results = db.append_leaves(tree_id, leaves);

    // Use results to collect hints:
    for (uint32_t i = 0; i < leaves.size(); i++) {
        FF root_after = i == leaves.size() - 1 ? get_tree_info(tree_id).root : results[i + 1].root;
        // Iterate tree_info to the be state after adding this leaf:
        tree_info = appendLeafInternal(tree_info, results[i].path, root_after, tree_id, leaves[i]);
    }

    return results;
}

AppendOnlyTreeSnapshot HintingRawDB::appendLeafInternal(const AppendOnlyTreeSnapshot& state_before,
                                                        const SiblingPath& path,
                                                        const FF& root_after,
                                                        world_state::MerkleTreeId tree_id,
                                                        const FF& leaf)
{
    // TODO(MW): Taken from raw_data_dbs:
    // We need to process each leaf individually because we need the sibling path after insertion, to be able to
    // constraint the insertion.
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13380): This can be changed if the world state
    // appendLeaves returns the sibling paths.
    AppendLeavesHintKey append_key = { state_before, tree_id, { leaf } };
    AppendOnlyTreeSnapshot state_after = { .root = root_after,
                                           .next_available_leaf_index = state_before.next_available_leaf_index + 1 };
    merkle_hints.append_leaves_hints[append_key] = AppendLeavesHint{
        .hint_key = state_before, .state_after = state_after, .tree_id = tree_id, .leaves = { leaf }
    };
    // TODO(MW): Storing sibling path hint manually using the result since a get_sibling_path() call here will use the
    // /current/ db.get_tree_info() (post full append_leaves), which may not match that at result.root. We may not care
    // about this (see comment in PureRawMerkleDB::append_leaves())
    GetSiblingPathKey path_key = { state_after, tree_id, state_before.next_available_leaf_index };
    merkle_hints.get_sibling_path_hints[path_key] = GetSiblingPathHint{
        .hint_key = state_after, .tree_id = tree_id, .index = state_before.next_available_leaf_index, .path = path
    };
    return state_after;
}

void HintingRawDB::dump_hints(ExecutionHints& hints)
{
    std::ranges::transform(
        merkle_hints.get_sibling_path_hints,
        std::back_inserter(hints.get_sibling_path_hints),
        [](const auto& mapped_get_sibling_path_hint) { return mapped_get_sibling_path_hint.second; });

    std::ranges::transform(
        merkle_hints.get_previous_value_index_hints,
        std::back_inserter(hints.get_previous_value_index_hints),
        [](const auto& mapped_get_previous_value_index_hint) { return mapped_get_previous_value_index_hint.second; });

    std::ranges::transform(
        merkle_hints.get_leaf_preimage_hints_public_data_tree,
        std::back_inserter(hints.get_leaf_preimage_hints_public_data_tree),
        [](const auto& mapped_get_leaf_preimage_hint) { return mapped_get_leaf_preimage_hint.second; });

    std::ranges::transform(
        merkle_hints.get_leaf_preimage_hints_nullifier_tree,
        std::back_inserter(hints.get_leaf_preimage_hints_nullifier_tree),
        [](const auto& mapped_get_leaf_preimage_hint) { return mapped_get_leaf_preimage_hint.second; });

    std::ranges::transform(merkle_hints.get_leaf_value_hints,
                           std::back_inserter(hints.get_leaf_value_hints),
                           [](const auto& mapped_get_leaf_value_hint) { return mapped_get_leaf_value_hint.second; });

    std::ranges::transform(
        merkle_hints.sequential_insert_hints_public_data_tree,
        std::back_inserter(hints.sequential_insert_hints_public_data_tree),
        [](const auto& mapped_sequential_insert_hint) { return mapped_sequential_insert_hint.second; });

    std::ranges::transform(
        merkle_hints.sequential_insert_hints_nullifier_tree,
        std::back_inserter(hints.sequential_insert_hints_nullifier_tree),
        [](const auto& mapped_sequential_insert_hint) { return mapped_sequential_insert_hint.second; });

    std::ranges::transform(merkle_hints.append_leaves_hints,
                           std::back_inserter(hints.append_leaves_hints),
                           [](const auto& mapped_append_leaves_hint) { return mapped_append_leaves_hint.second; });

    std::ranges::transform(
        merkle_hints.create_checkpoint_hints,
        std::back_inserter(hints.create_checkpoint_hints),
        [](const auto& mapped_create_checkpoint_hint) { return mapped_create_checkpoint_hint.second; });

    std::ranges::transform(
        merkle_hints.commit_checkpoint_hints,
        std::back_inserter(hints.commit_checkpoint_hints),
        [](const auto& mapped_commit_checkpoint_hint) { return mapped_commit_checkpoint_hint.second; });

    std::ranges::transform(
        merkle_hints.revert_checkpoint_hints,
        std::back_inserter(hints.revert_checkpoint_hints),
        [](const auto& mapped_revert_checkpoint_hint) { return mapped_revert_checkpoint_hint.second; });
}

} // namespace bb::avm2::simulation
