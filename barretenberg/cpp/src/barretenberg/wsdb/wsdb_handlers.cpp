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

namespace bb::wsdb {

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

// ---------------------------------------------------------------------------
// Wire <-> Domain conversion helpers
// ---------------------------------------------------------------------------

namespace {

inline bb::fr fr_from_wire(const Fr& w)
{
    bb::fr r;
    std::memcpy(&r, w.data(), 32);
    return r;
}

inline Fr fr_to_wire(const bb::fr& d)
{
    Fr r;
    std::memcpy(r.data(), &d, 32);
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

inline WorldStateRevision revision_from_wire(const wire::WorldStateRevision& w)
{
    return WorldStateRevision{
        .forkId = w.forkId,
        .blockNumber = w.blockNumber,
        .includeUncommitted = w.includeUncommitted,
    };
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
            std::memcpy(&root, v.first.data(), 32);
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
        std::memcpy(root_bytes.data(), &v.first, 32);
        result[static_cast<uint32_t>(k)] = { std::move(root_bytes), v.second };
    }
    return result;
}

// Domain leaf values from wire
inline NullifierLeafValue nullifier_leaf_from_wire(const wire::NullifierLeafValue& w)
{
    return NullifierLeafValue(fr_from_wire(w.nullifier));
}

inline std::vector<NullifierLeafValue> nullifier_leaves_from_wire(const std::vector<wire::NullifierLeafValue>& wire)
{
    std::vector<NullifierLeafValue> result;
    result.reserve(wire.size());
    for (const auto& w : wire) {
        result.push_back(nullifier_leaf_from_wire(w));
    }
    return result;
}

inline PublicDataLeafValue public_data_leaf_from_wire(const wire::PublicDataLeafValue& w)
{
    return PublicDataLeafValue(fr_from_wire(w.slot), fr_from_wire(w.value));
}

inline std::vector<PublicDataLeafValue> public_data_leaves_from_wire(const std::vector<wire::PublicDataLeafValue>& wire)
{
    std::vector<PublicDataLeafValue> result;
    result.reserve(wire.size());
    for (const auto& w : wire) {
        result.push_back(public_data_leaf_from_wire(w));
    }
    return result;
}

// Status conversion: domain -> wire
inline wire::TreeMeta tree_meta_to_wire(const TreeMeta& d)
{
    return wire::TreeMeta{
        .name = d.name,
        .depth = d.depth,
        .size = d.size,
        .committedSize = d.committedSize,
        .root = fr_to_wire(d.root),
        .initialSize = d.initialSize,
        .initialRoot = fr_to_wire(d.initialRoot),
        .oldestHistoricBlock = d.oldestHistoricBlock,
        .unfinalizedBlockHeight = d.unfinalizedBlockHeight,
        .finalizedBlockHeight = d.finalizedBlockHeight,
    };
}

inline wire::DBStats db_stats_to_wire(const DBStats& d)
{
    return wire::DBStats{
        .name = d.name,
        .numDataItems = d.numDataItems,
        .totalUsedSize = d.totalUsedSize,
    };
}

inline wire::TreeDBStats tree_db_stats_to_wire(const TreeDBStats& d)
{
    return wire::TreeDBStats{
        .mapSize = d.mapSize,
        .physicalFileSize = d.physicalFileSize,
        .blocksDBStats = db_stats_to_wire(d.blocksDBStats),
        .nodesDBStats = db_stats_to_wire(d.nodesDBStats),
        .leafPreimagesDBStats = db_stats_to_wire(d.leafPreimagesDBStats),
        .leafIndicesDBStats = db_stats_to_wire(d.leafIndicesDBStats),
        .blockIndicesDBStats = db_stats_to_wire(d.blockIndicesDBStats),
    };
}

inline wire::WorldStateDBStats world_state_db_stats_to_wire(const WorldStateDBStats& d)
{
    return wire::WorldStateDBStats{
        .noteHashTreeStats = tree_db_stats_to_wire(d.noteHashTreeStats),
        .messageTreeStats = tree_db_stats_to_wire(d.messageTreeStats),
        .archiveTreeStats = tree_db_stats_to_wire(d.archiveTreeStats),
        .publicDataTreeStats = tree_db_stats_to_wire(d.publicDataTreeStats),
        .nullifierTreeStats = tree_db_stats_to_wire(d.nullifierTreeStats),
    };
}

inline wire::WorldStateMeta world_state_meta_to_wire(const WorldStateMeta& d)
{
    return wire::WorldStateMeta{
        .noteHashTreeMeta = tree_meta_to_wire(d.noteHashTreeMeta),
        .messageTreeMeta = tree_meta_to_wire(d.messageTreeMeta),
        .archiveTreeMeta = tree_meta_to_wire(d.archiveTreeMeta),
        .publicDataTreeMeta = tree_meta_to_wire(d.publicDataTreeMeta),
        .nullifierTreeMeta = tree_meta_to_wire(d.nullifierTreeMeta),
    };
}

inline wire::WorldStateStatusSummary status_summary_to_wire(const WorldStateStatusSummary& d)
{
    return wire::WorldStateStatusSummary{
        .unfinalizedBlockNumber = d.unfinalizedBlockNumber,
        .finalizedBlockNumber = d.finalizedBlockNumber,
        .oldestHistoricalBlock = d.oldestHistoricalBlock,
        .treesAreSynched = d.treesAreSynched,
    };
}

inline wire::WorldStateStatusFull status_full_to_wire(const WorldStateStatusFull& d)
{
    return wire::WorldStateStatusFull{
        .summary = status_summary_to_wire(d.summary),
        .dbStats = world_state_db_stats_to_wire(d.dbStats),
        .meta = world_state_meta_to_wire(d.meta),
    };
}

// Sibling path conversion: domain -> wire
inline wire::SiblingPathAndIndex sibling_path_and_index_to_wire(const SiblingPathAndIndex& d)
{
    return wire::SiblingPathAndIndex{
        .index = d.index,
        .path = fr_vec_to_wire(d.path),
    };
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
// Handler implementations
// ---------------------------------------------------------------------------

wire::WsdbGetTreeInfoResponse handle_get_tree_info(WsdbRequest& request, wire::WsdbGetTreeInfo&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = revision_from_wire(cmd.revision);
    auto info = request.world_state.get_tree_info(revision, tree_id);
    return wire::WsdbGetTreeInfoResponse{
        .treeId = cmd.treeId,
        .root = fr_to_wire(info.meta.root),
        .size = info.meta.size,
        .depth = info.meta.depth,
    };
}

wire::WsdbGetStateReferenceResponse handle_get_state_reference(WsdbRequest& request, wire::WsdbGetStateReference&& cmd)
{
    auto revision = revision_from_wire(cmd.revision);
    auto state = request.world_state.get_state_reference(revision);
    return wire::WsdbGetStateReferenceResponse{ .state = state_ref_to_wire(state) };
}

wire::WsdbGetInitialStateReferenceResponse handle_get_initial_state_reference(
    WsdbRequest& request, [[maybe_unused]] wire::WsdbGetInitialStateReference&& cmd)
{
    auto state = request.world_state.get_initial_state_reference();
    return wire::WsdbGetInitialStateReferenceResponse{ .state = state_ref_to_wire(state) };
}

wire::WsdbGetLeafValueResponse handle_get_leaf_value(WsdbRequest& request, wire::WsdbGetLeafValue&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = revision_from_wire(cmd.revision);

    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto leaf = request.world_state.get_leaf<bb::fr>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafValueResponse{ .value = std::nullopt };
        }
        return wire::WsdbGetLeafValueResponse{ .value = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = request.world_state.get_leaf<PublicDataLeafValue>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafValueResponse{ .value = std::nullopt };
        }
        return wire::WsdbGetLeafValueResponse{ .value = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = request.world_state.get_leaf<NullifierLeafValue>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafValueResponse{ .value = std::nullopt };
        }
        return wire::WsdbGetLeafValueResponse{ .value = serialize_to_msgpack(leaf.value()) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for get_leaf_value");
    }
}

wire::WsdbGetLeafPreimageResponse handle_get_leaf_preimage(WsdbRequest& request, wire::WsdbGetLeafPreimage&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = revision_from_wire(cmd.revision);

    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = request.world_state.get_indexed_leaf<NullifierLeafValue>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafPreimageResponse{ .preimage = std::nullopt };
        }
        return wire::WsdbGetLeafPreimageResponse{ .preimage = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = request.world_state.get_indexed_leaf<PublicDataLeafValue>(revision, tree_id, cmd.leafIndex);
        if (!leaf.has_value()) {
            return wire::WsdbGetLeafPreimageResponse{ .preimage = std::nullopt };
        }
        return wire::WsdbGetLeafPreimageResponse{ .preimage = serialize_to_msgpack(leaf.value()) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for get_leaf_preimage");
    }
}

wire::WsdbGetSiblingPathResponse handle_get_sibling_path(WsdbRequest& request, wire::WsdbGetSiblingPath&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = revision_from_wire(cmd.revision);
    fr_sibling_path path = request.world_state.get_sibling_path(revision, tree_id, cmd.leafIndex);
    return wire::WsdbGetSiblingPathResponse{ .path = fr_vec_to_wire(path) };
}

wire::WsdbGetBlockNumbersForLeafIndicesResponse handle_get_block_numbers_for_leaf_indices(
    WsdbRequest& request, wire::WsdbGetBlockNumbersForLeafIndices&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = revision_from_wire(cmd.revision);
    std::vector<std::optional<block_number_t>> block_numbers;
    request.world_state.get_block_numbers_for_leaf_indices(revision, tree_id, cmd.leafIndices, block_numbers);
    // Wire type uses optional<uint32_t> which is the same as optional<block_number_t>
    return wire::WsdbGetBlockNumbersForLeafIndicesResponse{ .blockNumbers = block_numbers };
}

wire::WsdbFindLeafIndicesResponse handle_find_leaf_indices(WsdbRequest& request, wire::WsdbFindLeafIndices&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = revision_from_wire(cmd.revision);
    std::vector<std::optional<index_t>> indices;

    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(cmd.leaves);
        request.world_state.find_leaf_indices<bb::fr>(revision, tree_id, typed_leaves, indices, cmd.startIndex);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        request.world_state.find_leaf_indices<PublicDataLeafValue>(
            revision, tree_id, typed_leaves, indices, cmd.startIndex);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        request.world_state.find_leaf_indices<NullifierLeafValue>(
            revision, tree_id, typed_leaves, indices, cmd.startIndex);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for find_leaf_indices");
    }
    return wire::WsdbFindLeafIndicesResponse{ .indices = indices };
}

wire::WsdbFindLowLeafResponse handle_find_low_leaf(WsdbRequest& request, wire::WsdbFindLowLeaf&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = revision_from_wire(cmd.revision);
    auto key = fr_from_wire(cmd.key);
    auto low_leaf_info = request.world_state.find_low_leaf_index(revision, tree_id, key);
    return wire::WsdbFindLowLeafResponse{
        .alreadyPresent = low_leaf_info.is_already_present,
        .index = low_leaf_info.index,
    };
}

wire::WsdbFindSiblingPathsResponse handle_find_sibling_paths(WsdbRequest& request, wire::WsdbFindSiblingPaths&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);
    auto revision = revision_from_wire(cmd.revision);
    std::vector<std::optional<SiblingPathAndIndex>> paths;

    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(cmd.leaves);
        request.world_state.find_sibling_paths<bb::fr>(revision, tree_id, typed_leaves, paths);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        request.world_state.find_sibling_paths<PublicDataLeafValue>(revision, tree_id, typed_leaves, paths);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        request.world_state.find_sibling_paths<NullifierLeafValue>(revision, tree_id, typed_leaves, paths);
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
            wire_paths.push_back(sibling_path_and_index_to_wire(p.value()));
        } else {
            wire_paths.push_back(std::nullopt);
        }
    }
    return wire::WsdbFindSiblingPathsResponse{ .paths = std::move(wire_paths) };
}

wire::WsdbAppendLeavesResponse handle_append_leaves(WsdbRequest& request, wire::WsdbAppendLeaves&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);

    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(cmd.leaves);
        request.world_state.append_leaves<bb::fr>(tree_id, typed_leaves, cmd.forkId);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        request.world_state.append_leaves<PublicDataLeafValue>(tree_id, typed_leaves, cmd.forkId);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        request.world_state.append_leaves<NullifierLeafValue>(tree_id, typed_leaves, cmd.forkId);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for append_leaves");
    }
    return wire::WsdbAppendLeavesResponse{};
}

wire::WsdbBatchInsertResponse handle_batch_insert(WsdbRequest& request, wire::WsdbBatchInsert&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);

    switch (tree_id) {
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        auto result = request.world_state.batch_insert_indexed_leaves<PublicDataLeafValue>(
            tree_id, typed_leaves, cmd.subtreeDepth, cmd.forkId);
        return wire::WsdbBatchInsertResponse{ .result = serialize_to_msgpack(result) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        auto result = request.world_state.batch_insert_indexed_leaves<NullifierLeafValue>(
            tree_id, typed_leaves, cmd.subtreeDepth, cmd.forkId);
        return wire::WsdbBatchInsertResponse{ .result = serialize_to_msgpack(result) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for batch_insert");
    }
}

wire::WsdbSequentialInsertResponse handle_sequential_insert(WsdbRequest& request, wire::WsdbSequentialInsert&& cmd)
{
    auto tree_id = tree_id_from_wire(cmd.treeId);

    switch (tree_id) {
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(cmd.leaves);
        auto result = request.world_state.insert_indexed_leaves<PublicDataLeafValue>(tree_id, typed_leaves, cmd.forkId);
        return wire::WsdbSequentialInsertResponse{ .result = serialize_to_msgpack(result) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(cmd.leaves);
        auto result = request.world_state.insert_indexed_leaves<NullifierLeafValue>(tree_id, typed_leaves, cmd.forkId);
        return wire::WsdbSequentialInsertResponse{ .result = serialize_to_msgpack(result) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for sequential_insert");
    }
}

wire::WsdbUpdateArchiveResponse handle_update_archive(WsdbRequest& request, wire::WsdbUpdateArchive&& cmd)
{
    auto block_state_ref = state_ref_from_wire(cmd.blockStateRef);
    auto block_header_hash = fr_from_wire(cmd.blockHeaderHash);
    request.world_state.update_archive(block_state_ref, block_header_hash, cmd.forkId);
    return wire::WsdbUpdateArchiveResponse{};
}

wire::WsdbCommitResponse handle_commit(WsdbRequest& request, [[maybe_unused]] wire::WsdbCommit&& cmd)
{
    WorldStateStatusFull status;
    request.world_state.commit(status);
    return wire::WsdbCommitResponse{ .status = status_full_to_wire(status) };
}

wire::WsdbRollbackResponse handle_rollback(WsdbRequest& request, [[maybe_unused]] wire::WsdbRollback&& cmd)
{
    request.world_state.rollback();
    return wire::WsdbRollbackResponse{};
}

wire::WsdbSyncBlockResponse handle_sync_block(WsdbRequest& request, wire::WsdbSyncBlock&& cmd)
{
    auto block_state_ref = state_ref_from_wire(cmd.blockStateRef);
    auto block_header_hash = fr_from_wire(cmd.blockHeaderHash);
    auto padded_note_hashes = fr_vec_from_wire(cmd.paddedNoteHashes);
    auto padded_l1_to_l2_messages = fr_vec_from_wire(cmd.paddedL1ToL2Messages);
    auto padded_nullifiers = nullifier_leaves_from_wire(cmd.paddedNullifiers);
    auto public_data_writes = public_data_leaves_from_wire(cmd.publicDataWrites);

    WorldStateStatusFull status = request.world_state.sync_block(block_state_ref,
                                                                 block_header_hash,
                                                                 padded_note_hashes,
                                                                 padded_l1_to_l2_messages,
                                                                 padded_nullifiers,
                                                                 public_data_writes);
    return wire::WsdbSyncBlockResponse{ .status = status_full_to_wire(status) };
}

wire::WsdbCreateForkResponse handle_create_fork(WsdbRequest& request, wire::WsdbCreateFork&& cmd)
{
    std::optional<block_number_t> block = cmd.latest ? std::nullopt : std::optional<block_number_t>(cmd.blockNumber);
    uint64_t id = request.world_state.create_fork(block);
    return wire::WsdbCreateForkResponse{ .forkId = id };
}

wire::WsdbDeleteForkResponse handle_delete_fork(WsdbRequest& request, wire::WsdbDeleteFork&& cmd)
{
    request.world_state.delete_fork(cmd.forkId);
    return wire::WsdbDeleteForkResponse{};
}

wire::WsdbFinalizeBlocksResponse handle_finalize_blocks(WsdbRequest& request, wire::WsdbFinalizeBlocks&& cmd)
{
    WorldStateStatusSummary status = request.world_state.set_finalized_blocks(cmd.toBlockNumber);
    return wire::WsdbFinalizeBlocksResponse{ .status = status_summary_to_wire(status) };
}

wire::WsdbUnwindBlocksResponse handle_unwind_blocks(WsdbRequest& request, wire::WsdbUnwindBlocks&& cmd)
{
    WorldStateStatusFull status = request.world_state.unwind_blocks(cmd.toBlockNumber);
    return wire::WsdbUnwindBlocksResponse{ .status = status_full_to_wire(status) };
}

wire::WsdbRemoveHistoricalBlocksResponse handle_remove_historical_blocks(WsdbRequest& request,
                                                                         wire::WsdbRemoveHistoricalBlocks&& cmd)
{
    WorldStateStatusFull status = request.world_state.remove_historical_blocks(cmd.toBlockNumber);
    return wire::WsdbRemoveHistoricalBlocksResponse{ .status = status_full_to_wire(status) };
}

wire::WsdbGetStatusResponse handle_get_status(WsdbRequest& request, [[maybe_unused]] wire::WsdbGetStatus&& cmd)
{
    WorldStateStatusSummary status;
    request.world_state.get_status_summary(status);
    return wire::WsdbGetStatusResponse{ .status = status_summary_to_wire(status) };
}

wire::WsdbCreateCheckpointResponse handle_create_checkpoint(WsdbRequest& request, wire::WsdbCreateCheckpoint&& cmd)
{
    request.world_state.checkpoint(cmd.forkId);
    return wire::WsdbCreateCheckpointResponse{};
}

wire::WsdbCommitCheckpointResponse handle_commit_checkpoint(WsdbRequest& request, wire::WsdbCommitCheckpoint&& cmd)
{
    request.world_state.commit_checkpoint(cmd.forkId);
    return wire::WsdbCommitCheckpointResponse{};
}

wire::WsdbRevertCheckpointResponse handle_revert_checkpoint(WsdbRequest& request, wire::WsdbRevertCheckpoint&& cmd)
{
    request.world_state.revert_checkpoint(cmd.forkId);
    return wire::WsdbRevertCheckpointResponse{};
}

wire::WsdbCommitAllCheckpointsResponse handle_commit_all_checkpoints(WsdbRequest& request,
                                                                     wire::WsdbCommitAllCheckpoints&& cmd)
{
    request.world_state.commit_all_checkpoints_to(cmd.forkId, 0);
    return wire::WsdbCommitAllCheckpointsResponse{};
}

wire::WsdbRevertAllCheckpointsResponse handle_revert_all_checkpoints(WsdbRequest& request,
                                                                     wire::WsdbRevertAllCheckpoints&& cmd)
{
    request.world_state.revert_all_checkpoints_to(cmd.forkId, 0);
    return wire::WsdbRevertAllCheckpointsResponse{};
}

wire::WsdbCopyStoresResponse handle_copy_stores(WsdbRequest& request, wire::WsdbCopyStores&& cmd)
{
    request.world_state.copy_stores(cmd.dstPath, cmd.compact.value_or(false));
    return wire::WsdbCopyStoresResponse{};
}

} // namespace bb::wsdb
