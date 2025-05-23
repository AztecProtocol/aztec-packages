#include "barretenberg/vm2/simulation/concrete_dbs.hpp"

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
    address_derivation.assert_derivation(address, instance.value());
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
const TreeSnapshots& MerkleDB::get_tree_roots() const
{
    // No event generated.
    return raw_merkle_db.get_tree_roots();
}

TreeStates MerkleDB::get_tree_state() const
{
    // No event generated.
    TreeSnapshots tree_snapshots = raw_merkle_db.get_tree_roots();
    return { .noteHashTree = { .tree = tree_snapshots.noteHashTree, .counter = note_hash_counter },
             .nullifierTree = { .tree = tree_snapshots.nullifierTree, .counter = nullifier_counter },
             .l1ToL2MessageTree = { .tree = tree_snapshots.l1ToL2MessageTree, .counter = l2_to_l1_msg_counter },
             .publicDataTree = { .tree = tree_snapshots.publicDataTree,
                                 .counter = static_cast<uint32_t>(storage_set.size()) } };
}

FF MerkleDB::storage_read(const FF& leaf_slot) const
{
    auto [present, index] = raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::PUBLIC_DATA_TREE, leaf_slot);
    auto path = raw_merkle_db.get_sibling_path(MerkleTreeId::PUBLIC_DATA_TREE, index);
    auto preimage = raw_merkle_db.get_leaf_preimage_public_data_tree(index);

    FF value = present ? preimage.leaf.value : 0;

    public_data_tree_check.assert_read(leaf_slot, value, preimage, index, path, get_tree_roots().publicDataTree);

    return value;
}

void MerkleDB::storage_write(const FF& leaf_slot, const FF& value)
{
    AppendOnlyTreeSnapshot snapshot_before = get_tree_roots().publicDataTree;

    auto hint = raw_merkle_db.insert_indexed_leaves_public_data_tree(PublicDataLeafValue(leaf_slot, value));

    auto& low_leaf_hint = hint.low_leaf_witness_data.at(0);
    auto& insertion_hint = hint.insertion_witness_data.at(0);

    AppendOnlyTreeSnapshot snapshot_after = public_data_tree_check.write(leaf_slot,
                                                                         value,
                                                                         low_leaf_hint.leaf,
                                                                         low_leaf_hint.index,
                                                                         low_leaf_hint.path,
                                                                         snapshot_before,
                                                                         insertion_hint.path);

    (void)snapshot_after; // Silence unused variable warning when assert is stripped out
    // Sanity check.
    assert(snapshot_after == get_tree_roots().publicDataTree);

    if (!storage_set.contains(leaf_slot)) {
        storage_set.insert(leaf_slot);
    }
}

bool MerkleDB::nullifier_exists(const FF& nullifier) const
{
    auto [present, low_leaf_index] = raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::NULLIFIER_TREE, nullifier);
    auto low_leaf_path = raw_merkle_db.get_sibling_path(MerkleTreeId::NULLIFIER_TREE, low_leaf_index);
    auto low_leaf_preimage = raw_merkle_db.get_leaf_preimage_nullifier_tree(low_leaf_index);

    nullifier_tree_check.assert_read(
        nullifier, present, low_leaf_preimage, low_leaf_index, low_leaf_path, get_tree_roots().nullifierTree);

    return present;
}

void MerkleDB::nullifier_write(const FF& nullifier)
{
    AppendOnlyTreeSnapshot snapshot_before = get_tree_roots().nullifierTree;

    auto hint = raw_merkle_db.insert_indexed_leaves_nullifier_tree(nullifier);

    auto& low_leaf_hint = hint.low_leaf_witness_data.at(0);
    auto& insertion_hint = hint.insertion_witness_data.at(0);

    AppendOnlyTreeSnapshot snapshot_after = nullifier_tree_check.write(
        nullifier, low_leaf_hint.leaf, low_leaf_hint.index, low_leaf_hint.path, snapshot_before, insertion_hint.path);

    (void)snapshot_after; // Silence unused variable warning when assert is stripped out
    // Sanity check.
    assert(snapshot_after == get_tree_roots().nullifierTree);

    nullifier_counter++;
}

// TODO: These are not current implemented - this needs to be once we have a note hash gadget
bool MerkleDB::note_hash_exists(const FF& note_hash) const
{
    auto [present, low_leaf_index] = raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::NOTE_HASH_TREE, note_hash);
    auto low_leaf_path = raw_merkle_db.get_sibling_path(MerkleTreeId::NOTE_HASH_TREE, low_leaf_index);
    [[maybe_unused]] auto low_leaf_preimage = raw_merkle_db.get_leaf_preimage_nullifier_tree(low_leaf_index);

    // TODO: Assert read
    return true;
}

// TODO: These are not current implemented - this needs to be once we have a note hash gadget
void MerkleDB::note_hash_write([[maybe_unused]] const FF& note_hash)
{
    // AppendOnlyTreeSnapshot snapshot_after = note_hash_tree_check.write(
    //     note_hash, low_leaf_hint.leaf, low_leaf_hint.index, low_leaf_hint.path, snapshot_before,
    //     insertion_hint.path);
    //
    // (void)snapshot_after; // Silence unused variable warning when assert is stripped out
    // // Sanity check.
    // assert(snapshot_after == get_tree_roots().noteHashTree);
    note_hash_counter++;
}

void MerkleDB::create_checkpoint()
{
    raw_merkle_db.create_checkpoint();
}

void MerkleDB::commit_checkpoint()
{
    raw_merkle_db.commit_checkpoint();
}

void MerkleDB::revert_checkpoint()
{
    raw_merkle_db.revert_checkpoint();
}

} // namespace bb::avm2::simulation
