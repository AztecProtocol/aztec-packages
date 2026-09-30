#pragma once
/**
 * @file wsdb_ref_handlers.hpp
 * @brief The wsdb base contract (wsdb_base_schema.jsonc) served by the in-memory reference world state.
 *
 * The generated dispatch (generated/wsdb_dispatch.hpp) declares template<Ctx> handle_<command>; the
 * overloads below, for Ctx = WsdbRefContext, are preferred at its instantiation in
 * make_wsdb_handler<WsdbRefContext>. Every handler answers synchronously. A request the reference cannot
 * serve (another fork, a historical block, an unsupported tree, a duplicate nullifier) is answered with
 * an error, never an exception, so a wasm build (no exceptions) keeps running after it.
 */
#include "barretenberg/world_state_reference/reference_world_state.hpp"
#include "barretenberg/wsdb_ref/generated/wsdb_dispatch.hpp"
#include "barretenberg/wsdb_ref/generated/wsdb_types.hpp"

namespace bb::wsdb_ref {

/** @brief The state a wsdb-ref service runs over: one reference world state at the canonical genesis. */
struct WsdbRefContext {
    world_state::ReferenceWorldState world_state;
};

void handle_get_tree_info(WsdbRefContext& ctx,
                          wire::WsdbGetTreeInfo&& cmd,
                          Responder<wire::WsdbGetTreeInfoResponse> respond);
void handle_get_state_reference(WsdbRefContext& ctx,
                                wire::WsdbGetStateReference&& cmd,
                                Responder<wire::WsdbGetStateReferenceResponse> respond);
void handle_get_initial_state_reference(WsdbRefContext& ctx,
                                        wire::WsdbGetInitialStateReference&& cmd,
                                        Responder<wire::WsdbGetInitialStateReferenceResponse> respond);
void handle_get_leaf_value(WsdbRefContext& ctx,
                           wire::WsdbGetLeafValue&& cmd,
                           Responder<wire::WsdbGetLeafValueResponse> respond);
void handle_get_public_data_leaf_value(WsdbRefContext& ctx,
                                       wire::WsdbGetPublicDataLeafValue&& cmd,
                                       Responder<wire::WsdbGetPublicDataLeafValueResponse> respond);
void handle_get_nullifier_leaf_value(WsdbRefContext& ctx,
                                     wire::WsdbGetNullifierLeafValue&& cmd,
                                     Responder<wire::WsdbGetNullifierLeafValueResponse> respond);
void handle_get_public_data_leaf_preimage(WsdbRefContext& ctx,
                                          wire::WsdbGetPublicDataLeafPreimage&& cmd,
                                          Responder<wire::WsdbGetPublicDataLeafPreimageResponse> respond);
void handle_get_nullifier_leaf_preimage(WsdbRefContext& ctx,
                                        wire::WsdbGetNullifierLeafPreimage&& cmd,
                                        Responder<wire::WsdbGetNullifierLeafPreimageResponse> respond);
void handle_get_sibling_path(WsdbRefContext& ctx,
                             wire::WsdbGetSiblingPath&& cmd,
                             Responder<wire::WsdbGetSiblingPathResponse> respond);
void handle_find_leaf_indices(WsdbRefContext& ctx,
                              wire::WsdbFindLeafIndices&& cmd,
                              Responder<wire::WsdbFindLeafIndicesResponse> respond);
void handle_find_public_data_leaf_indices(WsdbRefContext& ctx,
                                          wire::WsdbFindPublicDataLeafIndices&& cmd,
                                          Responder<wire::WsdbFindPublicDataLeafIndicesResponse> respond);
void handle_find_nullifier_leaf_indices(WsdbRefContext& ctx,
                                        wire::WsdbFindNullifierLeafIndices&& cmd,
                                        Responder<wire::WsdbFindNullifierLeafIndicesResponse> respond);
void handle_find_low_leaf(WsdbRefContext& ctx,
                          wire::WsdbFindLowLeaf&& cmd,
                          Responder<wire::WsdbFindLowLeafResponse> respond);
void handle_append_leaves(WsdbRefContext& ctx,
                          wire::WsdbAppendLeaves&& cmd,
                          Responder<wire::WsdbAppendLeavesResponse> respond);
void handle_sequential_insert_public_data(WsdbRefContext& ctx,
                                          wire::WsdbSequentialInsertPublicData&& cmd,
                                          Responder<wire::WsdbSequentialInsertPublicDataResponse> respond);
void handle_sequential_insert_nullifier(WsdbRefContext& ctx,
                                        wire::WsdbSequentialInsertNullifier&& cmd,
                                        Responder<wire::WsdbSequentialInsertNullifierResponse> respond);
void handle_update_archive(WsdbRefContext& ctx,
                           wire::WsdbUpdateArchive&& cmd,
                           Responder<wire::WsdbUpdateArchiveResponse> respond);
void handle_create_checkpoint(WsdbRefContext& ctx,
                              wire::WsdbCreateCheckpoint&& cmd,
                              Responder<wire::WsdbCreateCheckpointResponse> respond);
void handle_commit_checkpoint(WsdbRefContext& ctx,
                              wire::WsdbCommitCheckpoint&& cmd,
                              Responder<wire::WsdbCommitCheckpointResponse> respond);
void handle_revert_checkpoint(WsdbRefContext& ctx,
                              wire::WsdbRevertCheckpoint&& cmd,
                              Responder<wire::WsdbRevertCheckpointResponse> respond);
void handle_commit_all_checkpoints(WsdbRefContext& ctx,
                                   wire::WsdbCommitAllCheckpoints&& cmd,
                                   Responder<wire::WsdbCommitAllCheckpointsResponse> respond);
void handle_revert_all_checkpoints(WsdbRefContext& ctx,
                                   wire::WsdbRevertAllCheckpoints&& cmd,
                                   Responder<wire::WsdbRevertAllCheckpointsResponse> respond);

} // namespace bb::wsdb_ref
