#pragma once
/**
 * @file wsdb_ipc_merkle_db.hpp
 * @brief LowLevelMerkleDBInterface implementation backed by WSDB IPC.
 *
 * Connects to an aztec-wsdb process over Unix Domain Socket and translates
 * each LowLevelMerkleDBInterface call into the corresponding WSDB IPC command.
 */

#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_client.hpp"

#include <optional>
#include <stack>

namespace bb::avm2::simulation {

class WsdbIpcMerkleDB final : public avm2::simulation::LowLevelMerkleDBInterface {
  public:
    /**
     * @brief Construct from a connected WSDB IPC client and world state revision.
     * @param client Reference to a connected WsdbIpcClient.
     * @param revision The world state revision (includes forkId) to use for queries.
     */
    WsdbIpcMerkleDB(wsdb::WsdbIpcClient& client, world_state::WorldStateRevision revision);

    avm2::TreeSnapshots get_tree_roots() const override;

    // Query methods
    avm2::simulation::SiblingPath get_sibling_path(avm2::simulation::MerkleTreeId tree_id,
                                                   avm2::simulation::index_t leaf_index) const override;
    crypto::merkle_tree::GetLowIndexedLeafResponse get_low_indexed_leaf(avm2::simulation::MerkleTreeId tree_id,
                                                                        const avm2::FF& value) const override;
    avm2::FF get_leaf_value(avm2::simulation::MerkleTreeId tree_id,
                            avm2::simulation::index_t leaf_index) const override;
    avm2::simulation::IndexedLeaf<avm2::simulation::PublicDataLeafValue> get_leaf_preimage_public_data_tree(
        avm2::simulation::index_t leaf_index) const override;
    avm2::simulation::IndexedLeaf<avm2::simulation::NullifierLeafValue> get_leaf_preimage_nullifier_tree(
        avm2::simulation::index_t leaf_index) const override;

    // State modification methods
    avm2::simulation::SequentialInsertionResult<avm2::simulation::PublicDataLeafValue>
    insert_indexed_leaves_public_data_tree(const avm2::simulation::PublicDataLeafValue& leaf_value) override;
    avm2::simulation::SequentialInsertionResult<avm2::simulation::NullifierLeafValue>
    insert_indexed_leaves_nullifier_tree(const avm2::simulation::NullifierLeafValue& leaf_value) override;
    void append_leaves(avm2::simulation::MerkleTreeId tree_id, std::span<const avm2::FF> leaves) override;
    void pad_tree(avm2::simulation::MerkleTreeId tree_id, size_t num_leaves) override;

    // Checkpoint methods
    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;
    uint32_t get_checkpoint_id() const override;

  private:
    template <typename T> static std::vector<uint8_t> serialize_to_msgpack(const T& value);
    template <typename T> static T deserialize_from_msgpack(const std::vector<uint8_t>& bytes);

    /** Invalidate the cached tree roots (call after any write operation). */
    void invalidate_tree_roots_cache();

    wsdb::WsdbIpcClient& client_;
    world_state::WorldStateRevision revision_;
    std::stack<uint32_t> checkpoint_stack_{ { 0 } };
    /** Cached tree roots — avoids 5 IPC round trips per get_tree_roots() call. */
    mutable std::optional<avm2::TreeSnapshots> cached_tree_roots_;
};

} // namespace bb::avm2::simulation
