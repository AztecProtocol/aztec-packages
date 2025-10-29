#include "barretenberg/vm2/simulation/lib/hinting_dbs.hpp"

#include <cstdint>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

namespace {

// We need this helper to avoid having const and non-const versions methods in the class.
auto& get_tree_info_helper(world_state::MerkleTreeId tree_id, const auto& tree_roots)
{
    switch (tree_id) {
    case world_state::MerkleTreeId::NULLIFIER_TREE:
        return tree_roots.nullifierTree;
    case world_state::MerkleTreeId::PUBLIC_DATA_TREE:
        return tree_roots.publicDataTree;
    case world_state::MerkleTreeId::NOTE_HASH_TREE:
        return tree_roots.noteHashTree;
    case world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return tree_roots.l1ToL2MessageTree;
    default:
        throw std::runtime_error("AVM cannot process tree id: " + std::to_string(static_cast<uint64_t>(tree_id)));
    }
}

} // namespace

// HintingContractsDB starts.
std::optional<ContractInstance> HintingContractsDB::get_contract_instance(const AztecAddress& address) const
{
    info("HintingContractsDB get_contract_instance");
    auto instance = db.get_contract_instance(address);
    // If we don't find the instance hint, this is not a catastrophic failure. The inner db should handle it, and
    // here we simply don't store any hint:
    if (instance.has_value()) {
        // TODO(MW): Use/write instance to hint methods for ContractInstance, PublicKeys, ContractClass, etc.
        mapped_hints.contract_instances[address] = ContractInstanceHint{
            .address = address,
            .salt = instance->salt,
            .deployer = instance->deployer_addr,
            .currentContractClassId = instance->current_class_id,
            .originalContractClassId = instance->original_class_id,
            .initializationHash = instance->initialisation_hash,
            .publicKeys = PublicKeysHint{ .masterNullifierPublicKey = instance->public_keys.nullifier_key,
                                          .masterIncomingViewingPublicKey = instance->public_keys.incoming_viewing_key,
                                          .masterOutgoingViewingPublicKey = instance->public_keys.outgoing_viewing_key,
                                          .masterTaggingPublicKey = instance->public_keys.tagging_key }

        };
    }

    return instance;
}

std::optional<ContractClass> HintingContractsDB::get_contract_class(const ContractClassId& class_id) const
{
    info("HintingContractsDB get_contract_class");
    auto klass = db.get_contract_class(class_id);
    // If we don't find the instance hint, this is not a catastrophic failure. The inner db should handle it, and
    // here we simply don't store any hint:
    if (klass.has_value()) {
        // TODO(MW): Use/write instance to hint methods for ContractInstance, PublicKeys, ContractClass, etc.
        mapped_hints.contract_classes[class_id] = ContractClassHint{
            .classId = class_id,
            .artifactHash = klass->artifact_hash,
            .privateFunctionsRoot = klass->private_function_root,
            .packedBytecode = klass->packed_bytecode,
        };
        // Note: HintedRawContractDB accesses the bytecode commitment 'hint' during get_contract_class, so following
        // same logic here:
        mapped_hints.bytecode_commitments[class_id] =
            BytecodeCommitmentHint{ .classId = class_id, .commitment = klass->public_bytecode_commitment };
    }

    return klass;
}

void HintingContractsDB::dump_hints(ExecutionHints& hints)
{
    // TODO(MW): better way than to iterate? do we want push_back?
    for (const auto& contract_instance : mapped_hints.contract_instances) {
        hints.contractInstances.push_back(contract_instance.second);
    }
    for (const auto& contract_class : mapped_hints.contract_classes) {
        hints.contractClasses.push_back(contract_class.second);
    }
    for (const auto& bytecode_commitment : mapped_hints.bytecode_commitments) {
        hints.bytecodeCommitments.push_back(bytecode_commitment.second);
    }
}

// Hinting MerkleDB starts.
const AppendOnlyTreeSnapshot& HintingRawDB::get_tree_info(world_state::MerkleTreeId tree_id) const
{
    return get_tree_info_helper(tree_id, db.get_tree_roots());
}

SiblingPath HintingRawDB::get_sibling_path(world_state::MerkleTreeId tree_id, index_t leaf_index) const
{
    info("HintingRawDB get_sib: ", leaf_index);
    auto tree_info = get_tree_info(tree_id);
    auto path = db.get_sibling_path(tree_id, leaf_index);
    GetSiblingPathKey key = { tree_info, tree_id, leaf_index };
    query_hints.get_sibling_path_hints[key] = path;

    return path;
}

GetLowIndexedLeafResponse HintingRawDB::get_low_indexed_leaf(world_state::MerkleTreeId tree_id, const FF& value) const
{
    info("HintingRawDB get_low_indexed_leaf");
    auto tree_info = get_tree_info(tree_id);
    auto resp = db.get_low_indexed_leaf(tree_id, value);
    GetPreviousValueIndexKey key = { tree_info, tree_id, value };
    query_hints.get_previous_value_index_hints[key] = { resp.is_already_present, resp.index };
    // TODO(MW): We may need a sibling path hint so must collect it in case - see comments in public_db_sources.ts
    get_sibling_path(tree_id, resp.index);
    return resp;
}

FF HintingRawDB::get_leaf_value(world_state::MerkleTreeId tree_id, index_t leaf_index) const
{
    info("HintingRawDB get_leaf_value");
    auto tree_info = get_tree_info(tree_id);
    auto value = db.get_leaf_value(tree_id, leaf_index);
    GetLeafValueKey key = { tree_info, tree_id, leaf_index };
    query_hints.get_leaf_value_hints[key] = value;
    // TODO(MW): We may need a sibling path hint so must collect it in case - see comments in public_db_sources.ts
    get_sibling_path(tree_id, leaf_index);
    return value;
}

IndexedLeaf<PublicDataLeafValue> HintingRawDB::get_leaf_preimage_public_data_tree(index_t leaf_index) const
{
    info("HintingRawDB get_leaf_preimage_public_data_tree");
    auto tree_info = get_tree_info(world_state::MerkleTreeId::PUBLIC_DATA_TREE);
    auto preimage = db.get_leaf_preimage_public_data_tree(leaf_index);

    GetLeafPreimageKey key = { tree_info, leaf_index };
    query_hints.get_leaf_preimage_hints_public_data_tree[key] = preimage;
    // TODO(MW): We may need a sibling path hint so must collect it in case - see comments in public_db_sources.ts
    get_sibling_path(world_state::MerkleTreeId::PUBLIC_DATA_TREE, leaf_index);
    return preimage;
}

IndexedLeaf<NullifierLeafValue> HintingRawDB::get_leaf_preimage_nullifier_tree(index_t leaf_index) const
{
    info("HintingRawDB get_leaf_preimage_nullifier_tree");
    auto tree_info = get_tree_info(world_state::MerkleTreeId::NULLIFIER_TREE);
    auto preimage = db.get_leaf_preimage_nullifier_tree(leaf_index);
    GetLeafPreimageKey key = { tree_info, leaf_index };
    query_hints.get_leaf_preimage_hints_nullifier_tree[key] = preimage;
    // TODO(MW): We may need a sibling path hint so must collect it in case - see comments in public_db_sources.ts
    get_sibling_path(world_state::MerkleTreeId::NULLIFIER_TREE, leaf_index);
    return preimage;
}

SequentialInsertionResult<PublicDataLeafValue> HintingRawDB::insert_indexed_leaves_public_data_tree(
    const PublicDataLeafValue& leaf_value)
{
    info("HintingRawDB insert_indexed_leaves_public_data_tree");
    auto tree_info = get_tree_info(world_state::MerkleTreeId::PUBLIC_DATA_TREE);
    auto result = db.insert_indexed_leaves_public_data_tree(leaf_value);
    // The underlying db should update its state post insertion:
    auto stateAfter = db.get_tree_roots().publicDataTree;

    SequentialInsertHintPublicDataTreeKey key = { tree_info, world_state::MerkleTreeId::PUBLIC_DATA_TREE, leaf_value };
    SequentialInsertHint<PublicDataLeafValue> sequential_insert_hint = {
        .hintKey = tree_info,
        .treeId = world_state::MerkleTreeId::PUBLIC_DATA_TREE,
        .leaf = leaf_value,
        .lowLeavesWitnessData = result.low_leaf_witness_data.back(),
        .insertionWitnessData = result.insertion_witness_data.back(),
        .stateAfter = stateAfter
    };
    sequential_insert_hints_public_data_tree[key] = sequential_insert_hint;

    return result;
}

SequentialInsertionResult<NullifierLeafValue> HintingRawDB::insert_indexed_leaves_nullifier_tree(
    const NullifierLeafValue& leaf_value)
{
    info("HintingRawDB insert_indexed_leaves_nullifier_tree");
    auto tree_info = get_tree_info(world_state::MerkleTreeId::NULLIFIER_TREE);
    auto result = db.insert_indexed_leaves_nullifier_tree(leaf_value);
    // The underlying db should update its state post insertion:
    auto stateAfter = db.get_tree_roots().nullifierTree;

    SequentialInsertHintNullifierTreeKey key = { tree_info, world_state::MerkleTreeId::NULLIFIER_TREE, leaf_value };
    SequentialInsertHint<NullifierLeafValue> sequential_insert_hint = {
        .hintKey = tree_info,
        .treeId = world_state::MerkleTreeId::NULLIFIER_TREE,
        .leaf = leaf_value,
        .lowLeavesWitnessData = result.low_leaf_witness_data.back(),
        .insertionWitnessData = result.insertion_witness_data.back(),
        .stateAfter = stateAfter
    };
    sequential_insert_hints_nullifier_tree[key] = sequential_insert_hint;

    return result;
}

void HintingRawDB::create_checkpoint()
{
    info("HintingRawDB create_checkpoint");
    auto old_checkpoint_id = db.get_checkpoint_id();
    // Update underlying db:
    db.create_checkpoint();

    // Store hint:
    create_checkpoint_hints[checkpoint_action_counter] = {
        .actionCounter = checkpoint_action_counter,
        .oldCheckpointId = old_checkpoint_id,
        .newCheckpointId = db.get_checkpoint_id(),
    };

    // Update this db:
    checkpoint_action_counter++;
}

void HintingRawDB::commit_checkpoint()
{
    info("HintingRawDB commit_checkpoint");
    auto old_checkpoint_id = db.get_checkpoint_id();
    // Update underlying db:
    db.commit_checkpoint();
    // Store hint:
    commit_checkpoint_hints[checkpoint_action_counter] = {
        .actionCounter = checkpoint_action_counter,
        .oldCheckpointId = old_checkpoint_id,
        .newCheckpointId = db.get_checkpoint_id(),
    };

    // Update this db:
    checkpoint_action_counter++;
}

void HintingRawDB::revert_checkpoint()
{
    info("HintingRawDB revert_checkpoint");
    auto state_before = db.get_tree_roots();
    auto old_checkpoint_id = db.get_checkpoint_id();
    // Update underlying db:
    db.revert_checkpoint();
    auto state_after = db.get_tree_roots();
    // Store hint:
    revert_checkpoint_hints[checkpoint_action_counter] = {
        .actionCounter = checkpoint_action_counter,
        .oldCheckpointId = old_checkpoint_id,
        .newCheckpointId = db.get_checkpoint_id(),
        .stateBefore = state_before,
        .stateAfter = state_after,
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
    info("HintingRawDB append_leaves: ", leaves.size());
    auto tree_info = get_tree_info(tree_id);
    // Update underlying db:
    auto results = db.append_leaves(tree_id, leaves);

    // Use results to collect hints:
    for (uint32_t i = 0; i < leaves.size(); i++) {
        FF root_after = i == leaves.size() - 1 ? get_tree_info(tree_id).root : results[i + 1].root;
        // Iterate tree_info to the be state after adding this leaf:
        tree_info = appendLeafInternal(tree_info, root_after, tree_id, leaves[i]);
    }

    return results;
}

// TODO(MW): rework
AppendOnlyTreeSnapshot HintingRawDB::appendLeafInternal(AppendOnlyTreeSnapshot state_before,
                                                        const FF& root_after,
                                                        world_state::MerkleTreeId tree_id,
                                                        const FF& leaf)
{
    // TODO(MW): Taken from raw_data_dbs:
    // We need to process each leaf individually because we need the sibling path after insertion, to be able to
    // constraint the insertion.
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13380): This can be changed if the world state
    // appendLeaves returns the sibling paths.
    AppendLeavesHintKey key = { state_before, tree_id, { leaf } };
    AppendOnlyTreeSnapshot state_after = { .root = root_after,
                                           .nextAvailableLeafIndex = state_before.nextAvailableLeafIndex + 1 };
    append_leaves_hints[key] = state_after;
    // TODO(MW): Just store hint using result in append_leaves to avoid unnecessary extra calls to underlying db?
    // NOTE: this call will use the /current/ db.get_tree_info() (post full append_leaves), which may not match that at
    // root_after:
    get_sibling_path(tree_id, state_before.nextAvailableLeafIndex);
    return state_after;
}

void HintingRawDB::dump_hints(ExecutionHints& hints)
{
    // TODO(MW): better way than to iterate? do we want push_back?
    for (const auto& get_sibling_path_hint : query_hints.get_sibling_path_hints) {
        auto [hint_key, tree_id, index] = get_sibling_path_hint.first;
        hints.getSiblingPathHints.push_back(GetSiblingPathHint{
            .hintKey = hint_key, .treeId = tree_id, .index = index, .path = get_sibling_path_hint.second });
    }
    for (const auto& get_previous_value_index_hint : query_hints.get_previous_value_index_hints) {
        auto [hint_key, tree_id, value] = get_previous_value_index_hint.first;
        hints.getPreviousValueIndexHints.push_back(GetPreviousValueIndexHint{
            .hintKey = hint_key,
            .treeId = tree_id,
            .value = value,
            .index = get_previous_value_index_hint.second.index,
            .alreadyPresent = get_previous_value_index_hint.second.is_already_present,
        });
    }
    for (const auto& get_leaf_preimage_hint : query_hints.get_leaf_preimage_hints_public_data_tree) {
        auto [hint_key, index] = get_leaf_preimage_hint.first;
        hints.getLeafPreimageHintsPublicDataTree.push_back(
            { .hintKey = hint_key, .index = index, .leafPreimage = get_leaf_preimage_hint.second });
    }
    for (const auto& get_leaf_preimage_hint : query_hints.get_leaf_preimage_hints_nullifier_tree) {
        auto [hint_key, index] = get_leaf_preimage_hint.first;
        hints.getLeafPreimageHintsNullifierTree.push_back(
            { .hintKey = hint_key, .index = index, .leafPreimage = get_leaf_preimage_hint.second });
    }
    for (const auto& get_leaf_value_hint : query_hints.get_leaf_value_hints) {
        auto [hint_key, tree_id, index] = get_leaf_value_hint.first;
        hints.getLeafValueHints.push_back(GetLeafValueHint{
            .hintKey = hint_key, .treeId = tree_id, .index = index, .value = get_leaf_value_hint.second });
    }
    for (const auto& sequential_insert_hint : sequential_insert_hints_public_data_tree) {
        hints.sequentialInsertHintsPublicDataTree.push_back(sequential_insert_hint.second);
    }
    for (const auto& sequential_insert_hint : sequential_insert_hints_nullifier_tree) {
        hints.sequentialInsertHintsNullifierTree.push_back(sequential_insert_hint.second);
    }
    for (const auto& append_leaves_hint : append_leaves_hints) {
        auto [hint_key, tree_id, leaves] = append_leaves_hint.first;
        hints.appendLeavesHints.push_back(AppendLeavesHint{
            .hintKey = hint_key, .stateAfter = append_leaves_hint.second, .treeId = tree_id, .leaves = leaves });
    }
    for (const auto& create_checkpoint_hint : create_checkpoint_hints) {
        hints.createCheckpointHints.push_back(create_checkpoint_hint.second);
    }
    for (const auto& commit_checkpoint_hint : commit_checkpoint_hints) {
        hints.commitCheckpointHints.push_back(commit_checkpoint_hint.second);
    }
    for (const auto& revert_checkpoint_hint : revert_checkpoint_hints) {
        hints.revertCheckpointHints.push_back(revert_checkpoint_hint.second);
    }
}

} // namespace bb::avm2::simulation
