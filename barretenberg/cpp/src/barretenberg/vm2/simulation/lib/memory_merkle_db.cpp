#include "barretenberg/vm2/simulation/lib/memory_merkle_db.hpp"

namespace bb::avm2::simulation {

namespace {

AppendOnlyTreeSnapshot to_avm_snapshot(const world_state::TreeSnapshot& snapshot)
{
    return AppendOnlyTreeSnapshot{ .root = snapshot.root,
                                   .next_available_leaf_index = snapshot.next_available_leaf_index };
}

} // namespace

TreeSnapshots MemoryMerkleDB::get_tree_roots() const
{
    world_state::TreeRoots roots = inner_.get_tree_roots();
    return TreeSnapshots{
        .l1_to_l2_message_tree = to_avm_snapshot(roots.l1_to_l2_message_tree),
        .note_hash_tree = to_avm_snapshot(roots.note_hash_tree),
        .nullifier_tree = to_avm_snapshot(roots.nullifier_tree),
        .public_data_tree = to_avm_snapshot(roots.public_data_tree),
    };
}

} // namespace bb::avm2::simulation
