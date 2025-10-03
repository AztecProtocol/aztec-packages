#include "barretenberg/vm2/simulation/gadgets/concrete_dbs.hpp"

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"

namespace bb::avm2::simulation {

// Contracts DB starts.
std::optional<ContractInstance> ContractDB::get_contract_instance(const AztecAddress& address) const
{
    std::optional<ContractInstance> instance = raw_contract_db.get_contract_instance(address);
    // If we didn't get a contract instance, we don't prove anything.
    // It is the responsibility of the caller to prove what the protocol expects.
    if (!instance.has_value()) {
        return std::nullopt;
    }
    // If we did get a contract instance, we need to prove that the address is derived from the instance.
    // For protocol contracts the input address is the canonical address, we need to retrieve the derived address.
    AztecAddress derived_address = is_protocol_contract_address(address)
                                       ? get_derived_address(protocol_contracts, address)
                                             .value() /* We can assume that get_derived_address will not return a
                                                         nullopt, since we have succesfully fetched the instance.*/
                                       : address;
    address_derivation.assert_derivation(derived_address, instance.value());
    return instance;
}

std::optional<ContractClass> ContractDB::get_contract_class(const ContractClassId& class_id) const
{
    std::optional<ContractClass> klass = raw_contract_db.get_contract_class(class_id);
    // If we didn't get a contract class, we don't prove anything.
    // It is the responsibility of the caller to prove what the protocol expects.
    if (!klass.has_value()) {
        return std::nullopt;
    }
    // If we did get a contract class, we need to prove that the class_id is derived from the class.
    class_id_derivation.assert_derivation(class_id, klass.value());
    return klass;
}

// Merkle DB starts.

TreeStates MerkleDB::get_tree_state() const
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

FF MerkleDB::storage_read(const AztecAddress& contract_address, const FF& slot) const
{
    auto [present, index] = raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::PUBLIC_DATA_TREE,
                                                               unconstrained_compute_leaf_slot(contract_address, slot));
    auto path = raw_merkle_db.get_sibling_path(MerkleTreeId::PUBLIC_DATA_TREE, index);
    auto preimage = raw_merkle_db.get_leaf_preimage_public_data_tree(index);

    FF value = present ? preimage.leaf.value : 0;

    public_data_tree_check.assert_read(
        slot, contract_address, value, preimage, index, path, raw_merkle_db.get_tree_roots().publicDataTree);

    return value;
}

void MerkleDB::storage_write(const AztecAddress& contract_address,
                             const FF& slot,
                             const FF& value,
                             bool is_protocol_write)
{
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    AppendOnlyTreeSnapshot snapshot_before = raw_merkle_db.get_tree_roots().publicDataTree;

    auto hint = raw_merkle_db.insert_indexed_leaves_public_data_tree(PublicDataLeafValue(leaf_slot, value));

    auto& low_leaf_hint = hint.low_leaf_witness_data.at(0);
    auto& insertion_hint = hint.insertion_witness_data.at(0);

    AppendOnlyTreeSnapshot snapshot_after = public_data_tree_check.write(slot,
                                                                         contract_address,
                                                                         value,
                                                                         low_leaf_hint.leaf,
                                                                         low_leaf_hint.index,
                                                                         low_leaf_hint.path,
                                                                         snapshot_before,
                                                                         insertion_hint.path,
                                                                         is_protocol_write);

    (void)snapshot_after; // Silence unused variable warning when assert is stripped out
    // Sanity check.
    assert(snapshot_after == raw_merkle_db.get_tree_roots().publicDataTree);
    if (!is_protocol_write) {
        written_public_data_slots.insert(contract_address, slot);
    }
}

bool MerkleDB::was_storage_written(const AztecAddress& contract_address, const FF& slot) const
{
    return written_public_data_slots.contains(contract_address, slot);
}

bool MerkleDB::nullifier_exists(const AztecAddress& contract_address, const FF& nullifier) const
{
    return nullifier_exists_internal(contract_address, nullifier);
}

bool MerkleDB::siloed_nullifier_exists(const FF& nullifier) const
{
    return nullifier_exists_internal(/*contract_address*/ std::nullopt, nullifier);
}

bool MerkleDB::nullifier_exists_internal(std::optional<AztecAddress> contract_address, const FF& nullifier) const
{
    FF siloed_nullifier = nullifier;
    if (contract_address.has_value()) {
        // Unconstrained siloing to fetch the hint, since the hints are keyed by siloed data.
        // The siloing will later be constrained in the nullifier tree check gadget.
        siloed_nullifier = unconstrained_silo_nullifier(contract_address.value(), nullifier);
    }

    auto [present, low_leaf_index] = raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::NULLIFIER_TREE, siloed_nullifier);
    auto low_leaf_path = raw_merkle_db.get_sibling_path(MerkleTreeId::NULLIFIER_TREE, low_leaf_index);
    auto low_leaf_preimage = raw_merkle_db.get_leaf_preimage_nullifier_tree(low_leaf_index);

    nullifier_tree_check.assert_read(nullifier,
                                     contract_address,
                                     present,
                                     low_leaf_preimage,
                                     low_leaf_index,
                                     low_leaf_path,
                                     raw_merkle_db.get_tree_roots().nullifierTree);

    return present;
}

void MerkleDB::nullifier_write(const AztecAddress& contract_address, const FF& nullifier)
{
    return nullifier_write_internal(contract_address, nullifier);
}

void MerkleDB::siloed_nullifier_write(const FF& nullifier)
{
    return nullifier_write_internal(/*contract_address*/ std::nullopt, nullifier);
}

void MerkleDB::nullifier_write_internal(std::optional<AztecAddress> contract_address, const FF& nullifier)
{
    uint32_t nullifier_counter = tree_counters_stack.top().nullifier_counter;
    FF siloed_nullifier = nullifier;
    if (contract_address.has_value()) {
        // Unconstrained siloing to fetch the hint, since the hints are keyed by siloed data.
        // The siloing will later be constrained in the nullifier tree check gadget.
        siloed_nullifier = unconstrained_silo_nullifier(contract_address.value(), nullifier);
    }

    auto [present, low_leaf_index] = raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::NULLIFIER_TREE, siloed_nullifier);
    AppendOnlyTreeSnapshot snapshot_before = raw_merkle_db.get_tree_roots().nullifierTree;

    SiblingPath low_leaf_path;
    IndexedLeaf<NullifierLeafValue> low_leaf_preimage;
    std::optional<SiblingPath> insertion_path = std::nullopt;

    if (present) {
        low_leaf_path = raw_merkle_db.get_sibling_path(MerkleTreeId::NULLIFIER_TREE, low_leaf_index);
        low_leaf_preimage = raw_merkle_db.get_leaf_preimage_nullifier_tree(low_leaf_index);
    } else {
        auto insertion_result = raw_merkle_db.insert_indexed_leaves_nullifier_tree(siloed_nullifier);

        low_leaf_path = insertion_result.low_leaf_witness_data.at(0).path;
        low_leaf_preimage = insertion_result.low_leaf_witness_data.at(0).leaf;
        insertion_path = insertion_result.insertion_witness_data.at(0).path;
    }

    AppendOnlyTreeSnapshot snapshot_after = nullifier_tree_check.write(nullifier,
                                                                       contract_address,
                                                                       nullifier_counter,
                                                                       low_leaf_preimage,
                                                                       low_leaf_index,
                                                                       low_leaf_path,
                                                                       snapshot_before,
                                                                       insertion_path);

    (void)snapshot_after; // Silence unused variable warning when assert is stripped out
    // Sanity check.
    assert(snapshot_after == raw_merkle_db.get_tree_roots().nullifierTree);

    if (!present) {
        tree_counters_stack.top().nullifier_counter++;
    } else {
        throw NullifierCollisionException(format("Nullifier ", nullifier, " already exists"));
    }
}

bool MerkleDB::note_hash_exists(uint64_t leaf_index, const FF& unique_note_hash) const
{
    auto leaf_value = raw_merkle_db.get_leaf_value(MerkleTreeId::NOTE_HASH_TREE, leaf_index);
    auto path = raw_merkle_db.get_sibling_path(MerkleTreeId::NOTE_HASH_TREE, leaf_index);
    return note_hash_tree_check.note_hash_exists(
        unique_note_hash, leaf_value, leaf_index, path, raw_merkle_db.get_tree_roots().noteHashTree);
}

void MerkleDB::note_hash_write(const AztecAddress& contract_address, const FF& note_hash)
{
    uint32_t note_hash_counter = tree_counters_stack.top().note_hash_counter;

    AppendOnlyTreeSnapshot snapshot_before = raw_merkle_db.get_tree_roots().noteHashTree;
    // Unconstrained siloing and uniqueness to fetch the hint, since the hints are keyed by the unique note hash.
    // The siloing and uniqueness will later be constrained in the note hash tree check gadget.
    FF siloed_note_hash = unconstrained_silo_note_hash(contract_address, note_hash);
    FF unique_note_hash = unconstrained_make_unique_note_hash(
        siloed_note_hash, note_hash_tree_check.get_first_nullifier(), note_hash_counter);
    auto append_result =
        raw_merkle_db.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ unique_note_hash })[0];

    AppendOnlyTreeSnapshot snapshot_after = note_hash_tree_check.append_note_hash(
        note_hash, contract_address, note_hash_counter, append_result.path, snapshot_before);

    (void)snapshot_after; // Silence unused variable warning when assert is stripped out
    // Sanity check.
    assert(snapshot_after == raw_merkle_db.get_tree_roots().noteHashTree);

    tree_counters_stack.top().note_hash_counter++;
}

void MerkleDB::siloed_note_hash_write(const FF& siloed_note_hash)
{
    uint32_t note_hash_counter = tree_counters_stack.top().note_hash_counter;
    AppendOnlyTreeSnapshot snapshot_before = raw_merkle_db.get_tree_roots().noteHashTree;
    // Unconstrained siloing and uniqueness to fetch the hint, since the hints are keyed by the unique note hash.
    // The siloing and uniqueness will later be constrained in the note hash tree check gadget.
    FF unique_note_hash = unconstrained_make_unique_note_hash(
        siloed_note_hash, note_hash_tree_check.get_first_nullifier(), note_hash_counter);
    auto hint = raw_merkle_db.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ unique_note_hash })[0];

    AppendOnlyTreeSnapshot snapshot_after =
        note_hash_tree_check.append_siloed_note_hash(siloed_note_hash, note_hash_counter, hint.path, snapshot_before);

    (void)snapshot_after; // Silence unused variable warning when assert is stripped out
    // Sanity check.
    assert(snapshot_after == raw_merkle_db.get_tree_roots().noteHashTree);

    tree_counters_stack.top().note_hash_counter++;
}

void MerkleDB::unique_note_hash_write(const FF& unique_note_hash)
{
    uint32_t note_hash_counter = tree_counters_stack.top().note_hash_counter;
    AppendOnlyTreeSnapshot snapshot_before = raw_merkle_db.get_tree_roots().noteHashTree;
    auto hint = raw_merkle_db.append_leaves(MerkleTreeId::NOTE_HASH_TREE, std::vector<FF>{ unique_note_hash })[0];

    AppendOnlyTreeSnapshot snapshot_after =
        note_hash_tree_check.append_unique_note_hash(unique_note_hash, note_hash_counter, hint.path, snapshot_before);

    (void)snapshot_after; // Silence unused variable warning when assert is stripped out
    // Sanity check.
    assert(snapshot_after == raw_merkle_db.get_tree_roots().noteHashTree);

    tree_counters_stack.top().note_hash_counter++;
}

bool MerkleDB::l1_to_l2_msg_exists(uint64_t leaf_index, const FF& msg_hash) const
{
    auto leaf_value = raw_merkle_db.get_leaf_value(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, leaf_index);
    auto path = raw_merkle_db.get_sibling_path(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, leaf_index);
    return l1_to_l2_msg_tree_check.exists(
        msg_hash, leaf_value, leaf_index, path, raw_merkle_db.get_tree_roots().l1ToL2MessageTree);
}

void MerkleDB::pad_trees()
{
    // The public data tree is not padded.
    raw_merkle_db.pad_tree(MerkleTreeId::NOTE_HASH_TREE,
                           MAX_NOTE_HASHES_PER_TX - tree_counters_stack.top().note_hash_counter);
    raw_merkle_db.pad_tree(MerkleTreeId::NULLIFIER_TREE,
                           MAX_NULLIFIERS_PER_TX - tree_counters_stack.top().nullifier_counter);
}

void MerkleDB::create_checkpoint()
{
    raw_merkle_db.create_checkpoint();
    written_public_data_slots.create_checkpoint();
    tree_counters_stack.push(tree_counters_stack.top());
    for (auto& listener : checkpoint_listeners) {
        listener->on_checkpoint_created();
    }
}

void MerkleDB::commit_checkpoint()
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

void MerkleDB::revert_checkpoint()
{
    raw_merkle_db.revert_checkpoint();
    written_public_data_slots.revert_checkpoint();
    tree_counters_stack.pop();
    for (auto& listener : checkpoint_listeners) {
        listener->on_checkpoint_reverted();
    }
}

uint32_t MerkleDB::get_checkpoint_id() const
{
    return raw_merkle_db.get_checkpoint_id();
}

} // namespace bb::avm2::simulation
