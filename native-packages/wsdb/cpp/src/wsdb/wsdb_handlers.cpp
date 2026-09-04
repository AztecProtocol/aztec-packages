/**
 * @file wsdb_handlers.cpp
 * @brief Per-command handlers consumed by the codegen-emitted server dispatch.
 *
 * Each handler matches the signature declared by generated/wsdb_dispatch.hpp but
 * as a non-template overload for `WsdbRequest` so the codegen's
 * `make_wsdb_handler<WsdbRequest>` instantiation resolves to these definitions
 * via overload resolution (preferred over the unspecialized template).
 *
 * Handlers are asynchronous: each declares its own ordering by calling
 * schedule_read (concurrent; committed reads bypass ordering) or schedule_write
 * (exclusive on its fork), passing the fork it touches and a lambda that does
 * the work and returns the typed response. The helper runs that lambda on the
 * scheduler (inline when idle, else a pool thread) and turns the return value
 * into respond.ok(...) or a thrown exception into respond.error(...). Wire <->
 * domain conversion happens inside the lambda via wsdb_wire_convert.hpp.
 */
#include "wsdb/wsdb_handlers.hpp"
#include "merkle_tree/indexed_leaf.hpp"
#include "merkle_tree/response.hpp"
#include "merkle_tree/tree_db_stats.hpp"
#include "world_state/world_state.hpp"
#include "wsdb/wsdb_schedule.hpp"
#include "wsdb/wsdb_wire_convert.hpp"

#include <optional>
#include <stdexcept>

namespace azteclabs::wsdb {

using namespace azteclabs::wsdb::world_state;
using namespace azteclabs::wsdb::merkle_tree;

// ---------------------------------------------------------------------------
// Tree info / state queries
// ---------------------------------------------------------------------------

void handle_get_tree_info(WsdbRequest& ctx,
                          wire::WsdbGetTreeInfo&& cmd,
                          Responder<wire::WsdbGetTreeInfoResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbGetTreeInfoResponse {
                      auto info = ctx.world_state.get_tree_info(revision_from_wire(cmd.revision),
                                                                tree_id_from_wire(cmd.treeId));
                      return wire::WsdbGetTreeInfoResponse{
                          .treeId = cmd.treeId,
                          .root = fr_to_wire(info.meta.root),
                          .size = info.meta.size,
                          .depth = info.meta.depth,
                      };
                  });
}

void handle_get_state_reference(WsdbRequest& ctx,
                                wire::WsdbGetStateReference&& cmd,
                                Responder<wire::WsdbGetStateReferenceResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbGetStateReferenceResponse {
                      auto state = ctx.world_state.get_state_reference(revision_from_wire(cmd.revision));
                      return wire::WsdbGetStateReferenceResponse{ .state = state_reference_to_wire(state) };
                  });
}

void handle_get_initial_state_reference(WsdbRequest& ctx,
                                        wire::WsdbGetInitialStateReference&& /*cmd*/,
                                        Responder<wire::WsdbGetInitialStateReferenceResponse> respond)
{
    // No revision: reads the canonical initial state. Ordered against fork 0
    // (matches the historical client contract of committedOnly=false).
    schedule_read(ctx, 0, false, std::move(respond), [&ctx]() -> wire::WsdbGetInitialStateReferenceResponse {
        auto state = ctx.world_state.get_initial_state_reference();
        return wire::WsdbGetInitialStateReferenceResponse{ .state = state_reference_to_wire(state) };
    });
}

// ---------------------------------------------------------------------------
// Leaf queries
// ---------------------------------------------------------------------------

void handle_get_leaf_value(WsdbRequest& ctx,
                           wire::WsdbGetLeafValue&& cmd,
                           Responder<wire::WsdbGetLeafValueResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbGetLeafValueResponse {
                      auto revision = revision_from_wire(cmd.revision);
                      auto tree_id = tree_id_from_wire(cmd.treeId);
                      auto leaf_index = static_cast<index_t>(cmd.leafIndex);

                      switch (tree_id) {
                      case world_state::MerkleTreeId::NOTE_HASH_TREE:
                      case world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
                      case world_state::MerkleTreeId::ARCHIVE: {
                          auto leaf = ctx.world_state.get_leaf<azteclabs::wsdb::fr>(revision, tree_id, leaf_index);
                          return wire::WsdbGetLeafValueResponse{
                              .value = leaf.has_value() ? std::optional<wire::Fr>(fr_to_wire(*leaf)) : std::nullopt
                          };
                      }
                      default:
                          throw std::runtime_error("Unsupported tree type for get_leaf_value");
                      }
                  });
}

void handle_get_public_data_leaf_value(WsdbRequest& ctx,
                                       wire::WsdbGetPublicDataLeafValue&& cmd,
                                       Responder<wire::WsdbGetPublicDataLeafValueResponse> respond)
{
    schedule_read(
        ctx,
        cmd.revision.forkId,
        !cmd.revision.includeUncommitted,
        std::move(respond),
        [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbGetPublicDataLeafValueResponse {
            auto leaf = ctx.world_state.get_leaf<PublicDataLeafValue>(revision_from_wire(cmd.revision),
                                                                      world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                                      static_cast<index_t>(cmd.leafIndex));
            return wire::WsdbGetPublicDataLeafValueResponse{
                .value = leaf.has_value() ? std::optional<wire::PublicDataLeafValue>(public_data_leaf_to_wire(*leaf))
                                          : std::nullopt
            };
        });
}

void handle_get_nullifier_leaf_value(WsdbRequest& ctx,
                                     wire::WsdbGetNullifierLeafValue&& cmd,
                                     Responder<wire::WsdbGetNullifierLeafValueResponse> respond)
{
    schedule_read(
        ctx,
        cmd.revision.forkId,
        !cmd.revision.includeUncommitted,
        std::move(respond),
        [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbGetNullifierLeafValueResponse {
            auto leaf = ctx.world_state.get_leaf<NullifierLeafValue>(revision_from_wire(cmd.revision),
                                                                     world_state::MerkleTreeId::NULLIFIER_TREE,
                                                                     static_cast<index_t>(cmd.leafIndex));
            return wire::WsdbGetNullifierLeafValueResponse{
                .value = leaf.has_value() ? std::optional<wire::NullifierLeafValue>(nullifier_leaf_to_wire(*leaf))
                                          : std::nullopt
            };
        });
}

void handle_get_public_data_leaf_preimage(WsdbRequest& ctx,
                                          wire::WsdbGetPublicDataLeafPreimage&& cmd,
                                          Responder<wire::WsdbGetPublicDataLeafPreimageResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbGetPublicDataLeafPreimageResponse {
                      auto leaf = ctx.world_state.get_indexed_leaf<PublicDataLeafValue>(
                          revision_from_wire(cmd.revision),
                          world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                          static_cast<index_t>(cmd.leafIndex));
                      return wire::WsdbGetPublicDataLeafPreimageResponse{
                          .preimage = leaf.has_value() ? std::optional<wire::IndexedPublicDataLeafValue>(
                                                             indexed_public_data_leaf_to_wire(*leaf))
                                                       : std::nullopt
                      };
                  });
}

void handle_get_nullifier_leaf_preimage(WsdbRequest& ctx,
                                        wire::WsdbGetNullifierLeafPreimage&& cmd,
                                        Responder<wire::WsdbGetNullifierLeafPreimageResponse> respond)
{
    schedule_read(
        ctx,
        cmd.revision.forkId,
        !cmd.revision.includeUncommitted,
        std::move(respond),
        [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbGetNullifierLeafPreimageResponse {
            auto leaf = ctx.world_state.get_indexed_leaf<NullifierLeafValue>(revision_from_wire(cmd.revision),
                                                                             world_state::MerkleTreeId::NULLIFIER_TREE,
                                                                             static_cast<index_t>(cmd.leafIndex));
            return wire::WsdbGetNullifierLeafPreimageResponse{
                .preimage = leaf.has_value()
                                ? std::optional<wire::IndexedNullifierLeafValue>(indexed_nullifier_leaf_to_wire(*leaf))
                                : std::nullopt
            };
        });
}

void handle_get_sibling_path(WsdbRequest& ctx,
                             wire::WsdbGetSiblingPath&& cmd,
                             Responder<wire::WsdbGetSiblingPathResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbGetSiblingPathResponse {
                      fr_sibling_path path = ctx.world_state.get_sibling_path(revision_from_wire(cmd.revision),
                                                                              tree_id_from_wire(cmd.treeId),
                                                                              static_cast<index_t>(cmd.leafIndex));
                      return wire::WsdbGetSiblingPathResponse{ .path = fr_vec_to_wire(path) };
                  });
}

void handle_get_block_numbers_for_leaf_indices(WsdbRequest& ctx,
                                               wire::WsdbGetBlockNumbersForLeafIndices&& cmd,
                                               Responder<wire::WsdbGetBlockNumbersForLeafIndicesResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbGetBlockNumbersForLeafIndicesResponse {
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
                      return wire::WsdbGetBlockNumbersForLeafIndicesResponse{ .blockNumbers =
                                                                                  std::move(wire_block_numbers) };
                  });
}

// ---------------------------------------------------------------------------
// Leaf search operations
// ---------------------------------------------------------------------------

void handle_find_leaf_indices(WsdbRequest& ctx,
                              wire::WsdbFindLeafIndices&& cmd,
                              Responder<wire::WsdbFindLeafIndicesResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbFindLeafIndicesResponse {
                      auto revision = revision_from_wire(cmd.revision);
                      auto tree_id = tree_id_from_wire(cmd.treeId);
                      auto start_index = static_cast<index_t>(cmd.startIndex);

                      std::vector<std::optional<index_t>> indices;
                      switch (tree_id) {
                      case world_state::MerkleTreeId::NOTE_HASH_TREE:
                      case world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
                      case world_state::MerkleTreeId::ARCHIVE: {
                          auto typed_leaves = fr_vec_from_wire(cmd.leaves);
                          ctx.world_state.find_leaf_indices<azteclabs::wsdb::fr>(
                              revision, tree_id, typed_leaves, indices, start_index);
                          break;
                      }
                      default:
                          throw std::runtime_error("Unsupported tree type for find_leaf_indices");
                      }
                      std::vector<std::optional<uint64_t>> wire_indices;
                      wire_indices.reserve(indices.size());
                      for (const auto& i : indices) {
                          wire_indices.push_back(i.has_value() ? std::optional<uint64_t>(static_cast<uint64_t>(*i))
                                                               : std::nullopt);
                      }
                      return wire::WsdbFindLeafIndicesResponse{ .indices = std::move(wire_indices) };
                  });
}

void handle_find_public_data_leaf_indices(WsdbRequest& ctx,
                                          wire::WsdbFindPublicDataLeafIndices&& cmd,
                                          Responder<wire::WsdbFindPublicDataLeafIndicesResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbFindPublicDataLeafIndicesResponse {
                      std::vector<std::optional<index_t>> indices;
                      ctx.world_state.find_leaf_indices<PublicDataLeafValue>(
                          revision_from_wire(cmd.revision),
                          world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                          public_data_leaf_vec_from_wire(cmd.leaves),
                          indices,
                          static_cast<index_t>(cmd.startIndex));
                      std::vector<std::optional<uint64_t>> wire_indices;
                      wire_indices.reserve(indices.size());
                      for (const auto& i : indices) {
                          wire_indices.push_back(i.has_value() ? std::optional<uint64_t>(static_cast<uint64_t>(*i))
                                                               : std::nullopt);
                      }
                      return wire::WsdbFindPublicDataLeafIndicesResponse{ .indices = std::move(wire_indices) };
                  });
}

void handle_find_nullifier_leaf_indices(WsdbRequest& ctx,
                                        wire::WsdbFindNullifierLeafIndices&& cmd,
                                        Responder<wire::WsdbFindNullifierLeafIndicesResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbFindNullifierLeafIndicesResponse {
                      std::vector<std::optional<index_t>> indices;
                      ctx.world_state.find_leaf_indices<NullifierLeafValue>(revision_from_wire(cmd.revision),
                                                                            world_state::MerkleTreeId::NULLIFIER_TREE,
                                                                            nullifier_leaf_vec_from_wire(cmd.leaves),
                                                                            indices,
                                                                            static_cast<index_t>(cmd.startIndex));
                      std::vector<std::optional<uint64_t>> wire_indices;
                      wire_indices.reserve(indices.size());
                      for (const auto& i : indices) {
                          wire_indices.push_back(i.has_value() ? std::optional<uint64_t>(static_cast<uint64_t>(*i))
                                                               : std::nullopt);
                      }
                      return wire::WsdbFindNullifierLeafIndicesResponse{ .indices = std::move(wire_indices) };
                  });
}

void handle_find_low_leaf(WsdbRequest& ctx,
                          wire::WsdbFindLowLeaf&& cmd,
                          Responder<wire::WsdbFindLowLeafResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbFindLowLeafResponse {
                      auto low_leaf_info = ctx.world_state.find_low_leaf_index(
                          revision_from_wire(cmd.revision), tree_id_from_wire(cmd.treeId), fr_from_wire(cmd.key));
                      return wire::WsdbFindLowLeafResponse{
                          .alreadyPresent = low_leaf_info.is_already_present,
                          .index = static_cast<uint64_t>(low_leaf_info.index),
                      };
                  });
}

void handle_find_sibling_paths(WsdbRequest& ctx,
                               wire::WsdbFindSiblingPaths&& cmd,
                               Responder<wire::WsdbFindSiblingPathsResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbFindSiblingPathsResponse {
                      auto revision = revision_from_wire(cmd.revision);
                      auto tree_id = tree_id_from_wire(cmd.treeId);
                      std::vector<std::optional<SiblingPathAndIndex>> paths;
                      switch (tree_id) {
                      case world_state::MerkleTreeId::NOTE_HASH_TREE:
                      case world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
                      case world_state::MerkleTreeId::ARCHIVE: {
                          auto typed_leaves = fr_vec_from_wire(cmd.leaves);
                          ctx.world_state.find_sibling_paths<azteclabs::wsdb::fr>(
                              revision, tree_id, typed_leaves, paths);
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
                  });
}

void handle_find_public_data_sibling_paths(WsdbRequest& ctx,
                                           wire::WsdbFindPublicDataSiblingPaths&& cmd,
                                           Responder<wire::WsdbFindPublicDataSiblingPathsResponse> respond)
{
    schedule_read(
        ctx,
        cmd.revision.forkId,
        !cmd.revision.includeUncommitted,
        std::move(respond),
        [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbFindPublicDataSiblingPathsResponse {
            std::vector<std::optional<SiblingPathAndIndex>> paths;
            ctx.world_state.find_sibling_paths<PublicDataLeafValue>(revision_from_wire(cmd.revision),
                                                                    world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                                    public_data_leaf_vec_from_wire(cmd.leaves),
                                                                    paths);
            std::vector<std::optional<wire::SiblingPathAndIndex>> wire_paths;
            wire_paths.reserve(paths.size());
            for (const auto& p : paths) {
                wire_paths.push_back(
                    p.has_value() ? std::optional<wire::SiblingPathAndIndex>(wire::SiblingPathAndIndex{
                                        .index = static_cast<uint64_t>(p->index), .path = fr_vec_to_wire(p->path) })
                                  : std::nullopt);
            }
            return wire::WsdbFindPublicDataSiblingPathsResponse{ .paths = std::move(wire_paths) };
        });
}

void handle_find_nullifier_sibling_paths(WsdbRequest& ctx,
                                         wire::WsdbFindNullifierSiblingPaths&& cmd,
                                         Responder<wire::WsdbFindNullifierSiblingPathsResponse> respond)
{
    schedule_read(ctx,
                  cmd.revision.forkId,
                  !cmd.revision.includeUncommitted,
                  std::move(respond),
                  [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbFindNullifierSiblingPathsResponse {
                      std::vector<std::optional<SiblingPathAndIndex>> paths;
                      ctx.world_state.find_sibling_paths<NullifierLeafValue>(revision_from_wire(cmd.revision),
                                                                             world_state::MerkleTreeId::NULLIFIER_TREE,
                                                                             nullifier_leaf_vec_from_wire(cmd.leaves),
                                                                             paths);
                      std::vector<std::optional<wire::SiblingPathAndIndex>> wire_paths;
                      wire_paths.reserve(paths.size());
                      for (const auto& p : paths) {
                          wire_paths.push_back(
                              p.has_value()
                                  ? std::optional<wire::SiblingPathAndIndex>(wire::SiblingPathAndIndex{
                                        .index = static_cast<uint64_t>(p->index), .path = fr_vec_to_wire(p->path) })
                                  : std::nullopt);
                      }
                      return wire::WsdbFindNullifierSiblingPathsResponse{ .paths = std::move(wire_paths) };
                  });
}

// ---------------------------------------------------------------------------
// Tree mutation operations
// ---------------------------------------------------------------------------

void handle_append_leaves(WsdbRequest& ctx,
                          wire::WsdbAppendLeaves&& cmd,
                          Responder<wire::WsdbAppendLeavesResponse> respond)
{
    schedule_write(
        ctx, cmd.forkId, std::move(respond), [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbAppendLeavesResponse {
            auto tree_id = tree_id_from_wire(cmd.treeId);
            switch (tree_id) {
            case world_state::MerkleTreeId::NOTE_HASH_TREE:
            case world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
            case world_state::MerkleTreeId::ARCHIVE: {
                ctx.world_state.append_leaves<azteclabs::wsdb::fr>(tree_id, fr_vec_from_wire(cmd.leaves), cmd.forkId);
                break;
            }
            default:
                throw std::runtime_error("Unsupported tree type for append_leaves");
            }
            return wire::WsdbAppendLeavesResponse{};
        });
}

void handle_append_public_data_leaves(WsdbRequest& ctx,
                                      wire::WsdbAppendPublicDataLeaves&& cmd,
                                      Responder<wire::WsdbAppendPublicDataLeavesResponse> respond)
{
    schedule_write(ctx,
                   cmd.forkId,
                   std::move(respond),
                   [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbAppendPublicDataLeavesResponse {
                       ctx.world_state.append_leaves<PublicDataLeafValue>(world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                                                                          public_data_leaf_vec_from_wire(cmd.leaves),
                                                                          cmd.forkId);
                       return wire::WsdbAppendPublicDataLeavesResponse{};
                   });
}

void handle_append_nullifier_leaves(WsdbRequest& ctx,
                                    wire::WsdbAppendNullifierLeaves&& cmd,
                                    Responder<wire::WsdbAppendNullifierLeavesResponse> respond)
{
    schedule_write(ctx,
                   cmd.forkId,
                   std::move(respond),
                   [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbAppendNullifierLeavesResponse {
                       ctx.world_state.append_leaves<NullifierLeafValue>(world_state::MerkleTreeId::NULLIFIER_TREE,
                                                                         nullifier_leaf_vec_from_wire(cmd.leaves),
                                                                         cmd.forkId);
                       return wire::WsdbAppendNullifierLeavesResponse{};
                   });
}

void handle_batch_insert_public_data(WsdbRequest& ctx,
                                     wire::WsdbBatchInsertPublicData&& cmd,
                                     Responder<wire::WsdbBatchInsertPublicDataResponse> respond)
{
    schedule_write(ctx,
                   cmd.forkId,
                   std::move(respond),
                   [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbBatchInsertPublicDataResponse {
                       auto result = ctx.world_state.batch_insert_indexed_leaves<PublicDataLeafValue>(
                           world_state::MerkleTreeId::PUBLIC_DATA_TREE,
                           public_data_leaf_vec_from_wire(cmd.leaves),
                           cmd.subtreeDepth,
                           cmd.forkId);
                       return wire::WsdbBatchInsertPublicDataResponse{ .result = batch_public_data_to_wire(result) };
                   });
}

void handle_batch_insert_nullifier(WsdbRequest& ctx,
                                   wire::WsdbBatchInsertNullifier&& cmd,
                                   Responder<wire::WsdbBatchInsertNullifierResponse> respond)
{
    schedule_write(ctx,
                   cmd.forkId,
                   std::move(respond),
                   [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbBatchInsertNullifierResponse {
                       auto result = ctx.world_state.batch_insert_indexed_leaves<NullifierLeafValue>(
                           world_state::MerkleTreeId::NULLIFIER_TREE,
                           nullifier_leaf_vec_from_wire(cmd.leaves),
                           cmd.subtreeDepth,
                           cmd.forkId);
                       return wire::WsdbBatchInsertNullifierResponse{ .result = batch_nullifier_to_wire(result) };
                   });
}

void handle_sequential_insert_public_data(WsdbRequest& ctx,
                                          wire::WsdbSequentialInsertPublicData&& cmd,
                                          Responder<wire::WsdbSequentialInsertPublicDataResponse> respond)
{
    schedule_write(
        ctx,
        cmd.forkId,
        std::move(respond),
        [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbSequentialInsertPublicDataResponse {
            auto result = ctx.world_state.insert_indexed_leaves<PublicDataLeafValue>(
                world_state::MerkleTreeId::PUBLIC_DATA_TREE, public_data_leaf_vec_from_wire(cmd.leaves), cmd.forkId);
            return wire::WsdbSequentialInsertPublicDataResponse{ .result = sequential_public_data_to_wire(result) };
        });
}

void handle_sequential_insert_nullifier(WsdbRequest& ctx,
                                        wire::WsdbSequentialInsertNullifier&& cmd,
                                        Responder<wire::WsdbSequentialInsertNullifierResponse> respond)
{
    schedule_write(
        ctx,
        cmd.forkId,
        std::move(respond),
        [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbSequentialInsertNullifierResponse {
            auto result = ctx.world_state.insert_indexed_leaves<NullifierLeafValue>(
                world_state::MerkleTreeId::NULLIFIER_TREE, nullifier_leaf_vec_from_wire(cmd.leaves), cmd.forkId);
            return wire::WsdbSequentialInsertNullifierResponse{ .result = sequential_nullifier_to_wire(result) };
        });
}

void handle_update_archive(WsdbRequest& ctx,
                           wire::WsdbUpdateArchive&& cmd,
                           Responder<wire::WsdbUpdateArchiveResponse> respond)
{
    schedule_write(
        ctx, cmd.forkId, std::move(respond), [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbUpdateArchiveResponse {
            ctx.world_state.update_archive(state_reference_from_wire(cmd.blockStateRef),
                                           block_header_hash_from_wire(cmd.blockHeaderHash),
                                           cmd.forkId);
            return wire::WsdbUpdateArchiveResponse{};
        });
}

// ---------------------------------------------------------------------------
// Transaction operations (canonical state — fork 0)
// ---------------------------------------------------------------------------

void handle_commit(WsdbRequest& ctx, wire::WsdbCommit&& /*cmd*/, Responder<wire::WsdbCommitResponse> respond)
{
    schedule_write(ctx, 0, std::move(respond), [&ctx]() -> wire::WsdbCommitResponse {
        WorldStateStatusFull status;
        ctx.world_state.commit(status);
        return wire::WsdbCommitResponse{ .status = world_state_status_full_to_wire(status) };
    });
}

void handle_rollback(WsdbRequest& ctx, wire::WsdbRollback&& /*cmd*/, Responder<wire::WsdbRollbackResponse> respond)
{
    schedule_write(ctx, 0, std::move(respond), [&ctx]() -> wire::WsdbRollbackResponse {
        ctx.world_state.rollback();
        return wire::WsdbRollbackResponse{};
    });
}

// ---------------------------------------------------------------------------
// Block synchronization (canonical state — fork 0)
// ---------------------------------------------------------------------------

void handle_sync_block(WsdbRequest& ctx, wire::WsdbSyncBlock&& cmd, Responder<wire::WsdbSyncBlockResponse> respond)
{
    schedule_write(ctx, 0, std::move(respond), [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbSyncBlockResponse {
        auto block_state_ref = state_reference_from_wire(cmd.blockStateRef);
        auto block_header_hash = block_header_hash_from_wire(cmd.blockHeaderHash);
        auto padded_note_hashes = fr_vec_from_wire(cmd.paddedNoteHashes);
        auto padded_l1_to_l2_messages = fr_vec_from_wire(cmd.paddedL1ToL2Messages);

        std::vector<NullifierLeafValue> padded_nullifiers;
        padded_nullifiers.reserve(cmd.paddedNullifiers.size());
        for (const auto& w : cmd.paddedNullifiers) {
            padded_nullifiers.emplace_back(nullifier_from_wire(w.nullifier));
        }

        std::vector<PublicDataLeafValue> public_data_writes;
        public_data_writes.reserve(cmd.publicDataWrites.size());
        for (const auto& w : cmd.publicDataWrites) {
            public_data_writes.emplace_back(public_data_slot_from_wire(w.slot), public_data_value_from_wire(w.value));
        }

        // The canonical archive roots from the block being synced; sync_block verifies the local archive root
        // against them and rejects a divergent tree before committing.
        std::optional<azteclabs::wsdb::fr> expected_archive_root;
        if (cmd.expectedArchiveRoot.has_value()) {
            expected_archive_root = fr_from_wire(cmd.expectedArchiveRoot.value());
        }
        std::optional<azteclabs::wsdb::fr> expected_previous_archive_root;
        if (cmd.expectedPreviousArchiveRoot.has_value()) {
            expected_previous_archive_root = fr_from_wire(cmd.expectedPreviousArchiveRoot.value());
        }

        WorldStateStatusFull status = ctx.world_state.sync_block(block_state_ref,
                                                                 block_header_hash,
                                                                 padded_note_hashes,
                                                                 padded_l1_to_l2_messages,
                                                                 padded_nullifiers,
                                                                 public_data_writes,
                                                                 expected_archive_root,
                                                                 expected_previous_archive_root);
        return wire::WsdbSyncBlockResponse{ .status = world_state_status_full_to_wire(status) };
    });
}

// ---------------------------------------------------------------------------
// Fork management
// ---------------------------------------------------------------------------

void handle_create_fork(WsdbRequest& ctx, wire::WsdbCreateFork&& cmd, Responder<wire::WsdbCreateForkResponse> respond)
{
    // Allocating a fork mutates shared fork state; serialize against fork 0.
    schedule_write(ctx, 0, std::move(respond), [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbCreateForkResponse {
        std::optional<block_number_t> block =
            cmd.latest ? std::nullopt : std::optional<block_number_t>(cmd.blockNumber);
        uint64_t id = ctx.world_state.create_fork(block);
        return wire::WsdbCreateForkResponse{ .forkId = id };
    });
}

void handle_delete_fork(WsdbRequest& ctx, wire::WsdbDeleteFork&& cmd, Responder<wire::WsdbDeleteForkResponse> respond)
{
    schedule_write(
        ctx, cmd.forkId, std::move(respond), [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbDeleteForkResponse {
            ctx.world_state.delete_fork(cmd.forkId);
            return wire::WsdbDeleteForkResponse{};
        });
}

// ---------------------------------------------------------------------------
// Block management (canonical state — fork 0)
// ---------------------------------------------------------------------------

void handle_finalize_blocks(WsdbRequest& ctx,
                            wire::WsdbFinalizeBlocks&& cmd,
                            Responder<wire::WsdbFinalizeBlocksResponse> respond)
{
    schedule_write(
        ctx, 0, std::move(respond), [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbFinalizeBlocksResponse {
            WorldStateStatusSummary status = ctx.world_state.set_finalized_blocks(cmd.toBlockNumber);
            return wire::WsdbFinalizeBlocksResponse{ .status = world_state_status_summary_to_wire(status) };
        });
}

void handle_unwind_blocks(WsdbRequest& ctx,
                          wire::WsdbUnwindBlocks&& cmd,
                          Responder<wire::WsdbUnwindBlocksResponse> respond)
{
    schedule_write(
        ctx, 0, std::move(respond), [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbUnwindBlocksResponse {
            WorldStateStatusFull status = ctx.world_state.unwind_blocks(cmd.toBlockNumber);
            return wire::WsdbUnwindBlocksResponse{ .status = world_state_status_full_to_wire(status) };
        });
}

void handle_remove_historical_blocks(WsdbRequest& ctx,
                                     wire::WsdbRemoveHistoricalBlocks&& cmd,
                                     Responder<wire::WsdbRemoveHistoricalBlocksResponse> respond)
{
    schedule_write(
        ctx, 0, std::move(respond), [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbRemoveHistoricalBlocksResponse {
            WorldStateStatusFull status = ctx.world_state.remove_historical_blocks(cmd.toBlockNumber);
            return wire::WsdbRemoveHistoricalBlocksResponse{ .status = world_state_status_full_to_wire(status) };
        });
}

// ---------------------------------------------------------------------------
// Status (read — fork 0)
// ---------------------------------------------------------------------------

void handle_get_status(WsdbRequest& ctx, wire::WsdbGetStatus&& /*cmd*/, Responder<wire::WsdbGetStatusResponse> respond)
{
    schedule_read(ctx, 0, false, std::move(respond), [&ctx]() -> wire::WsdbGetStatusResponse {
        WorldStateStatusSummary status;
        ctx.world_state.get_status_summary(status);
        return wire::WsdbGetStatusResponse{ .status = world_state_status_summary_to_wire(status) };
    });
}

// ---------------------------------------------------------------------------
// Checkpoint operations
// ---------------------------------------------------------------------------

void handle_create_checkpoint(WsdbRequest& ctx,
                              wire::WsdbCreateCheckpoint&& cmd,
                              Responder<wire::WsdbCreateCheckpointResponse> respond)
{
    schedule_write(ctx,
                   cmd.forkId,
                   std::move(respond),
                   [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbCreateCheckpointResponse {
                       ctx.world_state.checkpoint(cmd.forkId);
                       return wire::WsdbCreateCheckpointResponse{};
                   });
}

void handle_commit_checkpoint(WsdbRequest& ctx,
                              wire::WsdbCommitCheckpoint&& cmd,
                              Responder<wire::WsdbCommitCheckpointResponse> respond)
{
    schedule_write(ctx,
                   cmd.forkId,
                   std::move(respond),
                   [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbCommitCheckpointResponse {
                       ctx.world_state.commit_checkpoint(cmd.forkId);
                       return wire::WsdbCommitCheckpointResponse{};
                   });
}

void handle_revert_checkpoint(WsdbRequest& ctx,
                              wire::WsdbRevertCheckpoint&& cmd,
                              Responder<wire::WsdbRevertCheckpointResponse> respond)
{
    schedule_write(ctx,
                   cmd.forkId,
                   std::move(respond),
                   [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbRevertCheckpointResponse {
                       ctx.world_state.revert_checkpoint(cmd.forkId);
                       return wire::WsdbRevertCheckpointResponse{};
                   });
}

void handle_commit_all_checkpoints(WsdbRequest& ctx,
                                   wire::WsdbCommitAllCheckpoints&& cmd,
                                   Responder<wire::WsdbCommitAllCheckpointsResponse> respond)
{
    schedule_write(ctx,
                   cmd.forkId,
                   std::move(respond),
                   [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbCommitAllCheckpointsResponse {
                       ctx.world_state.commit_all_checkpoints_to(cmd.forkId, 0);
                       return wire::WsdbCommitAllCheckpointsResponse{};
                   });
}

void handle_revert_all_checkpoints(WsdbRequest& ctx,
                                   wire::WsdbRevertAllCheckpoints&& cmd,
                                   Responder<wire::WsdbRevertAllCheckpointsResponse> respond)
{
    schedule_write(ctx,
                   cmd.forkId,
                   std::move(respond),
                   [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbRevertAllCheckpointsResponse {
                       ctx.world_state.revert_all_checkpoints_to(cmd.forkId, 0);
                       return wire::WsdbRevertAllCheckpointsResponse{};
                   });
}

// ---------------------------------------------------------------------------
// Database operations (canonical state — fork 0)
// ---------------------------------------------------------------------------

void handle_copy_stores(WsdbRequest& ctx, wire::WsdbCopyStores&& cmd, Responder<wire::WsdbCopyStoresResponse> respond)
{
    schedule_write(ctx, 0, std::move(respond), [&ctx, cmd = std::move(cmd)]() mutable -> wire::WsdbCopyStoresResponse {
        ctx.world_state.copy_stores(cmd.dstPath, cmd.compact.value_or(false));
        return wire::WsdbCopyStoresResponse{};
    });
}

} // namespace azteclabs::wsdb
