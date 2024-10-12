#pragma once

#include "barretenberg/vm/avm/generated/relations/poseidon2.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/gadgets/poseidon2.hpp"

#include <vector>
namespace bb::avm_trace {

class AvmMerkleTreeTraceBuilder {
  public:
    struct MerkleCheckEntry {
        uint32_t clk;
        FF leaf_value;
        uint32_t leaf_index;
        std::vector<FF> path;
        std::vector<bool> path_bits;
        // Could probably get away with not having this and computing in finalize
        std::vector<FF> path_values;
        FF root;
        bool is_member;
    };

    AvmMerkleTreeTraceBuilder() = default;
    void reset();

    bool check_membership(
        uint32_t clk, const FF leaf_value, const uint32_t leaf_index, const std::vector<FF>& path, const FF& root);

    void finalize(std::vector<AvmFullRow<FF>>& main_trace);
    // We need access to the poseidon2 gadget
    AvmPoseidon2TraceBuilder poseidon2_builder;

  private:
    std::vector<MerkleCheckEntry> merkle_check_trace;
};
}; // namespace bb::avm_trace
