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
    void reset();

    bool check_membership(
        uint32_t clk, const FF& leaf_value, const uint64_t leaf_index, const std::vector<FF>& path, const FF& root);

    FF update_leaf_index(uint32_t clk, const FF& leaf_value, const uint64_t leaf_index, const std::vector<FF>& path);

    FF silo_note_hash(uint32_t clk, FF contract_address, FF note_hash);

    FF silo_nullifier(uint32_t clk, FF contract_address, FF nullifier);

    FF compute_public_tree_leaf_slot(uint32_t clk, FF contract_address, FF leaf_index);

    // These can be static, but not yet in-case we want to store the tree snapshots in this gadget
    bool perform_storage_read(uint32_t clk,
                              const PublicDataTreeLeafPreimage& preimage,
                              const FF& leaf_index,
                              const std::vector<FF>& path,
                              const FF& root);

    FF perform_storage_write(uint32_t clk,
                             PublicDataTreeLeafPreimage& low_preimage,
                             const FF& low_index,
                             const std::vector<FF>& low_path,
                             const FF& slot,
                             const FF& value,
                             const FF& insertion_index,
                             const std::vector<FF>& insertion_path,
                             const FF& initial_root);

    bool perform_nullifier_read(uint32_t clk,
                                const NullifierLeafPreimage& preimage,
                                const FF& leaf_index,
                                const std::vector<FF>& path,
                                const FF& root);

    FF perform_nullifier_append(uint32_t clk,
                                NullifierLeafPreimage& low_preimage,
                                const FF& low_index,
                                const std::vector<FF>& low_path,
                                const FF& nullifier,
                                const FF& insertion_index,
                                const std::vector<FF>& insertion_path,
                                const FF& root);

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
    static FF unconstrained_silo_nullifier(FF contract_address, FF nullifier);
    static FF unconstrained_compute_public_tree_leaf_slot(FF contract_address, FF leaf_index);

    void finalize(std::vector<AvmFullRow<FF>>& main_trace);
    // We need access to the poseidon2 gadget
    AvmPoseidon2TraceBuilder poseidon2_builder;

  private:
    std::vector<MerkleEntry> merkle_check_trace;
    MerkleEntry compute_root_from_path(uint32_t clk,
                                       const FF& leaf_value,
                                       const uint64_t leaf_index,
                                       const std::vector<FF>& path);
};
}; // namespace bb::avm_trace
