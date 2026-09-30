#include "barretenberg/world_state_reference/reference_world_state.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/world_state_reference/genesis_protocol_nullifiers.hpp"

namespace bb::world_state {

namespace {

// The trees a state reference covers, in the order the reference reports them. A node world state
// builds its reference from an unordered map, so clients match entries by tree id, not position.
constexpr MerkleTreeId STATE_TREES[] = {
    MerkleTreeId::NULLIFIER_TREE,
    MerkleTreeId::NOTE_HASH_TREE,
    MerkleTreeId::PUBLIC_DATA_TREE,
    MerkleTreeId::L1_TO_L2_MESSAGE_TREE,
};

TreeSnapshot snapshot_of(const TreeRoots& roots, MerkleTreeId tree_id)
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return roots.nullifier_tree;
    case MerkleTreeId::NOTE_HASH_TREE:
        return roots.note_hash_tree;
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return roots.public_data_tree;
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return roots.l1_to_l2_message_tree;
    default:
        throw_or_abort("snapshot_of: not a state-reference tree");
    }
}

bool is_append_only(MerkleTreeId tree_id)
{
    return tree_id == MerkleTreeId::NOTE_HASH_TREE || tree_id == MerkleTreeId::L1_TO_L2_MESSAGE_TREE ||
           tree_id == MerkleTreeId::ARCHIVE;
}

} // namespace

GenesisConfig GenesisConfig::canonical()
{
    GenesisConfig genesis;
    for (const auto& nullifier : genesis_protocol_nullifiers()) {
        genesis.prefilled_nullifiers.emplace_back(nullifier);
    }
    return genesis;
}

ReferenceWorldState::ReferenceWorldState(const GenesisConfig& genesis)
    : genesis_{ .trees = MemoryMerkleDB(INDEXED_TREE_INITIAL_SIZE,
                                        INDEXED_TREE_INITIAL_SIZE,
                                        genesis.prefilled_nullifiers,
                                        genesis.prefilled_public_data),
                .archive = ArchiveTree(ARCHIVE_HEIGHT) }
    , current_(genesis_)
{
    genesis_block_header_hash_ =
        compute_genesis_block_header_hash(genesis_.trees.get_tree_roots(), genesis.genesis_timestamp);
    genesis_.archive.append_leaves(std::span<const FF>(&genesis_block_header_hash_, 1));
    current_ = genesis_;
}

std::optional<std::string> ReferenceWorldState::check_genesis(const GenesisConfig& genesis)
{
    if (auto problem =
            MemoryMerkleDB::NullifierTree::check_prefill(INDEXED_TREE_INITIAL_SIZE, genesis.prefilled_nullifiers)) {
        return "prefilled nullifiers: " + *problem;
    }
    if (auto problem =
            MemoryMerkleDB::PublicDataTree::check_prefill(INDEXED_TREE_INITIAL_SIZE, genesis.prefilled_public_data)) {
        return "prefilled public data: " + *problem;
    }
    return std::nullopt;
}

std::optional<std::string> ReferenceWorldState::check_revision(const WorldStateRevision& revision)
{
    if (auto problem = check_fork(revision.forkId)) {
        return problem;
    }
    if (revision.blockNumber != 0 && revision.blockNumber != WorldStateRevision::LATEST) {
        return "the reference world state keeps no block history: read block 0 or the latest block (" +
               std::to_string(WorldStateRevision::LATEST) + "), not " + std::to_string(revision.blockNumber);
    }
    return std::nullopt;
}

std::optional<std::string> ReferenceWorldState::check_fork(uint64_t fork_id)
{
    if (fork_id != 0) {
        return "the reference world state has one fork (0), not " + std::to_string(fork_id);
    }
    return std::nullopt;
}

uint32_t ReferenceWorldState::tree_height(MerkleTreeId tree_id)
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return NULLIFIER_TREE_HEIGHT;
    case MerkleTreeId::NOTE_HASH_TREE:
        return NOTE_HASH_TREE_HEIGHT;
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return PUBLIC_DATA_TREE_HEIGHT;
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return L1_TO_L2_MSG_TREE_HEIGHT;
    case MerkleTreeId::ARCHIVE:
        return ARCHIVE_HEIGHT;
    }
    throw_or_abort("tree_height: unknown tree id");
}

const ReferenceWorldState::State& ReferenceWorldState::view(const WorldStateRevision& revision) const
{
    BB_ASSERT(!check_revision(revision).has_value());
    // Block 0 is the genesis. The latest block is the genesis too until the first commit, which the
    // base contract has no command for; only uncommitted reads see the current state.
    if (revision.blockNumber == 0 || !revision.includeUncommitted) {
        return genesis_;
    }
    return current_;
}

std::vector<TreeState> ReferenceWorldState::get_state_reference(const WorldStateRevision& revision) const
{
    const auto roots = view(revision).trees.get_tree_roots();
    std::vector<TreeState> state;
    for (auto tree_id : STATE_TREES) {
        const auto snapshot = snapshot_of(roots, tree_id);
        state.push_back({ tree_id, snapshot.root, snapshot.next_available_leaf_index });
    }
    return state;
}

std::vector<TreeState> ReferenceWorldState::get_initial_state_reference() const
{
    return get_state_reference(WorldStateRevision{ .blockNumber = 0 });
}

TreeState ReferenceWorldState::get_tree_info(const WorldStateRevision& revision, MerkleTreeId tree_id) const
{
    const State& state = view(revision);
    const TreeSnapshot snapshot = tree_id == MerkleTreeId::ARCHIVE ? state.archive.get_snapshot()
                                                                   : snapshot_of(state.trees.get_tree_roots(), tree_id);
    return { tree_id, snapshot.root, snapshot.next_available_leaf_index };
}

std::optional<FF> ReferenceWorldState::get_leaf_value(const WorldStateRevision& revision,
                                                      MerkleTreeId tree_id,
                                                      uint64_t index) const
{
    BB_ASSERT(is_append_only(tree_id));
    if (index >= get_tree_info(revision, tree_id).size) {
        return std::nullopt;
    }
    const State& state = view(revision);
    return tree_id == MerkleTreeId::ARCHIVE ? state.archive.get_leaf_value(index)
                                            : state.trees.get_leaf_value(tree_id, index);
}

std::optional<IndexedLeaf<NullifierLeafValue>> ReferenceWorldState::get_nullifier_preimage(
    const WorldStateRevision& revision, uint64_t index) const
{
    if (index >= get_tree_info(revision, MerkleTreeId::NULLIFIER_TREE).size) {
        return std::nullopt;
    }
    return view(revision).trees.get_leaf_preimage_nullifier_tree(index);
}

std::optional<IndexedLeaf<PublicDataLeafValue>> ReferenceWorldState::get_public_data_preimage(
    const WorldStateRevision& revision, uint64_t index) const
{
    if (index >= get_tree_info(revision, MerkleTreeId::PUBLIC_DATA_TREE).size) {
        return std::nullopt;
    }
    return view(revision).trees.get_leaf_preimage_public_data_tree(index);
}

SiblingPath ReferenceWorldState::get_sibling_path(const WorldStateRevision& revision,
                                                  MerkleTreeId tree_id,
                                                  uint64_t index) const
{
    const State& state = view(revision);
    return tree_id == MerkleTreeId::ARCHIVE ? state.archive.get_sibling_path(index)
                                            : state.trees.get_sibling_path(tree_id, index);
}

std::optional<uint64_t> ReferenceWorldState::find_leaf_index(const WorldStateRevision& revision,
                                                             MerkleTreeId tree_id,
                                                             const FF& leaf,
                                                             uint64_t start) const
{
    const uint64_t size = get_tree_info(revision, tree_id).size;
    for (uint64_t index = start; index < size; ++index) {
        if (get_leaf_value(revision, tree_id, index) == leaf) {
            return index;
        }
    }
    return std::nullopt;
}

std::optional<uint64_t> ReferenceWorldState::find_indexed_leaf_index(const WorldStateRevision& revision,
                                                                     MerkleTreeId tree_id,
                                                                     const FF& key,
                                                                     uint64_t start) const
{
    const uint64_t size = get_tree_info(revision, tree_id).size;
    for (uint64_t index = start; index < size; ++index) {
        const FF leaf_key = tree_id == MerkleTreeId::NULLIFIER_TREE
                                ? get_nullifier_preimage(revision, index)->leaf.get_key()
                                : get_public_data_preimage(revision, index)->leaf.get_key();
        if (leaf_key == key) {
            return index;
        }
    }
    return std::nullopt;
}

GetLowIndexedLeafResponse ReferenceWorldState::find_low_leaf(const WorldStateRevision& revision,
                                                             MerkleTreeId tree_id,
                                                             const FF& key) const
{
    return view(revision).trees.get_low_indexed_leaf(tree_id, key);
}

void ReferenceWorldState::append_leaves(MerkleTreeId tree_id, std::span<const FF> leaves)
{
    BB_ASSERT(is_append_only(tree_id));
    if (tree_id == MerkleTreeId::ARCHIVE) {
        current_.archive.append_leaves(leaves);
    } else {
        current_.trees.append_leaves(tree_id, leaves);
    }
}

SequentialInsertionResult<NullifierLeafValue> ReferenceWorldState::insert_nullifier(const NullifierLeafValue& leaf)
{
    return current_.trees.insert_indexed_leaves_nullifier_tree(leaf);
}

SequentialInsertionResult<PublicDataLeafValue> ReferenceWorldState::insert_public_data(const PublicDataLeafValue& leaf)
{
    return current_.trees.insert_indexed_leaves_public_data_tree(leaf);
}

bool ReferenceWorldState::has_nullifier(const FF& nullifier) const
{
    return current_.trees.get_low_indexed_leaf(MerkleTreeId::NULLIFIER_TREE, nullifier).is_already_present;
}

bool ReferenceWorldState::state_matches(std::span<const TreeState> state) const
{
    const auto current = get_state_reference(WorldStateRevision{ .includeUncommitted = true });
    if (state.size() != current.size()) {
        return false;
    }
    for (const auto& expected : current) {
        bool found = false;
        for (const auto& given : state) {
            found = found || given == expected;
        }
        if (!found) {
            return false;
        }
    }
    return true;
}

void ReferenceWorldState::update_archive(const FF& block_header_hash)
{
    current_.archive.append_leaves(std::span<const FF>(&block_header_hash, 1));
}

void ReferenceWorldState::create_checkpoint()
{
    checkpoints_.push(current_);
}

void ReferenceWorldState::commit_checkpoint()
{
    BB_ASSERT(has_checkpoint());
    checkpoints_.pop();
}

void ReferenceWorldState::revert_checkpoint()
{
    BB_ASSERT(has_checkpoint());
    current_ = checkpoints_.top();
    checkpoints_.pop();
}

void ReferenceWorldState::commit_all_checkpoints()
{
    checkpoints_ = {};
}

void ReferenceWorldState::revert_all_checkpoints()
{
    while (has_checkpoint()) {
        revert_checkpoint();
    }
}

FF ReferenceWorldState::compute_genesis_block_header_hash(const TreeRoots& trees, uint64_t genesis_timestamp)
{
    // BlockHeader::serialize (block_header.nr) with every field zero except the state: the last
    // archive is empty, and the sponge blob hash, tx effects root, global variables (other than the
    // timestamp), total fees and mana used are all zero at genesis.
    return crypto::merkle_tree::Poseidon2HashPolicy::hash({
        FF(DOM_SEP__BLOCK_HEADER_HASH),
        FF(0), // last archive root
        FF(0), // last archive next_available_leaf_index
        trees.l1_to_l2_message_tree.root,
        FF(trees.l1_to_l2_message_tree.next_available_leaf_index),
        trees.note_hash_tree.root,
        FF(trees.note_hash_tree.next_available_leaf_index),
        trees.nullifier_tree.root,
        FF(trees.nullifier_tree.next_available_leaf_index),
        trees.public_data_tree.root,
        FF(trees.public_data_tree.next_available_leaf_index),
        FF(0), // sponge_blob_hash
        FF(0), // tx_effects_tree_root
        FF(0), // chain_id
        FF(0), // version
        FF(0), // block_number
        FF(0), // slot_number
        FF(genesis_timestamp),
        FF(0), // coinbase
        FF(0), // fee_recipient
        FF(0), // gas_fees.fee_per_da_gas
        FF(0), // gas_fees.fee_per_l2_gas
        FF(0), // total_fees
        FF(0), // total_mana_used
    });
}

} // namespace bb::world_state
