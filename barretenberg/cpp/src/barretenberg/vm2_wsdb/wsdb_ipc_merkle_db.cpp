#include "barretenberg/vm2_wsdb/wsdb_ipc_merkle_db.hpp"
#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/wsdb/wsdb_wire_convert.hpp"

#include <cstring>

namespace bb::avm2::simulation {

// Wire <-> domain conversion helpers are shared with the server handlers
// (see wsdb_handlers.cpp) so both sides use the same encoding boundary.
using bb::wsdb::fr_from_wire;
using bb::wsdb::fr_to_wire;
using bb::wsdb::fr_vec_from_wire;
using bb::wsdb::revision_to_wire;
using bb::wsdb::tree_id_to_wire;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

template <typename T> std::vector<uint8_t> WsdbIpcMerkleDB::serialize_to_msgpack(const T& value)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, value);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

template <typename T> T WsdbIpcMerkleDB::deserialize_from_msgpack(const std::vector<uint8_t>& bytes)
{
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(bytes.data()), bytes.size());
    T value;
    unpacked.get().convert(value);
    return value;
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

WsdbIpcMerkleDB::WsdbIpcMerkleDB(wsdb::WsdbIpcClient& client, world_state::WorldStateRevision revision)
    : client_(client)
    , revision_(revision)
{}

// ---------------------------------------------------------------------------
// Tree roots
// ---------------------------------------------------------------------------

avm2::TreeSnapshots WsdbIpcMerkleDB::get_tree_roots() const
{
    if (cached_tree_roots_.has_value()) {
        return cached_tree_roots_.value();
    }

    auto wire_rev = revision_to_wire(revision_);

    auto l1_info = client_.get_tree_info(
        wsdb::WsdbGetTreeInfo{ .treeId = tree_id_to_wire(MerkleTreeId::L1_TO_L2_MESSAGE_TREE), .revision = wire_rev });
    auto nh_info = client_.get_tree_info(
        wsdb::WsdbGetTreeInfo{ .treeId = tree_id_to_wire(MerkleTreeId::NOTE_HASH_TREE), .revision = wire_rev });
    auto null_info = client_.get_tree_info(
        wsdb::WsdbGetTreeInfo{ .treeId = tree_id_to_wire(MerkleTreeId::NULLIFIER_TREE), .revision = wire_rev });
    auto pd_info = client_.get_tree_info(
        wsdb::WsdbGetTreeInfo{ .treeId = tree_id_to_wire(MerkleTreeId::PUBLIC_DATA_TREE), .revision = wire_rev });

    avm2::TreeSnapshots snapshots{
        .l1_to_l2_message_tree = avm2::AppendOnlyTreeSnapshot{ .root = fr_from_wire(l1_info.root),
                                                               .next_available_leaf_index = l1_info.size },
        .note_hash_tree = avm2::AppendOnlyTreeSnapshot{ .root = fr_from_wire(nh_info.root),
                                                        .next_available_leaf_index = nh_info.size },
        .nullifier_tree = avm2::AppendOnlyTreeSnapshot{ .root = fr_from_wire(null_info.root),
                                                        .next_available_leaf_index = null_info.size },
        .public_data_tree = avm2::AppendOnlyTreeSnapshot{ .root = fr_from_wire(pd_info.root),
                                                          .next_available_leaf_index = pd_info.size },
    };
    cached_tree_roots_ = snapshots;
    return snapshots;
}

void WsdbIpcMerkleDB::invalidate_tree_roots_cache()
{
    cached_tree_roots_ = std::nullopt;
}

// ---------------------------------------------------------------------------
// Query methods
// ---------------------------------------------------------------------------

SiblingPath WsdbIpcMerkleDB::get_sibling_path(MerkleTreeId tree_id, index_t leaf_index) const
{
    auto resp = client_.get_sibling_path(wsdb::WsdbGetSiblingPath{
        .treeId = tree_id_to_wire(tree_id), .revision = revision_to_wire(revision_), .leafIndex = leaf_index });
    return fr_vec_from_wire(resp.path);
}

crypto::merkle_tree::GetLowIndexedLeafResponse WsdbIpcMerkleDB::get_low_indexed_leaf(MerkleTreeId tree_id,
                                                                                     const avm2::FF& value) const
{
    auto resp = client_.find_low_leaf(wsdb::WsdbFindLowLeaf{
        .treeId = tree_id_to_wire(tree_id), .revision = revision_to_wire(revision_), .key = fr_to_wire(value) });
    return GetLowIndexedLeafResponse(resp.alreadyPresent, resp.index);
}

avm2::FF WsdbIpcMerkleDB::get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const
{
    auto resp = client_.get_leaf_value(wsdb::WsdbGetLeafValue{
        .treeId = tree_id_to_wire(tree_id), .revision = revision_to_wire(revision_), .leafIndex = leaf_index });
    if (!resp.value.has_value()) {
        throw std::runtime_error("Invalid get_leaf_value request for tree " +
                                 std::to_string(static_cast<uint64_t>(tree_id)) + " index " +
                                 std::to_string(leaf_index));
    }
    return deserialize_from_msgpack<avm2::FF>(resp.value.value());
}

IndexedLeaf<PublicDataLeafValue> WsdbIpcMerkleDB::get_leaf_preimage_public_data_tree(index_t leaf_index) const
{
    auto resp =
        client_.get_leaf_preimage(wsdb::WsdbGetLeafPreimage{ .treeId = tree_id_to_wire(MerkleTreeId::PUBLIC_DATA_TREE),
                                                             .revision = revision_to_wire(revision_),
                                                             .leafIndex = leaf_index });
    if (!resp.preimage.has_value()) {
        throw std::runtime_error("Invalid get_leaf_preimage_public_data_tree request for index " +
                                 std::to_string(leaf_index));
    }
    return deserialize_from_msgpack<IndexedLeaf<PublicDataLeafValue>>(resp.preimage.value());
}

IndexedLeaf<NullifierLeafValue> WsdbIpcMerkleDB::get_leaf_preimage_nullifier_tree(index_t leaf_index) const
{
    auto resp =
        client_.get_leaf_preimage(wsdb::WsdbGetLeafPreimage{ .treeId = tree_id_to_wire(MerkleTreeId::NULLIFIER_TREE),
                                                             .revision = revision_to_wire(revision_),
                                                             .leafIndex = leaf_index });
    if (!resp.preimage.has_value()) {
        throw std::runtime_error("Invalid get_leaf_preimage_nullifier_tree request for index " +
                                 std::to_string(leaf_index));
    }
    return deserialize_from_msgpack<IndexedLeaf<NullifierLeafValue>>(resp.preimage.value());
}

// ---------------------------------------------------------------------------
// State modification methods
// ---------------------------------------------------------------------------

SequentialInsertionResult<PublicDataLeafValue> WsdbIpcMerkleDB::insert_indexed_leaves_public_data_tree(
    const PublicDataLeafValue& leaf_value)
{
    std::vector<std::vector<uint8_t>> serialized_leaves = { serialize_to_msgpack(leaf_value) };
    auto resp =
        client_.sequential_insert(wsdb::WsdbSequentialInsert{ .treeId = tree_id_to_wire(MerkleTreeId::PUBLIC_DATA_TREE),
                                                              .leaves = std::move(serialized_leaves),
                                                              .forkId = revision_.forkId });
    invalidate_tree_roots_cache();
    return deserialize_from_msgpack<SequentialInsertionResult<PublicDataLeafValue>>(resp.result);
}

SequentialInsertionResult<NullifierLeafValue> WsdbIpcMerkleDB::insert_indexed_leaves_nullifier_tree(
    const NullifierLeafValue& leaf_value)
{
    std::vector<std::vector<uint8_t>> serialized_leaves = { serialize_to_msgpack(leaf_value) };
    auto resp =
        client_.sequential_insert(wsdb::WsdbSequentialInsert{ .treeId = tree_id_to_wire(MerkleTreeId::NULLIFIER_TREE),
                                                              .leaves = std::move(serialized_leaves),
                                                              .forkId = revision_.forkId });
    invalidate_tree_roots_cache();
    return deserialize_from_msgpack<SequentialInsertionResult<NullifierLeafValue>>(resp.result);
}

void WsdbIpcMerkleDB::append_leaves(MerkleTreeId tree_id, std::span<const avm2::FF> leaves)
{
    std::vector<std::vector<uint8_t>> serialized_leaves;
    serialized_leaves.reserve(leaves.size());
    for (const auto& leaf : leaves) {
        serialized_leaves.push_back(serialize_to_msgpack(leaf));
    }
    client_.append_leaves(wsdb::WsdbAppendLeaves{
        .treeId = tree_id_to_wire(tree_id), .leaves = std::move(serialized_leaves), .forkId = revision_.forkId });
    invalidate_tree_roots_cache();
}

void WsdbIpcMerkleDB::pad_tree(MerkleTreeId tree_id, size_t num_leaves)
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE: {
        std::vector<std::vector<uint8_t>> padding_leaves;
        padding_leaves.reserve(num_leaves);
        auto empty_leaf = NullifierLeafValue::empty();
        for (size_t i = 0; i < num_leaves; i++) {
            padding_leaves.push_back(serialize_to_msgpack(empty_leaf));
        }
        client_.batch_insert(wsdb::WsdbBatchInsert{ .treeId = tree_id_to_wire(MerkleTreeId::NULLIFIER_TREE),
                                                    .leaves = std::move(padding_leaves),
                                                    .subtreeDepth = NULLIFIER_SUBTREE_HEIGHT,
                                                    .forkId = revision_.forkId });
        break;
    }
    case MerkleTreeId::NOTE_HASH_TREE: {
        std::vector<std::vector<uint8_t>> padding_leaves;
        padding_leaves.reserve(num_leaves);
        auto zero = avm2::FF(0);
        for (size_t i = 0; i < num_leaves; i++) {
            padding_leaves.push_back(serialize_to_msgpack(zero));
        }
        client_.append_leaves(wsdb::WsdbAppendLeaves{ .treeId = tree_id_to_wire(MerkleTreeId::NOTE_HASH_TREE),
                                                      .leaves = std::move(padding_leaves),
                                                      .forkId = revision_.forkId });
        break;
    }
    default:
        throw std::runtime_error("Padding not supported for tree " + std::to_string(static_cast<uint64_t>(tree_id)));
    }
    invalidate_tree_roots_cache();
}

// ---------------------------------------------------------------------------
// Checkpoint methods
// ---------------------------------------------------------------------------

void WsdbIpcMerkleDB::create_checkpoint()
{
    client_.create_checkpoint(wsdb::WsdbCreateCheckpoint{ .forkId = revision_.forkId });
    uint32_t current_id = checkpoint_stack_.top();
    checkpoint_stack_.push(current_id + 1);
}

void WsdbIpcMerkleDB::commit_checkpoint()
{
    client_.commit_checkpoint(wsdb::WsdbCommitCheckpoint{ .forkId = revision_.forkId });
    invalidate_tree_roots_cache();
    checkpoint_stack_.pop();
}

void WsdbIpcMerkleDB::revert_checkpoint()
{
    client_.revert_checkpoint(wsdb::WsdbRevertCheckpoint{ .forkId = revision_.forkId });
    invalidate_tree_roots_cache();
    checkpoint_stack_.pop();
}

uint32_t WsdbIpcMerkleDB::get_checkpoint_id() const
{
    return checkpoint_stack_.top();
}

} // namespace bb::avm2::simulation
