/**
 * @file wsdb_handlers.cpp
 * @brief Per-command handlers consumed by the codegen-emitted server dispatch.
 *
 * Each handler matches the signature declared by generated/wsdb_ipc_server.hpp
 * but as a non-template overload for `WsdbRequest` so the codegen's
 * `make_wsdb_handler<WsdbRequest>` instantiation resolves to these
 * definitions via overload resolution (preferred over the unspecialized
 * template).
 *
 * Wire <-> domain conversion happens at the entry/exit of each handler via
 * the helpers in wsdb_wire_convert.hpp. Field-element-bearing or status-
 * struct-bearing responses use msgpack roundtrip when wire/domain shapes
 * are isomorphic (cheaper than writing field-by-field copies).
 */
#include "barretenberg/wsdb/wsdb_handlers.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/wsdb/wsdb_wire_convert.hpp"
#include "generated/wsdb_ipc_server.hpp"

#include <optional>
#include <stdexcept>

namespace bb::wsdb {

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

// ---------------------------------------------------------------------------
// Helper: serialize a value to msgpack bytes (for opaque-blob wire fields).
// ---------------------------------------------------------------------------

template <typename T> static std::vector<uint8_t> serialize_to_msgpack(const T& value)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, value);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

// ---------------------------------------------------------------------------
// Helper: deserialize typed leaves from raw msgpack bytes per leaf.
// ---------------------------------------------------------------------------

template <typename LeafType>
static std::vector<LeafType> deserialize_leaves(const std::vector<std::vector<uint8_t>>& raw_leaves)
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

// ---------------------------------------------------------------------------
// Tree info / state queries
// ---------------------------------------------------------------------------

wire::WsdbGetTreeInfoResponse handle_get_tree_info(WsdbRequest& ctx, wire::WsdbGetTreeInfo&& cmd)
{
    auto info = ctx.world_state.get_tree_info(revision_from_wire(cmd.revision), tree_id_from_wire(cmd.treeId));
    return wire::WsdbGetTreeInfoResponse{
        .treeId = cmd.treeId,
        .root = fr_to_wire(info.meta.root),
        .size = info.meta.size,
        .depth = info.meta.depth,
    };
}

wire::WsdbGetStateReferenceResponse handle_get_state_reference(WsdbRequest& ctx, wire::WsdbGetStateReference&& cmd)
{
    auto state = ctx.world_state.get_state_reference(revision_from_wire(cmd.revision));
    return wire::WsdbGetStateReferenceResponse{ .state = state_reference_to_wire(state) };
}

wire::WsdbGetInitialStateReferenceResponse handle_get_initial_state_reference(WsdbRequest& ctx,
                                                                              wire::WsdbGetInitialStateReference&&)
{
    auto state = ctx.world_state.get_initial_state_reference();
    return wire::WsdbGetInitialStateReferenceResponse{ .state = state_reference_to_wire(state) };
}

// ---------------------------------------------------------------------------
// Leaf queries
// ---------------------------------------------------------------------------

wire::WsdbGetLeafValueResponse handle_get_leaf_value(WsdbRequest& ctx, wire::WsdbGetLeafValue&& cmd)
{
    auto revision = revision_from_wire(cmd.revision);
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto leaf_index = static_cast<index_t>(cmd.leafIndex);

    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto leaf = ctx.world_state.get_leaf<bb::fr>(revision, tree_id, leaf_index);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafValueResponse{ .value = std::nullopt };
        }
        return wire::WsdbGetLeafValueResponse{ .value = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = ctx.world_state.get_leaf<PublicDataLeafValue>(revision, tree_id, leaf_index);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafValueResponse{ .value = std::nullopt };
        }
        return wire::WsdbGetLeafValueResponse{ .value = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = ctx.world_state.get_leaf<NullifierLeafValue>(revision, tree_id, leaf_index);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafValueResponse{ .value = std::nullopt };
        }
        return wire::WsdbGetLeafValueResponse{ .value = serialize_to_msgpack(leaf.value()) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for get_leaf_value");
    }
}

wire::WsdbGetLeafPreimageResponse handle_get_leaf_preimage(WsdbRequest& ctx, wire::WsdbGetLeafPreimage&& cmd)
{
    auto revision = revision_from_wire(cmd.revision);
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto leaf_index = static_cast<index_t>(cmd.leafIndex);

    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = ctx.world_state.get_indexed_leaf<NullifierLeafValue>(revision, tree_id, leaf_index);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafPreimageResponse{ .preimage = std::nullopt };
        }
        return wire::WsdbGetLeafPreimageResponse{ .preimage = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = ctx.world_state.get_indexed_leaf<PublicDataLeafValue>(revision, tree_id, leaf_index);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafPreimageResponse{ .preimage = std::nullopt };
        }
        return wire::WsdbGetLeafPreimageResponse{ .preimage = serialize_to_msgpack(leaf.value()) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for get_leaf_preimage");
    }
}

wire::WsdbGetSiblingPathResponse handle_get_sibling_path(WsdbRequest& ctx, wire::WsdbGetSiblingPath&& cmd)
{
    fr_sibling_path path = ctx.world_state.get_sibling_path(
        revision_from_wire(cmd.revision), tree_id_from_wire(cmd.treeId), static_cast<index_t>(cmd.leafIndex));
    return wire::WsdbGetSiblingPathResponse{ .path = fr_vec_to_wire(path) };
}

wire::WsdbGetBlockNumbersForLeafIndicesResponse handle_get_block_numbers_for_leaf_indices(
    WsdbRequest& ctx, wire::WsdbGetBlockNumbersForLeafIndices&& cmd)
{
    std::vector<index_t> leaf_indices;
    leaf_indices.reserve(cmd.leafIndices.size());
    for (auto i : cmd.leafIndices) {
        leaf_indices.push_back(static_cast<index_t>(i));
    }
    std::vector<std::optional<block_number_t>> block_numbers;
    ctx.world_state.get_block_numbers_for_leaf_indices(
        revision_from_wire(cmd.revision), tree_id_from_wire(cmd.treeId), leaf_indices, block_numbers);
    std::vector<std::optional<uint32_t>> wire_block_numbers;
    wire_block_numbers.reserve(block_numbers.size());
    for (const auto& bn : block_numbers) {
        wire_block_numbers.push_back(bn);
    }
    return wire::WsdbGetBlockNumbersForLeafIndicesResponse{ .blockNumbers = std::move(wire_block_numbers) };
}

// ---------------------------------------------------------------------------
// Leaf search operations
// ---------------------------------------------------------------------------

wire::WsdbFindLeafIndicesResponse handle_find_leaf_indices(WsdbRequest& ctx, wire::WsdbFindLeafIndices&& cmd)
{
    auto revision = revision_from_wire(cmd.revision);
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto start_index = static_cast<index_t>(cmd.startIndex);

    std::vector<std::optional<index_t>> indices;
    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(cmd.leaves);
        ctx.world_state.find_leaf_indices<bb::fr>(revision, tree_id, typed_leaves, indices, start_index);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        ctx.world_state.find_leaf_indices<PublicDataLeafValue>(revision, tree_id, typed_leaves, indices, start_index);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        ctx.world_state.find_leaf_indices<NullifierLeafValue>(revision, tree_id, typed_leaves, indices, start_index);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for find_leaf_indices");
    }
    std::vector<std::optional<uint64_t>> wire_indices;
    wire_indices.reserve(indices.size());
    for (const auto& i : indices) {
        wire_indices.push_back(i.has_value() ? std::optional<uint64_t>(static_cast<uint64_t>(*i)) : std::nullopt);
    }
    return wire::WsdbFindLeafIndicesResponse{ .indices = std::move(wire_indices) };
}

wire::WsdbFindLowLeafResponse handle_find_low_leaf(WsdbRequest& ctx, wire::WsdbFindLowLeaf&& cmd)
{
    auto low_leaf_info = ctx.world_state.find_low_leaf_index(
        revision_from_wire(cmd.revision), tree_id_from_wire(cmd.treeId), fr_from_wire(cmd.key));
    return wire::WsdbFindLowLeafResponse{
        .alreadyPresent = low_leaf_info.is_already_present,
        .index = static_cast<uint64_t>(low_leaf_info.index),
    };
}

wire::WsdbFindSiblingPathsResponse handle_find_sibling_paths(WsdbRequest& ctx, wire::WsdbFindSiblingPaths&& cmd)
{
    auto revision = revision_from_wire(cmd.revision);
    auto tree_id = tree_id_from_wire(cmd.treeId);
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
    std::vector<std::optional<wire::SiblingPathAndIndex>> wire_paths;
    wire_paths.reserve(paths.size());
    for (const auto& p : paths) {
        if (!p.has_value()) {
            wire_paths.push_back(std::nullopt);
            continue;
        }
        wire_paths.push_back(wire::SiblingPathAndIndex{
            .index = static_cast<uint64_t>(p->index),
            .path = fr_vec_to_wire(p->path),
        });
    }
    return wire::WsdbFindSiblingPathsResponse{ .paths = std::move(wire_paths) };
}

// ---------------------------------------------------------------------------
// Tree mutation operations
// ---------------------------------------------------------------------------

wire::WsdbAppendLeavesResponse handle_append_leaves(WsdbRequest& ctx, wire::WsdbAppendLeaves&& cmd)
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

wire::WsdbBatchInsertResponse handle_batch_insert(WsdbRequest& ctx, wire::WsdbBatchInsert&& cmd)
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

wire::WsdbSequentialInsertResponse handle_sequential_insert(WsdbRequest& ctx, wire::WsdbSequentialInsert&& cmd)
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

wire::WsdbUpdateArchiveResponse handle_update_archive(WsdbRequest& ctx, wire::WsdbUpdateArchive&& cmd)
{
    ctx.world_state.update_archive(
        state_reference_from_wire(cmd.blockStateRef), fr_from_wire(cmd.blockHeaderHash), cmd.forkId);
    return wire::WsdbUpdateArchiveResponse{};
}

// ---------------------------------------------------------------------------
// Transaction operations
// ---------------------------------------------------------------------------

wire::WsdbCommitResponse handle_commit(WsdbRequest& ctx, wire::WsdbCommit&&)
{
    WorldStateStatusFull status;
    ctx.world_state.commit(status);
    return wire::WsdbCommitResponse{
        .status = world_state_status_full_to_wire(status),
    };
}

wire::WsdbRollbackResponse handle_rollback(WsdbRequest& ctx, wire::WsdbRollback&&)
{
    ctx.world_state.rollback();
    return wire::WsdbRollbackResponse{};
}

// ---------------------------------------------------------------------------
// Block synchronization
// ---------------------------------------------------------------------------

wire::WsdbSyncBlockResponse handle_sync_block(WsdbRequest& ctx, wire::WsdbSyncBlock&& cmd)
{
    auto block_state_ref = state_reference_from_wire(cmd.blockStateRef);
    auto block_header_hash = fr_from_wire(cmd.blockHeaderHash);
    auto padded_note_hashes = fr_vec_from_wire(cmd.paddedNoteHashes);
    auto padded_l1_to_l2_messages = fr_vec_from_wire(cmd.paddedL1ToL2Messages);

    std::vector<NullifierLeafValue> padded_nullifiers;
    padded_nullifiers.reserve(cmd.paddedNullifiers.size());
    for (const auto& w : cmd.paddedNullifiers) {
        padded_nullifiers.emplace_back(fr_from_wire(w.nullifier));
    }

    std::vector<PublicDataLeafValue> public_data_writes;
    public_data_writes.reserve(cmd.publicDataWrites.size());
    for (const auto& w : cmd.publicDataWrites) {
        public_data_writes.emplace_back(fr_from_wire(w.slot), fr_from_wire(w.value));
    }

    WorldStateStatusFull status = ctx.world_state.sync_block(block_state_ref,
                                                             block_header_hash,
                                                             padded_note_hashes,
                                                             padded_l1_to_l2_messages,
                                                             padded_nullifiers,
                                                             public_data_writes);
    return wire::WsdbSyncBlockResponse{
        .status = world_state_status_full_to_wire(status),
    };
}

// ---------------------------------------------------------------------------
// Fork management
// ---------------------------------------------------------------------------

wire::WsdbCreateForkResponse handle_create_fork(WsdbRequest& ctx, wire::WsdbCreateFork&& cmd)
{
    std::optional<block_number_t> block = cmd.latest ? std::nullopt : std::optional<block_number_t>(cmd.blockNumber);
    uint64_t id = ctx.world_state.create_fork(block);
    return wire::WsdbCreateForkResponse{ .forkId = id };
}

wire::WsdbDeleteForkResponse handle_delete_fork(WsdbRequest& ctx, wire::WsdbDeleteFork&& cmd)
{
    ctx.world_state.delete_fork(cmd.forkId);
    return wire::WsdbDeleteForkResponse{};
}

// ---------------------------------------------------------------------------
// Block management
// ---------------------------------------------------------------------------

wire::WsdbFinalizeBlocksResponse handle_finalize_blocks(WsdbRequest& ctx, wire::WsdbFinalizeBlocks&& cmd)
{
    WorldStateStatusSummary status = ctx.world_state.set_finalized_blocks(cmd.toBlockNumber);
    return wire::WsdbFinalizeBlocksResponse{
        .status = world_state_status_summary_to_wire(status),
    };
}

wire::WsdbUnwindBlocksResponse handle_unwind_blocks(WsdbRequest& ctx, wire::WsdbUnwindBlocks&& cmd)
{
    WorldStateStatusFull status = ctx.world_state.unwind_blocks(cmd.toBlockNumber);
    return wire::WsdbUnwindBlocksResponse{
        .status = world_state_status_full_to_wire(status),
    };
}

wire::WsdbRemoveHistoricalBlocksResponse handle_remove_historical_blocks(WsdbRequest& ctx,
                                                                         wire::WsdbRemoveHistoricalBlocks&& cmd)
{
    WorldStateStatusFull status = ctx.world_state.remove_historical_blocks(cmd.toBlockNumber);
    return wire::WsdbRemoveHistoricalBlocksResponse{
        .status = world_state_status_full_to_wire(status),
    };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

wire::WsdbGetStatusResponse handle_get_status(WsdbRequest& ctx, wire::WsdbGetStatus&&)
{
    WorldStateStatusSummary status;
    ctx.world_state.get_status_summary(status);
    return wire::WsdbGetStatusResponse{
        .status = world_state_status_summary_to_wire(status),
    };
}

// ---------------------------------------------------------------------------
// Checkpoint operations
// ---------------------------------------------------------------------------

wire::WsdbCreateCheckpointResponse handle_create_checkpoint(WsdbRequest& ctx, wire::WsdbCreateCheckpoint&& cmd)
{
    ctx.world_state.checkpoint(cmd.forkId);
    return wire::WsdbCreateCheckpointResponse{};
}

wire::WsdbCommitCheckpointResponse handle_commit_checkpoint(WsdbRequest& ctx, wire::WsdbCommitCheckpoint&& cmd)
{
    ctx.world_state.commit_checkpoint(cmd.forkId);
    return wire::WsdbCommitCheckpointResponse{};
}

wire::WsdbRevertCheckpointResponse handle_revert_checkpoint(WsdbRequest& ctx, wire::WsdbRevertCheckpoint&& cmd)
{
    ctx.world_state.revert_checkpoint(cmd.forkId);
    return wire::WsdbRevertCheckpointResponse{};
}

wire::WsdbCommitAllCheckpointsResponse handle_commit_all_checkpoints(WsdbRequest& ctx,
                                                                     wire::WsdbCommitAllCheckpoints&& cmd)
{
    ctx.world_state.commit_all_checkpoints_to(cmd.forkId, 0);
    return wire::WsdbCommitAllCheckpointsResponse{};
}

wire::WsdbRevertAllCheckpointsResponse handle_revert_all_checkpoints(WsdbRequest& ctx,
                                                                     wire::WsdbRevertAllCheckpoints&& cmd)
{
    ctx.world_state.revert_all_checkpoints_to(cmd.forkId, 0);
    return wire::WsdbRevertAllCheckpointsResponse{};
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

wire::WsdbCopyStoresResponse handle_copy_stores(WsdbRequest& ctx, wire::WsdbCopyStores&& cmd)
{
    ctx.world_state.copy_stores(cmd.dstPath, cmd.compact.value_or(false));
    return wire::WsdbCopyStoresResponse{};
}

} // namespace bb::wsdb
