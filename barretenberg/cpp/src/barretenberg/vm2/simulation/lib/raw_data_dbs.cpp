#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"

#include <cassert>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>

#include "barretenberg/common/log.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

namespace {

std::string to_string(const TreeSnapshots& snapshots)
{
    return format("PUBLIC_DATA_TREE: ",
                  snapshots.publicDataTree,
                  "\nNULLIFIER_TREE: ",
                  snapshots.nullifierTree,
                  "\nNOTE_HASH_TREE: ",
                  snapshots.noteHashTree,
                  "\nL1_TO_L2_MESSAGE_TREE: ",
                  snapshots.l1ToL2MessageTree);
}

} // namespace

// HintedRawContractDB starts.
HintedRawContractDB::HintedRawContractDB(const ExecutionHints& hints)
{
    vinfo("Initializing HintedRawContractDB with...",
          "\n * contractInstances: ",
          hints.contractInstances.size(),
          "\n * contractClasses: ",
          hints.contractClasses.size(),
          "\n * bytecodeCommitments: ",
          hints.bytecodeCommitments.size());

    for (const auto& contract_instance_hint : hints.contractInstances) {
        // TODO(fcarreiro): We are currently generating duplicates in TS.
        // assert(!contract_instances.contains(contract_instance_hint.address));
        contract_instances[contract_instance_hint.address] = contract_instance_hint;
    }

    for (const auto& contract_class_hint : hints.contractClasses) {
        // TODO(fcarreiro): We are currently generating duplicates in TS.
        // assert(!contract_classes.contains(contract_class_hint.classId));
        contract_classes[contract_class_hint.classId] = contract_class_hint;
    }

    for (const auto& bytecode_commitment_hint : hints.bytecodeCommitments) {
        // TODO(fcarreiro): We are currently generating duplicates in TS.
        // assert(!bytecode_commitments.contains(bytecode_commitment_hint.classId));
        bytecode_commitments[bytecode_commitment_hint.classId] = bytecode_commitment_hint.commitment;
    }
}

std::optional<ContractInstance> HintedRawContractDB::get_contract_instance(const AztecAddress& address) const
{
    auto it = contract_instances.find(address);
    // If we don't find the instance hint, this is not a catastrohic failure. It means that on the TS side,
    // the instance was also not found, and should be handled.
    if (it == contract_instances.end()) {
        vinfo("Contract instance not found: ", address);
        return std::nullopt;
    }
    const auto& contract_instance_hint = it->second;

    return std::make_optional<ContractInstance>({
        .salt = contract_instance_hint.salt,
        .deployer_addr = contract_instance_hint.deployer,
        .current_class_id = contract_instance_hint.currentContractClassId,
        .original_class_id = contract_instance_hint.originalContractClassId,
        .initialisation_hash = contract_instance_hint.initializationHash,
        .public_keys =
            PublicKeys{
                .nullifier_key = contract_instance_hint.publicKeys.masterNullifierPublicKey,
                .incoming_viewing_key = contract_instance_hint.publicKeys.masterIncomingViewingPublicKey,
                .outgoing_viewing_key = contract_instance_hint.publicKeys.masterOutgoingViewingPublicKey,
                .tagging_key = contract_instance_hint.publicKeys.masterTaggingPublicKey,
            },
    });
}

std::optional<ContractClass> HintedRawContractDB::get_contract_class(const ContractClassId& class_id) const
{
    auto it = contract_classes.find(class_id);
    // If we don't find the class hint, this is not a catastrohic failure. It means that on the TS side,
    // the class was also not found, and should be handled.
    if (it == contract_classes.end()) {
        vinfo("Contract class not found: ", class_id);
        return std::nullopt;
    }
    const auto& contract_class_hint = it->second;

    return std::make_optional<ContractClass>({
        .artifact_hash = contract_class_hint.artifactHash,
        .private_function_root = contract_class_hint.privateFunctionsRoot,
        // We choose to embed the bytecode commitment in the contract class.
        .public_bytecode_commitment = get_bytecode_commitment(class_id),
        .packed_bytecode = contract_class_hint.packedBytecode,
    });
}

FF HintedRawContractDB::get_bytecode_commitment(const ContractClassId& class_id) const
{
    assert(bytecode_commitments.contains(class_id));
    return bytecode_commitments.at(class_id);
}

// Hinted MerkleDB starts.
HintedRawMerkleDB::HintedRawMerkleDB(const ExecutionHints& hints, const TreeSnapshots& tree_roots)
    : tree_roots(tree_roots)
{
    vinfo("Initializing HintedRawMerkleDB with...",
          "\n * get_sibling_path_hints: ",
          hints.getSiblingPathHints.size(),
          "\n * get_previous_value_index_hints: ",
          hints.getPreviousValueIndexHints.size(),
          "\n * get_leaf_preimage_hints_public_data_tree: ",
          hints.getLeafPreimageHintsPublicDataTree.size(),
          "\n * get_leaf_preimage_hints_nullifier_tree: ",
          hints.getLeafPreimageHintsNullifierTree.size(),
          "\n * get_leaf_value_hints: ",
          hints.getLeafValueHints.size(),
          "\n * sequential_insert_hints_public_data_tree: ",
          hints.sequentialInsertHintsPublicDataTree.size(),
          "\n * sequential_insert_hints_nullifier_tree: ",
          hints.sequentialInsertHintsNullifierTree.size(),
          "\n * append_leaves_hints: ",
          hints.appendLeavesHints.size(),
          "\n * create_checkpoint_hints: ",
          hints.createCheckpointHints.size(),
          "\n * commit_checkpoint_hints: ",
          hints.commitCheckpointHints.size(),
          "\n * revert_checkpoint_hints: ",
          hints.revertCheckpointHints.size());
    debug("Initializing HintedRawMerkleDB with snapshots...\n", to_string(tree_roots));

    for (const auto& get_sibling_path_hint : hints.getSiblingPathHints) {
        GetSiblingPathKey key = { get_sibling_path_hint.hintKey,
                                  get_sibling_path_hint.treeId,
                                  get_sibling_path_hint.index };
        get_sibling_path_hints[key] = get_sibling_path_hint.path;
    }

    for (const auto& get_previous_value_index_hint : hints.getPreviousValueIndexHints) {
        GetPreviousValueIndexKey key = { get_previous_value_index_hint.hintKey,
                                         get_previous_value_index_hint.treeId,
                                         get_previous_value_index_hint.value };
        get_previous_value_index_hints[key] = {
            get_previous_value_index_hint.alreadyPresent,
            get_previous_value_index_hint.index,
        };
    }

    for (const auto& get_leaf_preimage_hint : hints.getLeafPreimageHintsPublicDataTree) {
        GetLeafPreimageKey key = { get_leaf_preimage_hint.hintKey, get_leaf_preimage_hint.index };
        get_leaf_preimage_hints_public_data_tree[key] = get_leaf_preimage_hint.leafPreimage;
    }

    for (const auto& get_leaf_preimage_hint : hints.getLeafPreimageHintsNullifierTree) {
        GetLeafPreimageKey key = { get_leaf_preimage_hint.hintKey, get_leaf_preimage_hint.index };
        get_leaf_preimage_hints_nullifier_tree[key] = get_leaf_preimage_hint.leafPreimage;
    }

    for (const auto& get_leaf_value_hint : hints.getLeafValueHints) {
        GetLeafValueKey key = { get_leaf_value_hint.hintKey, get_leaf_value_hint.treeId, get_leaf_value_hint.index };
        get_leaf_value_hints[key] = get_leaf_value_hint.value;
    }

    for (const auto& sequential_insert_hint : hints.sequentialInsertHintsPublicDataTree) {
        SequentialInsertHintPublicDataTreeKey key = { sequential_insert_hint.hintKey,
                                                      sequential_insert_hint.treeId,
                                                      sequential_insert_hint.leaf };
        sequential_insert_hints_public_data_tree[key] = sequential_insert_hint;
    }

    for (const auto& sequential_insert_hint : hints.sequentialInsertHintsNullifierTree) {
        SequentialInsertHintNullifierTreeKey key = { sequential_insert_hint.hintKey,
                                                     sequential_insert_hint.treeId,
                                                     sequential_insert_hint.leaf };
        sequential_insert_hints_nullifier_tree[key] = sequential_insert_hint;
    }

    for (const auto& append_leaves_hint : hints.appendLeavesHints) {
        // Convert the span from the hint to a vector for the key
        AppendLeavesHintKey key = { append_leaves_hint.hintKey, append_leaves_hint.treeId, append_leaves_hint.leaves };
        append_leaves_hints[key] = append_leaves_hint.stateAfter;
    }

    for (const auto& create_checkpoint_hint : hints.createCheckpointHints) {
        create_checkpoint_hints[create_checkpoint_hint.actionCounter] = create_checkpoint_hint;
    }

    for (const auto& commit_checkpoint_hint : hints.commitCheckpointHints) {
        commit_checkpoint_hints[commit_checkpoint_hint.actionCounter] = commit_checkpoint_hint;
    }

    for (const auto& revert_checkpoint_hint : hints.revertCheckpointHints) {
        revert_checkpoint_hints[revert_checkpoint_hint.actionCounter] = revert_checkpoint_hint;
    }
}

const AppendOnlyTreeSnapshot& HintedRawMerkleDB::get_tree_info(world_state::MerkleTreeId tree_id) const
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

crypto::merkle_tree::fr_sibling_path HintedRawMerkleDB::get_sibling_path(world_state::MerkleTreeId tree_id,
                                                                         crypto::merkle_tree::index_t leaf_index) const
{
    auto tree_info = get_tree_info(tree_id);
    GetSiblingPathKey key = { tree_info, tree_id, leaf_index };
    auto it = get_sibling_path_hints.find(key);
    if (it == get_sibling_path_hints.end()) {
        throw std::runtime_error(format("Sibling path not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.nextAvailableLeafIndex,
                                        ", tree_id: ",
                                        static_cast<uint32_t>(tree_id),
                                        ", leaf_index: ",
                                        leaf_index,
                                        ")"));
    }
    return it->second;
}

crypto::merkle_tree::GetLowIndexedLeafResponse HintedRawMerkleDB::get_low_indexed_leaf(
    world_state::MerkleTreeId tree_id, const FF& value) const
{
    auto tree_info = get_tree_info(tree_id);
    GetPreviousValueIndexKey key = { tree_info, tree_id, value };
    auto it = get_previous_value_index_hints.find(key);
    if (it == get_previous_value_index_hints.end()) {
        throw std::runtime_error(format("Low indexed leaf not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.nextAvailableLeafIndex,
                                        ", tree_id: ",
                                        static_cast<uint32_t>(tree_id),
                                        ", value: ",
                                        value,
                                        ")"));
    }
    return it->second;
}

FF HintedRawMerkleDB::get_leaf_value(world_state::MerkleTreeId tree_id, crypto::merkle_tree::index_t leaf_index) const
{
    auto tree_info = get_tree_info(tree_id);
    GetLeafValueKey key = { tree_info, tree_id, leaf_index };
    auto it = get_leaf_value_hints.find(key);
    return it == get_leaf_value_hints.end() ? 0 : it->second;
}

crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue> HintedRawMerkleDB::
    get_leaf_preimage_public_data_tree(crypto::merkle_tree::index_t leaf_index) const
{
    auto tree_info = get_tree_info(world_state::MerkleTreeId::PUBLIC_DATA_TREE);
    GetLeafPreimageKey key = { tree_info, leaf_index };
    auto it = get_leaf_preimage_hints_public_data_tree.find(key);
    if (it == get_leaf_preimage_hints_public_data_tree.end()) {
        throw std::runtime_error(format("Leaf preimage (PUBLIC_DATA_TREE) not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.nextAvailableLeafIndex,
                                        ", leaf_index: ",
                                        leaf_index,
                                        ")"));
    }
    return it->second;
}

crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue> HintedRawMerkleDB::
    get_leaf_preimage_nullifier_tree(crypto::merkle_tree::index_t leaf_index) const
{
    auto tree_info = get_tree_info(world_state::MerkleTreeId::NULLIFIER_TREE);
    GetLeafPreimageKey key = { tree_info, leaf_index };
    auto it = get_leaf_preimage_hints_nullifier_tree.find(key);
    if (it == get_leaf_preimage_hints_nullifier_tree.end()) {
        throw std::runtime_error(format("Leaf preimage (NULLIFIER_TREE) not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.nextAvailableLeafIndex,
                                        ", leaf_index: ",
                                        leaf_index,
                                        ")"));
    }
    return it->second;
}

world_state::SequentialInsertionResult<crypto::merkle_tree::PublicDataLeafValue> HintedRawMerkleDB::
    insert_indexed_leaves_public_data_tree(const crypto::merkle_tree::PublicDataLeafValue& leaf_value)
{
    auto tree_info = get_tree_info(world_state::MerkleTreeId::PUBLIC_DATA_TREE);
    SequentialInsertHintPublicDataTreeKey key = { tree_info, world_state::MerkleTreeId::PUBLIC_DATA_TREE, leaf_value };
    auto it = sequential_insert_hints_public_data_tree.find(key);
    if (it == sequential_insert_hints_public_data_tree.end()) {
        throw std::runtime_error(format("Sequential insert hint (PUBLIC_DATA_TREE) not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.nextAvailableLeafIndex,
                                        ", leaf_value: ",
                                        leaf_value,
                                        ")"));
    }
    const auto& hint = it->second;

    world_state::SequentialInsertionResult<crypto::merkle_tree::PublicDataLeafValue> result;

    // Convert low leaves witness data
    result.low_leaf_witness_data.emplace_back(
        hint.lowLeavesWitnessData.leaf, hint.lowLeavesWitnessData.index, hint.lowLeavesWitnessData.path);

    // Convert insertion witness data
    result.insertion_witness_data.emplace_back(
        hint.insertionWitnessData.leaf, hint.insertionWitnessData.index, hint.insertionWitnessData.path);

    // Evolve state.
    tree_roots.publicDataTree = hint.stateAfter;

    debug("Evolved state of PUBLIC_DATA_TREE: ",
          tree_roots.publicDataTree.root,
          " (size: ",
          tree_roots.publicDataTree.nextAvailableLeafIndex,
          ")");

    return result;
}

world_state::SequentialInsertionResult<crypto::merkle_tree::NullifierLeafValue> HintedRawMerkleDB::
    insert_indexed_leaves_nullifier_tree(const crypto::merkle_tree::NullifierLeafValue& leaf_value)
{
    auto tree_info = get_tree_info(world_state::MerkleTreeId::NULLIFIER_TREE);
    SequentialInsertHintNullifierTreeKey key = { tree_info, world_state::MerkleTreeId::NULLIFIER_TREE, leaf_value };
    auto it = sequential_insert_hints_nullifier_tree.find(key);
    if (it == sequential_insert_hints_nullifier_tree.end()) {
        throw std::runtime_error(format("Sequential insert hint (NULLIFIER_TREE) not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.nextAvailableLeafIndex,
                                        ", leaf_value: ",
                                        leaf_value,
                                        ")"));
    }
    const auto& hint = it->second;

    world_state::SequentialInsertionResult<crypto::merkle_tree::NullifierLeafValue> result;

    // Convert low leaves witness data
    result.low_leaf_witness_data.emplace_back(
        hint.lowLeavesWitnessData.leaf, hint.lowLeavesWitnessData.index, hint.lowLeavesWitnessData.path);

    // Convert insertion witness data
    result.insertion_witness_data.emplace_back(
        hint.insertionWitnessData.leaf, hint.insertionWitnessData.index, hint.insertionWitnessData.path);

    // Evolve state.
    tree_roots.nullifierTree = hint.stateAfter;

    debug("Evolved state of NULLIFIER_TREE: ",
          tree_roots.nullifierTree.root,
          " (size: ",
          tree_roots.nullifierTree.nextAvailableLeafIndex,
          ")");

    return result;
}

void HintedRawMerkleDB::create_checkpoint()
{
    auto it = create_checkpoint_hints.find(checkpoint_action_counter);
    if (it == create_checkpoint_hints.end()) {
        throw std::runtime_error(
            format("[create_checkpoint@", checkpoint_action_counter, "] Hint not found for action counter!"));
    }
    const auto& hint = it->second;

    // Sanity check.
    if (hint.oldCheckpointId != checkpoint_stack.top()) {
        throw std::runtime_error(format("[create_checkpoint@",
                                        checkpoint_action_counter,
                                        "] Old checkpoint id does not match the current checkpoint id: ",
                                        hint.oldCheckpointId,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    debug("[create_checkpoint@",
          checkpoint_action_counter,
          "] Checkpoint evolved ",
          hint.oldCheckpointId,
          " -> ",
          hint.newCheckpointId);

    checkpoint_stack.push(hint.newCheckpointId);
    checkpoint_action_counter++;
}

void HintedRawMerkleDB::commit_checkpoint()
{
    auto it = commit_checkpoint_hints.find(checkpoint_action_counter);
    if (it == commit_checkpoint_hints.end()) {
        throw std::runtime_error(
            format("[commit_checkpoint@", checkpoint_action_counter, "] Hint not found for action counter!"));
    }
    const auto& hint = it->second;

    // Sanity check.
    if (hint.oldCheckpointId != checkpoint_stack.top()) {
        throw std::runtime_error(format("[commit_checkpoint@",
                                        checkpoint_action_counter,
                                        "] Old checkpoint id does not match the current checkpoint id: ",
                                        hint.oldCheckpointId,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    checkpoint_stack.pop();

    // Sanity check.
    if (hint.newCheckpointId != checkpoint_stack.top()) {
        throw std::runtime_error(format("[commit_checkpoint@",
                                        checkpoint_action_counter,
                                        "] New checkpoint id does not match the current checkpoint id: ",
                                        hint.newCheckpointId,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    debug("[commit_checkpoint@",
          checkpoint_action_counter,
          "] Checkpoint evolved ",
          hint.oldCheckpointId,
          " -> ",
          hint.newCheckpointId);

    checkpoint_action_counter++;
}

void HintedRawMerkleDB::revert_checkpoint()
{
    auto it = revert_checkpoint_hints.find(checkpoint_action_counter);
    if (it == revert_checkpoint_hints.end()) {
        throw std::runtime_error(
            format("[revert_checkpoint@", checkpoint_action_counter, "] Hint not found for action counter!"));
    }
    const auto& hint = it->second;

    // Sanity check of checkpoint stack.
    if (hint.oldCheckpointId != checkpoint_stack.top()) {
        throw std::runtime_error(format("[revert_checkpoint@",
                                        checkpoint_action_counter,
                                        "] Old checkpoint id does not match the current checkpoint id: ",
                                        hint.oldCheckpointId,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    // Sanity check of tree snapshots.
    if (hint.stateBefore != tree_roots) {
        vinfo("Hint tree snapshots: ", to_string(hint.stateBefore));
        vinfo("Current tree roots: ", to_string(tree_roots));
        throw std::runtime_error(format("[revert_checkpoint@",
                                        checkpoint_action_counter,
                                        "] Hint tree snapshots do not match the current tree roots."));
    }

    checkpoint_stack.pop();

    // Sanity check.
    if (hint.newCheckpointId != checkpoint_stack.top()) {
        throw std::runtime_error(format("[revert_checkpoint@",
                                        checkpoint_action_counter,
                                        "] New checkpoint id does not match the current checkpoint id: ",
                                        hint.newCheckpointId,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    // Evolve trees.
    tree_roots = hint.stateAfter;

    debug("[revert_checkpoint@",
          checkpoint_action_counter,
          "] Checkpoint evolved ",
          hint.oldCheckpointId,
          " -> ",
          hint.newCheckpointId);

    checkpoint_action_counter++;
}

void HintedRawMerkleDB::append_leaves(world_state::MerkleTreeId tree_id, std::span<const FF> leaves)
{
    if (leaves.empty()) {
        return;
    }

    auto tree_info = get_tree_info(tree_id);
    AppendLeavesHintKey key = { tree_info, tree_id, std::vector<FF>(leaves.begin(), leaves.end()) };
    auto it = append_leaves_hints.find(key);
    if (it == append_leaves_hints.end()) {
        throw std::runtime_error(format("Append leaves hint not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.nextAvailableLeafIndex,
                                        ", tree_id: ",
                                        static_cast<uint32_t>(tree_id),
                                        ", leaves: ",
                                        leaves[0],
                                        "..., leaves count: ",
                                        leaves.size(),
                                        ")"));
    }
    const auto& stateAfter = it->second;

    // Update the tree state based on the hint
    switch (tree_id) {
    case world_state::MerkleTreeId::NOTE_HASH_TREE:
        tree_roots.noteHashTree = stateAfter;
        debug("Evolved state of NOTE_HASH_TREE: ",
              tree_roots.noteHashTree.root,
              " (size: ",
              tree_roots.noteHashTree.nextAvailableLeafIndex,
              ")");
        break;
    case world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        tree_roots.l1ToL2MessageTree = stateAfter;
        debug("Evolved state of L1_TO_L2_MESSAGE_TREE: ",
              tree_roots.l1ToL2MessageTree.root,
              " (size: ",
              tree_roots.l1ToL2MessageTree.nextAvailableLeafIndex,
              ")");
        break;
    default:
        throw std::runtime_error("append_leaves is only supported for NOTE_HASH_TREE and L1_TO_L2_MESSAGE_TREE");
    }
}

} // namespace bb::avm2::simulation
