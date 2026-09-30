#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <stack>
#include <string>
#include <vector>

#include "barretenberg/world_state_reference/memory_merkle_db.hpp"
#include "barretenberg/world_state_reference/merkle_tree_id.hpp"

namespace bb::world_state {

/**
 * @brief The genesis a world state starts from: indexed-tree prefill and the genesis block's timestamp.
 * @details canonical() is the protocol's: the protocol contracts' registration nullifiers, no public
 * data, timestamp 0. Anything else is for tests of the reference itself.
 */
struct GenesisConfig {
    std::vector<NullifierLeafValue> prefilled_nullifiers;
    std::vector<PublicDataLeafValue> prefilled_public_data;
    uint64_t genesis_timestamp = 0;

    static GenesisConfig canonical();
};

/** @brief One tree's root and size, as a state reference reports it. */
struct TreeState {
    MerkleTreeId tree_id;
    FF root;
    uint64_t size;
    bool operator==(const TreeState& other) const = default;
};

/**
 * @brief The in-memory reference world state behind the wsdb base contract (wsdb_base_schema.jsonc).
 *
 * All five trees at protocol height: the four MemoryMerkleDB trees plus the archive. It is one fork
 * (fork 0) with no block history, which is all the protocol's own flows need: build a genesis, read
 * witnesses, append and insert leaves, and advance the archive.
 *
 * The genesis snapshot never changes (the base contract has no Commit), so reads resolve against one
 * of two states: the genesis, for block 0 or for committed reads of the latest block, and the current
 * state, for uncommitted reads of the latest block. That is what a node world state answers on fork 0
 * before its first commit. Checkpoints copy the current state onto a stack.
 *
 * Genesis matches the node world state: the indexed trees hold their prefill, and the archive holds
 * one leaf, the hash of the genesis block header built from the four trees' genesis roots.
 *
 * Methods take already validated input; the check_* helpers return why a request cannot be served,
 * so a caller can answer with an error instead of aborting (wasm builds have no exceptions).
 */
class ReferenceWorldState {
  public:
    using ArchiveTree = MemoryAppendOnlyTree<aztec::AztecMerkleHashPolicy>;

    /** Leaves each indexed tree starts with, prefill included, as on a node. */
    static constexpr size_t INDEXED_TREE_INITIAL_SIZE = 128;

    explicit ReferenceWorldState(const GenesisConfig& genesis = GenesisConfig::canonical());

    /** Why `genesis` cannot seed a world state, or nullopt when it can. */
    static std::optional<std::string> check_genesis(const GenesisConfig& genesis);

    /**
     * @brief Why a read at this revision cannot be served, or nullopt when it can.
     * @details Fork 0 only; the block must be 0 (the genesis) or WorldStateRevision::LATEST.
     */
    static std::optional<std::string> check_revision(const WorldStateRevision& revision);

    /** Why a write to this fork cannot be served, or nullopt when it can. */
    static std::optional<std::string> check_fork(uint64_t fork_id);

    /** The tree height the protocol fixes for `tree_id`. */
    static uint32_t tree_height(MerkleTreeId tree_id);

    // Reads. `revision` must have passed check_revision.
    std::vector<TreeState> get_state_reference(const WorldStateRevision& revision) const;
    std::vector<TreeState> get_initial_state_reference() const;
    TreeState get_tree_info(const WorldStateRevision& revision, MerkleTreeId tree_id) const;
    /** Leaf of an append-only tree (note hash, L1-to-L2 message, archive); nullopt past its size. */
    std::optional<FF> get_leaf_value(const WorldStateRevision& revision, MerkleTreeId tree_id, uint64_t index) const;
    std::optional<IndexedLeaf<NullifierLeafValue>> get_nullifier_preimage(const WorldStateRevision& revision,
                                                                          uint64_t index) const;
    std::optional<IndexedLeaf<PublicDataLeafValue>> get_public_data_preimage(const WorldStateRevision& revision,
                                                                             uint64_t index) const;
    SiblingPath get_sibling_path(const WorldStateRevision& revision, MerkleTreeId tree_id, uint64_t index) const;
    /** First index at or after `start` holding `leaf` in an append-only tree. */
    std::optional<uint64_t> find_leaf_index(const WorldStateRevision& revision,
                                            MerkleTreeId tree_id,
                                            const FF& leaf,
                                            uint64_t start) const;
    /** First index at or after `start` of the indexed-tree leaf with `key` (a nullifier, or a slot). */
    std::optional<uint64_t> find_indexed_leaf_index(const WorldStateRevision& revision,
                                                    MerkleTreeId tree_id,
                                                    const FF& key,
                                                    uint64_t start) const;
    GetLowIndexedLeafResponse find_low_leaf(const WorldStateRevision& revision,
                                            MerkleTreeId tree_id,
                                            const FF& key) const;

    // Writes, all to the current state.
    /** Append to an append-only tree (note hash, L1-to-L2 message, archive). */
    void append_leaves(MerkleTreeId tree_id, std::span<const FF> leaves);
    SequentialInsertionResult<NullifierLeafValue> insert_nullifier(const NullifierLeafValue& leaf);
    SequentialInsertionResult<PublicDataLeafValue> insert_public_data(const PublicDataLeafValue& leaf);
    /** Whether `nullifier` is already in the current nullifier tree (inserting it again is an error). */
    bool has_nullifier(const FF& nullifier) const;
    /** Whether `state` equals the current state of the four non-archive trees, as UpdateArchive requires. */
    bool state_matches(std::span<const TreeState> state) const;
    void update_archive(const FF& block_header_hash);

    void create_checkpoint();
    void commit_checkpoint();
    void revert_checkpoint();
    void commit_all_checkpoints();
    void revert_all_checkpoints();
    bool has_checkpoint() const { return !checkpoints_.empty(); }

    /** The genesis block header hash: the archive's first leaf. */
    const FF& genesis_block_header_hash() const { return genesis_block_header_hash_; }

    /**
     * @brief Hash of the genesis block header over `trees` (nullifier, note hash, public data, L1-to-L2).
     * @details Must match BlockHeader::hash in noir-protocol-circuits' block_header.nr for a header whose
     * only non-zero fields are the four trees' state and the timestamp.
     */
    static FF compute_genesis_block_header_hash(const TreeRoots& trees, uint64_t genesis_timestamp);

  private:
    struct State {
        MemoryMerkleDB trees;
        ArchiveTree archive;
    };

    const State& view(const WorldStateRevision& revision) const;

    State genesis_;
    State current_;
    std::stack<State> checkpoints_;
    FF genesis_block_header_hash_;
};

} // namespace bb::world_state
