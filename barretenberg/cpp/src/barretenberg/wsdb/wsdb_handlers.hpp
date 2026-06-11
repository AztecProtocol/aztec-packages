#pragma once
/**
 * @file wsdb_handlers.hpp
 * @brief Non-template handler declarations for the wsdb service.
 *
 * The codegen-emitted server (generated/wsdb_ipc_server.hpp) declares
 * template<Ctx> handle_<method>(Ctx&, wire::Cmd&&). The free-function
 * overloads below provide concrete definitions for `Ctx = WsdbRequest`
 * so that overload resolution prefers them at the template's instantiation
 * point inside make_wsdb_handler<WsdbRequest>(...).
 *
 * Definitions live in wsdb_handlers.cpp. This header keeps the
 * instantiation-time lookup honest.
 */
#include "barretenberg/wsdb/generated/wsdb_types.hpp"
#include "barretenberg/wsdb/wsdb_request.hpp"

namespace bb::wsdb {

wire::WsdbGetTreeInfoResponse handle_get_tree_info(WsdbRequest& ctx, wire::WsdbGetTreeInfo&& cmd);
wire::WsdbGetStateReferenceResponse handle_get_state_reference(WsdbRequest& ctx, wire::WsdbGetStateReference&& cmd);
wire::WsdbGetInitialStateReferenceResponse handle_get_initial_state_reference(WsdbRequest& ctx,
                                                                              wire::WsdbGetInitialStateReference&& cmd);
wire::WsdbGetLeafValueResponse handle_get_leaf_value(WsdbRequest& ctx, wire::WsdbGetLeafValue&& cmd);
wire::WsdbGetPublicDataLeafValueResponse handle_get_public_data_leaf_value(WsdbRequest& ctx,
                                                                           wire::WsdbGetPublicDataLeafValue&& cmd);
wire::WsdbGetNullifierLeafValueResponse handle_get_nullifier_leaf_value(WsdbRequest& ctx,
                                                                        wire::WsdbGetNullifierLeafValue&& cmd);
wire::WsdbGetPublicDataLeafPreimageResponse handle_get_public_data_leaf_preimage(
    WsdbRequest& ctx, wire::WsdbGetPublicDataLeafPreimage&& cmd);
wire::WsdbGetNullifierLeafPreimageResponse handle_get_nullifier_leaf_preimage(WsdbRequest& ctx,
                                                                              wire::WsdbGetNullifierLeafPreimage&& cmd);
wire::WsdbGetSiblingPathResponse handle_get_sibling_path(WsdbRequest& ctx, wire::WsdbGetSiblingPath&& cmd);
wire::WsdbGetBlockNumbersForLeafIndicesResponse handle_get_block_numbers_for_leaf_indices(
    WsdbRequest& ctx, wire::WsdbGetBlockNumbersForLeafIndices&& cmd);
wire::WsdbFindLeafIndicesResponse handle_find_leaf_indices(WsdbRequest& ctx, wire::WsdbFindLeafIndices&& cmd);
wire::WsdbFindPublicDataLeafIndicesResponse handle_find_public_data_leaf_indices(
    WsdbRequest& ctx, wire::WsdbFindPublicDataLeafIndices&& cmd);
wire::WsdbFindNullifierLeafIndicesResponse handle_find_nullifier_leaf_indices(WsdbRequest& ctx,
                                                                              wire::WsdbFindNullifierLeafIndices&& cmd);
wire::WsdbFindLowLeafResponse handle_find_low_leaf(WsdbRequest& ctx, wire::WsdbFindLowLeaf&& cmd);
wire::WsdbFindSiblingPathsResponse handle_find_sibling_paths(WsdbRequest& ctx, wire::WsdbFindSiblingPaths&& cmd);
wire::WsdbFindPublicDataSiblingPathsResponse handle_find_public_data_sibling_paths(
    WsdbRequest& ctx, wire::WsdbFindPublicDataSiblingPaths&& cmd);
wire::WsdbFindNullifierSiblingPathsResponse handle_find_nullifier_sibling_paths(
    WsdbRequest& ctx, wire::WsdbFindNullifierSiblingPaths&& cmd);
wire::WsdbAppendLeavesResponse handle_append_leaves(WsdbRequest& ctx, wire::WsdbAppendLeaves&& cmd);
wire::WsdbAppendPublicDataLeavesResponse handle_append_public_data_leaves(WsdbRequest& ctx,
                                                                          wire::WsdbAppendPublicDataLeaves&& cmd);
wire::WsdbAppendNullifierLeavesResponse handle_append_nullifier_leaves(WsdbRequest& ctx,
                                                                       wire::WsdbAppendNullifierLeaves&& cmd);
wire::WsdbBatchInsertPublicDataResponse handle_batch_insert_public_data(WsdbRequest& ctx,
                                                                        wire::WsdbBatchInsertPublicData&& cmd);
wire::WsdbBatchInsertNullifierResponse handle_batch_insert_nullifier(WsdbRequest& ctx,
                                                                     wire::WsdbBatchInsertNullifier&& cmd);
wire::WsdbSequentialInsertPublicDataResponse handle_sequential_insert_public_data(
    WsdbRequest& ctx, wire::WsdbSequentialInsertPublicData&& cmd);
wire::WsdbSequentialInsertNullifierResponse handle_sequential_insert_nullifier(
    WsdbRequest& ctx, wire::WsdbSequentialInsertNullifier&& cmd);
wire::WsdbUpdateArchiveResponse handle_update_archive(WsdbRequest& ctx, wire::WsdbUpdateArchive&& cmd);
wire::WsdbCommitResponse handle_commit(WsdbRequest& ctx, wire::WsdbCommit&& cmd);
wire::WsdbRollbackResponse handle_rollback(WsdbRequest& ctx, wire::WsdbRollback&& cmd);
wire::WsdbSyncBlockResponse handle_sync_block(WsdbRequest& ctx, wire::WsdbSyncBlock&& cmd);
wire::WsdbCreateForkResponse handle_create_fork(WsdbRequest& ctx, wire::WsdbCreateFork&& cmd);
wire::WsdbDeleteForkResponse handle_delete_fork(WsdbRequest& ctx, wire::WsdbDeleteFork&& cmd);
wire::WsdbFinalizeBlocksResponse handle_finalize_blocks(WsdbRequest& ctx, wire::WsdbFinalizeBlocks&& cmd);
wire::WsdbUnwindBlocksResponse handle_unwind_blocks(WsdbRequest& ctx, wire::WsdbUnwindBlocks&& cmd);
wire::WsdbRemoveHistoricalBlocksResponse handle_remove_historical_blocks(WsdbRequest& ctx,
                                                                         wire::WsdbRemoveHistoricalBlocks&& cmd);
wire::WsdbGetStatusResponse handle_get_status(WsdbRequest& ctx, wire::WsdbGetStatus&& cmd);
wire::WsdbCreateCheckpointResponse handle_create_checkpoint(WsdbRequest& ctx, wire::WsdbCreateCheckpoint&& cmd);
wire::WsdbCommitCheckpointResponse handle_commit_checkpoint(WsdbRequest& ctx, wire::WsdbCommitCheckpoint&& cmd);
wire::WsdbRevertCheckpointResponse handle_revert_checkpoint(WsdbRequest& ctx, wire::WsdbRevertCheckpoint&& cmd);
wire::WsdbCommitAllCheckpointsResponse handle_commit_all_checkpoints(WsdbRequest& ctx,
                                                                     wire::WsdbCommitAllCheckpoints&& cmd);
wire::WsdbRevertAllCheckpointsResponse handle_revert_all_checkpoints(WsdbRequest& ctx,
                                                                     wire::WsdbRevertAllCheckpoints&& cmd);
wire::WsdbCopyStoresResponse handle_copy_stores(WsdbRequest& ctx, wire::WsdbCopyStores&& cmd);

} // namespace bb::wsdb
