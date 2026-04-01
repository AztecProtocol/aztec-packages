/**
 * @file wsdb_handlers.cpp
 * @brief Handler implementations bridging wire types to domain types for the WSDB IPC server.
 *
 * Each handler:
 *  1. Takes a wire command (bb::wsdb::wire::WsdbFoo&&)
 *  2. Converts wire fields to domain types (MerkleTreeId, bb::fr, WorldStateRevision, etc.)
 *  3. Calls the corresponding WorldState method
 *  4. Converts the domain response back to wire types
 *  5. Returns wire response
 */

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_server.hpp"

#include <cstring>
#include <optional>
#include <stdexcept>

#include "barretenberg/wsdb/wsdb_context.hpp"

namespace bb::wsdb {

using WsdbContext = bb::wsdb::WsdbContext;

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

// ---------------------------------------------------------------------------
// Context type for WSDB handlers
// ---------------------------------------------------------------------------

// WsdbContext defined in wsdb_context.hpp

// ---------------------------------------------------------------------------
// Wire <-> Domain conversion helpers
// ---------------------------------------------------------------------------

namespace {

inline bb::fr fr_from_wire(const Fr& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline Fr fr_to_wire(const bb::fr& d)
{
    Fr r;
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline std::vector<bb::fr> fr_vec_from_wire(const std::vector<Fr>& wire)
{
    std::vector<bb::fr> result;
    result.reserve(wire.size());
    for (const auto& w : wire) {
        result.push_back(fr_from_wire(w));
    }
    return result;
}

inline std::vector<Fr> fr_vec_to_wire(const std::vector<bb::fr>& domain)
{
    std::vector<Fr> result;
    result.reserve(domain.size());
    for (const auto& d : domain) {
        result.push_back(fr_to_wire(d));
    }
    return result;
}

inline MerkleTreeId tree_id_from_wire(uint32_t id)
{
    return static_cast<MerkleTreeId>(id);
}

// StateReference: domain = map<MerkleTreeId, pair<bb::fr, index_t>>
//                 wire   = map<uint32_t, pair<vector<uint8_t>, uint64_t>>
// The pair<bb::fr, index_t> serializes as pair<vector<uint8_t>(32 bytes), uint64_t> in msgpack.
// However, the wire type uses vector<uint8_t> for the serialized fr bytes.

inline StateReference state_ref_from_wire(
    const std::unordered_map<uint32_t, std::pair<std::vector<uint8_t>, uint64_t>>& wire)
{
    StateReference result;
    for (const auto& [k, v] : wire) {
        bb::fr root;
        if (v.first.size() >= 32) {
            root = bb::fr::serialize_from_buffer(v.first.data());
        }
        result[static_cast<MerkleTreeId>(k)] = { root, v.second };
    }
    return result;
}

inline std::unordered_map<uint32_t, std::pair<std::vector<uint8_t>, uint64_t>> state_ref_to_wire(
    const StateReference& domain)
{
    std::unordered_map<uint32_t, std::pair<std::vector<uint8_t>, uint64_t>> result;
    for (const auto& [k, v] : domain) {
        std::vector<uint8_t> root_bytes(32);
        bb::fr::serialize_to_buffer(v.first, root_bytes.data());
        result[static_cast<uint32_t>(k)] = { std::move(root_bytes), v.second };
    }
    return result;
}

// Helper: serialize a value to msgpack bytes
template <typename T> std::vector<uint8_t> serialize_to_msgpack(const T& value)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, value);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

// Helper: deserialize leaves from raw bytes based on tree type
template <typename LeafType>
std::vector<LeafType> deserialize_leaves(const std::vector<std::vector<uint8_t>>& raw_leaves)
{
    std::vector<LeafType> leaves;
    leaves.reserve(raw_leaves.size());
    for (const auto& raw : raw_leaves) {
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(raw.data()), raw.size());
        LeafType leaf;
        unpacked.get().convert(leaf);
        leaves.push_back(std::move(leaf));
    }
    return leaves;
}

} // anonymous namespace

// ---------------------------------------------------------------------------
// Handler implementations (template specializations for WsdbContext)
// ---------------------------------------------------------------------------

template <> wire::WsdbGetTreeInfoResponse handle_get_tree_info(WsdbContext& ctx, wire::WsdbGetTreeInfo&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = WorldStateRevision::from_wire(cmd.revision);
    auto info = ctx.world_state.get_tree_info(revision, tree_id);
    return wire::WsdbGetTreeInfoResponse{
        .treeId = cmd.treeId,
        .root = fr_to_wire(info.meta.root),
        .size = info.meta.size,
        .depth = info.meta.depth,
    };
}

template <>
wire::WsdbGetStateReferenceResponse handle_get_state_reference(WsdbContext& ctx, wire::WsdbGetStateReference&& cmd)
{
    auto revision = WorldStateRevision::from_wire(cmd.revision);
    auto state = ctx.world_state.get_state_reference(revision);
    return wire::WsdbGetStateReferenceResponse{ .state = state_ref_to_wire(state) };
}

template <>
wire::WsdbGetInitialStateReferenceResponse handle_get_initial_state_reference(
    WsdbContext& ctx, [[maybe_unused]] wire::WsdbGetInitialStateReference&& cmd)
{
    auto state = ctx.world_state.get_initial_state_reference();
    return wire::WsdbGetInitialStateReferenceResponse{ .state = state_ref_to_wire(state) };
}

template <> wire::WsdbGetLeafValueResponse handle_get_leaf_value(WsdbContext& ctx, wire::WsdbGetLeafValue&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = WorldStateRevision::from_wire(cmd.revision);

    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto leaf = ctx.world_state.get_leaf<bb::fr>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafValueResponse{ .value = std::nullopt };
        }
        return wire::WsdbGetLeafValueResponse{ .value = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = ctx.world_state.get_leaf<PublicDataLeafValue>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafValueResponse{ .value = std::nullopt };
        }
        return wire::WsdbGetLeafValueResponse{ .value = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = ctx.world_state.get_leaf<NullifierLeafValue>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafValueResponse{ .value = std::nullopt };
        }
        return wire::WsdbGetLeafValueResponse{ .value = serialize_to_msgpack(leaf.value()) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for get_leaf_value");
    }
}

template <>
wire::WsdbGetLeafPreimageResponse handle_get_leaf_preimage(WsdbContext& ctx, wire::WsdbGetLeafPreimage&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = WorldStateRevision::from_wire(cmd.revision);

    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = ctx.world_state.get_indexed_leaf<NullifierLeafValue>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafPreimageResponse{ .preimage = std::nullopt };
        }
        return wire::WsdbGetLeafPreimageResponse{ .preimage = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = ctx.world_state.get_indexed_leaf<PublicDataLeafValue>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafPreimageResponse{ .preimage = std::nullopt };
        }
        return wire::WsdbGetLeafPreimageResponse{ .preimage = serialize_to_msgpack(leaf.value()) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for get_leaf_preimage");
    }
}

template <> wire::WsdbGetSiblingPathResponse handle_get_sibling_path(WsdbContext& ctx, wire::WsdbGetSiblingPath&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = WorldStateRevision::from_wire(cmd.revision);
    fr_sibling_path path = ctx.world_state.get_sibling_path(revision, tree_id, cmd.leafIndex);
    return wire::WsdbGetSiblingPathResponse{ .path = fr_vec_to_wire(path) };
}

template <>
wire::WsdbGetBlockNumbersForLeafIndicesResponse handle_get_block_numbers_for_leaf_indices(
    WsdbContext& ctx, wire::WsdbGetBlockNumbersForLeafIndices&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = WorldStateRevision::from_wire(cmd.revision);
    std::vector<std::optional<block_number_t>> block_numbers;
    ctx.world_state.get_block_numbers_for_leaf_indices(revision, tree_id, cmd.leafIndices, block_numbers);
    // Wire type uses optional<uint32_t> which is the same as optional<block_number_t>
    return wire::WsdbGetBlockNumbersForLeafIndicesResponse{ .blockNumbers = block_numbers };
}

template <>
wire::WsdbFindLeafIndicesResponse handle_find_leaf_indices(WsdbContext& ctx, wire::WsdbFindLeafIndices&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = WorldStateRevision::from_wire(cmd.revision);
    std::vector<std::optional<index_t>> indices;

    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(cmd.leaves);
        ctx.world_state.find_leaf_indices<bb::fr>(revision, tree_id, typed_leaves, indices, cmd.startIndex);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        ctx.world_state.find_leaf_indices<PublicDataLeafValue>(
            revision, tree_id, typed_leaves, indices, cmd.startIndex);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        ctx.world_state.find_leaf_indices<NullifierLeafValue>(revision, tree_id, typed_leaves, indices, cmd.startIndex);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for find_leaf_indices");
    }
    return wire::WsdbFindLeafIndicesResponse{ .indices = indices };
}

template <> wire::WsdbFindLowLeafResponse handle_find_low_leaf(WsdbContext& ctx, wire::WsdbFindLowLeaf&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = WorldStateRevision::from_wire(cmd.revision);
    auto key = fr_from_wire(cmd.key);
    auto low_leaf_info = ctx.world_state.find_low_leaf_index(revision, tree_id, key);
    return wire::WsdbFindLowLeafResponse{
        .alreadyPresent = low_leaf_info.is_already_present,
        .index = low_leaf_info.index,
    };
}

template <>
wire::WsdbFindSiblingPathsResponse handle_find_sibling_paths(WsdbContext& ctx, wire::WsdbFindSiblingPaths&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = WorldStateRevision::from_wire(cmd.revision);
    std::vector<std::optional<SiblingPathAndIndex>> paths;

    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(cmd.leaves);
        ctx.world_state.find_sibling_paths<bb::fr>(revision, tree_id, typed_leaves, paths);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        ctx.world_state.find_sibling_paths<PublicDataLeafValue>(revision, tree_id, typed_leaves, paths);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        ctx.world_state.find_sibling_paths<NullifierLeafValue>(revision, tree_id, typed_leaves, paths);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for find_sibling_paths");
    }

    // Convert domain SiblingPathAndIndex -> wire SiblingPathAndIndex
    std::vector<std::optional<wire::SiblingPathAndIndex>> wire_paths;
    wire_paths.reserve(paths.size());
    for (const auto& p : paths) {
        if (p.has_value()) {
            wire_paths.push_back(p.value().to_wire());
        } else {
            wire_paths.push_back(std::nullopt);
        }
    }
    return wire::WsdbFindSiblingPathsResponse{ .paths = std::move(wire_paths) };
}

template <> wire::WsdbAppendLeavesResponse handle_append_leaves(WsdbContext& ctx, wire::WsdbAppendLeaves&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);

    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(cmd.leaves);
        ctx.world_state.append_leaves<bb::fr>(tree_id, typed_leaves, cmd.forkId);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        ctx.world_state.append_leaves<PublicDataLeafValue>(tree_id, typed_leaves, cmd.forkId);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        ctx.world_state.append_leaves<NullifierLeafValue>(tree_id, typed_leaves, cmd.forkId);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for append_leaves");
    }
    return wire::WsdbAppendLeavesResponse{};
}

template <> wire::WsdbBatchInsertResponse handle_batch_insert(WsdbContext& ctx, wire::WsdbBatchInsert&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);

    switch (tree_id) {
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        auto result = ctx.world_state.batch_insert_indexed_leaves<PublicDataLeafValue>(
            tree_id, typed_leaves, cmd.subtreeDepth, cmd.forkId);
        return wire::WsdbBatchInsertResponse{ .result = serialize_to_msgpack(result) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        auto result = ctx.world_state.batch_insert_indexed_leaves<NullifierLeafValue>(
            tree_id, typed_leaves, cmd.subtreeDepth, cmd.forkId);
        return wire::WsdbBatchInsertResponse{ .result = serialize_to_msgpack(result) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for batch_insert");
    }
}

template <>
wire::WsdbSequentialInsertResponse handle_sequential_insert(WsdbContext& ctx, wire::WsdbSequentialInsert&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);

    switch (tree_id) {
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        auto result = ctx.world_state.insert_indexed_leaves<PublicDataLeafValue>(tree_id, typed_leaves, cmd.forkId);
        return wire::WsdbSequentialInsertResponse{ .result = serialize_to_msgpack(result) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        auto result = ctx.world_state.insert_indexed_leaves<NullifierLeafValue>(tree_id, typed_leaves, cmd.forkId);
        return wire::WsdbSequentialInsertResponse{ .result = serialize_to_msgpack(result) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for sequential_insert");
    }
}

template <> wire::WsdbUpdateArchiveResponse handle_update_archive(WsdbContext& ctx, wire::WsdbUpdateArchive&& cmd)
{
    auto block_state_ref = state_ref_from_wire(cmd.blockStateRef);
    auto block_header_hash = fr_from_wire(cmd.blockHeaderHash);
    ctx.world_state.update_archive(block_state_ref, block_header_hash, cmd.forkId);
    return wire::WsdbUpdateArchiveResponse{};
}

template <> wire::WsdbCommitResponse handle_commit(WsdbContext& ctx, [[maybe_unused]] wire::WsdbCommit&& cmd)
{
    WorldStateStatusFull status;
    ctx.world_state.commit(status);
    return wire::WsdbCommitResponse{ .status = status.to_wire() };
}

template <> wire::WsdbRollbackResponse handle_rollback(WsdbContext& ctx, [[maybe_unused]] wire::WsdbRollback&& cmd)
{
    ctx.world_state.rollback();
    return wire::WsdbRollbackResponse{};
}

template <> wire::WsdbSyncBlockResponse handle_sync_block(WsdbContext& ctx, wire::WsdbSyncBlock&& cmd)
{
    auto block_state_ref = state_ref_from_wire(cmd.blockStateRef);
    auto block_header_hash = fr_from_wire(cmd.blockHeaderHash);
    auto padded_note_hashes = fr_vec_from_wire(cmd.paddedNoteHashes);
    auto padded_l1_to_l2_messages = fr_vec_from_wire(cmd.paddedL1ToL2Messages);
    std::vector<NullifierLeafValue> padded_nullifiers;
    padded_nullifiers.reserve(cmd.paddedNullifiers.size());
    for (const auto& w : cmd.paddedNullifiers) {
        padded_nullifiers.push_back(NullifierLeafValue::from_wire(w));
    }
    std::vector<PublicDataLeafValue> public_data_writes;
    public_data_writes.reserve(cmd.publicDataWrites.size());
    for (const auto& w : cmd.publicDataWrites) {
        public_data_writes.push_back(PublicDataLeafValue::from_wire(w));
    }

    WorldStateStatusFull status = ctx.world_state.sync_block(block_state_ref,
                                                             block_header_hash,
                                                             padded_note_hashes,
                                                             padded_l1_to_l2_messages,
                                                             padded_nullifiers,
                                                             public_data_writes);
    return wire::WsdbSyncBlockResponse{ .status = status.to_wire() };
}

template <> wire::WsdbCreateForkResponse handle_create_fork(WsdbContext& ctx, wire::WsdbCreateFork&& cmd)
{
    std::optional<block_number_t> block = cmd.latest ? std::nullopt : std::optional<block_number_t>(cmd.blockNumber);
    uint64_t id = ctx.world_state.create_fork(block);
    return wire::WsdbCreateForkResponse{ .forkId = id };
}

template <> wire::WsdbDeleteForkResponse handle_delete_fork(WsdbContext& ctx, wire::WsdbDeleteFork&& cmd)
{
    ctx.world_state.delete_fork(cmd.forkId);
    return wire::WsdbDeleteForkResponse{};
}

template <> wire::WsdbFinalizeBlocksResponse handle_finalize_blocks(WsdbContext& ctx, wire::WsdbFinalizeBlocks&& cmd)
{
    WorldStateStatusSummary status = ctx.world_state.set_finalized_blocks(cmd.toBlockNumber);
    return wire::WsdbFinalizeBlocksResponse{ .status = status.to_wire() };
}

template <> wire::WsdbUnwindBlocksResponse handle_unwind_blocks(WsdbContext& ctx, wire::WsdbUnwindBlocks&& cmd)
{
    WorldStateStatusFull status = ctx.world_state.unwind_blocks(cmd.toBlockNumber);
    return wire::WsdbUnwindBlocksResponse{ .status = status.to_wire() };
}

template <>
wire::WsdbRemoveHistoricalBlocksResponse handle_remove_historical_blocks(WsdbContext& ctx,
                                                                         wire::WsdbRemoveHistoricalBlocks&& cmd)
{
    WorldStateStatusFull status = ctx.world_state.remove_historical_blocks(cmd.toBlockNumber);
    return wire::WsdbRemoveHistoricalBlocksResponse{ .status = status.to_wire() };
}

template <> wire::WsdbGetStatusResponse handle_get_status(WsdbContext& ctx, [[maybe_unused]] wire::WsdbGetStatus&& cmd)
{
    WorldStateStatusSummary status;
    ctx.world_state.get_status_summary(status);
    return wire::WsdbGetStatusResponse{ .status = status.to_wire() };
}

template <>
wire::WsdbCreateCheckpointResponse handle_create_checkpoint(WsdbContext& ctx, wire::WsdbCreateCheckpoint&& cmd)
{
    ctx.world_state.checkpoint(cmd.forkId);
    return wire::WsdbCreateCheckpointResponse{};
}

template <>
wire::WsdbCommitCheckpointResponse handle_commit_checkpoint(WsdbContext& ctx, wire::WsdbCommitCheckpoint&& cmd)
{
    ctx.world_state.commit_checkpoint(cmd.forkId);
    return wire::WsdbCommitCheckpointResponse{};
}

template <>
wire::WsdbRevertCheckpointResponse handle_revert_checkpoint(WsdbContext& ctx, wire::WsdbRevertCheckpoint&& cmd)
{
    ctx.world_state.revert_checkpoint(cmd.forkId);
    return wire::WsdbRevertCheckpointResponse{};
}

template <>
wire::WsdbCommitAllCheckpointsResponse handle_commit_all_checkpoints(WsdbContext& ctx,
                                                                     wire::WsdbCommitAllCheckpoints&& cmd)
{
    ctx.world_state.commit_all_checkpoints_to(cmd.forkId, 0);
    return wire::WsdbCommitAllCheckpointsResponse{};
}

template <>
wire::WsdbRevertAllCheckpointsResponse handle_revert_all_checkpoints(WsdbContext& ctx,
                                                                     wire::WsdbRevertAllCheckpoints&& cmd)
{
    ctx.world_state.revert_all_checkpoints_to(cmd.forkId, 0);
    return wire::WsdbRevertAllCheckpointsResponse{};
}

template <> wire::WsdbCopyStoresResponse handle_copy_stores(WsdbContext& ctx, wire::WsdbCopyStores&& cmd)
{
    ctx.world_state.copy_stores(cmd.dstPath, cmd.compact.value_or(false));
    return wire::WsdbCopyStoresResponse{};
}

// Explicit instantiation of the dispatch handler for WsdbContext
template ::ipc::Handler make_wsdb_handler(WsdbContext& ctx);

} // namespace bb::wsdb
