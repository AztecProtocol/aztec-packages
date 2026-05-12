#include "barretenberg/wsdb/wsdb_execute.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include <optional>
#include <stdexcept>

namespace bb::wsdb {

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

// ---------------------------------------------------------------------------
// Helper: serialize a value to msgpack bytes
// ---------------------------------------------------------------------------

template <typename T> static std::vector<uint8_t> serialize_to_msgpack(const T& value)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, value);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

// ---------------------------------------------------------------------------
// Helper: deserialize leaves from raw bytes based on tree type
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
// Top-level dispatch
// ---------------------------------------------------------------------------

WsdbCommandResponse wsdb(WsdbRequest& request, WsdbCommand&& command)
{
    return execute(request, std::move(command));
}

// ---------------------------------------------------------------------------
// Tree info / state queries
// ---------------------------------------------------------------------------

WsdbGetTreeInfo::Response WsdbGetTreeInfo::execute(WsdbRequest& request) &&
{
    auto info = request.world_state.get_tree_info(revision, treeId);
    return Response{ .treeId = treeId, .root = info.meta.root, .size = info.meta.size, .depth = info.meta.depth };
}

WsdbGetStateReference::Response WsdbGetStateReference::execute(WsdbRequest& request) &&
{
    auto state = request.world_state.get_state_reference(revision);
    return Response{ .state = state };
}

WsdbGetInitialStateReference::Response WsdbGetInitialStateReference::execute(WsdbRequest& request) &&
{
    auto state = request.world_state.get_initial_state_reference();
    return Response{ .state = state };
}

// ---------------------------------------------------------------------------
// Leaf queries
// ---------------------------------------------------------------------------

WsdbGetLeafValue::Response WsdbGetLeafValue::execute(WsdbRequest& request) &&
{
    switch (treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto leaf = request.world_state.get_leaf<bb::fr>(revision, treeId, leafIndex);
        if (!leaf.has_value()) {
            return Response{ .value = std::nullopt };
        }
        return Response{ .value = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = request.world_state.get_leaf<PublicDataLeafValue>(revision, treeId, leafIndex);
        if (!leaf.has_value()) {
            return Response{ .value = std::nullopt };
        }
        return Response{ .value = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = request.world_state.get_leaf<NullifierLeafValue>(revision, treeId, leafIndex);
        if (!leaf.has_value()) {
            return Response{ .value = std::nullopt };
        }
        return Response{ .value = serialize_to_msgpack(leaf.value()) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for get_leaf_value");
    }
}

WsdbGetLeafPreimage::Response WsdbGetLeafPreimage::execute(WsdbRequest& request) &&
{
    switch (treeId) {
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = request.world_state.get_indexed_leaf<NullifierLeafValue>(revision, treeId, leafIndex);
        if (!leaf.has_value()) {
            return Response{ .preimage = std::nullopt };
        }
        return Response{ .preimage = serialize_to_msgpack(leaf.value()) };
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = request.world_state.get_indexed_leaf<PublicDataLeafValue>(revision, treeId, leafIndex);
        if (!leaf.has_value()) {
            return Response{ .preimage = std::nullopt };
        }
        return Response{ .preimage = serialize_to_msgpack(leaf.value()) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for get_leaf_preimage");
    }
}

WsdbGetSiblingPath::Response WsdbGetSiblingPath::execute(WsdbRequest& request) &&
{
    fr_sibling_path path = request.world_state.get_sibling_path(revision, treeId, leafIndex);
    return Response{ .path = path };
}

WsdbGetBlockNumbersForLeafIndices::Response WsdbGetBlockNumbersForLeafIndices::execute(WsdbRequest& request) &&
{
    Response response;
    request.world_state.get_block_numbers_for_leaf_indices(revision, treeId, leafIndices, response.blockNumbers);
    return response;
}

// ---------------------------------------------------------------------------
// Leaf search operations
// ---------------------------------------------------------------------------

WsdbFindLeafIndices::Response WsdbFindLeafIndices::execute(WsdbRequest& request) &&
{
    Response response;
    switch (treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(leaves);
        request.world_state.find_leaf_indices<bb::fr>(revision, treeId, typed_leaves, response.indices, startIndex);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(leaves);
        request.world_state.find_leaf_indices<PublicDataLeafValue>(
            revision, treeId, typed_leaves, response.indices, startIndex);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(leaves);
        request.world_state.find_leaf_indices<NullifierLeafValue>(
            revision, treeId, typed_leaves, response.indices, startIndex);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for find_leaf_indices");
    }
    return response;
}

WsdbFindLowLeaf::Response WsdbFindLowLeaf::execute(WsdbRequest& request) &&
{
    auto low_leaf_info = request.world_state.find_low_leaf_index(revision, treeId, key);
    return Response{ .alreadyPresent = low_leaf_info.is_already_present, .index = low_leaf_info.index };
}

WsdbFindSiblingPaths::Response WsdbFindSiblingPaths::execute(WsdbRequest& request) &&
{
    Response response;
    switch (treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(leaves);
        request.world_state.find_sibling_paths<bb::fr>(revision, treeId, typed_leaves, response.paths);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(leaves);
        request.world_state.find_sibling_paths<PublicDataLeafValue>(revision, treeId, typed_leaves, response.paths);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(leaves);
        request.world_state.find_sibling_paths<NullifierLeafValue>(revision, treeId, typed_leaves, response.paths);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for find_sibling_paths");
    }
    return response;
}

// ---------------------------------------------------------------------------
// Tree mutation operations
// ---------------------------------------------------------------------------

WsdbAppendLeaves::Response WsdbAppendLeaves::execute(WsdbRequest& request) &&
{
    switch (treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto typed_leaves = deserialize_leaves<bb::fr>(leaves);
        request.world_state.append_leaves<bb::fr>(treeId, typed_leaves, forkId);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(leaves);
        request.world_state.append_leaves<PublicDataLeafValue>(treeId, typed_leaves, forkId);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(leaves);
        request.world_state.append_leaves<NullifierLeafValue>(treeId, typed_leaves, forkId);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for append_leaves");
    }
    return Response{};
}

WsdbBatchInsert::Response WsdbBatchInsert::execute(WsdbRequest& request) &&
{
    switch (treeId) {
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(leaves);
        auto result = request.world_state.batch_insert_indexed_leaves<PublicDataLeafValue>(
            treeId, typed_leaves, subtreeDepth, forkId);
        return Response{ .result = serialize_to_msgpack(result) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(leaves);
        auto result = request.world_state.batch_insert_indexed_leaves<NullifierLeafValue>(
            treeId, typed_leaves, subtreeDepth, forkId);
        return Response{ .result = serialize_to_msgpack(result) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for batch_insert");
    }
}

WsdbSequentialInsert::Response WsdbSequentialInsert::execute(WsdbRequest& request) &&
{
    switch (treeId) {
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto typed_leaves = deserialize_leaves<PublicDataLeafValue>(leaves);
        auto result = request.world_state.insert_indexed_leaves<PublicDataLeafValue>(treeId, typed_leaves, forkId);
        return Response{ .result = serialize_to_msgpack(result) };
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        auto typed_leaves = deserialize_leaves<NullifierLeafValue>(leaves);
        auto result = request.world_state.insert_indexed_leaves<NullifierLeafValue>(treeId, typed_leaves, forkId);
        return Response{ .result = serialize_to_msgpack(result) };
    }
    default:
        throw std::runtime_error("Unsupported tree type for sequential_insert");
    }
}

WsdbUpdateArchive::Response WsdbUpdateArchive::execute(WsdbRequest& request) &&
{
    request.world_state.update_archive(blockStateRef, blockHeaderHash, forkId);
    return Response{};
}

// ---------------------------------------------------------------------------
// Transaction operations
// ---------------------------------------------------------------------------

WsdbCommit::Response WsdbCommit::execute(WsdbRequest& request) &&
{
    WorldStateStatusFull status;
    request.world_state.commit(status);
    return Response{ .status = status };
}

WsdbRollback::Response WsdbRollback::execute(WsdbRequest& request) &&
{
    request.world_state.rollback();
    return Response{};
}

// ---------------------------------------------------------------------------
// Block synchronization
// ---------------------------------------------------------------------------

WsdbSyncBlock::Response WsdbSyncBlock::execute(WsdbRequest& request) &&
{
    WorldStateStatusFull status = request.world_state.sync_block(
        blockStateRef, blockHeaderHash, paddedNoteHashes, paddedL1ToL2Messages, paddedNullifiers, publicDataWrites);
    return Response{ .status = status };
}

// ---------------------------------------------------------------------------
// Fork management
// ---------------------------------------------------------------------------

WsdbCreateFork::Response WsdbCreateFork::execute(WsdbRequest& request) &&
{
    std::optional<block_number_t> block = latest ? std::nullopt : std::optional<block_number_t>(blockNumber);
    uint64_t id = request.world_state.create_fork(block);
    return Response{ .forkId = id };
}

WsdbDeleteFork::Response WsdbDeleteFork::execute(WsdbRequest& request) &&
{
    request.world_state.delete_fork(forkId);
    return Response{};
}

// ---------------------------------------------------------------------------
// Block management
// ---------------------------------------------------------------------------

WsdbFinalizeBlocks::Response WsdbFinalizeBlocks::execute(WsdbRequest& request) &&
{
    WorldStateStatusSummary status = request.world_state.set_finalized_blocks(toBlockNumber);
    return Response{ .status = status };
}

WsdbUnwindBlocks::Response WsdbUnwindBlocks::execute(WsdbRequest& request) &&
{
    WorldStateStatusFull status = request.world_state.unwind_blocks(toBlockNumber);
    return Response{ .status = status };
}

WsdbRemoveHistoricalBlocks::Response WsdbRemoveHistoricalBlocks::execute(WsdbRequest& request) &&
{
    WorldStateStatusFull status = request.world_state.remove_historical_blocks(toBlockNumber);
    return Response{ .status = status };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

WsdbGetStatus::Response WsdbGetStatus::execute(WsdbRequest& request) &&
{
    WorldStateStatusSummary status;
    request.world_state.get_status_summary(status);
    return Response{ .status = status };
}

// ---------------------------------------------------------------------------
// Checkpoint operations
// ---------------------------------------------------------------------------

WsdbCreateCheckpoint::Response WsdbCreateCheckpoint::execute(WsdbRequest& request) &&
{
    request.world_state.checkpoint(forkId);
    return Response{};
}

WsdbCommitCheckpoint::Response WsdbCommitCheckpoint::execute(WsdbRequest& request) &&
{
    request.world_state.commit_checkpoint(forkId);
    return Response{};
}

WsdbRevertCheckpoint::Response WsdbRevertCheckpoint::execute(WsdbRequest& request) &&
{
    request.world_state.revert_checkpoint(forkId);
    return Response{};
}

WsdbCommitAllCheckpoints::Response WsdbCommitAllCheckpoints::execute(WsdbRequest& request) &&
{
    request.world_state.commit_all_checkpoints_to(forkId, 0);
    return Response{};
}

WsdbRevertAllCheckpoints::Response WsdbRevertAllCheckpoints::execute(WsdbRequest& request) &&
{
    request.world_state.revert_all_checkpoints_to(forkId, 0);
    return Response{};
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

WsdbCopyStores::Response WsdbCopyStores::execute(WsdbRequest& request) &&
{
    request.world_state.copy_stores(dstPath, compact.value_or(false));
    return Response{};
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

WsdbShutdown::Response WsdbShutdown::execute(WsdbRequest& /* request */) &&
{
    return Response{};
}

} // namespace bb::wsdb
