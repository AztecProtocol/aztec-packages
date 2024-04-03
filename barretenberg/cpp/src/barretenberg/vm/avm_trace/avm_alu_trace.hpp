#pragma once

#include "avm_common.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"

namespace bb::avm_trace {

class AvmAluTraceBuilder {

  public:
    struct AluTraceEntry {
        uint32_t alu_clk{};

        bool alu_op_add = false;
        bool alu_op_sub = false;
        bool alu_op_mul = false;
        bool alu_op_not = false;
        bool alu_op_eq = false;
        bool alu_op_lt = false;
        bool alu_op_lte = false;

        bool alu_ff_tag = false;
        bool alu_u8_tag = false;
        bool alu_u16_tag = false;
        bool alu_u32_tag = false;
        bool alu_u64_tag = false;
        bool alu_u128_tag = false;

        FF alu_ia{};
        FF alu_ib{};
        FF alu_ic{};

        bool alu_cf = false;

        uint8_t alu_u8_r0{};
        uint8_t alu_u8_r1{};

        std::array<uint16_t, 15> alu_u16_reg{};

        uint64_t alu_u64_r0{};

        FF alu_op_eq_diff_inv{};

        // Comparison check
        FF input_ia;
        FF input_ib;
        bool borrow;

        uint128_t a_lo;
        uint128_t a_hi;
        uint128_t b_lo;
        uint128_t b_hi;

        uint128_t p_sub_a_lo;
        uint128_t p_sub_a_hi;
        bool p_a_borrow;
        uint128_t p_sub_b_lo;
        uint128_t p_sub_b_hi;
        bool p_b_borrow;

        uint128_t res_lo;
        uint128_t res_hi;
    };

    AvmAluTraceBuilder();
    void reset();
    std::vector<AluTraceEntry> finalize();

    FF op_add(FF const& a, FF const& b, AvmMemoryTag in_tag, uint32_t clk);
    FF op_sub(FF const& a, FF const& b, AvmMemoryTag in_tag, uint32_t clk);
    FF op_mul(FF const& a, FF const& b, AvmMemoryTag in_tag, uint32_t clk);
    FF op_not(FF const& a, AvmMemoryTag in_tag, uint32_t clk);
    FF op_eq(FF const& a, FF const& b, AvmMemoryTag in_tag, uint32_t clk);
    FF op_lt(FF const& a, FF const& b, AvmMemoryTag in_tag, uint32_t clk);
    FF op_lte(FF const& a, FF const& b, AvmMemoryTag in_tag, uint32_t clk);

  private:
    std::vector<AluTraceEntry> alu_trace;
};
} // namespace bb::avm_trace
