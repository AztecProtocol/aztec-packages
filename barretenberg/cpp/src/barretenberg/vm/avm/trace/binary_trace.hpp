#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm/avm/generated/full_row.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"

#include <unordered_map>

namespace bb::avm_trace {

class AvmBinaryTraceBuilder {
  public:
    struct BinaryTraceEntry {
        uint32_t binary_clk = 0;
        bool bin_sel = 0;
        uint8_t op_id = 0;
        uint8_t in_tag = 0;
        uint8_t mem_tag_ctr = 0;
        FF mem_tag_ctr_inv = 0;

        uint256_t factor = 0;
        bool start = false;

        FF acc_ia = FF(0);
        FF acc_ib = FF(0);
        FF acc_ic = FF(0);
        uint8_t bin_ia_bytes = 0;
        uint8_t bin_ib_bytes = 0;
        uint8_t bin_ic_bytes = 0;
    };

    std::unordered_map<uint32_t, uint32_t> byte_operation_counter;
    std::unordered_map<uint32_t, uint32_t> byte_length_counter;

    AvmBinaryTraceBuilder() = default;

    size_t size() const { return binary_trace.size(); }
    void reset();

    // These two have to be separate because the lookups need to be finalized
    // after the extra first row is inserted in the main trace.
    void finalize(std::vector<AvmFullRow<FF>>& main_trace);
    void finalize_lookups(std::vector<AvmFullRow<FF>>& main_trace);
    void finalize_lookups_for_testing(std::vector<AvmFullRow<FF>>& main_trace);

    FF op_and(FF const& a, FF const& b, AvmMemoryTag instr_tag, uint32_t clk);
    FF op_or(FF const& a, FF const& b, AvmMemoryTag instr_tag, uint32_t clk);
    FF op_xor(FF const& a, FF const& b, AvmMemoryTag instr_tag, uint32_t clk);

  private:
    std::vector<BinaryTraceEntry> binary_trace;
    // Helper Function to build binary trace entries
    void entry_builder(uint128_t const& a,
                       uint128_t const& b,
                       uint128_t const& c,
                       AvmMemoryTag instr_tag,
                       uint32_t clk,
                       uint8_t op_id);
};

} // namespace bb::avm_trace
