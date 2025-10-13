#include "barretenberg/vm2/simulation/standalone/concrete_dbs.hpp"

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"

namespace bb::avm2::simulation {

// Contracts DB starts.
std::optional<ContractInstance> PureContractDB::get_contract_instance(const AztecAddress& address) const
{
    return raw_contract_db.get_contract_instance(address);
}

std::optional<ContractClass> PureContractDB::get_contract_class(const ContractClassId& class_id) const
{
    return raw_contract_db.get_contract_class(class_id);
}

// Merkle DB starts.
TreeStates PureMerkleDB::get_tree_state() const
{
    // No event generated.
    TreeSnapshots tree_snapshots = raw_merkle_db.get_tree_roots();
    TreeCounters tree_counters = tree_counters_stack.top();
    return {
        .noteHashTree = { .tree = tree_snapshots.noteHashTree, .counter = tree_counters.note_hash_counter },
        .nullifierTree = { .tree = tree_snapshots.nullifierTree, .counter = tree_counters.nullifier_counter },
        .l1ToL2MessageTree = { .tree = tree_snapshots.l1ToL2MessageTree,
                               .counter = tree_counters.l2_to_l1_msg_counter },
        .publicDataTree = { .tree = tree_snapshots.publicDataTree, .counter = written_public_data_slots.size() },
    };
}

FF PureMerkleDB::storage_read(const AztecAddress& contract_address, const FF& slot) const
{
    auto [present, index] = raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::PUBLIC_DATA_TREE,
                                                               unconstrained_compute_leaf_slot(contract_address, slot));
    FF value = 0;

    if (present) {
        auto preimage = raw_merkle_db.get_leaf_preimage_public_data_tree(index);
        value = preimage.leaf.value;
    }

    return value;
}

void PureMerkleDB::storage_write(const AztecAddress& contract_address,
                                 const FF& slot,
                                 const FF& value,
                                 bool is_protocol_write)
{
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    auto hint = raw_merkle_db.insert_indexed_leaves_public_data_tree(PublicDataLeafValue(leaf_slot, value));

    if (!is_protocol_write) {
        written_public_data_slots.insert(contract_address, slot);
    }
}

bool PureMerkleDB::was_storage_written(const AztecAddress& contract_address, const FF& slot) const
{
    return written_public_data_slots.contains(contract_address, slot);
}

bool PureMerkleDB::nullifier_exists(const AztecAddress& contract_address, const FF& nullifier) const
{
    return nullifier_exists_internal(contract_address, nullifier);
}

bool PureMerkleDB::siloed_nullifier_exists(const FF& nullifier) const
{
    return nullifier_exists_internal(/*contract_address*/ std::nullopt, nullifier);
}

bool PureMerkleDB::nullifier_exists_internal(std::optional<AztecAddress> contract_address, const FF& nullifier) const
{
    FF siloed_nullifier = nullifier;
    if (contract_address.has_value()) {
        siloed_nullifier = unconstrained_silo_nullifier(contract_address.value(), nullifier);
    }

    auto [present, low_leaf_index_] =
        raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::NULLIFIER_TREE, siloed_nullifier);

    return present;
}

void PureMerkleDB::nullifier_write(const AztecAddress& contract_address, const FF& nullifier)
{
    nullifier_write_internal(contract_address, nullifier);
}

void PureMerkleDB::siloed_nullifier_write(const FF& nullifier)
{
    nullifier_write_internal(/*contract_address*/ std::nullopt, nullifier);
}

void PureMerkleDB::nullifier_write_internal(std::optional<AztecAddress> contract_address, const FF& nullifier)
{
    FF siloed_nullifier = nullifier;
    if (contract_address.has_value()) {
        // Unconstrained siloing to fetch the hint, since the hints are keyed by siloed data.
        // The siloing will later be constrained in the nullifier tree check gadget.
        siloed_nullifier = unconstrained_silo_nullifier(contract_address.value(), nullifier);
    }

    auto [present, low_leaf_index_] =
        raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::NULLIFIER_TREE, siloed_nullifier);

    if (present) {
        throw NullifierCollisionException(format("Nullifier ", nullifier, " already exists"));
    }

    raw_merkle_db.insert_indexed_leaves_nullifier_tree(siloed_nullifier);
    tree_counters_stack.top().nullifier_counter++;
}

bool PureMerkleDB::note_hash_exists(uint64_t leaf_index, const FF& unique_note_hash) const
{
    auto leaf_value = raw_merkle_db.get_leaf_value(MerkleTreeId::NOTE_HASH_TREE, leaf_index);
    return (unique_note_hash == leaf_value);
}

void PureMerkleDB::note_hash_write(const AztecAddress& contract_address, const FF& note_hash)
{
    uint32_t note_hash_counter = tree_counters_stack.top().note_hash_counter;
    FF siloed_note_hash = unconstrained_silo_note_hash(contract_address, note_hash);
    FF unique_note_hash = unconstrained_make_unique_note_hash(siloed_note_hash, first_nullifier, note_hash_counter);
    raw_merkle_db.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ unique_note_hash });

    tree_counters_stack.top().note_hash_counter++;
}

void PureMerkleDB::siloed_note_hash_write(const FF& siloed_note_hash)
{
    uint32_t note_hash_counter = tree_counters_stack.top().note_hash_counter;
    FF unique_note_hash = unconstrained_make_unique_note_hash(siloed_note_hash, first_nullifier, note_hash_counter);
    raw_merkle_db.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ unique_note_hash });

    tree_counters_stack.top().note_hash_counter++;
}

void PureMerkleDB::unique_note_hash_write(const FF& unique_note_hash)
{
    raw_merkle_db.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ unique_note_hash });

    tree_counters_stack.top().note_hash_counter++;
}

bool PureMerkleDB::l1_to_l2_msg_exists(uint64_t leaf_index, const FF& msg_hash) const
{
    auto leaf_value = raw_merkle_db.get_leaf_value(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, leaf_index);
    return (msg_hash == leaf_value);
}

void PureMerkleDB::pad_trees()
{
    // The public data tree is not padded.
    raw_merkle_db.pad_tree(MerkleTreeId::NOTE_HASH_TREE,
                           MAX_NOTE_HASHES_PER_TX - tree_counters_stack.top().note_hash_counter);
    raw_merkle_db.pad_tree(MerkleTreeId::NULLIFIER_TREE,
                           MAX_NULLIFIERS_PER_TX - tree_counters_stack.top().nullifier_counter);
}

void PureMerkleDB::create_checkpoint()
{
    raw_merkle_db.create_checkpoint();
    written_public_data_slots.create_checkpoint();
    tree_counters_stack.push(tree_counters_stack.top());
    for (auto& listener : checkpoint_listeners) {
        listener->on_checkpoint_created();
    }
}

void PureMerkleDB::commit_checkpoint()
{
    raw_merkle_db.commit_checkpoint();
    written_public_data_slots.commit_checkpoint();
    TreeCounters current_counters = tree_counters_stack.top();
    tree_counters_stack.pop();
    tree_counters_stack.top() = current_counters;
    for (auto& listener : checkpoint_listeners) {
        listener->on_checkpoint_committed();
    }
}

void PureMerkleDB::revert_checkpoint()
{
    raw_merkle_db.revert_checkpoint();
    written_public_data_slots.revert_checkpoint();
    tree_counters_stack.pop();
    for (auto& listener : checkpoint_listeners) {
        listener->on_checkpoint_reverted();
    }
}

uint32_t PureMerkleDB::get_checkpoint_id() const
{
    return raw_merkle_db.get_checkpoint_id();
}

} // namespace bb::avm2::simulation
