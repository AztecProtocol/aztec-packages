#pragma once

#include "barretenberg/vm/avm/generated/relations/poseidon2.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/execution_hints.hpp"
#include "barretenberg/vm/avm/trace/gadgets/poseidon2.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"

#include <vector>
namespace bb::avm_trace {

class AvmMerkleTreeTraceBuilder {
  public:
    struct MerkleEntry {
        uint32_t clk;
        FF leaf_value{};
        uint64_t leaf_index;
        std::vector<FF> path;
        // Could probably get away with not having this and computing in finalize
        std::vector<FF> path_values;
        FF root{};
    };

    AvmMerkleTreeTraceBuilder() = default;
    AvmMerkleTreeTraceBuilder(TreeSnapshots& tree_snapshots)
        : tree_snapshots(tree_snapshots){};

    void reset();

    void checkpoint_non_revertible_state();
    void rollback_to_non_revertible_checkpoint();

    bool check_membership(
        uint32_t clk, const FF& leaf_value, const uint64_t leaf_index, const std::vector<FF>& path, const FF& root);

    FF update_leaf_index(uint32_t clk, const FF& leaf_value, const uint64_t leaf_index, const std::vector<FF>& path);

    FF silo_note_hash(uint32_t clk, FF contract_address, FF note_hash);

    FF silo_nullifier(uint32_t clk, FF contract_address, FF nullifier);

    FF compute_public_tree_leaf_slot(uint32_t clk, FF contract_address, FF leaf_index);

    TreeSnapshots& get_tree_snapshots() { return tree_snapshots; }

    // Public Data Tree
    bool perform_storage_read(uint32_t clk,
                              const PublicDataTreeLeafPreimage& preimage,
                              const FF& leaf_index,
                              const std::vector<FF>& path) const;

    FF perform_storage_write(uint32_t clk,
                             PublicDataTreeLeafPreimage& low_preimage,
                             const FF& low_index,
                             const std::vector<FF>& low_path,
                             const FF& slot,
                             const FF& value,
                             const std::vector<FF>& insertion_path);

    // Nullifier Tree
    bool perform_nullifier_read(uint32_t clk,
                                const NullifierLeafPreimage& preimage,
                                const FF& leaf_index,
                                const std::vector<FF>& path) const;

    FF perform_nullifier_append(uint32_t clk,
                                NullifierLeafPreimage& low_preimage,
                                const FF& low_index,
                                const std::vector<FF>& low_path,
                                const FF& nullifier,
                                const std::vector<FF>& insertion_path);
    void set_nullifier_tree_size(uint32_t size) { tree_snapshots.nullifier_tree.size = size; }

    // Note Hash Tree
    bool perform_note_hash_read(uint32_t clk,
                                const FF& note_hash,
                                const FF& leaf_index,
                                const std::vector<FF>& path) const;

    FF perform_note_hash_append(uint32_t clk, const FF& note_hash, const std::vector<FF>& insertion_path);
    void set_note_hash_tree_size(uint32_t size) { tree_snapshots.note_hash_tree.size = size; }

    // L1 to L2 Message Tree
    bool perform_l1_to_l2_message_read(uint32_t clk,
                                       const FF& leaf_value,
                                       const FF leaf_index,
                                       const std::vector<FF>& path) const;

    // Unconstrained variants while circuit stuff is being worked out
    static bool unconstrained_check_membership(const FF& leaf_value,
                                               const uint64_t leaf_index,
                                               const std::vector<FF>& path,
                                               const FF& root);

    static FF unconstrained_update_leaf_index(const FF& leaf_value,
                                              const uint64_t leaf_index,
                                              const std::vector<FF>& path);

    // Compute preimage hashes
    static FF unconstrained_hash_nullifier_preimage(const NullifierLeafPreimage& preimage);
    static FF unconstrained_hash_public_data_preimage(const PublicDataTreeLeafPreimage& preimage);

    static FF unconstrained_silo_note_hash(FF contract_address, FF note_hash);
    static FF unconstrained_compute_note_hash_nonce(FF tx_hash, FF note_index_in_tx);
    static FF unconstrained_compute_unique_note_hash(FF nonce, FF siloed_note_hash);
    static FF unconstrained_silo_nullifier(FF contract_address, FF nullifier);
    static FF unconstrained_compute_public_tree_leaf_slot(FF contract_address, FF leaf_index);
    // Could probably template these
    static bool assert_public_data_non_membership_check(const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                                        const FF& leaf_slot);
    static bool assert_nullifier_non_membership_check(const NullifierLeafPreimage& low_leaf_preimage,
                                                      const FF& nullifier);

    void finalize(std::vector<AvmFullRow<FF>>& main_trace);

    // We need access to the poseidon2 gadget
    AvmPoseidon2TraceBuilder poseidon2_builder;

  private:
    std::vector<MerkleEntry> merkle_check_trace;
    TreeSnapshots non_revertible_tree_snapshots;
    TreeSnapshots tree_snapshots;
    MerkleEntry compute_root_from_path(uint32_t clk,
                                       const FF& leaf_value,
                                       const uint64_t leaf_index,
                                       const std::vector<FF>& path);
};
}; // namespace bb::avm_trace
