#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"

#include <cassert>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

namespace {

std::string to_string(const TreeSnapshots& snapshots)
{
    return format("PUBLIC_DATA_TREE: ",
                  snapshots.public_data_tree,
                  "\nNULLIFIER_TREE: ",
                  snapshots.nullifier_tree,
                  "\nNOTE_HASH_TREE: ",
                  snapshots.note_hash_tree,
                  "\nL1_TO_L2_MESSAGE_TREE: ",
                  snapshots.l1_to_l2_message_tree);
}

std::string get_tree_name(world_state::MerkleTreeId tree_id)
{
    switch (tree_id) {
    case world_state::MerkleTreeId::PUBLIC_DATA_TREE:
        return "PUBLIC_DATA_TREE";
    case world_state::MerkleTreeId::NULLIFIER_TREE:
        return "NULLIFIER_TREE";
    case world_state::MerkleTreeId::NOTE_HASH_TREE:
        return "NOTE_HASH_TREE";
    case world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return "L1_TO_L2_MESSAGE_TREE";
    case world_state::MerkleTreeId::ARCHIVE:
        return "ARCHIVE";
    }

    return "UNKNOWN"; // To make GCC happy.
}

} // namespace

// HintedRawContractDB starts.
HintedRawContractDB::HintedRawContractDB(const ExecutionHints& hints)
{
    BB_BENCH_NAME("HintedRawContractDB::HintedRawContractDB");

    vinfo("Initializing HintedRawContractDB with...",
          "\n * contract_instances: ",
          hints.contract_instances.size(),
          "\n * contract_classes: ",
          hints.contract_classes.size(),
          "\n * bytecode_commitments: ",
          hints.bytecode_commitments.size(),
          "\n * debug_function_names: ",
          hints.debug_function_names.size());

    for (const auto& contract_instance_hint : hints.contract_instances) {
        contract_instances[std::make_tuple(contract_instance_hint.hint_key, contract_instance_hint.address)] =
            contract_instance_hint;
    }

    for (const auto& contract_class_hint : hints.contract_classes) {
        contract_classes[std::make_tuple(contract_class_hint.hint_key, contract_class_hint.class_id)] =
            contract_class_hint;
    }

    for (const auto& bytecode_commitment_hint : hints.bytecode_commitments) {
        bytecode_commitments[std::make_tuple(bytecode_commitment_hint.hint_key, bytecode_commitment_hint.class_id)] =
            bytecode_commitment_hint.commitment;
    }

    for (const auto& debug_function_name_hint : hints.debug_function_names) {
        debug_function_names[std::make_pair(debug_function_name_hint.address, debug_function_name_hint.selector)] =
            debug_function_name_hint.name;
    }

    for (const auto& hint : hints.contract_db_create_checkpoint_hints) {
        create_checkpoint_hints[hint.action_counter] = hint;
    }
    for (const auto& hint : hints.contract_db_commit_checkpoint_hints) {
        commit_checkpoint_hints[hint.action_counter] = hint;
    }
    for (const auto& hint : hints.contract_db_revert_checkpoint_hints) {
        revert_checkpoint_hints[hint.action_counter] = hint;
    }
}

std::optional<ContractInstance> HintedRawContractDB::get_contract_instance(const AztecAddress& address) const
{
    uint32_t hint_key = action_counter;
    auto key = std::make_tuple(hint_key, address);
    auto it = contract_instances.find(key);
    if (it == contract_instances.end()) {
        vinfo("Contract instance not found for key (", hint_key, ", ", address, ")");
        return std::nullopt;
    }
    const auto& contract_instance_hint = it->second;

    return std::make_optional<ContractInstance>({
        .salt = contract_instance_hint.salt,
        .deployer = contract_instance_hint.deployer,
        .current_contract_class_id = contract_instance_hint.current_contract_class_id,
        .original_contract_class_id = contract_instance_hint.original_contract_class_id,
        .initialization_hash = contract_instance_hint.initialization_hash,
        .public_keys =
            PublicKeys{
                .nullifier_key = contract_instance_hint.public_keys.master_nullifier_public_key,
                .incoming_viewing_key = contract_instance_hint.public_keys.master_incoming_viewing_public_key,
                .outgoing_viewing_key = contract_instance_hint.public_keys.master_outgoing_viewing_public_key,
                .tagging_key = contract_instance_hint.public_keys.master_tagging_public_key,
            },
    });
}

std::optional<ContractClass> HintedRawContractDB::get_contract_class(const ContractClassId& class_id) const
{
    uint32_t hint_key = action_counter;
    auto key = std::make_tuple(hint_key, class_id);
    auto it = contract_classes.find(key);
    if (it == contract_classes.end()) {
        vinfo("Contract class not found for key (", hint_key, ", ", class_id, ")");
        return std::nullopt;
    }
    const auto& contract_class_hint = it->second;

    return std::make_optional<ContractClass>({
        .id = class_id,
        .artifact_hash = contract_class_hint.artifact_hash,
        .private_functions_root = contract_class_hint.private_functions_root,
        .packed_bytecode = contract_class_hint.packed_bytecode,
    });
}

std::optional<FF> HintedRawContractDB::get_bytecode_commitment(const ContractClassId& class_id) const
{
    uint32_t hint_key = action_counter;
    auto key = std::make_tuple(hint_key, class_id);
    auto it = bytecode_commitments.find(key);
    if (it == bytecode_commitments.end()) {
        vinfo("Bytecode commitment not found for key (", hint_key, ", ", class_id, ")");
        return std::nullopt;
    }
    return it->second;
}

std::optional<std::string> HintedRawContractDB::get_debug_function_name(const AztecAddress& address,
                                                                        const FunctionSelector& selector) const
{
    auto it = debug_function_names.find(std::make_pair(address, selector));
    if (it != debug_function_names.end()) {
        return it->second;
    }
    return std::nullopt;
}

void HintedRawContractDB::add_contracts([[maybe_unused]] const ContractDeploymentData& contract_deployment_data)
{
    debug("add_contracts called (no-op in hinted mode)");
}

void HintedRawContractDB::create_checkpoint()
{
    auto hint_it = create_checkpoint_hints.find(action_counter);
    assert(hint_it != create_checkpoint_hints.end());

    const auto& hint = hint_it->second;
    assert(hint.old_checkpoint_id == checkpoint_stack.top());

    checkpoint_stack.push(hint.new_checkpoint_id);
    action_counter++;
}

void HintedRawContractDB::commit_checkpoint()
{
    auto hint_it = commit_checkpoint_hints.find(action_counter);
    assert(hint_it != commit_checkpoint_hints.end());

    const auto& hint = hint_it->second;
    assert(hint.old_checkpoint_id == checkpoint_stack.top());

    checkpoint_stack.pop();
    assert(hint.new_checkpoint_id == checkpoint_stack.top());
    action_counter++;
    (void)hint;
}

void HintedRawContractDB::revert_checkpoint()
{
    auto hint_it = revert_checkpoint_hints.find(action_counter);
    assert(hint_it != revert_checkpoint_hints.end());

    const auto& hint = hint_it->second;
    assert(hint.old_checkpoint_id == checkpoint_stack.top());

    checkpoint_stack.pop();
    assert(hint.new_checkpoint_id == checkpoint_stack.top());
    action_counter++;
    (void)hint;
}

uint32_t HintedRawContractDB::get_checkpoint_id() const
{
    return checkpoint_stack.top();
}

// Hinted MerkleDB starts.
HintedRawMerkleDB::HintedRawMerkleDB(const ExecutionHints& hints)
    : tree_roots(hints.starting_tree_roots)
{
    BB_BENCH_NAME("HintedRawMerkleDB::HintedRawMerkleDB");

    vinfo("Initializing HintedRawMerkleDB with...",
          "\n * get_sibling_path_hints: ",
          hints.get_sibling_path_hints.size(),
          "\n * get_previous_value_index_hints: ",
          hints.get_previous_value_index_hints.size(),
          "\n * get_leaf_preimage_hints_public_data_tree: ",
          hints.get_leaf_preimage_hints_public_data_tree.size(),
          "\n * get_leaf_preimage_hints_nullifier_tree: ",
          hints.get_leaf_preimage_hints_nullifier_tree.size(),
          "\n * get_leaf_value_hints: ",
          hints.get_leaf_value_hints.size(),
          "\n * sequential_insert_hints_public_data_tree: ",
          hints.sequential_insert_hints_public_data_tree.size(),
          "\n * sequential_insert_hints_nullifier_tree: ",
          hints.sequential_insert_hints_nullifier_tree.size(),
          "\n * append_leaves_hints: ",
          hints.append_leaves_hints.size(),
          "\n * create_checkpoint_hints: ",
          hints.create_checkpoint_hints.size(),
          "\n * commit_checkpoint_hints: ",
          hints.commit_checkpoint_hints.size(),
          "\n * revert_checkpoint_hints: ",
          hints.revert_checkpoint_hints.size());
    debug("Initializing HintedRawMerkleDB with snapshots...\n", to_string(tree_roots));

    for (const auto& get_sibling_path_hint : hints.get_sibling_path_hints) {
        GetSiblingPathKey key = { get_sibling_path_hint.hint_key,
                                  get_sibling_path_hint.tree_id,
                                  get_sibling_path_hint.index };
        get_sibling_path_hints[key] = get_sibling_path_hint.path;
    }

    for (const auto& get_previous_value_index_hint : hints.get_previous_value_index_hints) {
        GetPreviousValueIndexKey key = { get_previous_value_index_hint.hint_key,
                                         get_previous_value_index_hint.tree_id,
                                         get_previous_value_index_hint.value };
        get_previous_value_index_hints[key] = {
            get_previous_value_index_hint.already_present,
            get_previous_value_index_hint.index,
        };
    }

    for (const auto& get_leaf_preimage_hint : hints.get_leaf_preimage_hints_public_data_tree) {
        GetLeafPreimageKey key = { get_leaf_preimage_hint.hint_key, get_leaf_preimage_hint.index };
        get_leaf_preimage_hints_public_data_tree[key] = get_leaf_preimage_hint.leaf_preimage;
    }

    for (const auto& get_leaf_preimage_hint : hints.get_leaf_preimage_hints_nullifier_tree) {
        GetLeafPreimageKey key = { get_leaf_preimage_hint.hint_key, get_leaf_preimage_hint.index };
        get_leaf_preimage_hints_nullifier_tree[key] = get_leaf_preimage_hint.leaf_preimage;
    }

    for (const auto& get_leaf_value_hint : hints.get_leaf_value_hints) {
        GetLeafValueKey key = { get_leaf_value_hint.hint_key, get_leaf_value_hint.tree_id, get_leaf_value_hint.index };
        get_leaf_value_hints[key] = get_leaf_value_hint.value;
    }

    for (const auto& sequential_insert_hint : hints.sequential_insert_hints_public_data_tree) {
        SequentialInsertHintPublicDataTreeKey key = { sequential_insert_hint.hint_key,
                                                      sequential_insert_hint.tree_id,
                                                      sequential_insert_hint.leaf };
        sequential_insert_hints_public_data_tree[key] = sequential_insert_hint;
    }

    for (const auto& sequential_insert_hint : hints.sequential_insert_hints_nullifier_tree) {
        SequentialInsertHintNullifierTreeKey key = { sequential_insert_hint.hint_key,
                                                     sequential_insert_hint.tree_id,
                                                     sequential_insert_hint.leaf };
        sequential_insert_hints_nullifier_tree[key] = sequential_insert_hint;
    }

    for (const auto& append_leaves_hint : hints.append_leaves_hints) {
        // Convert the span from the hint to a vector for the key
        AppendLeavesHintKey key = { append_leaves_hint.hint_key,
                                    append_leaves_hint.tree_id,
                                    append_leaves_hint.leaves };
        append_leaves_hints[key] = append_leaves_hint.state_after;
    }

    for (const auto& create_checkpoint_hint : hints.create_checkpoint_hints) {
        create_checkpoint_hints[create_checkpoint_hint.action_counter] = create_checkpoint_hint;
    }

    for (const auto& commit_checkpoint_hint : hints.commit_checkpoint_hints) {
        commit_checkpoint_hints[commit_checkpoint_hint.action_counter] = commit_checkpoint_hint;
    }

    for (const auto& revert_checkpoint_hint : hints.revert_checkpoint_hints) {
        revert_checkpoint_hints[revert_checkpoint_hint.action_counter] = revert_checkpoint_hint;
    }
}

const AppendOnlyTreeSnapshot& HintedRawMerkleDB::get_tree_info(world_state::MerkleTreeId tree_id) const
{
    return get_tree_info_helper(tree_id, tree_roots);
}

AppendOnlyTreeSnapshot& HintedRawMerkleDB::get_tree_info(world_state::MerkleTreeId tree_id)
{
    return get_tree_info_helper(tree_id, tree_roots);
}

SiblingPath HintedRawMerkleDB::get_sibling_path(world_state::MerkleTreeId tree_id, index_t leaf_index) const
{
    auto tree_info = get_tree_info(tree_id);
    GetSiblingPathKey key = { tree_info, tree_id, leaf_index };
    auto it = get_sibling_path_hints.find(key);
    if (it == get_sibling_path_hints.end()) {
        throw std::runtime_error(format("Sibling path not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.next_available_leaf_index,
                                        ", tree: ",
                                        get_tree_name(tree_id),
                                        ", leaf_index: ",
                                        leaf_index,
                                        ")"));
    }
    return it->second;
}

GetLowIndexedLeafResponse HintedRawMerkleDB::get_low_indexed_leaf(world_state::MerkleTreeId tree_id,
                                                                  const FF& value) const
{
    auto tree_info = get_tree_info(tree_id);
    GetPreviousValueIndexKey key = { tree_info, tree_id, value };
    auto it = get_previous_value_index_hints.find(key);
    if (it == get_previous_value_index_hints.end()) {
        throw std::runtime_error(format("Low indexed leaf not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.next_available_leaf_index,
                                        ", tree: ",
                                        get_tree_name(tree_id),
                                        ", value: ",
                                        value,
                                        ")"));
    }
    return it->second;
}

FF HintedRawMerkleDB::get_leaf_value(world_state::MerkleTreeId tree_id, index_t leaf_index) const
{
    auto tree_info = get_tree_info(tree_id);
    GetLeafValueKey key = { tree_info, tree_id, leaf_index };
    auto it = get_leaf_value_hints.find(key);
    if (it == get_leaf_value_hints.end()) {
        throw std::runtime_error(format("Leaf value not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.next_available_leaf_index,
                                        ", tree: ",
                                        get_tree_name(tree_id),
                                        ", leaf_index: ",
                                        leaf_index,
                                        ")"));
    }
    return it->second;
}

IndexedLeaf<PublicDataLeafValue> HintedRawMerkleDB::get_leaf_preimage_public_data_tree(index_t leaf_index) const
{
    auto tree_info = get_tree_info(world_state::MerkleTreeId::PUBLIC_DATA_TREE);
    GetLeafPreimageKey key = { tree_info, leaf_index };
    auto it = get_leaf_preimage_hints_public_data_tree.find(key);
    if (it == get_leaf_preimage_hints_public_data_tree.end()) {
        throw std::runtime_error(format("Leaf preimage (PUBLIC_DATA_TREE) not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.next_available_leaf_index,
                                        ", leaf_index: ",
                                        leaf_index,
                                        ")"));
    }
    return it->second;
}

IndexedLeaf<NullifierLeafValue> HintedRawMerkleDB::get_leaf_preimage_nullifier_tree(index_t leaf_index) const
{
    auto tree_info = get_tree_info(world_state::MerkleTreeId::NULLIFIER_TREE);
    GetLeafPreimageKey key = { tree_info, leaf_index };
    auto it = get_leaf_preimage_hints_nullifier_tree.find(key);
    if (it == get_leaf_preimage_hints_nullifier_tree.end()) {
        throw std::runtime_error(format("Leaf preimage (NULLIFIER_TREE) not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.next_available_leaf_index,
                                        ", leaf_index: ",
                                        leaf_index,
                                        ")"));
    }
    return it->second;
}

SequentialInsertionResult<PublicDataLeafValue> HintedRawMerkleDB::insert_indexed_leaves_public_data_tree(
    const PublicDataLeafValue& leaf_value)
{
    auto tree_info = get_tree_info(world_state::MerkleTreeId::PUBLIC_DATA_TREE);
    SequentialInsertHintPublicDataTreeKey key = { tree_info, world_state::MerkleTreeId::PUBLIC_DATA_TREE, leaf_value };
    auto it = sequential_insert_hints_public_data_tree.find(key);
    if (it == sequential_insert_hints_public_data_tree.end()) {
        throw std::runtime_error(format("Sequential insert hint (PUBLIC_DATA_TREE) not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.next_available_leaf_index,
                                        ", leaf_value: ",
                                        leaf_value,
                                        ")"));
    }
    const auto& hint = it->second;

    SequentialInsertionResult<PublicDataLeafValue> result;

    // Convert low leaves witness data
    result.low_leaf_witness_data.emplace_back(
        hint.low_leaves_witness_data.leaf, hint.low_leaves_witness_data.index, hint.low_leaves_witness_data.path);

    // Convert insertion witness data
    result.insertion_witness_data.emplace_back(
        hint.insertion_witness_data.leaf, hint.insertion_witness_data.index, hint.insertion_witness_data.path);

    // Evolve state.
    tree_roots.public_data_tree = hint.state_after;

    debug("Evolved state of PUBLIC_DATA_TREE: ",
          tree_roots.public_data_tree.root,
          " (size: ",
          tree_roots.public_data_tree.next_available_leaf_index,
          ")");

    return result;
}

SequentialInsertionResult<NullifierLeafValue> HintedRawMerkleDB::insert_indexed_leaves_nullifier_tree(
    const NullifierLeafValue& leaf_value)
{
    auto tree_info = get_tree_info(world_state::MerkleTreeId::NULLIFIER_TREE);
    SequentialInsertHintNullifierTreeKey key = { tree_info, world_state::MerkleTreeId::NULLIFIER_TREE, leaf_value };
    auto it = sequential_insert_hints_nullifier_tree.find(key);
    if (it == sequential_insert_hints_nullifier_tree.end()) {
        throw std::runtime_error(format("Sequential insert hint (NULLIFIER_TREE) not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.next_available_leaf_index,
                                        ", leaf_value: ",
                                        leaf_value,
                                        ")"));
    }
    const auto& hint = it->second;

    SequentialInsertionResult<NullifierLeafValue> result;

    // Convert low leaves witness data
    result.low_leaf_witness_data.emplace_back(
        hint.low_leaves_witness_data.leaf, hint.low_leaves_witness_data.index, hint.low_leaves_witness_data.path);

    // Convert insertion witness data
    result.insertion_witness_data.emplace_back(
        hint.insertion_witness_data.leaf, hint.insertion_witness_data.index, hint.insertion_witness_data.path);

    // Evolve state.
    tree_roots.nullifier_tree = hint.state_after;

    debug("Evolved state of NULLIFIER_TREE: ",
          tree_roots.nullifier_tree.root,
          " (size: ",
          tree_roots.nullifier_tree.next_available_leaf_index,
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
    if (hint.old_checkpoint_id != checkpoint_stack.top()) {
        throw std::runtime_error(format("[create_checkpoint@",
                                        checkpoint_action_counter,
                                        "] Old checkpoint id does not match the current checkpoint id: ",
                                        hint.old_checkpoint_id,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    debug("[create_checkpoint@",
          checkpoint_action_counter,
          "] Checkpoint evolved ",
          hint.old_checkpoint_id,
          " -> ",
          hint.new_checkpoint_id);

    checkpoint_stack.push(hint.new_checkpoint_id);
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
    if (hint.old_checkpoint_id != checkpoint_stack.top()) {
        throw std::runtime_error(format("[commit_checkpoint@",
                                        checkpoint_action_counter,
                                        "] Old checkpoint id does not match the current checkpoint id: ",
                                        hint.old_checkpoint_id,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    checkpoint_stack.pop();

    // Sanity check.
    if (hint.new_checkpoint_id != checkpoint_stack.top()) {
        throw std::runtime_error(format("[commit_checkpoint@",
                                        checkpoint_action_counter,
                                        "] New checkpoint id does not match the current checkpoint id: ",
                                        hint.new_checkpoint_id,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    debug("[commit_checkpoint@",
          checkpoint_action_counter,
          "] Checkpoint evolved ",
          hint.old_checkpoint_id,
          " -> ",
          hint.new_checkpoint_id);

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
    if (hint.old_checkpoint_id != checkpoint_stack.top()) {
        throw std::runtime_error(format("[revert_checkpoint@",
                                        checkpoint_action_counter,
                                        "] Old checkpoint id does not match the current checkpoint id: ",
                                        hint.old_checkpoint_id,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    // Sanity check of tree snapshots.
    if (hint.state_before != tree_roots) {
        vinfo("Hint tree snapshots: ", to_string(hint.state_before));
        vinfo("Current tree roots: ", to_string(tree_roots));
        throw std::runtime_error(format("[revert_checkpoint@",
                                        checkpoint_action_counter,
                                        "] Hint tree snapshots do not match the current tree roots."));
    }

    checkpoint_stack.pop();

    // Sanity check.
    if (hint.new_checkpoint_id != checkpoint_stack.top()) {
        throw std::runtime_error(format("[revert_checkpoint@",
                                        checkpoint_action_counter,
                                        "] New checkpoint id does not match the current checkpoint id: ",
                                        hint.new_checkpoint_id,
                                        " != ",
                                        checkpoint_stack.top()));
    }

    // Evolve trees.
    tree_roots = hint.state_after;

    debug("[revert_checkpoint@",
          checkpoint_action_counter,
          "] Checkpoint evolved ",
          hint.old_checkpoint_id,
          " -> ",
          hint.new_checkpoint_id);

    checkpoint_action_counter++;
}

std::vector<AppendLeafResult> HintedRawMerkleDB::append_leaves(world_state::MerkleTreeId tree_id,
                                                               std::span<const FF> leaves)
{
    std::vector<AppendLeafResult> results;
    results.reserve(leaves.size());

    // We need to process each leaf individually because we need the sibling path after insertion, to be able to
    // constraint the insertion.
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/13380): This can be changed if the world state
    // appendLeaves returns the sibling paths.
    for (const auto& leaf : leaves) {
        results.push_back(appendLeafInternal(tree_id, leaf));
    }

    return results;
}

void HintedRawMerkleDB::pad_tree(world_state::MerkleTreeId tree_id, size_t num_leaves)
{
    auto& tree_info = get_tree_info(tree_id);
    auto size_before = tree_info.next_available_leaf_index;
    (void)size_before; // To please the compiler.
    tree_info.next_available_leaf_index += num_leaves;

    debug("Padded tree ",
          get_tree_name(tree_id),
          " from size ",
          size_before,
          " to ",
          tree_info.next_available_leaf_index);
}

AppendLeafResult HintedRawMerkleDB::appendLeafInternal(world_state::MerkleTreeId tree_id, const FF& leaf)
{
    auto tree_info = get_tree_info(tree_id);
    AppendLeavesHintKey key = { tree_info, tree_id, { leaf } };
    auto it = append_leaves_hints.find(key);
    if (it == append_leaves_hints.end()) {
        throw std::runtime_error(format("Append leaves hint not found for key (root: ",
                                        tree_info.root,
                                        ", size: ",
                                        tree_info.next_available_leaf_index,
                                        ", tree: ",
                                        get_tree_name(tree_id),
                                        ", leaf: ",
                                        leaf,
                                        ")"));
    }
    const auto& state_after = it->second;

    // Update the tree state based on the hint.
    switch (tree_id) {
    case world_state::MerkleTreeId::NOTE_HASH_TREE:
        tree_roots.note_hash_tree = state_after;
        debug("Evolved state of NOTE_HASH_TREE: ",
              tree_roots.note_hash_tree.root,
              " (size: ",
              tree_roots.note_hash_tree.next_available_leaf_index,
              ")");
        break;
    case world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        tree_roots.l1_to_l2_message_tree = state_after;
        debug("Evolved state of L1_TO_L2_MESSAGE_TREE: ",
              tree_roots.l1_to_l2_message_tree.root,
              " (size: ",
              tree_roots.l1_to_l2_message_tree.next_available_leaf_index,
              ")");
        break;
    default:
        throw std::runtime_error("append_leaves is only supported for NOTE_HASH_TREE and L1_TO_L2_MESSAGE_TREE");
    }

    // Get the sibling path for the newly inserted leaf.
    return { .root = tree_info.root, .path = get_sibling_path(tree_id, tree_info.next_available_leaf_index) };
}

uint32_t HintedRawMerkleDB::get_checkpoint_id() const
{
    return checkpoint_stack.top();
}

// PureRawMerkleDB starts.
TreeSnapshots PureRawMerkleDB::get_tree_roots() const
{
    auto l1_to_l2_info = ws_instance.get_tree_info(ws_revision, MerkleTreeId::L1_TO_L2_MESSAGE_TREE);
    auto note_hash_info = ws_instance.get_tree_info(ws_revision, MerkleTreeId::NOTE_HASH_TREE);
    auto nullifier_info = ws_instance.get_tree_info(ws_revision, MerkleTreeId::NULLIFIER_TREE);
    auto public_data_info = ws_instance.get_tree_info(ws_revision, MerkleTreeId::PUBLIC_DATA_TREE);

    return TreeSnapshots{
        .l1_to_l2_message_tree = AppendOnlyTreeSnapshot{ .root = l1_to_l2_info.meta.root,
                                                         .next_available_leaf_index = l1_to_l2_info.meta.size },
        .note_hash_tree = AppendOnlyTreeSnapshot{ .root = note_hash_info.meta.root,
                                                  .next_available_leaf_index = note_hash_info.meta.size },
        .nullifier_tree = AppendOnlyTreeSnapshot{ .root = nullifier_info.meta.root,
                                                  .next_available_leaf_index = nullifier_info.meta.size },
        .public_data_tree = AppendOnlyTreeSnapshot{ .root = public_data_info.meta.root,
                                                    .next_available_leaf_index = public_data_info.meta.size },
    };
}

SiblingPath PureRawMerkleDB::get_sibling_path(MerkleTreeId tree_id, index_t leaf_index) const
{
    return ws_instance.get_sibling_path(ws_revision, tree_id, leaf_index);
}

GetLowIndexedLeafResponse PureRawMerkleDB::get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) const
{
    return ws_instance.find_low_leaf_index(ws_revision, tree_id, value);
}

FF PureRawMerkleDB::get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const
{
    std::optional<FF> res = ws_instance.get_leaf<FF>(ws_revision, tree_id, leaf_index);
    // If the optional is not set, we assume something is wrong (e.g. leaf index out of bounds)
    if (!res.has_value()) {
        throw std::runtime_error(
            format("Invalid get_leaf_value request", static_cast<uint64_t>(tree_id), " for index ", leaf_index));
    }
    return res.value();
}

IndexedLeaf<PublicDataLeafValue> PureRawMerkleDB::get_leaf_preimage_public_data_tree(index_t leaf_index) const
{
    std::optional<IndexedLeaf<PublicDataLeafValue>> res =
        ws_instance.get_indexed_leaf<PublicDataLeafValue>(ws_revision, MerkleTreeId::PUBLIC_DATA_TREE, leaf_index);
    // If the optional is not set, we assume something is wrong (e.g. leaf index out of bounds)
    if (!res.has_value()) {
        throw std::runtime_error(format("Invalid get_leaf_preimage_public_data_tree request for index ", leaf_index));
    }
    return res.value();
}

IndexedLeaf<NullifierLeafValue> PureRawMerkleDB::get_leaf_preimage_nullifier_tree(index_t leaf_index) const
{
    std::optional<IndexedLeaf<NullifierLeafValue>> res =
        ws_instance.get_indexed_leaf<NullifierLeafValue>(ws_revision, MerkleTreeId::NULLIFIER_TREE, leaf_index);
    // If the optional is not set, we assume something is wrong (e.g. leaf index out of bounds)
    if (!res.has_value()) {
        throw std::runtime_error(format("Invalid get_leaf_preimage_nullifier_tree request for index ", leaf_index));
    }
    return res.value();
}

// State modification methods.
SequentialInsertionResult<PublicDataLeafValue> PureRawMerkleDB::insert_indexed_leaves_public_data_tree(
    const PublicDataLeafValue& leaf_value)
{
    auto result = ws_instance.insert_indexed_leaves<PublicDataLeafValue>(
        MerkleTreeId::PUBLIC_DATA_TREE, { leaf_value }, ws_revision.forkId);
    return result;
}

SequentialInsertionResult<NullifierLeafValue> PureRawMerkleDB::insert_indexed_leaves_nullifier_tree(
    const NullifierLeafValue& leaf_value)
{
    auto result = ws_instance.insert_indexed_leaves<NullifierLeafValue>(
        MerkleTreeId::NULLIFIER_TREE, { leaf_value }, ws_revision.forkId);
    return result;
}

// This method currently returns a vector of intermediate roots and sibling paths, but in practice we might only
// need or care about the last one for simulation, this would simplify how we append in this function.
// todo(ilyas): Given this function says append, perhaps we just want to restrict to NoteHash?
std::vector<AppendLeafResult> PureRawMerkleDB::append_leaves(MerkleTreeId tree_id, std::span<const FF> leaves)
{
    std::vector<FF> leaves_vec(leaves.begin(), leaves.end());

    // If we wanted intermediate roots and paths, we would need to call append_leaves one by one
    ws_instance.append_leaves(tree_id, leaves_vec, ws_revision.forkId);

    auto tree_info = ws_instance.get_tree_info(ws_revision, MerkleTreeId::NOTE_HASH_TREE);
    return { AppendLeafResult{ .root = tree_info.meta.root,
                               .path = get_sibling_path(tree_id, tree_info.meta.size - 1) } };
}

void PureRawMerkleDB::pad_tree(MerkleTreeId tree_id, size_t num_leaves)
{
    // The only trees that should be padded are NULLIFIER_TREE and NOTE_HASH_TREE
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE: {
        std::vector<NullifierLeafValue> padding_leaves(num_leaves, NullifierLeafValue::empty());
        ws_instance.batch_insert_indexed_leaves(
            MerkleTreeId::NULLIFIER_TREE, padding_leaves, NULLIFIER_SUBTREE_HEIGHT, ws_revision.forkId);
        break;
    }
    case MerkleTreeId::NOTE_HASH_TREE: {
        std::vector<FF> padding_leaves(num_leaves, FF(0));
        ws_instance.append_leaves(MerkleTreeId::NOTE_HASH_TREE, padding_leaves, ws_revision.forkId);
        break;
    }
    default:
        throw std::runtime_error("Padding not supported for tree " + std::to_string(static_cast<uint64_t>(tree_id)));
    }
}

void PureRawMerkleDB::create_checkpoint()
{
    ws_instance.checkpoint(ws_revision.forkId);
    // Since the world state checkpoint stack is opaque, we track our own checkpoint ids.
    uint32_t current_id = checkpoint_stack.top();
    checkpoint_stack.push(current_id + 1);
}

void PureRawMerkleDB::commit_checkpoint()
{
    ws_instance.commit_checkpoint(ws_revision.forkId);
    checkpoint_stack.pop();
}

void PureRawMerkleDB::revert_checkpoint()
{
    ws_instance.revert_checkpoint(ws_revision.forkId);
    checkpoint_stack.pop();
}

uint32_t PureRawMerkleDB::get_checkpoint_id() const
{
    return checkpoint_stack.top();
}

} // namespace bb::avm2::simulation
