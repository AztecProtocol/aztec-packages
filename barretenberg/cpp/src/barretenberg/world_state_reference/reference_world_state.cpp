#include "barretenberg/world_state_reference/reference_world_state.hpp"

#include <algorithm>
#include <set>
#include <sstream>
#include <stdexcept>

#include "barretenberg/aztec/aztec_constants.hpp"
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

constexpr MerkleTreeId ALL_TREES[] = {
    MerkleTreeId::NULLIFIER_TREE,        MerkleTreeId::NOTE_HASH_TREE, MerkleTreeId::PUBLIC_DATA_TREE,
    MerkleTreeId::L1_TO_L2_MESSAGE_TREE, MerkleTreeId::ARCHIVE,
};

bool is_append_only(MerkleTreeId tree_id)
{
    return tree_id == MerkleTreeId::NOTE_HASH_TREE || tree_id == MerkleTreeId::L1_TO_L2_MESSAGE_TREE ||
           tree_id == MerkleTreeId::ARCHIVE;
}

template <typename... Parts> [[noreturn]] void fail(const Parts&... parts)
{
    std::ostringstream message;
    (message << ... << parts);
    throw std::runtime_error(message.str());
}

/** An indexed-tree leaf as the tree stores it: an empty leaf hashes to zero and carries no preimage. */
template <typename Tree, typename Payload> typename Tree::Leaf leaf_of(const Payload& indexed_leaf)
{
    if (indexed_leaf.is_empty()) {
        return { .hash = FF::zero(), .payload = nullptr };
    }
    return { .hash = Tree::Hashing::hash(indexed_leaf.get_hash_inputs()),
             .payload = std::make_shared<const Payload>(indexed_leaf) };
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
{
    reset(genesis);
}

std::optional<std::string> ReferenceWorldState::check_genesis(const GenesisConfig& genesis)
{
    for (auto tree_id : ALL_TREES) {
        uint32_t height = genesis.tree_heights[static_cast<size_t>(tree_id)];
        if (height == 0 || height > 63) {
            return "tree " + std::to_string(static_cast<uint32_t>(tree_id)) + ": height " + std::to_string(height) +
                   " is not in 1..63";
        }
    }
    auto check = [&](const auto& prefilled, uint64_t initial_size, MerkleTreeId tree_id) -> std::optional<std::string> {
        if (initial_size < 2) {
            return "Indexed trees must have initial size > 1";
        }
        if (initial_size > (uint64_t(1) << genesis.tree_heights[static_cast<size_t>(tree_id)])) {
            return "Initial size is more than the tree holds";
        }
        if (prefilled.size() > initial_size) {
            return "Number of prefilled values can't be more than initial size";
        }
        size_t num_padding = static_cast<size_t>(initial_size - prefilled.size());
        using LeafType = std::remove_cvref_t<decltype(prefilled[0])>;
        uint256_t previous = num_padding > 0 ? uint256_t(LeafType::padding(num_padding - 1).get_key()) : uint256_t(0);
        for (size_t i = 0; i < prefilled.size(); ++i) {
            uint256_t key = uint256_t(prefilled[i].get_key());
            if ((i > 0 || num_padding > 0) && key <= previous) {
                return i == 0 ? "Prefilled values must not be the same as the default values"
                              : "Prefilled values must be unique and sorted";
            }
            previous = key;
        }
        return std::nullopt;
    };
    if (auto problem =
            check(genesis.prefilled_nullifiers, genesis.nullifier_tree_initial_size, MerkleTreeId::NULLIFIER_TREE)) {
        return "prefilled nullifiers: " + *problem;
    }
    if (auto problem = check(
            genesis.prefilled_public_data, genesis.public_data_tree_initial_size, MerkleTreeId::PUBLIC_DATA_TREE)) {
        return "prefilled public data: " + *problem;
    }
    return std::nullopt;
}

void ReferenceWorldState::reset(const GenesisConfig& genesis)
{
    if (auto problem = check_genesis(genesis)) {
        fail(*problem);
    }
    tree_heights_ = genesis.tree_heights;
    blocks_.clear();
    forks_.clear();
    blocks_.push_back(build_genesis(genesis));
    forks_.emplace(0, Fork{ .block_number = 0, .base = blocks_[0], .current = blocks_[0], .checkpoints = {} });
    next_fork_id_ = 1;
    finalized_block_number_ = 0;
    oldest_historical_block_ = 0;
}

uint32_t ReferenceWorldState::tree_height(MerkleTreeId tree_id) const
{
    auto index = static_cast<size_t>(tree_id);
    if (index >= tree_heights_.size()) {
        fail("Unknown tree id ", static_cast<uint32_t>(tree_id));
    }
    return tree_heights_[index];
}

ReferenceWorldState::Trees ReferenceWorldState::build_genesis(const GenesisConfig& genesis)
{
    // The indexed trees start as on a node: LeafType::padding(i) for the leaves the prefill leaves
    // free, then the prefill, linked as one ascending chain.
    auto indexed = [](auto tree, const auto& prefilled, uint64_t initial_size) {
        using Tree = decltype(tree);
        using LeafType = std::remove_cvref_t<decltype(prefilled[0])>;
        std::vector<IndexedLeaf<LeafType>> leaves;
        size_t num_padding = static_cast<size_t>(initial_size - prefilled.size());
        for (size_t i = 0; i < num_padding; ++i) {
            leaves.push_back(IndexedLeaf<LeafType>(LeafType::padding(i), 0, 0));
        }
        for (const auto& value : prefilled) {
            leaves.push_back(IndexedLeaf<LeafType>(value, 0, 0));
        }
        std::vector<typename decltype(tree.tree)::Leaf> hashed;
        for (size_t i = 0; i < leaves.size(); ++i) {
            size_t next = i + 1 == leaves.size() ? 0 : i + 1;
            leaves[i].nextIndex = next;
            leaves[i].nextKey = leaves[next].leaf.get_key();
            hashed.push_back(leaf_of<Tree>(leaves[i]));
            tree.indices = tree.indices.with(uint256_t(leaves[i].leaf.get_key()), i);
        }
        tree.tree = tree.tree.with_leaves(0, hashed);
        tree.size = leaves.size();
        return tree;
    };
    auto height = [&](MerkleTreeId tree_id) { return genesis.tree_heights[static_cast<size_t>(tree_id)]; };
    auto append_only = [&](MerkleTreeId tree_id) {
        return AppendOnlyTree{ .tree = decltype(AppendOnlyTree::tree)(height(tree_id)), .indices = {}, .size = 0 };
    };

    Trees trees{
        .nullifier =
            indexed(NullifierTree{ .tree = decltype(NullifierTree::tree)(height(MerkleTreeId::NULLIFIER_TREE)) },
                    genesis.prefilled_nullifiers,
                    genesis.nullifier_tree_initial_size),
        .note_hash = append_only(MerkleTreeId::NOTE_HASH_TREE),
        .public_data =
            indexed(PublicDataTree{ .tree = decltype(PublicDataTree::tree)(height(MerkleTreeId::PUBLIC_DATA_TREE)) },
                    genesis.prefilled_public_data,
                    genesis.public_data_tree_initial_size),
        .l1_to_l2 = append_only(MerkleTreeId::L1_TO_L2_MESSAGE_TREE),
        .archive = append_only(MerkleTreeId::ARCHIVE),
    };
    FF header_hash = compute_genesis_block_header_hash(
        state_reference(trees), genesis.genesis_timestamp, genesis.header_generator_point);
    append(trees.archive, std::span<const FF>(&header_hash, 1));
    return trees;
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

const ReferenceWorldState::Fork& ReferenceWorldState::fork(uint64_t fork_id) const
{
    auto it = forks_.find(fork_id);
    if (it == forks_.end()) {
        fail("Fork not found");
    }
    return it->second;
}

ReferenceWorldState::Fork& ReferenceWorldState::fork(uint64_t fork_id)
{
    return const_cast<Fork&>(std::as_const(*this).fork(fork_id));
}

const ReferenceWorldState::Trees& ReferenceWorldState::committed_block(block_number_t block_number) const
{
    if (block_number > latest_block_number()) {
        fail("Unable to get state for block ", block_number, ", latest block is ", latest_block_number());
    }
    if (block_number != 0 && block_number < oldest_historical_block_) {
        fail("Unable to get state for block ", block_number, ", oldest historical block is ", oldest_historical_block_);
    }
    return blocks_[block_number];
}

const ReferenceWorldState::Trees& ReferenceWorldState::view(const WorldStateRevision& revision) const
{
    const Fork& f = fork(revision.forkId);
    if (revision.is_historical()) {
        return committed_block(revision.blockNumber);
    }
    return revision.includeUncommitted ? f.current : f.base;
}

TreeState ReferenceWorldState::tree_state(const Trees& trees, MerkleTreeId tree_id)
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return { tree_id, trees.nullifier.tree.root(), trees.nullifier.size };
    case MerkleTreeId::NOTE_HASH_TREE:
        return { tree_id, trees.note_hash.tree.root(), trees.note_hash.size };
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return { tree_id, trees.public_data.tree.root(), trees.public_data.size };
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return { tree_id, trees.l1_to_l2.tree.root(), trees.l1_to_l2.size };
    case MerkleTreeId::ARCHIVE:
        return { tree_id, trees.archive.tree.root(), trees.archive.size };
    }
    fail("Unknown tree id ", static_cast<uint32_t>(tree_id));
}

uint64_t ReferenceWorldState::tree_size(const Trees& trees, MerkleTreeId tree_id)
{
    return tree_state(trees, tree_id).size;
}

std::vector<TreeState> ReferenceWorldState::state_reference(const Trees& trees)
{
    std::vector<TreeState> state;
    for (auto tree_id : STATE_TREES) {
        state.push_back(tree_state(trees, tree_id));
    }
    return state;
}

bool ReferenceWorldState::state_matches(const Trees& trees, std::span<const TreeState> state)
{
    // The node compares maps keyed by tree id: the same four trees, each with the same root and size.
    const auto current = state_reference(trees);
    if (state.size() != current.size()) {
        return false;
    }
    return std::all_of(current.begin(), current.end(), [&](const TreeState& expected) {
        return std::any_of(state.begin(), state.end(), [&](const TreeState& given) { return given == expected; });
    });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

std::vector<TreeState> ReferenceWorldState::get_state_reference(const WorldStateRevision& revision) const
{
    return state_reference(view(revision));
}

std::vector<TreeState> ReferenceWorldState::get_initial_state_reference() const
{
    return state_reference(blocks_[0]);
}

TreeState ReferenceWorldState::get_tree_info(const WorldStateRevision& revision, MerkleTreeId tree_id) const
{
    return tree_state(view(revision), tree_id);
}

std::optional<FF> ReferenceWorldState::get_leaf_value(const WorldStateRevision& revision,
                                                      MerkleTreeId tree_id,
                                                      uint64_t index) const
{
    if (!is_append_only(tree_id)) {
        fail("Unsupported tree type for get_leaf_value");
    }
    // As on a node: any leaf inside the tree's capacity reads (zero if unwritten), except that a historical
    // read past that block's size, or of a block it does not have, reads as no leaf.
    const Fork& f = fork(revision.forkId);
    const Trees* trees = &(revision.includeUncommitted ? f.current : f.base);
    if (revision.is_historical()) {
        if (revision.blockNumber > latest_block_number() ||
            (revision.blockNumber != 0 && revision.blockNumber < oldest_historical_block_)) {
            return std::nullopt;
        }
        trees = &blocks_[revision.blockNumber];
    }
    const AppendOnlyTree& tree = tree_id == MerkleTreeId::NOTE_HASH_TREE          ? trees->note_hash
                                 : tree_id == MerkleTreeId::L1_TO_L2_MESSAGE_TREE ? trees->l1_to_l2
                                                                                  : trees->archive;
    if (index >= (uint64_t(1) << tree.tree.depth()) || (revision.is_historical() && index >= tree.size)) {
        return std::nullopt;
    }
    return tree.tree.leaf_hash(index);
}

std::optional<IndexedLeaf<NullifierLeafValue>> ReferenceWorldState::get_nullifier_preimage(
    const WorldStateRevision& revision, uint64_t index) const
{
    // As on a node: a slot a batch left empty reads as the empty leaf; past the tree's size there is none.
    const auto& tree = view(revision).nullifier;
    if (index >= tree.size) {
        return std::nullopt;
    }
    const auto* leaf = tree.tree.payload(index);
    return leaf != nullptr ? *leaf : IndexedLeaf<NullifierLeafValue>::empty();
}

std::optional<IndexedLeaf<PublicDataLeafValue>> ReferenceWorldState::get_public_data_preimage(
    const WorldStateRevision& revision, uint64_t index) const
{
    // As on a node: a slot a batch left empty reads as the empty leaf; past the tree's size there is none.
    const auto& tree = view(revision).public_data;
    if (index >= tree.size) {
        return std::nullopt;
    }
    const auto* leaf = tree.tree.payload(index);
    return leaf != nullptr ? *leaf : IndexedLeaf<PublicDataLeafValue>::empty();
}

SiblingPath ReferenceWorldState::get_sibling_path(const WorldStateRevision& revision,
                                                  MerkleTreeId tree_id,
                                                  uint64_t index) const
{
    const Trees& trees = view(revision);
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return trees.nullifier.tree.sibling_path(index);
    case MerkleTreeId::NOTE_HASH_TREE:
        return trees.note_hash.tree.sibling_path(index);
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return trees.public_data.tree.sibling_path(index);
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return trees.l1_to_l2.tree.sibling_path(index);
    case MerkleTreeId::ARCHIVE:
        return trees.archive.tree.sibling_path(index);
    }
    fail("Unknown tree id ", static_cast<uint32_t>(tree_id));
}

std::vector<std::optional<block_number_t>> ReferenceWorldState::get_block_numbers_for_leaf_indices(
    const WorldStateRevision& revision, MerkleTreeId tree_id, std::span<const uint64_t> indices) const
{
    // Only committed blocks number leaves: up to the revision's block, or the block the fork started from.
    const Fork& f = fork(revision.forkId);
    block_number_t last = revision.is_historical() ? revision.blockNumber : f.block_number;
    committed_block(last);
    std::vector<std::optional<block_number_t>> out;
    out.reserve(indices.size());
    for (uint64_t index : indices) {
        if (index >= tree_size(blocks_[last], tree_id)) {
            out.emplace_back(std::nullopt);
            continue;
        }
        // The first block whose tree holds the index.
        block_number_t low = 0;
        block_number_t high = last;
        while (low < high) {
            block_number_t mid = low + (high - low) / 2;
            if (tree_size(blocks_[mid], tree_id) > index) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        out.emplace_back(low);
    }
    return out;
}

const PersistentKeyIndex& ReferenceWorldState::key_index(const Trees& trees, MerkleTreeId tree_id)
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return trees.nullifier.indices;
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return trees.public_data.indices;
    case MerkleTreeId::NOTE_HASH_TREE:
        return trees.note_hash.indices;
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return trees.l1_to_l2.indices;
    case MerkleTreeId::ARCHIVE:
        return trees.archive.indices;
    }
    fail("Unknown tree id ", static_cast<uint32_t>(tree_id));
}

std::optional<uint64_t> ReferenceWorldState::find_leaf_index(const WorldStateRevision& revision,
                                                             MerkleTreeId tree_id,
                                                             const FF& key,
                                                             uint64_t start) const
{
    const uint256_t k = uint256_t(key);
    const Trees& trees = view(revision);
    std::optional<uint64_t> index;
    if (revision.includeUncommitted && revision.is_historical()) {
        // As on a node: a key the fork wrote since its base is found first, whatever block the read names.
        const Fork& f = fork(revision.forkId);
        auto written = key_index(f.current, tree_id).find(k);
        if (written.has_value() && !key_index(f.base, tree_id).find(k).has_value()) {
            index = written;
        }
    }
    if (!index.has_value()) {
        index = key_index(trees, tree_id).find(k);
    }
    if (!index.has_value() || *index < start) {
        return std::nullopt;
    }
    return index;
}

GetLowIndexedLeafResponse ReferenceWorldState::find_low_leaf(const WorldStateRevision& revision,
                                                             MerkleTreeId tree_id,
                                                             const FF& key) const
{
    if (tree_id != MerkleTreeId::NULLIFIER_TREE && tree_id != MerkleTreeId::PUBLIC_DATA_TREE) {
        fail("Unsupported tree type for find_low_leaf");
    }
    if (auto index = find_leaf_index(revision, tree_id, key, 0)) {
        return GetLowIndexedLeafResponse(true, *index);
    }
    const uint256_t k = uint256_t(key);
    auto low = key_index(view(revision), tree_id).predecessor(k);
    if (revision.includeUncommitted && revision.is_historical()) {
        // As on a node: keys the fork wrote since its base count too, whatever block the read names.
        const Fork& f = fork(revision.forkId);
        const auto& current = key_index(f.current, tree_id);
        const auto& base = key_index(f.base, tree_id);
        for (auto written = current.predecessor(k); written.has_value() && (!low || written->first > low->first);
             written = current.predecessor(written->first)) {
            if (!base.find(written->first).has_value()) {
                low = written;
                break;
            }
        }
    }
    return GetLowIndexedLeafResponse(false, low.has_value() ? low->second : 0);
}

// ---------------------------------------------------------------------------
// Tree writes
// ---------------------------------------------------------------------------

void ReferenceWorldState::append(AppendOnlyTree& tree, std::span<const FF> leaves)
{
    uint64_t max = uint64_t(1) << tree.tree.depth();
    if (tree.size + leaves.size() > max) {
        fail("Unable to append leaves to tree, new size: ", tree.size + leaves.size(), " max size: ", max);
    }
    std::vector<typename decltype(tree.tree)::Leaf> hashed;
    hashed.reserve(leaves.size());
    for (size_t i = 0; i < leaves.size(); ++i) {
        hashed.push_back({ .hash = leaves[i], .payload = nullptr });
        // A node does not index zero leaves.
        if (!leaves[i].is_zero()) {
            tree.indices = tree.indices.with(uint256_t(leaves[i]), tree.size + i);
        }
    }
    tree.tree = tree.tree.with_leaves(tree.size, hashed);
    tree.size += leaves.size();
}

template <typename Tree, typename LeafValueType>
BatchInsertionResult<LeafValueType> ReferenceWorldState::batch_insert(Tree& target,
                                                                      std::span<const LeafValueType> leaves,
                                                                      uint32_t subtree_depth,
                                                                      bool capture_witness)
{
    // Mirrors ContentAddressedIndexedTree::add_or_update_values: sort the batch by descending key, update each
    // value's low leaf in that order, then append one slot per value at the batch's own position, empty for a
    // zero value or a value that updated its low leaf in place. Works on a copy, so a failure changes nothing.
    using Leaf = IndexedLeaf<LeafValueType>;
    Tree tree = target;
    const uint32_t depth = static_cast<uint32_t>(tree.tree.depth());
    const uint64_t start = tree.size;
    if (start + leaves.size() > (uint64_t(1) << depth)) {
        fail("Unable to insert values into tree ",
             LeafValueType::name(),
             " new size: ",
             start + leaves.size(),
             " max size: ",
             uint64_t(1) << depth);
    }

    BatchInsertionResult<LeafValueType> result;
    result.sorted_leaves.reserve(leaves.size());
    for (size_t i = 0; i < leaves.size(); ++i) {
        result.sorted_leaves.emplace_back(leaves[i], i);
    }
    std::sort(result.sorted_leaves.begin(), result.sorted_leaves.end(), [](const auto& a, const auto& b) {
        uint256_t a_key = uint256_t(a.first.get_key());
        uint256_t b_key = uint256_t(b.first.get_key());
        return a_key == b_key ? a.second < b.second : a_key > b_key;
    });

    std::vector<Leaf> appended(leaves.size(), Leaf::empty());
    std::vector<LeafUpdateWitnessData<LeafValueType>> witnesses;
    std::set<uint256_t> unique;
    for (const auto& [value, position] : result.sorted_leaves) {
        if (value.is_empty()) {
            continue;
        }
        uint256_t key = uint256_t(value.get_key());
        if (!unique.insert(key).second) {
            fail("Duplicate key not allowed in same batch, key value: ", value.get_key(), ", tree: ", Leaf::name());
        }
        uint64_t low_index = 0;
        bool present = false;
        if (auto exact = tree.indices.find(key)) {
            present = true;
            low_index = *exact;
        } else if (auto low = tree.indices.predecessor(key)) {
            low_index = low->second;
        }
        const Leaf* stored = tree.tree.payload(low_index);
        if (stored == nullptr) {
            fail("Unable to insert values into tree ", Leaf::name(), ", failed to find low leaf at index ", low_index);
        }
        Leaf low_leaf = *stored;
        if (capture_witness) {
            witnesses.emplace_back(low_leaf, low_index, tree.tree.sibling_path(low_index));
        }
        Leaf updated = low_leaf;
        if (!present) {
            uint64_t new_index = start + position;
            appended[static_cast<size_t>(position)] = Leaf(value, low_leaf.nextIndex, low_leaf.nextKey);
            updated.nextIndex = new_index;
            updated.nextKey = value.get_key();
            tree.indices = tree.indices.with(key, new_index);
        } else if (Leaf::is_updateable()) {
            updated = Leaf(value, low_leaf.nextIndex, low_leaf.nextKey);
        } else {
            fail("Unable to insert values into tree ",
                 Leaf::name(),
                 " leaf type ",
                 Leaf::name(),
                 " is not updateable and ",
                 value.get_key(),
                 " is already present");
        }
        tree.tree = tree.tree.with_leaf(low_index, leaf_of<Tree>(updated));
    }

    if (capture_witness) {
        // One witness slot per value: the low-leaf updates in the order they were applied, then empty ones.
        witnesses.resize(leaves.size(),
                         LeafUpdateWitnessData<LeafValueType>(Leaf::empty(), 0, SiblingPath(depth, FF::zero())));
        result.low_leaf_witness_data = std::move(witnesses);
        result.subtree_path = subtree_depth >= depth
                                  ? SiblingPath{}
                                  : tree.tree.subtree_sibling_path(start >> subtree_depth, subtree_depth);
    }

    std::vector<typename decltype(tree.tree)::Leaf> hashed;
    hashed.reserve(appended.size());
    for (const auto& leaf : appended) {
        hashed.push_back(leaf_of<Tree>(leaf));
    }
    tree.tree = tree.tree.with_leaves(start, hashed);
    tree.size = start + leaves.size();
    target = std::move(tree);
    if (!capture_witness) {
        result.sorted_leaves.clear();
    }
    return result;
}

template <typename Tree, typename LeafValueType>
SequentialInsertionResult<LeafValueType> ReferenceWorldState::sequential_insert(Tree& target,
                                                                                std::span<const LeafValueType> leaves)
{
    // Mirrors ContentAddressedIndexedTree::add_or_update_values_sequentially: each value in order updates its low
    // leaf, then (if new) is written at the next index. Zero values are skipped. Works on a copy.
    using Leaf = IndexedLeaf<LeafValueType>;
    Tree tree = target;
    const uint32_t depth = static_cast<uint32_t>(tree.tree.depth());
    SequentialInsertionResult<LeafValueType> result;
    for (const auto& value : leaves) {
        if (value.is_empty()) {
            continue;
        }
        uint256_t key = uint256_t(value.get_key());
        uint64_t low_index = 0;
        bool present = false;
        if (auto exact = tree.indices.find(key)) {
            present = true;
            low_index = *exact;
        } else if (auto low = tree.indices.predecessor(key)) {
            low_index = low->second;
        }
        const Leaf* stored = tree.tree.payload(low_index);
        if (stored == nullptr) {
            fail("Unable to insert values into tree ", Leaf::name(), ", failed to find low leaf at index ", low_index);
        }
        Leaf low_leaf = *stored;
        result.low_leaf_witness_data.emplace_back(low_leaf, low_index, tree.tree.sibling_path(low_index));
        if (!present) {
            uint64_t new_index = tree.size;
            Leaf fresh(value, low_leaf.nextIndex, low_leaf.nextKey);
            Leaf updated = low_leaf;
            updated.nextIndex = new_index;
            updated.nextKey = value.get_key();
            tree.tree = tree.tree.with_leaf(low_index, leaf_of<Tree>(updated));
            result.insertion_witness_data.emplace_back(Leaf::empty(), new_index, tree.tree.sibling_path(new_index));
            tree.tree = tree.tree.with_leaf(new_index, leaf_of<Tree>(fresh));
            tree.indices = tree.indices.with(key, new_index);
            tree.size++;
        } else if (Leaf::is_updateable()) {
            tree.tree =
                tree.tree.with_leaf(low_index, leaf_of<Tree>(Leaf(value, low_leaf.nextIndex, low_leaf.nextKey)));
            result.insertion_witness_data.emplace_back(Leaf::empty(), 0, SiblingPath(depth, FF::zero()));
        } else {
            fail("Unable to insert values into tree ",
                 Leaf::name(),
                 " leaf type ",
                 Leaf::name(),
                 " is not updateable and ",
                 value.get_key(),
                 " is already present");
        }
    }
    if (tree.size > (uint64_t(1) << depth)) {
        fail("Unable to insert values into tree ", Leaf::name(), " new size: ", tree.size);
    }
    target = std::move(tree);
    return result;
}

void ReferenceWorldState::append_leaves(uint64_t fork_id, MerkleTreeId tree_id, std::span<const FF> leaves)
{
    Trees& trees = fork(fork_id).current;
    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
        return append(trees.note_hash, leaves);
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return append(trees.l1_to_l2, leaves);
    case MerkleTreeId::ARCHIVE:
        return append(trees.archive, leaves);
    default:
        fail("Unsupported tree type for append_leaves");
    }
}

BatchInsertionResult<NullifierLeafValue> ReferenceWorldState::batch_insert_nullifiers(
    uint64_t fork_id, std::span<const NullifierLeafValue> leaves, uint32_t subtree_depth)
{
    return batch_insert(fork(fork_id).current.nullifier, leaves, subtree_depth, true);
}

BatchInsertionResult<PublicDataLeafValue> ReferenceWorldState::batch_insert_public_data(
    uint64_t fork_id, std::span<const PublicDataLeafValue> leaves, uint32_t subtree_depth)
{
    return batch_insert(fork(fork_id).current.public_data, leaves, subtree_depth, true);
}

SequentialInsertionResult<NullifierLeafValue> ReferenceWorldState::sequential_insert_nullifiers(
    uint64_t fork_id, std::span<const NullifierLeafValue> leaves)
{
    return sequential_insert(fork(fork_id).current.nullifier, leaves);
}

SequentialInsertionResult<PublicDataLeafValue> ReferenceWorldState::sequential_insert_public_data(
    uint64_t fork_id, std::span<const PublicDataLeafValue> leaves)
{
    return sequential_insert(fork(fork_id).current.public_data, leaves);
}

void ReferenceWorldState::update_archive(uint64_t fork_id,
                                         std::span<const TreeState> block_state_ref,
                                         const FF& block_header_hash)
{
    Trees& trees = fork(fork_id).current;
    if (!state_matches(trees, block_state_ref)) {
        fail("Can't update archive tree: Block state does not match world state");
    }
    append(trees.archive, std::span<const FF>(&block_header_hash, 1));
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

void ReferenceWorldState::create_checkpoint(uint64_t fork_id)
{
    Fork& f = fork(fork_id);
    f.checkpoints.push_back(f.current);
}

void ReferenceWorldState::commit_checkpoint(uint64_t fork_id)
{
    Fork& f = fork(fork_id);
    if (f.checkpoints.empty()) {
        fail("Cannot commit without a checkpoint");
    }
    f.checkpoints.pop_back();
}

void ReferenceWorldState::revert_checkpoint(uint64_t fork_id)
{
    Fork& f = fork(fork_id);
    if (f.checkpoints.empty()) {
        fail("Cannot revert without a checkpoint");
    }
    f.current = std::move(f.checkpoints.back());
    f.checkpoints.pop_back();
}

void ReferenceWorldState::commit_all_checkpoints(uint64_t fork_id)
{
    Fork& f = fork(fork_id);
    if (f.checkpoints.empty()) {
        fail("Invalid depth for commit_to_depth");
    }
    f.checkpoints.clear();
}

void ReferenceWorldState::revert_all_checkpoints(uint64_t fork_id)
{
    Fork& f = fork(fork_id);
    if (f.checkpoints.empty()) {
        fail("Invalid depth for revert_to_depth");
    }
    f.current = std::move(f.checkpoints.front());
    f.checkpoints.clear();
}

// ---------------------------------------------------------------------------
// Forks
// ---------------------------------------------------------------------------

uint64_t ReferenceWorldState::create_fork(std::optional<block_number_t> block_number)
{
    block_number_t block = block_number.value_or(latest_block_number());
    const Trees& trees = committed_block(block);
    uint64_t fork_id = next_fork_id_++;
    forks_.emplace(fork_id, Fork{ .block_number = block, .base = trees, .current = trees, .checkpoints = {} });
    return fork_id;
}

void ReferenceWorldState::delete_fork(uint64_t fork_id)
{
    if (fork_id == 0) {
        fail("Unable to delete canonical fork");
    }
    fork(fork_id);
    forks_.erase(fork_id);
}

// ---------------------------------------------------------------------------
// The canonical chain
// ---------------------------------------------------------------------------

void ReferenceWorldState::commit()
{
    Fork& canonical = fork(0);
    blocks_.push_back(canonical.current);
    // As on a node, the oldest historical block is 1 from the first commit on, unwinding included; block 0
    // stays readable regardless.
    oldest_historical_block_ = std::max<block_number_t>(oldest_historical_block_, 1);
    canonical.block_number = latest_block_number();
    canonical.base = canonical.current;
    canonical.checkpoints.clear();
}

void ReferenceWorldState::rollback()
{
    Fork& canonical = fork(0);
    canonical.current = canonical.base;
    canonical.checkpoints.clear();
}

void ReferenceWorldState::sync_block(std::span<const TreeState> block_state_ref,
                                     const FF& block_header_hash,
                                     std::span<const FF> padded_note_hashes,
                                     std::span<const FF> padded_l1_to_l2_messages,
                                     std::span<const NullifierLeafValue> padded_nullifiers,
                                     std::span<const PublicDataLeafValue> public_data_writes,
                                     const std::optional<FF>& expected_archive_root,
                                     const std::optional<FF>& expected_previous_archive_root)
{
    rollback();
    Fork& canonical = fork(0);
    if (expected_previous_archive_root.has_value()) {
        FF actual = canonical.base.archive.tree.root();
        if (actual != *expected_previous_archive_root) {
            fail("Can't sync block: local archive root ",
                 actual,
                 " does not match the block's previous archive root ",
                 *expected_previous_archive_root,
                 "; world state has diverged from the canonical chain and must be resynced");
        }
    }

    Trees trees = canonical.base;
    try {
        batch_insert(trees.nullifier, padded_nullifiers, 0, false);
        append(trees.note_hash, padded_note_hashes);
        append(trees.l1_to_l2, padded_l1_to_l2_messages);
        append(trees.archive, std::span<const FF>(&block_header_hash, 1));
        sequential_insert(trees.public_data, public_data_writes);
    } catch (const std::exception& e) {
        fail("Failed to sync block: ", e.what());
    }

    auto tip = trees.archive.indices.find(uint256_t(block_header_hash));
    if (!tip.has_value() || *tip + 1 != trees.archive.size) {
        fail("Can't synch block: block header hash is not the tip of the archive tree");
    }
    if (!state_matches(trees, block_state_ref)) {
        fail("Can't synch block: block state does not match world state");
    }
    if (expected_archive_root.has_value() && trees.archive.tree.root() != *expected_archive_root) {
        fail("Can't sync block: resulting archive root ",
             trees.archive.tree.root(),
             " does not match the block's archive root ",
             *expected_archive_root,
             "; world state has diverged from the canonical chain and must be resynced");
    }
    canonical.current = std::move(trees);
    commit();
}

void ReferenceWorldState::finalize_blocks(block_number_t to_block_number)
{
    if (to_block_number == 0) {
        fail("Unable to finalize block 0");
    }
    if (to_block_number <= finalized_block_number_) {
        return;
    }
    if (to_block_number > latest_block_number()) {
        fail("Unable to finalize block ",
             to_block_number,
             " currently unfinalized block height ",
             latest_block_number());
    }
    finalized_block_number_ = to_block_number;
}

void ReferenceWorldState::drop_forks_of(block_number_t block_number)
{
    for (auto it = forks_.begin(); it != forks_.end();) {
        it = it->first != 0 && it->second.block_number == block_number ? forks_.erase(it) : std::next(it);
    }
}

void ReferenceWorldState::unwind_blocks(block_number_t to_block_number)
{
    // As on a node: one block at a time from the tip, so a request that reaches a finalized block fails there,
    // keeping the blocks it already unwound.
    rollback();
    block_number_t latest = latest_block_number();
    if (to_block_number >= latest) {
        fail("Unable to unwind blocks to block number ", to_block_number, ", current pending block ", latest);
    }
    Fork& canonical = fork(0);
    for (block_number_t block = latest; block > to_block_number; --block) {
        if (block <= finalized_block_number_) {
            fail("Unable to unwind block: ", block, " finalizedBlockHeight: ", finalized_block_number_);
        }
        blocks_.pop_back();
        drop_forks_of(block);
        canonical.block_number = latest_block_number();
        canonical.base = blocks_.back();
        canonical.current = blocks_.back();
    }
}

void ReferenceWorldState::remove_historical_blocks(block_number_t to_block_number)
{
    // As on a node: one block at a time from the oldest, never a block that is not yet finalized. The genesis
    // block is never removed. States stay in memory (they share almost all of their nodes with their
    // successors); only reads of removed blocks stop.
    block_number_t oldest = status().oldest_historical_block;
    if (to_block_number <= oldest) {
        fail("Unable to remove historical blocks to block number ",
             to_block_number,
             ", blocks not found. Current oldest block: ",
             oldest);
    }
    for (block_number_t block = oldest; block < to_block_number; ++block) {
        if (block < 1) {
            fail("Unable to remove historical block: ", block);
        }
        if (block >= finalized_block_number_) {
            fail("Unable to remove historical block: ", block, " finalizedBlockHeight: ", finalized_block_number_);
        }
        oldest_historical_block_ = block + 1;
        drop_forks_of(block);
    }
}

StatusSummary ReferenceWorldState::status() const
{
    return StatusSummary{ .unfinalized_block_number = latest_block_number(),
                          .finalized_block_number = finalized_block_number_,
                          .oldest_historical_block = oldest_historical_block_,
                          .trees_are_synched = true };
}

std::array<TreeMetaInfo, 5> ReferenceWorldState::tree_meta() const
{
    const Fork& canonical = fork(0);
    const StatusSummary summary = status();
    std::array<TreeMetaInfo, 5> meta{};
    for (auto tree_id : ALL_TREES) {
        const TreeState current = tree_state(canonical.current, tree_id);
        const TreeState initial = tree_state(blocks_[0], tree_id);
        meta[static_cast<size_t>(tree_id)] = TreeMetaInfo{
            .tree_id = tree_id,
            .depth = tree_height(tree_id),
            .root = current.root,
            .size = current.size,
            .committed_size = tree_size(canonical.base, tree_id),
            .initial_root = initial.root,
            .initial_size = initial.size,
            .oldest_historic_block = summary.oldest_historical_block,
            .unfinalized_block_height = summary.unfinalized_block_number,
            .finalized_block_height = summary.finalized_block_number,
        };
    }
    return meta;
}

FF ReferenceWorldState::compute_genesis_block_header_hash(std::span<const TreeState> state,
                                                          uint64_t genesis_timestamp,
                                                          const FF& header_generator_point)
{
    auto tree = [&](MerkleTreeId tree_id) {
        for (const auto& entry : state) {
            if (entry.tree_id == tree_id) {
                return entry;
            }
        }
        fail("compute_genesis_block_header_hash: missing tree ", static_cast<uint32_t>(tree_id));
    };
    // BlockHeader::serialize (block_header.nr) with every field zero except the state: the last
    // archive is empty, and the sponge blob hash, tx effects root, global variables (other than the
    // timestamp), total fees and mana used are all zero at genesis.
    return crypto::merkle_tree::Poseidon2HashPolicy::hash({
        header_generator_point,
        FF(0), // last archive root
        FF(0), // last archive next_available_leaf_index
        tree(MerkleTreeId::L1_TO_L2_MESSAGE_TREE).root,
        FF(tree(MerkleTreeId::L1_TO_L2_MESSAGE_TREE).size),
        tree(MerkleTreeId::NOTE_HASH_TREE).root,
        FF(tree(MerkleTreeId::NOTE_HASH_TREE).size),
        tree(MerkleTreeId::NULLIFIER_TREE).root,
        FF(tree(MerkleTreeId::NULLIFIER_TREE).size),
        tree(MerkleTreeId::PUBLIC_DATA_TREE).root,
        FF(tree(MerkleTreeId::PUBLIC_DATA_TREE).size),
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
