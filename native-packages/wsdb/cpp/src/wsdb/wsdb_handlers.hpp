#pragma once
/**
 * @file wsdb_handlers.hpp
 * @brief Non-template handler declarations for the wsdb service.
 *
 * The codegen-emitted dispatch (generated/wsdb_dispatch.hpp) declares
 * template<Ctx> void handle_<method>(Ctx&, wire::Cmd&&, Responder<wire::Resp>).
 * The free-function overloads below provide concrete definitions for
 * `Ctx = WsdbRequest` so overload resolution prefers them at the template's
 * instantiation point inside make_wsdb_handler<WsdbRequest>(...).
 *
 * Each handler is asynchronous: rather than returning a value it submits its
 * work to the per-fork scheduler (via schedule_read / schedule_write in
 * wsdb_schedule.hpp) and the response is produced by respond.ok()/error() when
 * the work completes. Definitions live in wsdb_handlers.cpp.
 */
#include "merkle_tree/tree_db_stats.hpp"
#include "wsdb/generated/wsdb_dispatch.hpp" // Responder
#include "wsdb/generated/wsdb_types.hpp"
#include "wsdb/wsdb_request.hpp"

namespace bb::wsdb {

void handle_get_tree_info(WsdbRequest& ctx,
                          wire::WsdbGetTreeInfo&& cmd,
                          Responder<wire::WsdbGetTreeInfoResponse> respond);
void handle_get_state_reference(WsdbRequest& ctx,
                                wire::WsdbGetStateReference&& cmd,
                                Responder<wire::WsdbGetStateReferenceResponse> respond);
void handle_get_initial_state_reference(WsdbRequest& ctx,
                                        wire::WsdbGetInitialStateReference&& cmd,
                                        Responder<wire::WsdbGetInitialStateReferenceResponse> respond);
void handle_get_leaf_value(WsdbRequest& ctx,
                           wire::WsdbGetLeafValue&& cmd,
                           Responder<wire::WsdbGetLeafValueResponse> respond);
void handle_get_public_data_leaf_value(WsdbRequest& ctx,
                                       wire::WsdbGetPublicDataLeafValue&& cmd,
                                       Responder<wire::WsdbGetPublicDataLeafValueResponse> respond);
void handle_get_nullifier_leaf_value(WsdbRequest& ctx,
                                     wire::WsdbGetNullifierLeafValue&& cmd,
                                     Responder<wire::WsdbGetNullifierLeafValueResponse> respond);
void handle_get_public_data_leaf_preimage(WsdbRequest& ctx,
                                          wire::WsdbGetPublicDataLeafPreimage&& cmd,
                                          Responder<wire::WsdbGetPublicDataLeafPreimageResponse> respond);
void handle_get_nullifier_leaf_preimage(WsdbRequest& ctx,
                                        wire::WsdbGetNullifierLeafPreimage&& cmd,
                                        Responder<wire::WsdbGetNullifierLeafPreimageResponse> respond);
void handle_get_sibling_path(WsdbRequest& ctx,
                             wire::WsdbGetSiblingPath&& cmd,
                             Responder<wire::WsdbGetSiblingPathResponse> respond);
void handle_get_block_numbers_for_leaf_indices(WsdbRequest& ctx,
                                               wire::WsdbGetBlockNumbersForLeafIndices&& cmd,
                                               Responder<wire::WsdbGetBlockNumbersForLeafIndicesResponse> respond);
void handle_find_leaf_indices(WsdbRequest& ctx,
                              wire::WsdbFindLeafIndices&& cmd,
                              Responder<wire::WsdbFindLeafIndicesResponse> respond);
void handle_find_public_data_leaf_indices(WsdbRequest& ctx,
                                          wire::WsdbFindPublicDataLeafIndices&& cmd,
                                          Responder<wire::WsdbFindPublicDataLeafIndicesResponse> respond);
void handle_find_nullifier_leaf_indices(WsdbRequest& ctx,
                                        wire::WsdbFindNullifierLeafIndices&& cmd,
                                        Responder<wire::WsdbFindNullifierLeafIndicesResponse> respond);
void handle_find_low_leaf(WsdbRequest& ctx,
                          wire::WsdbFindLowLeaf&& cmd,
                          Responder<wire::WsdbFindLowLeafResponse> respond);
void handle_find_sibling_paths(WsdbRequest& ctx,
                               wire::WsdbFindSiblingPaths&& cmd,
                               Responder<wire::WsdbFindSiblingPathsResponse> respond);
void handle_find_public_data_sibling_paths(WsdbRequest& ctx,
                                           wire::WsdbFindPublicDataSiblingPaths&& cmd,
                                           Responder<wire::WsdbFindPublicDataSiblingPathsResponse> respond);
void handle_find_nullifier_sibling_paths(WsdbRequest& ctx,
                                         wire::WsdbFindNullifierSiblingPaths&& cmd,
                                         Responder<wire::WsdbFindNullifierSiblingPathsResponse> respond);
void handle_append_leaves(WsdbRequest& ctx,
                          wire::WsdbAppendLeaves&& cmd,
                          Responder<wire::WsdbAppendLeavesResponse> respond);
void handle_append_public_data_leaves(WsdbRequest& ctx,
                                      wire::WsdbAppendPublicDataLeaves&& cmd,
                                      Responder<wire::WsdbAppendPublicDataLeavesResponse> respond);
void handle_append_nullifier_leaves(WsdbRequest& ctx,
                                    wire::WsdbAppendNullifierLeaves&& cmd,
                                    Responder<wire::WsdbAppendNullifierLeavesResponse> respond);
void handle_batch_insert_public_data(WsdbRequest& ctx,
                                     wire::WsdbBatchInsertPublicData&& cmd,
                                     Responder<wire::WsdbBatchInsertPublicDataResponse> respond);
void handle_batch_insert_nullifier(WsdbRequest& ctx,
                                   wire::WsdbBatchInsertNullifier&& cmd,
                                   Responder<wire::WsdbBatchInsertNullifierResponse> respond);
void handle_sequential_insert_public_data(WsdbRequest& ctx,
                                          wire::WsdbSequentialInsertPublicData&& cmd,
                                          Responder<wire::WsdbSequentialInsertPublicDataResponse> respond);
void handle_sequential_insert_nullifier(WsdbRequest& ctx,
                                        wire::WsdbSequentialInsertNullifier&& cmd,
                                        Responder<wire::WsdbSequentialInsertNullifierResponse> respond);
void handle_update_archive(WsdbRequest& ctx,
                           wire::WsdbUpdateArchive&& cmd,
                           Responder<wire::WsdbUpdateArchiveResponse> respond);
void handle_commit(WsdbRequest& ctx, wire::WsdbCommit&& cmd, Responder<wire::WsdbCommitResponse> respond);
void handle_rollback(WsdbRequest& ctx, wire::WsdbRollback&& cmd, Responder<wire::WsdbRollbackResponse> respond);
void handle_sync_block(WsdbRequest& ctx, wire::WsdbSyncBlock&& cmd, Responder<wire::WsdbSyncBlockResponse> respond);
void handle_create_fork(WsdbRequest& ctx, wire::WsdbCreateFork&& cmd, Responder<wire::WsdbCreateForkResponse> respond);
void handle_delete_fork(WsdbRequest& ctx, wire::WsdbDeleteFork&& cmd, Responder<wire::WsdbDeleteForkResponse> respond);
void handle_finalize_blocks(WsdbRequest& ctx,
                            wire::WsdbFinalizeBlocks&& cmd,
                            Responder<wire::WsdbFinalizeBlocksResponse> respond);
void handle_unwind_blocks(WsdbRequest& ctx,
                          wire::WsdbUnwindBlocks&& cmd,
                          Responder<wire::WsdbUnwindBlocksResponse> respond);
void handle_remove_historical_blocks(WsdbRequest& ctx,
                                     wire::WsdbRemoveHistoricalBlocks&& cmd,
                                     Responder<wire::WsdbRemoveHistoricalBlocksResponse> respond);
void handle_get_status(WsdbRequest& ctx, wire::WsdbGetStatus&& cmd, Responder<wire::WsdbGetStatusResponse> respond);
void handle_create_checkpoint(WsdbRequest& ctx,
                              wire::WsdbCreateCheckpoint&& cmd,
                              Responder<wire::WsdbCreateCheckpointResponse> respond);
void handle_commit_checkpoint(WsdbRequest& ctx,
                              wire::WsdbCommitCheckpoint&& cmd,
                              Responder<wire::WsdbCommitCheckpointResponse> respond);
void handle_revert_checkpoint(WsdbRequest& ctx,
                              wire::WsdbRevertCheckpoint&& cmd,
                              Responder<wire::WsdbRevertCheckpointResponse> respond);
void handle_commit_all_checkpoints(WsdbRequest& ctx,
                                   wire::WsdbCommitAllCheckpoints&& cmd,
                                   Responder<wire::WsdbCommitAllCheckpointsResponse> respond);
void handle_revert_all_checkpoints(WsdbRequest& ctx,
                                   wire::WsdbRevertAllCheckpoints&& cmd,
                                   Responder<wire::WsdbRevertAllCheckpointsResponse> respond);
void handle_copy_stores(WsdbRequest& ctx, wire::WsdbCopyStores&& cmd, Responder<wire::WsdbCopyStoresResponse> respond);

} // namespace bb::wsdb
