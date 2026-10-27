#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <map>
#include <optional>
#include <span>
#include <string>
#include <utility>
#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/aztec/aztec_hash_policy.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/world_state_reference/merkle_tree_id.hpp"
#include "barretenberg/world_state_reference/persistent_key_index.hpp"
#include "barretenberg/world_state_reference/persistent_merkle_tree.hpp"

namespace bb::world_state {

using FF = bb::fr;
using crypto::merkle_tree::GetLowIndexedLeafResponse;
using crypto::merkle_tree::IndexedLeaf;
using crypto::merkle_tree::LeafUpdateWitnessData;
using crypto::merkle_tree::NullifierLeafValue;
using crypto::merkle_tree::PublicDataLeafValue;
using crypto::merkle_tree::SequentialInsertionResult;
using SiblingPath = crypto::merkle_tree::fr_sibling_path;
using numeric::uint256_t;

/**
 * @brief The genesis a world state starts from, as a node world state is configured with it.
 * @details canonical() is the protocol's: the protocol contracts' registration nullifiers, no public
 * data, timestamp 0.
 */
struct GenesisConfig {
    std::vector<NullifierLeafValue> prefilled_nullifiers;
    std::vector<PublicDataLeafValue> prefilled_public_data;
    uint64_t genesis_timestamp = 0;
    /** The first field of the genesis block header's hash preimage (its domain separator). */
    FF header_generator_point = FF(DOM_SEP__BLOCK_HEADER_HASH);

    static GenesisConfig canonical();
};

/** @brief One tree's root and size, as a state reference reports it. */
struct TreeState {
    MerkleTreeId tree_id;
    FF root;
    uint64_t size;
    bool operator==(const TreeState& other) const = default;
};

/** @brief What a node world state reports about one tree of the canonical chain. */
struct TreeMetaInfo {
    MerkleTreeId tree_id;
    uint32_t depth;
    FF root;
    uint64_t size;
    uint64_t committed_size;
    FF initial_root;
    uint64_t initial_size;
    block_number_t oldest_historic_block;
    block_number_t unfinalized_block_height;
    block_number_t finalized_block_height;
};

struct StatusSummary {
    block_number_t unfinalized_block_number;
    block_number_t finalized_block_number;
    block_number_t oldest_historical_block;
    bool trees_are_synched;
};

template <typename LeafValueType> struct BatchInsertionResult {
    std::vector<LeafUpdateWitnessData<LeafValueType>> low_leaf_witness_data;
    /** The batch sorted by descending key, each with its position in the batch. */
    std::vector<std::pair<LeafValueType, uint64_t>> sorted_leaves;
    SiblingPath subtree_path;
};

/**
 * @brief The in-memory reference world state: the node world state's contract (wsdb_schema.jsonc)
 * over trees whose versions share structure.
 *
 * Holds the canonical chain (one state per committed block, from genesis), its uncommitted state, and
 * any number of forks. A fork starts from the state at a committed block and is written to on its own,
 * with a stack of checkpoints. Every one of these is a copy of the persistent trees, which costs one
 * pointer per tree, so keeping every block, forking and checkpointing are all free.
 *
 * Reads take a revision, resolved as a node world state resolves it:
 * - a block number other than WorldStateRevision::LATEST reads the committed state at that block;
 * - otherwise includeUncommitted reads the fork's current state, and a committed read sees the state
 *   the fork started from (for the canonical fork, the latest committed block).
 *
 * Roots, sibling paths, insertion witnesses and indices follow the node world state (the
 * content-addressed trees in native-packages/wsdb) for the same requests. Every failure is a
 * std::runtime_error whose message a caller can return as the request's error.
 */
class ReferenceWorldState {
  public:
    /** Leaves each indexed tree starts with, prefill included, as on a node. */
    static constexpr size_t INDEXED_TREE_INITIAL_SIZE = 128;

    explicit ReferenceWorldState(const GenesisConfig& genesis = GenesisConfig::canonical());

    /** Why `genesis` cannot seed a world state, or nullopt when it can. */
    static std::optional<std::string> check_genesis(const GenesisConfig& genesis);

    /** Restarts from `genesis`: every block, fork and uncommitted write is dropped. */
    void reset(const GenesisConfig& genesis);

    /** The tree height the protocol fixes for `tree_id`. */
    static uint32_t tree_height(MerkleTreeId tree_id);

    // Reads.
    std::vector<TreeState> get_state_reference(const WorldStateRevision& revision) const;
    std::vector<TreeState> get_initial_state_reference() const;
    TreeState get_tree_info(const WorldStateRevision& revision, MerkleTreeId tree_id) const;
    /**
     * @brief Leaf of an append-only tree (note hash, L1-to-L2 message, archive), read as a node reads it: zero if
     * unwritten, nullopt past the tree's capacity, and for a historical read nullopt past that block's size or
     * for a block the chain does not have.
     */
    std::optional<FF> get_leaf_value(const WorldStateRevision& revision, MerkleTreeId tree_id, uint64_t index) const;
    /** Preimage of an indexed-tree leaf: the empty leaf for a slot a batch left empty, nullopt past the tree's size. */
    std::optional<IndexedLeaf<NullifierLeafValue>> get_nullifier_preimage(const WorldStateRevision& revision,
                                                                          uint64_t index) const;
    std::optional<IndexedLeaf<PublicDataLeafValue>> get_public_data_preimage(const WorldStateRevision& revision,
                                                                             uint64_t index) const;
    SiblingPath get_sibling_path(const WorldStateRevision& revision, MerkleTreeId tree_id, uint64_t index) const;
    /** The block that added each leaf index; nullopt for an index the revision's committed tree does not hold. */
    std::vector<std::optional<block_number_t>> get_block_numbers_for_leaf_indices(
        const WorldStateRevision& revision, MerkleTreeId tree_id, std::span<const uint64_t> indices) const;
    /**
     * @brief The index holding `key` (an append-only leaf, a nullifier or a public-data slot), if it is at or
     * after `start`. Each key has one index, the first it was written at; zero leaves are not indexed.
     */
    std::optional<uint64_t> find_leaf_index(const WorldStateRevision& revision,
                                            MerkleTreeId tree_id,
                                            const FF& key,
                                            uint64_t start) const;
    GetLowIndexedLeafResponse find_low_leaf(const WorldStateRevision& revision,
                                            MerkleTreeId tree_id,
                                            const FF& key) const;

    // Writes to a fork's current state (fork 0 is the canonical chain's uncommitted state).
    void append_leaves(uint64_t fork_id, MerkleTreeId tree_id, std::span<const FF> leaves);
    BatchInsertionResult<NullifierLeafValue> batch_insert_nullifiers(uint64_t fork_id,
                                                                     std::span<const NullifierLeafValue> leaves,
                                                                     uint32_t subtree_depth);
    BatchInsertionResult<PublicDataLeafValue> batch_insert_public_data(uint64_t fork_id,
                                                                       std::span<const PublicDataLeafValue> leaves,
                                                                       uint32_t subtree_depth);
    SequentialInsertionResult<NullifierLeafValue> sequential_insert_nullifiers(
        uint64_t fork_id, std::span<const NullifierLeafValue> leaves);
    SequentialInsertionResult<PublicDataLeafValue> sequential_insert_public_data(
        uint64_t fork_id, std::span<const PublicDataLeafValue> leaves);
    /** Appends `block_header_hash` to the archive, if `block_state_ref` is the fork's current state. */
    void update_archive(uint64_t fork_id, std::span<const TreeState> block_state_ref, const FF& block_header_hash);

    void create_checkpoint(uint64_t fork_id);
    void commit_checkpoint(uint64_t fork_id);
    void revert_checkpoint(uint64_t fork_id);
    void commit_all_checkpoints(uint64_t fork_id);
    void revert_all_checkpoints(uint64_t fork_id);

    /** A fork from the committed state at `block_number`, or at the latest block. */
    uint64_t create_fork(std::optional<block_number_t> block_number);
    void delete_fork(uint64_t fork_id);

    // The canonical chain.
    /** Commits the uncommitted state as the next block. */
    void commit();
    void rollback();
    /**
     * @brief Applies a block's effects to the canonical chain and commits it, as a node syncing a block does.
     * @details Rolls back first. Fails, committing nothing, unless the result is `block_state_ref` with
     * `block_header_hash` at the archive's tip, and the archive roots before and after match the expected
     * ones when given.
     */
    void sync_block(std::span<const TreeState> block_state_ref,
                    const FF& block_header_hash,
                    std::span<const FF> padded_note_hashes,
                    std::span<const FF> padded_l1_to_l2_messages,
                    std::span<const NullifierLeafValue> padded_nullifiers,
                    std::span<const PublicDataLeafValue> public_data_writes,
                    const std::optional<FF>& expected_archive_root,
                    const std::optional<FF>& expected_previous_archive_root);
    void finalize_blocks(block_number_t to_block_number);
    void unwind_blocks(block_number_t to_block_number);
    void remove_historical_blocks(block_number_t to_block_number);

    StatusSummary status() const;
    /** Per-tree meta for a full status, in MerkleTreeId order. */
    std::array<TreeMetaInfo, 5> tree_meta() const;

    block_number_t latest_block_number() const { return static_cast<block_number_t>(blocks_.size() - 1); }
    bool has_fork(uint64_t fork_id) const { return forks_.contains(fork_id); }

    /**
     * @brief Hash of the genesis block header over the four state trees' genesis state.
     * @details Must match BlockHeader::hash in noir-protocol-circuits' block_header.nr for a header whose
     * only non-zero fields are the four trees' state and the timestamp.
     */
    static FF compute_genesis_block_header_hash(std::span<const TreeState> state,
                                                uint64_t genesis_timestamp,
                                                const FF& header_generator_point);

  private:
    struct NoPayload {};

    /** A note hash, L1-to-L2 message or archive tree: leaves are values. */
    struct AppendOnlyTree {
        PersistentMerkleTree<aztec::AztecMerkleHashPolicy, NoPayload> tree;
        PersistentKeyIndex indices;
        uint64_t size = 0;
    };

    /** A nullifier or public-data tree: leaves are hashes of the preimages they carry. */
    template <typename LeafValueType, typename HashingPolicy> struct IndexedTree {
        using Hashing = HashingPolicy;
        using Leaf = typename PersistentMerkleTree<HashingPolicy, IndexedLeaf<LeafValueType>>::Leaf;
        PersistentMerkleTree<HashingPolicy, IndexedLeaf<LeafValueType>> tree;
        PersistentKeyIndex indices;
        uint64_t size = 0;
    };
    using NullifierTree = IndexedTree<NullifierLeafValue, aztec::NullifierMerkleHashPolicy>;
    using PublicDataTree = IndexedTree<PublicDataLeafValue, aztec::PublicDataMerkleHashPolicy>;

    /** All five trees. Copying one is copying ten pointers. */
    struct Trees {
        NullifierTree nullifier;
        AppendOnlyTree note_hash;
        PublicDataTree public_data;
        AppendOnlyTree l1_to_l2;
        AppendOnlyTree archive;
    };

    struct Fork {
        /** The committed block the fork started from (for the canonical fork, the latest block). */
        block_number_t block_number;
        Trees base;
        Trees current;
        std::vector<Trees> checkpoints;
    };

    static Trees build_genesis(const GenesisConfig& genesis);

    const Fork& fork(uint64_t fork_id) const;
    Fork& fork(uint64_t fork_id);
    const Trees& committed_block(block_number_t block_number) const;
    const Trees& view(const WorldStateRevision& revision) const;
    /** Drops the forks of `block_number`, as unwinding or removing that block does. */
    void drop_forks_of(block_number_t block_number);

    static TreeState tree_state(const Trees& trees, MerkleTreeId tree_id);
    static const PersistentKeyIndex& key_index(const Trees& trees, MerkleTreeId tree_id);
    static std::vector<TreeState> state_reference(const Trees& trees);
    static bool state_matches(const Trees& trees, std::span<const TreeState> state);
    static uint64_t tree_size(const Trees& trees, MerkleTreeId tree_id);

    static void append(AppendOnlyTree& tree, std::span<const FF> leaves);
    template <typename Tree, typename LeafValueType>
    static BatchInsertionResult<LeafValueType> batch_insert(Tree& tree,
                                                            std::span<const LeafValueType> leaves,
                                                            uint32_t subtree_depth,
                                                            bool capture_witness);
    template <typename Tree, typename LeafValueType>
    static SequentialInsertionResult<LeafValueType> sequential_insert(Tree& tree,
                                                                      std::span<const LeafValueType> leaves);

    std::vector<Trees> blocks_;
    std::map<uint64_t, Fork> forks_;
    uint64_t next_fork_id_ = 1;
    block_number_t finalized_block_number_ = 0;
    block_number_t oldest_historical_block_ = 0;
};

} // namespace bb::world_state
