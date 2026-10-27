#include "barretenberg/wsdb_ref/wsdb_ref_handlers.hpp"
#include "barretenberg/wsdb_ref/generated/wsdb_ffi.hpp"

#include <exception>
#include <optional>
#include <string>
#include <vector>

namespace bb::wsdb_ref {

using world_state::BatchInsertionResult;
using world_state::GenesisConfig;
using world_state::MerkleTreeId;
using world_state::ReferenceWorldState;
using world_state::TreeState;
using world_state::WorldStateRevision;
using FF = bb::fr;
using crypto::merkle_tree::IndexedLeaf;
using crypto::merkle_tree::LeafUpdateWitnessData;
using crypto::merkle_tree::NullifierLeafValue;
using crypto::merkle_tree::PublicDataLeafValue;
using crypto::merkle_tree::SequentialInsertionResult;

namespace {

/** Answers with what `work` returns, or with the error it throws. */
template <typename Resp, typename Work> void serve(const Responder<Resp>& respond, Work&& work)
{
    std::optional<Resp> response;
    try {
        response = work();
    } catch (const std::exception& e) {
        respond.error(e.what());
        return;
    }
    respond.ok(*response);
}

// Field elements cross the wire as 32 canonical bytes under whichever nominal alias the field declares.
template <typename W> FF to_fr(const W& w)
{
    return FF::serialize_from_buffer(w.data());
}

template <typename W> W from_fr(const FF& f)
{
    W w{};
    FF::serialize_to_buffer(f, w.data());
    return w;
}

std::vector<wire::Fr> path_to_wire(const std::vector<FF>& path)
{
    std::vector<wire::Fr> out;
    out.reserve(path.size());
    for (const auto& node : path) {
        out.push_back(from_fr<wire::Fr>(node));
    }
    return out;
}

MerkleTreeId tree_id_of(uint32_t id)
{
    if (id > static_cast<uint32_t>(MerkleTreeId::ARCHIVE)) {
        throw std::runtime_error("Unknown tree id " + std::to_string(id));
    }
    return static_cast<MerkleTreeId>(id);
}

bool is_append_only(MerkleTreeId id)
{
    return id == MerkleTreeId::NOTE_HASH_TREE || id == MerkleTreeId::L1_TO_L2_MESSAGE_TREE ||
           id == MerkleTreeId::ARCHIVE;
}

void require_append_only(MerkleTreeId id, const char* command)
{
    if (!is_append_only(id)) {
        throw std::runtime_error(std::string("Unsupported tree type for ") + command);
    }
}

WorldStateRevision revision_of(const wire::WorldStateRevision& w)
{
    return WorldStateRevision{ .forkId = w.forkId,
                               .blockNumber = w.blockNumber,
                               .includeUncommitted = w.includeUncommitted };
}

std::vector<wire::TreeStateReference> state_to_wire(const std::vector<TreeState>& state)
{
    std::vector<wire::TreeStateReference> out;
    out.reserve(state.size());
    for (const auto& tree : state) {
        out.push_back(
            { .treeId = static_cast<uint32_t>(tree.tree_id), .root = from_fr<wire::Fr>(tree.root), .size = tree.size });
    }
    return out;
}

std::vector<TreeState> state_from_wire(const std::vector<wire::TreeStateReference>& state)
{
    std::vector<TreeState> out;
    out.reserve(state.size());
    for (const auto& tree : state) {
        out.push_back({ .tree_id = tree_id_of(tree.treeId), .root = to_fr(tree.root), .size = tree.size });
    }
    return out;
}

NullifierLeafValue from_wire(const wire::NullifierLeafValue& leaf)
{
    return NullifierLeafValue(to_fr(leaf.nullifier));
}

PublicDataLeafValue from_wire(const wire::PublicDataLeafValue& leaf)
{
    return PublicDataLeafValue(to_fr(leaf.slot), to_fr(leaf.value));
}

template <typename Out, typename In> std::vector<Out> all_from_wire(const std::vector<In>& in)
{
    std::vector<Out> out;
    out.reserve(in.size());
    for (const auto& item : in) {
        out.push_back(from_wire(item));
    }
    return out;
}

std::vector<FF> frs_from_wire(const std::vector<wire::Fr>& in)
{
    std::vector<FF> out;
    out.reserve(in.size());
    for (const auto& item : in) {
        out.push_back(to_fr(item));
    }
    return out;
}

wire::NullifierLeafValue to_wire(const NullifierLeafValue& leaf)
{
    return { .nullifier = from_fr<wire::Nullifier>(leaf.nullifier) };
}

wire::PublicDataLeafValue to_wire(const PublicDataLeafValue& leaf)
{
    return { .slot = from_fr<wire::PublicDataSlot>(leaf.slot), .value = from_fr<wire::PublicDataValue>(leaf.value) };
}

wire::IndexedNullifierLeafValue to_wire(const IndexedLeaf<NullifierLeafValue>& leaf)
{
    return { .leaf = to_wire(leaf.leaf), .nextIndex = leaf.nextIndex, .nextKey = from_fr<wire::Fr>(leaf.nextKey) };
}

wire::IndexedPublicDataLeafValue to_wire(const IndexedLeaf<PublicDataLeafValue>& leaf)
{
    return { .leaf = to_wire(leaf.leaf), .nextIndex = leaf.nextIndex, .nextKey = from_fr<wire::Fr>(leaf.nextKey) };
}

wire::NullifierLeafUpdateWitnessData to_wire(const LeafUpdateWitnessData<NullifierLeafValue>& w)
{
    return { .leaf = to_wire(w.leaf), .index = w.index, .path = path_to_wire(w.path) };
}

wire::PublicDataLeafUpdateWitnessData to_wire(const LeafUpdateWitnessData<PublicDataLeafValue>& w)
{
    return { .leaf = to_wire(w.leaf), .index = w.index, .path = path_to_wire(w.path) };
}

template <typename Out, typename In> std::vector<Out> all_to_wire(const std::vector<In>& in)
{
    std::vector<Out> out;
    out.reserve(in.size());
    for (const auto& item : in) {
        out.push_back(to_wire(item));
    }
    return out;
}

template <typename WireResult, typename SortedLeaf, typename WireWitness, typename LeafValueType>
WireResult batch_to_wire(const BatchInsertionResult<LeafValueType>& result)
{
    std::vector<SortedLeaf> sorted;
    sorted.reserve(result.sorted_leaves.size());
    for (const auto& [leaf, index] : result.sorted_leaves) {
        sorted.push_back({ .leaf = to_wire(leaf), .index = index });
    }
    return { .lowLeafWitnessData = all_to_wire<WireWitness>(result.low_leaf_witness_data),
             .sortedLeaves = std::move(sorted),
             .subtreePath = path_to_wire(result.subtree_path) };
}

template <typename WireResult, typename WireWitness, typename LeafValueType>
WireResult sequential_to_wire(const SequentialInsertionResult<LeafValueType>& result)
{
    return { .lowLeafWitnessData = all_to_wire<WireWitness>(result.low_leaf_witness_data),
             .insertionWitnessData = all_to_wire<WireWitness>(result.insertion_witness_data) };
}

wire::WorldStateStatusSummary summary_to_wire(const world_state::StatusSummary& status)
{
    return { .unfinalizedBlockNumber = status.unfinalized_block_number,
             .finalizedBlockNumber = status.finalized_block_number,
             .oldestHistoricalBlock = status.oldest_historical_block,
             .treesAreSynched = status.trees_are_synched };
}

/** A node's full status: the summary, each tree's meta, and empty store statistics (there are no stores). */
wire::WorldStateStatusFull full_status(const ReferenceWorldState& world_state)
{
    const auto meta = world_state.tree_meta();
    auto tree_meta = [&](MerkleTreeId id) {
        const auto& m = meta[static_cast<size_t>(id)];
        return wire::TreeMeta{ .name = world_state::getMerkleTreeName(id),
                               .depth = m.depth,
                               .size = m.size,
                               .committedSize = m.committed_size,
                               .root = from_fr<wire::Fr>(m.root),
                               .initialSize = m.initial_size,
                               .initialRoot = from_fr<wire::Fr>(m.initial_root),
                               .oldestHistoricBlock = m.oldest_historic_block,
                               .unfinalizedBlockHeight = m.unfinalized_block_height,
                               .finalizedBlockHeight = m.finalized_block_height };
    };
    auto tree_stats = [](MerkleTreeId id) {
        auto db = [&](const char* suffix) {
            return wire::DBStats{ .name = world_state::getMerkleTreeName(id) + suffix,
                                  .numDataItems = 0,
                                  .totalUsedSize = 0 };
        };
        return wire::TreeDBStats{ .mapSize = 0,
                                  .physicalFileSize = 0,
                                  .blocksDBStats = db(" blocks"),
                                  .nodesDBStats = db(" nodes"),
                                  .leafPreimagesDBStats = db(" leaf preimages"),
                                  .leafIndicesDBStats = db(" leaf indices"),
                                  .blockIndicesDBStats = db(" block indices") };
    };
    return { .summary = summary_to_wire(world_state.status()),
             .dbStats = { .noteHashTreeStats = tree_stats(MerkleTreeId::NOTE_HASH_TREE),
                          .messageTreeStats = tree_stats(MerkleTreeId::L1_TO_L2_MESSAGE_TREE),
                          .archiveTreeStats = tree_stats(MerkleTreeId::ARCHIVE),
                          .publicDataTreeStats = tree_stats(MerkleTreeId::PUBLIC_DATA_TREE),
                          .nullifierTreeStats = tree_stats(MerkleTreeId::NULLIFIER_TREE) },
             .meta = { .noteHashTreeMeta = tree_meta(MerkleTreeId::NOTE_HASH_TREE),
                       .messageTreeMeta = tree_meta(MerkleTreeId::L1_TO_L2_MESSAGE_TREE),
                       .archiveTreeMeta = tree_meta(MerkleTreeId::ARCHIVE),
                       .publicDataTreeMeta = tree_meta(MerkleTreeId::PUBLIC_DATA_TREE),
                       .nullifierTreeMeta = tree_meta(MerkleTreeId::NULLIFIER_TREE) } };
}

template <typename Leaf>
std::vector<std::optional<wire::SiblingPathAndIndex>> find_paths(const ReferenceWorldState& world_state,
                                                                 const WorldStateRevision& revision,
                                                                 MerkleTreeId tree_id,
                                                                 const std::vector<Leaf>& keys)
{
    std::vector<std::optional<wire::SiblingPathAndIndex>> paths;
    paths.reserve(keys.size());
    for (const auto& key : keys) {
        auto index = world_state.find_leaf_index(revision, tree_id, key, 0);
        if (!index.has_value()) {
            paths.emplace_back(std::nullopt);
            continue;
        }
        paths.emplace_back(wire::SiblingPathAndIndex{
            .index = *index, .path = path_to_wire(world_state.get_sibling_path(revision, tree_id, *index)) });
    }
    return paths;
}

template <typename Leaf>
std::vector<std::optional<uint64_t>> find_indices(const ReferenceWorldState& world_state,
                                                  const WorldStateRevision& revision,
                                                  MerkleTreeId tree_id,
                                                  const std::vector<Leaf>& keys,
                                                  uint64_t start)
{
    std::vector<std::optional<uint64_t>> indices;
    indices.reserve(keys.size());
    for (const auto& key : keys) {
        indices.push_back(world_state.find_leaf_index(revision, tree_id, key, start));
    }
    return indices;
}

/**
 * An indexed leaf for a leaf-value read, which a node answers with null on any failure (an unknown block
 * included) except an unknown fork.
 */
template <typename Read> auto leaf_or_null(const ReferenceWorldState& world_state, uint64_t fork_id, Read read)
{
    if (!world_state.has_fork(fork_id)) {
        throw std::runtime_error("Fork not found");
    }
    try {
        return read();
    } catch (const std::exception&) {
        return decltype(read())(std::nullopt);
    }
}

template <typename LeafValueType> std::vector<FF> keys_of(const std::vector<LeafValueType>& leaves)
{
    std::vector<FF> keys;
    keys.reserve(leaves.size());
    for (const auto& leaf : leaves) {
        keys.push_back(leaf.get_key());
    }
    return keys;
}

} // namespace

// ---------------------------------------------------------------------------
// Tree state
// ---------------------------------------------------------------------------

void handle_get_tree_info(WsdbRefContext& ctx,
                          wire::WsdbGetTreeInfo&& cmd,
                          Responder<wire::WsdbGetTreeInfoResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetTreeInfoResponse {
        auto id = tree_id_of(cmd.treeId);
        auto info = ctx.world_state.get_tree_info(revision_of(cmd.revision), id);
        return { .treeId = cmd.treeId,
                 .root = from_fr<wire::Fr>(info.root),
                 .size = info.size,
                 .depth = ReferenceWorldState::tree_height(id) };
    });
}

void handle_get_state_reference(WsdbRefContext& ctx,
                                wire::WsdbGetStateReference&& cmd,
                                Responder<wire::WsdbGetStateReferenceResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetStateReferenceResponse {
        return { .state = state_to_wire(ctx.world_state.get_state_reference(revision_of(cmd.revision))) };
    });
}

void handle_get_initial_state_reference(WsdbRefContext& ctx,
                                        wire::WsdbGetInitialStateReference&& /*cmd*/,
                                        Responder<wire::WsdbGetInitialStateReferenceResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetInitialStateReferenceResponse {
        return { .state = state_to_wire(ctx.world_state.get_initial_state_reference()) };
    });
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

void handle_get_leaf_value(WsdbRefContext& ctx,
                           wire::WsdbGetLeafValue&& cmd,
                           Responder<wire::WsdbGetLeafValueResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetLeafValueResponse {
        auto id = tree_id_of(cmd.treeId);
        require_append_only(id, "get_leaf_value");
        auto value = ctx.world_state.get_leaf_value(revision_of(cmd.revision), id, cmd.leafIndex);
        return { .value = value.has_value() ? std::optional(from_fr<wire::Fr>(*value)) : std::nullopt };
    });
}

void handle_get_public_data_leaf_value(WsdbRefContext& ctx,
                                       wire::WsdbGetPublicDataLeafValue&& cmd,
                                       Responder<wire::WsdbGetPublicDataLeafValueResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetPublicDataLeafValueResponse {
        auto leaf = leaf_or_null(ctx.world_state, cmd.revision.forkId, [&] {
            return ctx.world_state.get_public_data_preimage(revision_of(cmd.revision), cmd.leafIndex);
        });
        return { .value = leaf.has_value() ? std::optional(to_wire(leaf->leaf)) : std::nullopt };
    });
}

void handle_get_nullifier_leaf_value(WsdbRefContext& ctx,
                                     wire::WsdbGetNullifierLeafValue&& cmd,
                                     Responder<wire::WsdbGetNullifierLeafValueResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetNullifierLeafValueResponse {
        auto leaf = leaf_or_null(ctx.world_state, cmd.revision.forkId, [&] {
            return ctx.world_state.get_nullifier_preimage(revision_of(cmd.revision), cmd.leafIndex);
        });
        return { .value = leaf.has_value() ? std::optional(to_wire(leaf->leaf)) : std::nullopt };
    });
}

void handle_get_public_data_leaf_preimage(WsdbRefContext& ctx,
                                          wire::WsdbGetPublicDataLeafPreimage&& cmd,
                                          Responder<wire::WsdbGetPublicDataLeafPreimageResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetPublicDataLeafPreimageResponse {
        // As on a node, a slot past the tree's size is an error here, while the leaf-value read of it answers null.
        auto leaf = ctx.world_state.get_public_data_preimage(revision_of(cmd.revision), cmd.leafIndex);
        if (!leaf.has_value()) {
            throw std::runtime_error("Failed to find indexed leaf: no leaf at index " + std::to_string(cmd.leafIndex));
        }
        return { .preimage = to_wire(*leaf) };
    });
}

void handle_get_nullifier_leaf_preimage(WsdbRefContext& ctx,
                                        wire::WsdbGetNullifierLeafPreimage&& cmd,
                                        Responder<wire::WsdbGetNullifierLeafPreimageResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetNullifierLeafPreimageResponse {
        // As on a node, a slot past the tree's size is an error here, while the leaf-value read of it answers null.
        auto leaf = ctx.world_state.get_nullifier_preimage(revision_of(cmd.revision), cmd.leafIndex);
        if (!leaf.has_value()) {
            throw std::runtime_error("Failed to find indexed leaf: no leaf at index " + std::to_string(cmd.leafIndex));
        }
        return { .preimage = to_wire(*leaf) };
    });
}

void handle_get_sibling_path(WsdbRefContext& ctx,
                             wire::WsdbGetSiblingPath&& cmd,
                             Responder<wire::WsdbGetSiblingPathResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetSiblingPathResponse {
        return { .path = path_to_wire(ctx.world_state.get_sibling_path(
                     revision_of(cmd.revision), tree_id_of(cmd.treeId), cmd.leafIndex)) };
    });
}

void handle_get_block_numbers_for_leaf_indices(WsdbRefContext& ctx,
                                               wire::WsdbGetBlockNumbersForLeafIndices&& cmd,
                                               Responder<wire::WsdbGetBlockNumbersForLeafIndicesResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbGetBlockNumbersForLeafIndicesResponse {
        return { .blockNumbers = ctx.world_state.get_block_numbers_for_leaf_indices(
                     revision_of(cmd.revision), tree_id_of(cmd.treeId), cmd.leafIndices) };
    });
}

// ---------------------------------------------------------------------------
// Searches
// ---------------------------------------------------------------------------

void handle_find_leaf_indices(WsdbRefContext& ctx,
                              wire::WsdbFindLeafIndices&& cmd,
                              Responder<wire::WsdbFindLeafIndicesResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbFindLeafIndicesResponse {
        auto id = tree_id_of(cmd.treeId);
        require_append_only(id, "find_leaf_indices");
        return { .indices = find_indices(
                     ctx.world_state, revision_of(cmd.revision), id, frs_from_wire(cmd.leaves), cmd.startIndex) };
    });
}

void handle_find_public_data_leaf_indices(WsdbRefContext& ctx,
                                          wire::WsdbFindPublicDataLeafIndices&& cmd,
                                          Responder<wire::WsdbFindPublicDataLeafIndicesResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbFindPublicDataLeafIndicesResponse {
        auto keys = keys_of(all_from_wire<PublicDataLeafValue>(cmd.leaves));
        return {
            .indices = find_indices(
                ctx.world_state, revision_of(cmd.revision), MerkleTreeId::PUBLIC_DATA_TREE, keys, cmd.startIndex)
        };
    });
}

void handle_find_nullifier_leaf_indices(WsdbRefContext& ctx,
                                        wire::WsdbFindNullifierLeafIndices&& cmd,
                                        Responder<wire::WsdbFindNullifierLeafIndicesResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbFindNullifierLeafIndicesResponse {
        auto keys = keys_of(all_from_wire<NullifierLeafValue>(cmd.leaves));
        return { .indices = find_indices(
                     ctx.world_state, revision_of(cmd.revision), MerkleTreeId::NULLIFIER_TREE, keys, cmd.startIndex) };
    });
}

void handle_find_low_leaf(WsdbRefContext& ctx,
                          wire::WsdbFindLowLeaf&& cmd,
                          Responder<wire::WsdbFindLowLeafResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbFindLowLeafResponse {
        auto low = ctx.world_state.find_low_leaf(revision_of(cmd.revision), tree_id_of(cmd.treeId), to_fr(cmd.key));
        return { .alreadyPresent = low.is_already_present, .index = low.index };
    });
}

void handle_find_sibling_paths(WsdbRefContext& ctx,
                               wire::WsdbFindSiblingPaths&& cmd,
                               Responder<wire::WsdbFindSiblingPathsResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbFindSiblingPathsResponse {
        auto id = tree_id_of(cmd.treeId);
        require_append_only(id, "find_sibling_paths");
        return { .paths = find_paths(ctx.world_state, revision_of(cmd.revision), id, frs_from_wire(cmd.leaves)) };
    });
}

void handle_find_public_data_sibling_paths(WsdbRefContext& ctx,
                                           wire::WsdbFindPublicDataSiblingPaths&& cmd,
                                           Responder<wire::WsdbFindPublicDataSiblingPathsResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbFindPublicDataSiblingPathsResponse {
        auto keys = keys_of(all_from_wire<PublicDataLeafValue>(cmd.leaves));
        return { .paths =
                     find_paths(ctx.world_state, revision_of(cmd.revision), MerkleTreeId::PUBLIC_DATA_TREE, keys) };
    });
}

void handle_find_nullifier_sibling_paths(WsdbRefContext& ctx,
                                         wire::WsdbFindNullifierSiblingPaths&& cmd,
                                         Responder<wire::WsdbFindNullifierSiblingPathsResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbFindNullifierSiblingPathsResponse {
        auto keys = keys_of(all_from_wire<NullifierLeafValue>(cmd.leaves));
        return { .paths = find_paths(ctx.world_state, revision_of(cmd.revision), MerkleTreeId::NULLIFIER_TREE, keys) };
    });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

void handle_append_leaves(WsdbRefContext& ctx,
                          wire::WsdbAppendLeaves&& cmd,
                          Responder<wire::WsdbAppendLeavesResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbAppendLeavesResponse {
        auto leaves = frs_from_wire(cmd.leaves);
        ctx.world_state.append_leaves(cmd.forkId, tree_id_of(cmd.treeId), leaves);
        return {};
    });
}

void handle_append_public_data_leaves(WsdbRefContext& ctx,
                                      wire::WsdbAppendPublicDataLeaves&& cmd,
                                      Responder<wire::WsdbAppendPublicDataLeavesResponse> respond)
{
    // As on a node: a batch insertion without its witnesses.
    serve(respond, [&]() -> wire::WsdbAppendPublicDataLeavesResponse {
        auto leaves = all_from_wire<PublicDataLeafValue>(cmd.leaves);
        ctx.world_state.batch_insert_public_data(cmd.forkId, leaves, 0);
        return {};
    });
}

void handle_append_nullifier_leaves(WsdbRefContext& ctx,
                                    wire::WsdbAppendNullifierLeaves&& cmd,
                                    Responder<wire::WsdbAppendNullifierLeavesResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbAppendNullifierLeavesResponse {
        auto leaves = all_from_wire<NullifierLeafValue>(cmd.leaves);
        ctx.world_state.batch_insert_nullifiers(cmd.forkId, leaves, 0);
        return {};
    });
}

void handle_batch_insert_public_data(WsdbRefContext& ctx,
                                     wire::WsdbBatchInsertPublicData&& cmd,
                                     Responder<wire::WsdbBatchInsertPublicDataResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbBatchInsertPublicDataResponse {
        auto leaves = all_from_wire<PublicDataLeafValue>(cmd.leaves);
        auto result = ctx.world_state.batch_insert_public_data(cmd.forkId, leaves, cmd.subtreeDepth);
        return { .result = batch_to_wire<wire::BatchInsertionResultPublicData,
                                         wire::SortedPublicDataLeaf,
                                         wire::PublicDataLeafUpdateWitnessData>(result) };
    });
}

void handle_batch_insert_nullifier(WsdbRefContext& ctx,
                                   wire::WsdbBatchInsertNullifier&& cmd,
                                   Responder<wire::WsdbBatchInsertNullifierResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbBatchInsertNullifierResponse {
        auto leaves = all_from_wire<NullifierLeafValue>(cmd.leaves);
        auto result = ctx.world_state.batch_insert_nullifiers(cmd.forkId, leaves, cmd.subtreeDepth);
        return { .result = batch_to_wire<wire::BatchInsertionResultNullifier,
                                         wire::SortedNullifierLeaf,
                                         wire::NullifierLeafUpdateWitnessData>(result) };
    });
}

void handle_sequential_insert_public_data(WsdbRefContext& ctx,
                                          wire::WsdbSequentialInsertPublicData&& cmd,
                                          Responder<wire::WsdbSequentialInsertPublicDataResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbSequentialInsertPublicDataResponse {
        auto leaves = all_from_wire<PublicDataLeafValue>(cmd.leaves);
        auto result = ctx.world_state.sequential_insert_public_data(cmd.forkId, leaves);
        return {
            .result =
                sequential_to_wire<wire::SequentialInsertionResultPublicData, wire::PublicDataLeafUpdateWitnessData>(
                    result)
        };
    });
}

void handle_sequential_insert_nullifier(WsdbRefContext& ctx,
                                        wire::WsdbSequentialInsertNullifier&& cmd,
                                        Responder<wire::WsdbSequentialInsertNullifierResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbSequentialInsertNullifierResponse {
        auto leaves = all_from_wire<NullifierLeafValue>(cmd.leaves);
        auto result = ctx.world_state.sequential_insert_nullifiers(cmd.forkId, leaves);
        return { .result =
                     sequential_to_wire<wire::SequentialInsertionResultNullifier, wire::NullifierLeafUpdateWitnessData>(
                         result) };
    });
}

void handle_update_archive(WsdbRefContext& ctx,
                           wire::WsdbUpdateArchive&& cmd,
                           Responder<wire::WsdbUpdateArchiveResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbUpdateArchiveResponse {
        ctx.world_state.update_archive(cmd.forkId, state_from_wire(cmd.blockStateRef), to_fr(cmd.blockHeaderHash));
        return {};
    });
}

// ---------------------------------------------------------------------------
// The canonical chain
// ---------------------------------------------------------------------------

void handle_commit(WsdbRefContext& ctx, wire::WsdbCommit&& /*cmd*/, Responder<wire::WsdbCommitResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbCommitResponse {
        ctx.world_state.commit();
        return { .status = full_status(ctx.world_state) };
    });
}

void handle_rollback(WsdbRefContext& ctx, wire::WsdbRollback&& /*cmd*/, Responder<wire::WsdbRollbackResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbRollbackResponse {
        ctx.world_state.rollback();
        return {};
    });
}

void handle_sync_block(WsdbRefContext& ctx, wire::WsdbSyncBlock&& cmd, Responder<wire::WsdbSyncBlockResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbSyncBlockResponse {
        auto note_hashes = frs_from_wire(cmd.paddedNoteHashes);
        auto messages = frs_from_wire(cmd.paddedL1ToL2Messages);
        auto nullifiers = all_from_wire<NullifierLeafValue>(cmd.paddedNullifiers);
        auto public_data = all_from_wire<PublicDataLeafValue>(cmd.publicDataWrites);
        auto optional_fr = [](const std::optional<wire::Fr>& w) {
            return w.has_value() ? std::optional(to_fr(*w)) : std::nullopt;
        };
        ctx.world_state.sync_block(state_from_wire(cmd.blockStateRef),
                                   to_fr(cmd.blockHeaderHash),
                                   note_hashes,
                                   messages,
                                   nullifiers,
                                   public_data,
                                   optional_fr(cmd.expectedArchiveRoot),
                                   optional_fr(cmd.expectedPreviousArchiveRoot));
        return { .status = full_status(ctx.world_state) };
    });
}

void handle_create_fork(WsdbRefContext& ctx,
                        wire::WsdbCreateFork&& cmd,
                        Responder<wire::WsdbCreateForkResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbCreateForkResponse {
        auto block = cmd.latest ? std::nullopt : std::optional<world_state::block_number_t>(cmd.blockNumber);
        return { .forkId = ctx.world_state.create_fork(block) };
    });
}

void handle_delete_fork(WsdbRefContext& ctx,
                        wire::WsdbDeleteFork&& cmd,
                        Responder<wire::WsdbDeleteForkResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbDeleteForkResponse {
        ctx.world_state.delete_fork(cmd.forkId);
        return {};
    });
}

void handle_finalize_blocks(WsdbRefContext& ctx,
                            wire::WsdbFinalizeBlocks&& cmd,
                            Responder<wire::WsdbFinalizeBlocksResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbFinalizeBlocksResponse {
        ctx.world_state.finalize_blocks(cmd.toBlockNumber);
        return { .status = summary_to_wire(ctx.world_state.status()) };
    });
}

void handle_unwind_blocks(WsdbRefContext& ctx,
                          wire::WsdbUnwindBlocks&& cmd,
                          Responder<wire::WsdbUnwindBlocksResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbUnwindBlocksResponse {
        ctx.world_state.unwind_blocks(cmd.toBlockNumber);
        return { .status = full_status(ctx.world_state) };
    });
}

void handle_remove_historical_blocks(WsdbRefContext& ctx,
                                     wire::WsdbRemoveHistoricalBlocks&& cmd,
                                     Responder<wire::WsdbRemoveHistoricalBlocksResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbRemoveHistoricalBlocksResponse {
        ctx.world_state.remove_historical_blocks(cmd.toBlockNumber);
        return { .status = full_status(ctx.world_state) };
    });
}

void handle_get_status(WsdbRefContext& ctx,
                       wire::WsdbGetStatus&& /*cmd*/,
                       Responder<wire::WsdbGetStatusResponse> respond)
{
    serve(respond,
          [&]() -> wire::WsdbGetStatusResponse { return { .status = summary_to_wire(ctx.world_state.status()) }; });
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

void handle_create_checkpoint(WsdbRefContext& ctx,
                              wire::WsdbCreateCheckpoint&& cmd,
                              Responder<wire::WsdbCreateCheckpointResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbCreateCheckpointResponse {
        ctx.world_state.create_checkpoint(cmd.forkId);
        return {};
    });
}

void handle_commit_checkpoint(WsdbRefContext& ctx,
                              wire::WsdbCommitCheckpoint&& cmd,
                              Responder<wire::WsdbCommitCheckpointResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbCommitCheckpointResponse {
        ctx.world_state.commit_checkpoint(cmd.forkId);
        return {};
    });
}

void handle_revert_checkpoint(WsdbRefContext& ctx,
                              wire::WsdbRevertCheckpoint&& cmd,
                              Responder<wire::WsdbRevertCheckpointResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbRevertCheckpointResponse {
        ctx.world_state.revert_checkpoint(cmd.forkId);
        return {};
    });
}

void handle_commit_all_checkpoints(WsdbRefContext& ctx,
                                   wire::WsdbCommitAllCheckpoints&& cmd,
                                   Responder<wire::WsdbCommitAllCheckpointsResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbCommitAllCheckpointsResponse {
        ctx.world_state.commit_all_checkpoints(cmd.forkId);
        return {};
    });
}

void handle_revert_all_checkpoints(WsdbRefContext& ctx,
                                   wire::WsdbRevertAllCheckpoints&& cmd,
                                   Responder<wire::WsdbRevertAllCheckpointsResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbRevertAllCheckpointsResponse {
        ctx.world_state.revert_all_checkpoints(cmd.forkId);
        return {};
    });
}

// ---------------------------------------------------------------------------
// Stores and genesis
// ---------------------------------------------------------------------------

void handle_copy_stores(WsdbRefContext& /*ctx*/,
                        wire::WsdbCopyStores&& /*cmd*/,
                        Responder<wire::WsdbCopyStoresResponse> respond)
{
    respond.error("CopyStores is not supported: wsdb-ref keeps its state in memory, with no stores to copy");
}

void handle_init_genesis(WsdbRefContext& ctx,
                         wire::WsdbInitGenesis&& cmd,
                         Responder<wire::WsdbInitGenesisResponse> respond)
{
    serve(respond, [&]() -> wire::WsdbInitGenesisResponse {
        GenesisConfig genesis;
        genesis.prefilled_public_data = all_from_wire<PublicDataLeafValue>(cmd.prefilledPublicData);
        for (const auto& nullifier : cmd.prefilledNullifiers) {
            genesis.prefilled_nullifiers.emplace_back(to_fr(nullifier));
        }
        genesis.genesis_timestamp = cmd.genesisTimestamp;
        genesis.header_generator_point = FF(cmd.initialHeaderGeneratorPoint);
        ctx.world_state.reset(genesis);
        return {};
    });
}

// The in-process FFI entry's context (generated/wsdb_ffi.hpp): one reference world state per loaded
// module, at the canonical genesis until InitGenesis, shared by every call as over one transport connection.
AsyncDispatchHandler& ipc_ffi_dispatcher()
{
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static WsdbRefContext ctx;
    static AsyncDispatchHandler handler = make_wsdb_handler(ctx);
    return handler;
}

} // namespace bb::wsdb_ref
