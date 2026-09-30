#include "barretenberg/wsdb_ref/wsdb_ref_handlers.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/wsdb_ref/generated/wsdb_ffi.hpp"

#include <optional>
#include <string>
#include <vector>

namespace bb::wsdb_ref {

using world_state::MerkleTreeId;
using world_state::ReferenceWorldState;
using world_state::TreeState;
using world_state::WorldStateRevision;
using FF = bb::fr;
using crypto::merkle_tree::IndexedLeaf;
using crypto::merkle_tree::LeafUpdateWitnessData;
using crypto::merkle_tree::NullifierLeafValue;
using crypto::merkle_tree::PublicDataLeafValue;

namespace {

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

std::optional<MerkleTreeId> tree_id_of(uint32_t id)
{
    if (id > static_cast<uint32_t>(MerkleTreeId::ARCHIVE)) {
        return std::nullopt;
    }
    return static_cast<MerkleTreeId>(id);
}

bool is_append_only(MerkleTreeId id)
{
    return id == MerkleTreeId::NOTE_HASH_TREE || id == MerkleTreeId::L1_TO_L2_MESSAGE_TREE ||
           id == MerkleTreeId::ARCHIVE;
}

bool is_indexed(MerkleTreeId id)
{
    return id == MerkleTreeId::NULLIFIER_TREE || id == MerkleTreeId::PUBLIC_DATA_TREE;
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

std::vector<std::optional<uint64_t>> to_wire_indices(const std::vector<std::optional<uint64_t>>& indices)
{
    return indices;
}

/**
 * Resolve the tree id and revision of a read, or answer the request with why it cannot be served.
 * `allowed` says which trees the command reads.
 */
template <typename Resp, typename Allowed>
std::optional<MerkleTreeId> check_read(uint32_t tree_id,
                                       const WorldStateRevision& revision,
                                       Allowed allowed,
                                       const char* what,
                                       const Responder<Resp>& respond)
{
    auto id = tree_id_of(tree_id);
    if (!id.has_value()) {
        respond.error("unknown tree id " + std::to_string(tree_id));
        return std::nullopt;
    }
    if (!allowed(*id)) {
        respond.error(std::string(what) + " is not supported for tree " + std::to_string(tree_id));
        return std::nullopt;
    }
    if (auto problem = ReferenceWorldState::check_revision(revision)) {
        respond.error(*problem);
        return std::nullopt;
    }
    return id;
}

template <typename Resp> bool check_revision(const WorldStateRevision& revision, const Responder<Resp>& respond)
{
    if (auto problem = ReferenceWorldState::check_revision(revision)) {
        respond.error(*problem);
        return false;
    }
    return true;
}

template <typename Resp> bool check_fork(uint64_t fork_id, const Responder<Resp>& respond)
{
    if (auto problem = ReferenceWorldState::check_fork(fork_id)) {
        respond.error(*problem);
        return false;
    }
    return true;
}

} // namespace

// ---------------------------------------------------------------------------
// Tree state
// ---------------------------------------------------------------------------

void handle_get_tree_info(WsdbRefContext& ctx,
                          wire::WsdbGetTreeInfo&& cmd,
                          Responder<wire::WsdbGetTreeInfoResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    auto id = check_read(cmd.treeId, revision, [](MerkleTreeId) { return true; }, "get_tree_info", respond);
    if (!id) {
        return;
    }
    auto info = ctx.world_state.get_tree_info(revision, *id);
    respond.ok({ .treeId = cmd.treeId,
                 .root = from_fr<wire::Fr>(info.root),
                 .size = info.size,
                 .depth = ReferenceWorldState::tree_height(*id) });
}

void handle_get_state_reference(WsdbRefContext& ctx,
                                wire::WsdbGetStateReference&& cmd,
                                Responder<wire::WsdbGetStateReferenceResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    if (!check_revision(revision, respond)) {
        return;
    }
    respond.ok({ .state = state_to_wire(ctx.world_state.get_state_reference(revision)) });
}

void handle_get_initial_state_reference(WsdbRefContext& ctx,
                                        wire::WsdbGetInitialStateReference&& /*cmd*/,
                                        Responder<wire::WsdbGetInitialStateReferenceResponse> respond)
{
    respond.ok({ .state = state_to_wire(ctx.world_state.get_initial_state_reference()) });
}

// ---------------------------------------------------------------------------
// Leaf reads
// ---------------------------------------------------------------------------

void handle_get_leaf_value(WsdbRefContext& ctx,
                           wire::WsdbGetLeafValue&& cmd,
                           Responder<wire::WsdbGetLeafValueResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    auto id = check_read(cmd.treeId, revision, is_append_only, "get_leaf_value", respond);
    if (!id) {
        return;
    }
    auto leaf = ctx.world_state.get_leaf_value(revision, *id, cmd.leafIndex);
    respond.ok({ .value = leaf ? std::optional<wire::Fr>(from_fr<wire::Fr>(*leaf)) : std::nullopt });
}

void handle_get_public_data_leaf_value(WsdbRefContext& ctx,
                                       wire::WsdbGetPublicDataLeafValue&& cmd,
                                       Responder<wire::WsdbGetPublicDataLeafValueResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    if (!check_revision(revision, respond)) {
        return;
    }
    auto preimage = ctx.world_state.get_public_data_preimage(revision, cmd.leafIndex);
    respond.ok({ .value = preimage ? std::optional(to_wire(preimage->leaf)) : std::nullopt });
}

void handle_get_nullifier_leaf_value(WsdbRefContext& ctx,
                                     wire::WsdbGetNullifierLeafValue&& cmd,
                                     Responder<wire::WsdbGetNullifierLeafValueResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    if (!check_revision(revision, respond)) {
        return;
    }
    auto preimage = ctx.world_state.get_nullifier_preimage(revision, cmd.leafIndex);
    respond.ok({ .value = preimage ? std::optional(to_wire(preimage->leaf)) : std::nullopt });
}

void handle_get_public_data_leaf_preimage(WsdbRefContext& ctx,
                                          wire::WsdbGetPublicDataLeafPreimage&& cmd,
                                          Responder<wire::WsdbGetPublicDataLeafPreimageResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    if (!check_revision(revision, respond)) {
        return;
    }
    auto preimage = ctx.world_state.get_public_data_preimage(revision, cmd.leafIndex);
    respond.ok({ .preimage = preimage ? std::optional(to_wire(*preimage)) : std::nullopt });
}

void handle_get_nullifier_leaf_preimage(WsdbRefContext& ctx,
                                        wire::WsdbGetNullifierLeafPreimage&& cmd,
                                        Responder<wire::WsdbGetNullifierLeafPreimageResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    if (!check_revision(revision, respond)) {
        return;
    }
    auto preimage = ctx.world_state.get_nullifier_preimage(revision, cmd.leafIndex);
    respond.ok({ .preimage = preimage ? std::optional(to_wire(*preimage)) : std::nullopt });
}

void handle_get_sibling_path(WsdbRefContext& ctx,
                             wire::WsdbGetSiblingPath&& cmd,
                             Responder<wire::WsdbGetSiblingPathResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    auto id = check_read(cmd.treeId, revision, [](MerkleTreeId) { return true; }, "get_sibling_path", respond);
    if (!id) {
        return;
    }
    if (cmd.leafIndex >= (uint64_t(1) << ReferenceWorldState::tree_height(*id))) {
        respond.error("leaf index " + std::to_string(cmd.leafIndex) + " is outside tree " + std::to_string(cmd.treeId));
        return;
    }
    respond.ok({ .path = path_to_wire(ctx.world_state.get_sibling_path(revision, *id, cmd.leafIndex)) });
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

void handle_find_leaf_indices(WsdbRefContext& ctx,
                              wire::WsdbFindLeafIndices&& cmd,
                              Responder<wire::WsdbFindLeafIndicesResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    auto id = check_read(cmd.treeId, revision, is_append_only, "find_leaf_indices", respond);
    if (!id) {
        return;
    }
    std::vector<std::optional<uint64_t>> indices;
    for (const auto& leaf : cmd.leaves) {
        indices.push_back(ctx.world_state.find_leaf_index(revision, *id, to_fr(leaf), cmd.startIndex));
    }
    respond.ok({ .indices = to_wire_indices(indices) });
}

void handle_find_public_data_leaf_indices(WsdbRefContext& ctx,
                                          wire::WsdbFindPublicDataLeafIndices&& cmd,
                                          Responder<wire::WsdbFindPublicDataLeafIndicesResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    if (!check_revision(revision, respond)) {
        return;
    }
    // Public data is keyed by slot: the leaf at a slot is found whatever value it now holds.
    std::vector<std::optional<uint64_t>> indices;
    for (const auto& leaf : cmd.leaves) {
        indices.push_back(ctx.world_state.find_indexed_leaf_index(
            revision, MerkleTreeId::PUBLIC_DATA_TREE, to_fr(leaf.slot), cmd.startIndex));
    }
    respond.ok({ .indices = to_wire_indices(indices) });
}

void handle_find_nullifier_leaf_indices(WsdbRefContext& ctx,
                                        wire::WsdbFindNullifierLeafIndices&& cmd,
                                        Responder<wire::WsdbFindNullifierLeafIndicesResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    if (!check_revision(revision, respond)) {
        return;
    }
    std::vector<std::optional<uint64_t>> indices;
    for (const auto& leaf : cmd.leaves) {
        indices.push_back(ctx.world_state.find_indexed_leaf_index(
            revision, MerkleTreeId::NULLIFIER_TREE, to_fr(leaf.nullifier), cmd.startIndex));
    }
    respond.ok({ .indices = to_wire_indices(indices) });
}

void handle_find_low_leaf(WsdbRefContext& ctx,
                          wire::WsdbFindLowLeaf&& cmd,
                          Responder<wire::WsdbFindLowLeafResponse> respond)
{
    auto revision = revision_of(cmd.revision);
    auto id = check_read(cmd.treeId, revision, is_indexed, "find_low_leaf", respond);
    if (!id) {
        return;
    }
    auto low = ctx.world_state.find_low_leaf(revision, *id, to_fr(cmd.key));
    respond.ok({ .alreadyPresent = low.is_already_present, .index = low.index });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

void handle_append_leaves(WsdbRefContext& ctx,
                          wire::WsdbAppendLeaves&& cmd,
                          Responder<wire::WsdbAppendLeavesResponse> respond)
{
    if (!check_fork(cmd.forkId, respond)) {
        return;
    }
    auto id = tree_id_of(cmd.treeId);
    if (!id || !is_append_only(*id)) {
        respond.error("append_leaves is not supported for tree " + std::to_string(cmd.treeId));
        return;
    }
    std::vector<FF> leaves;
    leaves.reserve(cmd.leaves.size());
    for (const auto& leaf : cmd.leaves) {
        leaves.push_back(to_fr(leaf));
    }
    ctx.world_state.append_leaves(*id, leaves);
    respond.ok({});
}

void handle_sequential_insert_public_data(WsdbRefContext& ctx,
                                          wire::WsdbSequentialInsertPublicData&& cmd,
                                          Responder<wire::WsdbSequentialInsertPublicDataResponse> respond)
{
    if (!check_fork(cmd.forkId, respond)) {
        return;
    }
    wire::SequentialInsertionResultPublicData result;
    for (const auto& leaf : cmd.leaves) {
        auto inserted = ctx.world_state.insert_public_data(PublicDataLeafValue(to_fr(leaf.slot), to_fr(leaf.value)));
        for (const auto& w : inserted.low_leaf_witness_data) {
            result.lowLeafWitnessData.push_back(to_wire(w));
        }
        for (const auto& w : inserted.insertion_witness_data) {
            result.insertionWitnessData.push_back(to_wire(w));
        }
    }
    respond.ok({ .result = std::move(result) });
}

void handle_sequential_insert_nullifier(WsdbRefContext& ctx,
                                        wire::WsdbSequentialInsertNullifier&& cmd,
                                        Responder<wire::WsdbSequentialInsertNullifierResponse> respond)
{
    if (!check_fork(cmd.forkId, respond)) {
        return;
    }
    // Validate the whole batch first, so a rejected request changes nothing.
    std::vector<FF> nullifiers;
    for (const auto& leaf : cmd.leaves) {
        FF nullifier = to_fr(leaf.nullifier);
        bool repeated = ctx.world_state.has_nullifier(nullifier);
        for (const auto& earlier : nullifiers) {
            repeated = repeated || earlier == nullifier;
        }
        if (repeated) {
            respond.error("nullifier " + format(nullifier) + " already exists");
            return;
        }
        nullifiers.push_back(nullifier);
    }
    wire::SequentialInsertionResultNullifier result;
    for (const auto& nullifier : nullifiers) {
        auto inserted = ctx.world_state.insert_nullifier(NullifierLeafValue(nullifier));
        for (const auto& w : inserted.low_leaf_witness_data) {
            result.lowLeafWitnessData.push_back(to_wire(w));
        }
        for (const auto& w : inserted.insertion_witness_data) {
            result.insertionWitnessData.push_back(to_wire(w));
        }
    }
    respond.ok({ .result = std::move(result) });
}

void handle_update_archive(WsdbRefContext& ctx,
                           wire::WsdbUpdateArchive&& cmd,
                           Responder<wire::WsdbUpdateArchiveResponse> respond)
{
    if (!check_fork(cmd.forkId, respond)) {
        return;
    }
    std::vector<TreeState> state;
    for (const auto& tree : cmd.blockStateRef) {
        auto id = tree_id_of(tree.treeId);
        if (!id) {
            respond.error("unknown tree id " + std::to_string(tree.treeId));
            return;
        }
        state.push_back({ *id, to_fr(tree.root), tree.size });
    }
    if (!ctx.world_state.state_matches(state)) {
        respond.error("Can't update archive tree: Block state does not match world state");
        return;
    }
    ctx.world_state.update_archive(to_fr(cmd.blockHeaderHash));
    respond.ok({});
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

void handle_create_checkpoint(WsdbRefContext& ctx,
                              wire::WsdbCreateCheckpoint&& cmd,
                              Responder<wire::WsdbCreateCheckpointResponse> respond)
{
    if (!check_fork(cmd.forkId, respond)) {
        return;
    }
    ctx.world_state.create_checkpoint();
    respond.ok({});
}

void handle_commit_checkpoint(WsdbRefContext& ctx,
                              wire::WsdbCommitCheckpoint&& cmd,
                              Responder<wire::WsdbCommitCheckpointResponse> respond)
{
    if (!check_fork(cmd.forkId, respond)) {
        return;
    }
    if (!ctx.world_state.has_checkpoint()) {
        respond.error("no checkpoint to commit");
        return;
    }
    ctx.world_state.commit_checkpoint();
    respond.ok({});
}

void handle_revert_checkpoint(WsdbRefContext& ctx,
                              wire::WsdbRevertCheckpoint&& cmd,
                              Responder<wire::WsdbRevertCheckpointResponse> respond)
{
    if (!check_fork(cmd.forkId, respond)) {
        return;
    }
    if (!ctx.world_state.has_checkpoint()) {
        respond.error("no checkpoint to revert");
        return;
    }
    ctx.world_state.revert_checkpoint();
    respond.ok({});
}

void handle_commit_all_checkpoints(WsdbRefContext& ctx,
                                   wire::WsdbCommitAllCheckpoints&& cmd,
                                   Responder<wire::WsdbCommitAllCheckpointsResponse> respond)
{
    if (!check_fork(cmd.forkId, respond)) {
        return;
    }
    ctx.world_state.commit_all_checkpoints();
    respond.ok({});
}

void handle_revert_all_checkpoints(WsdbRefContext& ctx,
                                   wire::WsdbRevertAllCheckpoints&& cmd,
                                   Responder<wire::WsdbRevertAllCheckpointsResponse> respond)
{
    if (!check_fork(cmd.forkId, respond)) {
        return;
    }
    ctx.world_state.revert_all_checkpoints();
    respond.ok({});
}

// The in-process FFI entry's context (generated/wsdb_ffi.hpp): one reference world state per loaded
// module, at the canonical genesis, shared by every call as over one transport connection.
AsyncDispatchHandler& ipc_ffi_dispatcher()
{
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
    static WsdbRefContext ctx;
    static AsyncDispatchHandler handler = make_wsdb_handler(ctx);
    return handler;
}

} // namespace bb::wsdb_ref
