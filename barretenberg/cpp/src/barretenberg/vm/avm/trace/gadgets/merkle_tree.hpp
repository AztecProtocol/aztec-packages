#pragma once

#include "barretenberg/vm/avm/generated/relations/poseidon2.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/gadgets/poseidon2.hpp"

#include <vector>
namespace bb::avm_trace {

class AvmMerkleTreeTraceBuilder {
  public:
    struct MerkleEntry {
        uint32_t clk;
        FF leaf_value{};
        uint32_t leaf_index;
        std::vector<FF> path;
        // Could probably get away with not having this and computing in finalize
        std::vector<FF> path_values;
        FF root{};
    };

    AvmMerkleTreeTraceBuilder() = default;
    void reset();

    bool check_membership(
        uint32_t clk, const FF& leaf_value, const uint32_t leaf_index, const std::vector<FF>& path, const FF& root);

    FF update_leaf_index(uint32_t clk, const FF& leaf_value, const uint32_t leaf_index, const std::vector<FF>& path);

    void finalize(std::vector<AvmFullRow<FF>>& main_trace);
    // We need access to the poseidon2 gadget
    AvmPoseidon2TraceBuilder poseidon2_builder;

  private:
    std::vector<MerkleEntry> merkle_check_trace;
    MerkleEntry compute_root_from_path(uint32_t clk,
                                       const FF& leaf_value,
                                       const uint32_t leaf_index,
                                       const std::vector<FF>& path);
};
}; // namespace bb::avm_trace
