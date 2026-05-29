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
 * the helpers in wsdb_wire_convert.hpp.
 */
#include "barretenberg/wsdb/wsdb_handlers.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_server.hpp"
#include "barretenberg/wsdb/wsdb_wire_convert.hpp"

#include <optional>
#include <stdexcept>

namespace bb::wsdb {

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

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
        return wire::WsdbGetLeafValueResponse{ .value = leaf.has_value() ? std::optional<Fr>(fr_to_wire(*leaf))
                                                                         : std::nullopt };
    }
    default:
        throw std::runtime_error("Unsupported tree type for get_leaf_value");
    }
}

wire::WsdbGetPublicDataLeafValueResponse handle_get_public_data_leaf_value(WsdbRequest& ctx,
                                                                           wire::WsdbGetPublicDataLeafValue&& cmd)
{
    auto leaf = ctx.world_state.get_leaf<PublicDataLeafValue>(
        revision_from_wire(cmd.revision), MerkleTreeId::PUBLIC_DATA_TREE, static_cast<index_t>(cmd.leafIndex));
    return wire::WsdbGetPublicDataLeafValueResponse{
        .value =
            leaf.has_value() ? std::optional<wire::PublicDataLeafValue>(public_data_leaf_to_wire(*leaf)) : std::nullopt
    };
}

wire::WsdbGetNullifierLeafValueResponse handle_get_nullifier_leaf_value(WsdbRequest& ctx,
                                                                        wire::WsdbGetNullifierLeafValue&& cmd)
{
    auto leaf = ctx.world_state.get_leaf<NullifierLeafValue>(
        revision_from_wire(cmd.revision), MerkleTreeId::NULLIFIER_TREE, static_cast<index_t>(cmd.leafIndex));
    return wire::WsdbGetNullifierLeafValueResponse{ .value = leaf.has_value() ? std::optional<wire::NullifierLeafValue>(
                                                                                    nullifier_leaf_to_wire(*leaf))
                                                                              : std::nullopt };
}

wire::WsdbGetPublicDataLeafPreimageResponse handle_get_public_data_leaf_preimage(
    WsdbRequest& ctx, wire::WsdbGetPublicDataLeafPreimage&& cmd)
{
    auto leaf = ctx.world_state.get_indexed_leaf<PublicDataLeafValue>(
        revision_from_wire(cmd.revision), MerkleTreeId::PUBLIC_DATA_TREE, static_cast<index_t>(cmd.leafIndex));
    return wire::WsdbGetPublicDataLeafPreimageResponse{
        .preimage = leaf.has_value()
                        ? std::optional<wire::IndexedPublicDataLeafValue>(indexed_public_data_leaf_to_wire(*leaf))
                        : std::nullopt
    };
}

wire::WsdbGetNullifierLeafPreimageResponse handle_get_nullifier_leaf_preimage(WsdbRequest& ctx,
                                                                              wire::WsdbGetNullifierLeafPreimage&& cmd)
{
    auto leaf = ctx.world_state.get_indexed_leaf<NullifierLeafValue>(
        revision_from_wire(cmd.revision), MerkleTreeId::NULLIFIER_TREE, static_cast<index_t>(cmd.leafIndex));
    return wire::WsdbGetNullifierLeafPreimageResponse{ .preimage = leaf.has_value()
                                                                       ? std::optional<wire::IndexedNullifierLeafValue>(
                                                                             indexed_nullifier_leaf_to_wire(*leaf))
                                                                       : std::nullopt };
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
        auto typed_leaves = fr_vec_from_wire(cmd.leaves);
        ctx.world_state.find_leaf_indices<bb::fr>(revision, tree_id, typed_leaves, indices, start_index);
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

wire::WsdbFindPublicDataLeafIndicesResponse handle_find_public_data_leaf_indices(
    WsdbRequest& ctx, wire::WsdbFindPublicDataLeafIndices&& cmd)
{
    std::vector<std::optional<index_t>> indices;
    ctx.world_state.find_leaf_indices<PublicDataLeafValue>(revision_from_wire(cmd.revision),
                                                           MerkleTreeId::PUBLIC_DATA_TREE,
                                                           public_data_leaf_vec_from_wire(cmd.leaves),
                                                           indices,
                                                           static_cast<index_t>(cmd.startIndex));
    std::vector<std::optional<uint64_t>> wire_indices;
    wire_indices.reserve(indices.size());
    for (const auto& i : indices) {
        wire_indices.push_back(i.has_value() ? std::optional<uint64_t>(static_cast<uint64_t>(*i)) : std::nullopt);
    }
    return wire::WsdbFindPublicDataLeafIndicesResponse{ .indices = std::move(wire_indices) };
}

wire::WsdbFindNullifierLeafIndicesResponse handle_find_nullifier_leaf_indices(WsdbRequest& ctx,
                                                                              wire::WsdbFindNullifierLeafIndices&& cmd)
{
    std::vector<std::optional<index_t>> indices;
    ctx.world_state.find_leaf_indices<NullifierLeafValue>(revision_from_wire(cmd.revision),
                                                          MerkleTreeId::NULLIFIER_TREE,
                                                          nullifier_leaf_vec_from_wire(cmd.leaves),
                                                          indices,
                                                          static_cast<index_t>(cmd.startIndex));
    std::vector<std::optional<uint64_t>> wire_indices;
    wire_indices.reserve(indices.size());
    for (const auto& i : indices) {
        wire_indices.push_back(i.has_value() ? std::optional<uint64_t>(static_cast<uint64_t>(*i)) : std::nullopt);
    }
    return wire::WsdbFindNullifierLeafIndicesResponse{ .indices = std::move(wire_indices) };
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
        auto typed_leaves = fr_vec_from_wire(cmd.leaves);
        ctx.world_state.find_sibling_paths<bb::fr>(revision, tree_id, typed_leaves, paths);
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

wire::WsdbFindPublicDataSiblingPathsResponse handle_find_public_data_sibling_paths(
    WsdbRequest& ctx, wire::WsdbFindPublicDataSiblingPaths&& cmd)
{
    std::vector<std::optional<SiblingPathAndIndex>> paths;
    ctx.world_state.find_sibling_paths<PublicDataLeafValue>(revision_from_wire(cmd.revision),
                                                            MerkleTreeId::PUBLIC_DATA_TREE,
                                                            public_data_leaf_vec_from_wire(cmd.leaves),
                                                            paths);
    std::vector<std::optional<wire::SiblingPathAndIndex>> wire_paths;
    wire_paths.reserve(paths.size());
    for (const auto& p : paths) {
        wire_paths.push_back(p.has_value()
                                 ? std::optional<wire::SiblingPathAndIndex>(wire::SiblingPathAndIndex{
                                       .index = static_cast<uint64_t>(p->index), .path = fr_vec_to_wire(p->path) })
                                 : std::nullopt);
    }
    return wire::WsdbFindPublicDataSiblingPathsResponse{ .paths = std::move(wire_paths) };
}

wire::WsdbFindNullifierSiblingPathsResponse handle_find_nullifier_sibling_paths(
    WsdbRequest& ctx, wire::WsdbFindNullifierSiblingPaths&& cmd)
{
    std::vector<std::optional<SiblingPathAndIndex>> paths;
    ctx.world_state.find_sibling_paths<NullifierLeafValue>(revision_from_wire(cmd.revision),
                                                           MerkleTreeId::NULLIFIER_TREE,
                                                           nullifier_leaf_vec_from_wire(cmd.leaves),
                                                           paths);
    std::vector<std::optional<wire::SiblingPathAndIndex>> wire_paths;
    wire_paths.reserve(paths.size());
    for (const auto& p : paths) {
        wire_paths.push_back(p.has_value()
                                 ? std::optional<wire::SiblingPathAndIndex>(wire::SiblingPathAndIndex{
                                       .index = static_cast<uint64_t>(p->index), .path = fr_vec_to_wire(p->path) })
                                 : std::nullopt);
    }
    return wire::WsdbFindNullifierSiblingPathsResponse{ .paths = std::move(wire_paths) };
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
        ctx.world_state.append_leaves<bb::fr>(tree_id, fr_vec_from_wire(cmd.leaves), cmd.forkId);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type for append_leaves");
    }
    return wire::WsdbAppendLeavesResponse{};
}

wire::WsdbAppendPublicDataLeavesResponse handle_append_public_data_leaves(WsdbRequest& ctx,
                                                                          wire::WsdbAppendPublicDataLeaves&& cmd)
{
    ctx.world_state.append_leaves<PublicDataLeafValue>(
        MerkleTreeId::PUBLIC_DATA_TREE, public_data_leaf_vec_from_wire(cmd.leaves), cmd.forkId);
    return wire::WsdbAppendPublicDataLeavesResponse{};
}

wire::WsdbAppendNullifierLeavesResponse handle_append_nullifier_leaves(WsdbRequest& ctx,
                                                                       wire::WsdbAppendNullifierLeaves&& cmd)
{
    ctx.world_state.append_leaves<NullifierLeafValue>(
        MerkleTreeId::NULLIFIER_TREE, nullifier_leaf_vec_from_wire(cmd.leaves), cmd.forkId);
    return wire::WsdbAppendNullifierLeavesResponse{};
}

wire::WsdbBatchInsertPublicDataResponse handle_batch_insert_public_data(WsdbRequest& ctx,
                                                                        wire::WsdbBatchInsertPublicData&& cmd)
{
    auto result = ctx.world_state.batch_insert_indexed_leaves<PublicDataLeafValue>(
        MerkleTreeId::PUBLIC_DATA_TREE, public_data_leaf_vec_from_wire(cmd.leaves), cmd.subtreeDepth, cmd.forkId);
    return wire::WsdbBatchInsertPublicDataResponse{ .result = batch_public_data_to_wire(result) };
}

wire::WsdbBatchInsertNullifierResponse handle_batch_insert_nullifier(WsdbRequest& ctx,
                                                                     wire::WsdbBatchInsertNullifier&& cmd)
{
    auto result = ctx.world_state.batch_insert_indexed_leaves<NullifierLeafValue>(
        MerkleTreeId::NULLIFIER_TREE, nullifier_leaf_vec_from_wire(cmd.leaves), cmd.subtreeDepth, cmd.forkId);
    return wire::WsdbBatchInsertNullifierResponse{ .result = batch_nullifier_to_wire(result) };
}

wire::WsdbSequentialInsertPublicDataResponse handle_sequential_insert_public_data(
    WsdbRequest& ctx, wire::WsdbSequentialInsertPublicData&& cmd)
{
    auto result = ctx.world_state.insert_indexed_leaves<PublicDataLeafValue>(
        MerkleTreeId::PUBLIC_DATA_TREE, public_data_leaf_vec_from_wire(cmd.leaves), cmd.forkId);
    return wire::WsdbSequentialInsertPublicDataResponse{ .result = sequential_public_data_to_wire(result) };
}

wire::WsdbSequentialInsertNullifierResponse handle_sequential_insert_nullifier(
    WsdbRequest& ctx, wire::WsdbSequentialInsertNullifier&& cmd)
{
    auto result = ctx.world_state.insert_indexed_leaves<NullifierLeafValue>(
        MerkleTreeId::NULLIFIER_TREE, nullifier_leaf_vec_from_wire(cmd.leaves), cmd.forkId);
    return wire::WsdbSequentialInsertNullifierResponse{ .result = sequential_nullifier_to_wire(result) };
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
