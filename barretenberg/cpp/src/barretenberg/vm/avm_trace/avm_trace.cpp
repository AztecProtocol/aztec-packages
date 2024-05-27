#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <limits>
#include <string>
#include <sys/types.h>
#include <vector>

#include "avm_common.hpp"
#include "avm_helper.hpp"
#include "avm_mem_trace.hpp"
#include "avm_trace.hpp"
#include "barretenberg/vm/avm_trace/avm_kernel_trace.hpp"
#include "barretenberg/vm/avm_trace/aztec_constants.hpp"

namespace bb::avm_trace {

/**
 * @brief Constructor of a trace builder of AVM. Only serves to set the capacity of the
 *        underlying traces.
 */
AvmTraceBuilder::AvmTraceBuilder(std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs)
    // NOTE: we initialise the environment builder here as it requires public inputs
    : kernel_trace_builder(kernel_inputs)
{
    main_trace.reserve(AVM_TRACE_SIZE);
}

/**
 * @brief Resetting the internal state so that a new trace can be rebuilt using the same object.
 *
 */
void AvmTraceBuilder::reset()
{
    main_trace.clear();
    mem_trace_builder.reset();
    alu_trace_builder.reset();
    bin_trace_builder.reset();
    kernel_trace_builder.reset();
}

AvmTraceBuilder::IndirectThreeResolution AvmTraceBuilder::resolve_ind_three(
    uint8_t space_id, uint32_t clk, uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t c_offset)
{
    bool indirect_flag_a = is_operand_indirect(indirect, 0);
    bool indirect_flag_b = is_operand_indirect(indirect, 1);
    bool indirect_flag_c = is_operand_indirect(indirect, 2);

    uint32_t direct_a_offset = a_offset;
    uint32_t direct_b_offset = b_offset;
    uint32_t direct_c_offset = c_offset;

    bool tag_match = true;

    if (indirect_flag_a) {
        auto read_ind_a =
            mem_trace_builder.indirect_read_and_load_from_memory(space_id, clk, IndirectRegister::IND_A, a_offset);
        direct_a_offset = uint32_t(read_ind_a.val);
        tag_match = tag_match && read_ind_a.tag_match;
    }

    if (indirect_flag_b) {
        auto read_ind_b =
            mem_trace_builder.indirect_read_and_load_from_memory(space_id, clk, IndirectRegister::IND_B, b_offset);
        direct_b_offset = uint32_t(read_ind_b.val);
        tag_match = tag_match && read_ind_b.tag_match;
    }

    if (indirect_flag_c) {
        auto read_ind_c =
            mem_trace_builder.indirect_read_and_load_from_memory(space_id, clk, IndirectRegister::IND_C, c_offset);
        direct_c_offset = uint32_t(read_ind_c.val);
        tag_match = tag_match && read_ind_c.tag_match;
    }

    return IndirectThreeResolution{
        .tag_match = tag_match,
        .direct_a_offset = direct_a_offset,
        .direct_b_offset = direct_b_offset,
        .direct_c_offset = direct_c_offset,
        .indirect_flag_a = indirect_flag_a,
        .indirect_flag_b = indirect_flag_b,
        .indirect_flag_c = indirect_flag_c,
    };
}

/**
 * @brief Addition with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the addition.
 * @param b_offset An index in memory pointing to the second operand of the addition.
 * @param dst_offset An index in memory pointing to the output of the addition.
 * @param in_tag The instruction memory tag of the operands.
 */
void AvmTraceBuilder::op_add(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, in_tag);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && read_b.tag_match;

    // a + b = c
    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = tag_match ? alu_trace_builder.op_add(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_add = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}

/**
 * @brief Subtraction with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the subtraction.
 * @param b_offset An index in memory pointing to the second operand of the subtraction.
 * @param dst_offset An index in memory pointing to the output of the subtraction.
 * @param in_tag The instruction memory tag of the operands.
 */
void AvmTraceBuilder::op_sub(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, in_tag);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && read_b.tag_match;

    // a - b = c
    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = tag_match ? alu_trace_builder.op_sub(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_sub = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}

/**
 * @brief Multiplication with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the multiplication.
 * @param b_offset An index in memory pointing to the second operand of the multiplication.
 * @param dst_offset An index in memory pointing to the output of the multiplication.
 * @param in_tag The instruction memory tag of the operands.
 */
void AvmTraceBuilder::op_mul(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, in_tag);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && read_b.tag_match;

    // a * b = c
    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = tag_match ? alu_trace_builder.op_mul(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_mul = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}

/**
 * @brief Finite field division with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the division.
 * @param b_offset An index in memory pointing to the second operand of the division.
 * @param dst_offset An index in memory pointing to the output of the division.
 * @param in_tag The instruction memory tag of the operands.
 */
void AvmTraceBuilder::op_fdiv(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, AvmMemoryTag::FF, AvmMemoryTag::FF);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, AvmMemoryTag::FF, AvmMemoryTag::FF);
    tag_match = read_a.tag_match && read_b.tag_match;

    // a * b^(-1) = c
    FF a = read_a.val;
    FF b = read_b.val;
    FF c;
    FF inv;
    FF error;

    if (!b.is_zero()) {

        inv = b.invert();
        c = a * inv;
        error = 0;
    } else {
        inv = 1;
        c = 0;
        error = 1;
    }

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(
        call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, AvmMemoryTag::FF, AvmMemoryTag::FF);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = tag_match ? a : FF(0),
        .avm_main_ib = tag_match ? b : FF(0),
        .avm_main_ic = tag_match ? c : FF(0),
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_inv = tag_match ? inv : FF(1),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_op_err = tag_match ? error : FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_fdiv = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
    });
}

/**
 * @brief Bitwise not with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the only operand of Not.
 * @param dst_offset An index in memory pointing to the output of Not.
 * @param in_tag The instruction memory tag of the operands.
 */
void AvmTraceBuilder::op_not(uint8_t indirect, uint32_t a_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());
    bool tag_match = true;
    uint32_t direct_a_offset = a_offset;
    uint32_t direct_dst_offset = dst_offset;

    bool indirect_a_flag = is_operand_indirect(indirect, 0);
    bool indirect_c_flag = is_operand_indirect(indirect, 1);

    if (indirect_a_flag) {
        auto read_ind_a =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_A, a_offset);
        tag_match = read_ind_a.tag_match;
        direct_a_offset = uint32_t(read_ind_a.val);
    }

    if (indirect_c_flag) {
        auto read_ind_c =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_C, dst_offset);
        tag_match = tag_match && read_ind_c.tag_match;
        direct_dst_offset = uint32_t(read_ind_c.val);
    }

    // Reading from memory and loading into ia.
    auto read_a =
        mem_trace_builder.read_and_load_from_memory(call_ptr, clk, IntermRegister::IA, direct_a_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && tag_match;
    // ~a = c
    FF a = read_a.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = tag_match ? alu_trace_builder.op_not(a, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, direct_dst_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ic = c,
        .avm_main_ind_a = indirect_a_flag ? FF(a_offset) : FF(0),
        .avm_main_ind_c = indirect_c_flag ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(indirect_a_flag)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(indirect_c_flag)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(direct_a_offset),
        .avm_main_mem_idx_c = FF(direct_dst_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_not = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!read_a.tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}

/**
 * @brief Equality with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the equality.
 * @param b_offset An index in memory pointing to the second operand of the equality.
 * @param dst_offset An index in memory pointing to the output of the equality.
 * @param in_tag The instruction memory tag of the operands.
 */
void AvmTraceBuilder::op_eq(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, AvmMemoryTag::U8);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, AvmMemoryTag::U8);
    tag_match = read_a.tag_match && read_b.tag_match;

    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = tag_match ? alu_trace_builder.op_eq(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(
        call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, AvmMemoryTag::U8);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_eq = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U8)),
    });
}

void AvmTraceBuilder::op_and(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, in_tag);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && read_b.tag_match;

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = tag_match ? bin_trace_builder.op_and(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_bin_op_id = FF(0),
        .avm_main_bin_sel = FF(1),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_and = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}

void AvmTraceBuilder::op_or(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, in_tag);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && read_b.tag_match;

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = tag_match ? bin_trace_builder.op_or(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_bin_op_id = FF(1),
        .avm_main_bin_sel = FF(1),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_or = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}

void AvmTraceBuilder::op_xor(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, in_tag);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && read_b.tag_match;

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = tag_match ? bin_trace_builder.op_xor(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_bin_op_id = FF(2),
        .avm_main_bin_sel = FF(1),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_xor = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}

void AvmTraceBuilder::op_lt(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, AvmMemoryTag::U8);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, AvmMemoryTag::U8);
    tag_match = read_a.tag_match && read_b.tag_match;

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = tag_match ? alu_trace_builder.op_lt(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(
        call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, AvmMemoryTag::U8);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_lt = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U8)),
    });
}

void AvmTraceBuilder::op_lte(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, AvmMemoryTag::U8);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, AvmMemoryTag::U8);
    tag_match = read_a.tag_match && read_b.tag_match;

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = tag_match ? alu_trace_builder.op_lte(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(
        call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, AvmMemoryTag::U8);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_lte = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U8)),
    });
}

void AvmTraceBuilder::op_shr(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{

    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, in_tag);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && read_b.tag_match;

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = tag_match ? alu_trace_builder.op_shr(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_shr = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}

void AvmTraceBuilder::op_shl(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{

    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, in_tag);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && read_b.tag_match;

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = tag_match ? alu_trace_builder.op_shl(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_shl = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}
// TODO: Ensure that the bytecode validation and/or deserialization is
//       enforcing that val complies to the tag.
/**
 * @brief Set a constant from bytecode with direct or indirect memory access.
 *        SET opcode is implemented purely as a memory operation. As val is a
 *        constant passed in the bytecode, the deserialization layer or bytecode
 *        validation circuit is enforcing that the constant complies to in_tag.
 *        Therefore, no range check is required as part of this opcode relation.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param val The constant to be written upcasted to u128
 * @param dst_offset Memory destination offset where val is written to
 * @param in_tag The instruction memory tag
 */
void AvmTraceBuilder::op_set(uint8_t indirect, uint128_t val, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto const clk = static_cast<uint32_t>(main_trace.size());
    auto const val_ff = FF{ uint256_t::from_uint128(val) };
    uint32_t direct_dst_offset = dst_offset; // Overriden in indirect mode
    bool indirect_dst_flag = is_operand_indirect(indirect, 0);
    bool tag_match = true;

    if (indirect_dst_flag) {
        auto read_ind_c =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_C, dst_offset);
        tag_match = read_ind_c.tag_match;
        direct_dst_offset = uint32_t(read_ind_c.val);
    }

    mem_trace_builder.write_into_memory(
        call_ptr, clk, IntermRegister::IC, direct_dst_offset, val_ff, AvmMemoryTag::U0, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_call_ptr = call_ptr,
        .avm_main_ic = val_ff,
        .avm_main_ind_c = indirect_dst_flag ? dst_offset : 0,
        .avm_main_ind_op_c = static_cast<uint32_t>(indirect_dst_flag),
        .avm_main_internal_return_ptr = internal_return_ptr,
        .avm_main_mem_idx_c = direct_dst_offset,
        .avm_main_mem_op_c = 1,
        .avm_main_pc = pc++,
        .avm_main_rwc = 1,
        .avm_main_tag_err = static_cast<uint32_t>(!tag_match),
        .avm_main_w_in_tag = static_cast<uint32_t>(in_tag),
    });
}

/**
 * @brief Copy value and tag from a memory cell at position src_offset to the
 *        memory cell at position dst_offset
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param src_offset Offset of source memory cell
 * @param dst_offset Offset of destination memory cell
 */
void AvmTraceBuilder::op_mov(uint8_t indirect, uint32_t src_offset, uint32_t dst_offset)
{
    auto const clk = static_cast<uint32_t>(main_trace.size());
    bool tag_match = true;
    uint32_t direct_src_offset = src_offset;
    uint32_t direct_dst_offset = dst_offset;

    bool indirect_src_flag = is_operand_indirect(indirect, 0);
    bool indirect_dst_flag = is_operand_indirect(indirect, 1);

    if (indirect_src_flag) {
        auto read_ind_a =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_A, src_offset);
        tag_match = read_ind_a.tag_match;
        direct_src_offset = uint32_t(read_ind_a.val);
    }

    if (indirect_dst_flag) {
        auto read_ind_c =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_C, dst_offset);
        tag_match = tag_match && read_ind_c.tag_match;
        direct_dst_offset = uint32_t(read_ind_c.val);
    }

    // Reading from memory and loading into ia without tag check.
    auto const [val, tag] = mem_trace_builder.read_and_load_mov_opcode(call_ptr, clk, direct_src_offset);

    // Write into memory from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, direct_dst_offset, val, tag, tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = val,
        .avm_main_ic = val,
        .avm_main_ind_a = indirect_src_flag ? src_offset : 0,
        .avm_main_ind_c = indirect_dst_flag ? dst_offset : 0,
        .avm_main_ind_op_a = static_cast<uint32_t>(indirect_src_flag),
        .avm_main_ind_op_c = static_cast<uint32_t>(indirect_dst_flag),
        .avm_main_internal_return_ptr = internal_return_ptr,
        .avm_main_mem_idx_a = direct_src_offset,
        .avm_main_mem_idx_c = direct_dst_offset,
        .avm_main_mem_op_a = 1,
        .avm_main_mem_op_c = 1,
        .avm_main_pc = pc++,
        .avm_main_r_in_tag = static_cast<uint32_t>(tag),
        .avm_main_rwc = 1,
        .avm_main_sel_mov = 1,
        .avm_main_sel_mov_a = 1,
        .avm_main_tag_err = static_cast<uint32_t>(!tag_match),
        .avm_main_w_in_tag = static_cast<uint32_t>(tag),
    });
}

/**
 * @brief Copy value and tag from a memory cell at position src_offset to the
 *        memory cell at position dst_offset. src_offset is a_offset if the value
 *        defined by cond_offset is non-zero. Otherwise, src_offset is b_offset.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset Offset of first candidate source memory cell
 * @param b_offset Offset of second candidate source memory cell
 * @param cond_offset Offset of the condition determining the source offset (a_offset or b_offset)
 * @param dst_offset Offset of destination memory cell
 */
void AvmTraceBuilder::op_cmov(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t cond_offset, uint32_t dst_offset)
{
    auto const clk = static_cast<uint32_t>(main_trace.size());
    bool tag_match = true;
    uint32_t direct_a_offset = a_offset;
    uint32_t direct_b_offset = b_offset;
    uint32_t direct_cond_offset = cond_offset;
    uint32_t direct_dst_offset = dst_offset;

    bool indirect_a_flag = is_operand_indirect(indirect, 0);
    bool indirect_b_flag = is_operand_indirect(indirect, 1);
    bool indirect_cond_flag = is_operand_indirect(indirect, 2);
    bool indirect_dst_flag = is_operand_indirect(indirect, 3);

    if (indirect_a_flag) {
        auto read_ind_a =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_A, a_offset);
        direct_a_offset = uint32_t(read_ind_a.val);
        tag_match = tag_match && read_ind_a.tag_match;
    }

    if (indirect_b_flag) {
        auto read_ind_b =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_B, b_offset);
        direct_b_offset = uint32_t(read_ind_b.val);
        tag_match = tag_match && read_ind_b.tag_match;
    }

    if (indirect_cond_flag) {
        auto read_ind_d =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_D, cond_offset);
        direct_cond_offset = uint32_t(read_ind_d.val);
        tag_match = tag_match && read_ind_d.tag_match;
    }

    if (indirect_dst_flag) {
        auto read_ind_c =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_C, dst_offset);
        direct_dst_offset = uint32_t(read_ind_c.val);
        tag_match = tag_match && read_ind_c.tag_match;
    }

    // Reading from memory and loading into ia or ib without tag check. We also load the conditional value
    // in id without any tag check.
    std::array<AvmMemTraceBuilder::MemEntry, 3> const cmov_res = mem_trace_builder.read_and_load_cmov_opcode(
        call_ptr, clk, direct_a_offset, direct_b_offset, direct_cond_offset);

    AvmMemTraceBuilder::MemEntry const& a_mem_entry = cmov_res.at(0);
    AvmMemTraceBuilder::MemEntry const& b_mem_entry = cmov_res.at(1);
    AvmMemTraceBuilder::MemEntry const& cond_mem_entry = cmov_res.at(2);

    const bool id_zero = cond_mem_entry.val == 0;

    auto const& val = id_zero ? b_mem_entry.val : a_mem_entry.val;
    auto const& tag = id_zero ? b_mem_entry.tag : a_mem_entry.tag;

    // Write into memory from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, direct_dst_offset, val, tag, tag);

    FF const inv = !id_zero ? cond_mem_entry.val.invert() : 1;

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a_mem_entry.val,
        .avm_main_ib = b_mem_entry.val,
        .avm_main_ic = val,
        .avm_main_id = cond_mem_entry.val,
        .avm_main_id_zero = static_cast<uint32_t>(id_zero),
        .avm_main_ind_a = indirect_a_flag ? a_offset : 0,
        .avm_main_ind_b = indirect_b_flag ? b_offset : 0,
        .avm_main_ind_c = indirect_dst_flag ? dst_offset : 0,
        .avm_main_ind_d = indirect_cond_flag ? cond_offset : 0,
        .avm_main_ind_op_a = static_cast<uint32_t>(indirect_a_flag),
        .avm_main_ind_op_b = static_cast<uint32_t>(indirect_b_flag),
        .avm_main_ind_op_c = static_cast<uint32_t>(indirect_dst_flag),
        .avm_main_ind_op_d = static_cast<uint32_t>(indirect_cond_flag),
        .avm_main_internal_return_ptr = internal_return_ptr,
        .avm_main_inv = inv,
        .avm_main_mem_idx_a = direct_a_offset,
        .avm_main_mem_idx_b = direct_b_offset,
        .avm_main_mem_idx_c = direct_dst_offset,
        .avm_main_mem_idx_d = direct_cond_offset,
        .avm_main_mem_op_a = 1,
        .avm_main_mem_op_b = 1,
        .avm_main_mem_op_c = 1,
        .avm_main_mem_op_d = 1,
        .avm_main_pc = pc++,
        .avm_main_r_in_tag = static_cast<uint32_t>(tag),
        .avm_main_rwc = 1,
        .avm_main_sel_cmov = 1,
        .avm_main_sel_mov_a = static_cast<uint32_t>(!id_zero),
        .avm_main_sel_mov_b = static_cast<uint32_t>(id_zero),
        .avm_main_tag_err = static_cast<uint32_t>(!tag_match),
        .avm_main_w_in_tag = static_cast<uint32_t>(tag),
    });
}

// Helper function to add kernel lookup operations into the main trace
Row AvmTraceBuilder::create_kernel_lookup_opcode(uint32_t dst_offset, uint32_t selector, FF value, AvmMemoryTag w_tag)
{
    auto const clk = static_cast<uint32_t>(main_trace.size());

    AvmMemoryTag r_tag = AvmMemoryTag::U0;
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IA, dst_offset, value, r_tag, w_tag);

    return Row{
        .avm_main_clk = clk,
        .avm_kernel_kernel_sel = selector,
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = value,
        .avm_main_ind_a = 0,
        .avm_main_internal_return_ptr = internal_return_ptr,
        .avm_main_mem_idx_a = dst_offset,
        .avm_main_mem_op_a = 1,
        .avm_main_pc = pc++,
        .avm_main_q_kernel_lookup = 1,
        .avm_main_rwa = 1,
        .avm_main_w_in_tag = static_cast<uint32_t>(w_tag),
    };
}

void AvmTraceBuilder::op_sender(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_sender();
    Row row = create_kernel_lookup_opcode(dst_offset, SENDER_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_sender = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_address(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_address();
    Row row = create_kernel_lookup_opcode(dst_offset, ADDRESS_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_address = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_portal(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_portal();
    Row row = create_kernel_lookup_opcode(dst_offset, PORTAL_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_portal = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_fee_per_da_gas(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_fee_per_da_gas();
    Row row = create_kernel_lookup_opcode(dst_offset, FEE_PER_DA_GAS_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_fee_per_da_gas = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_fee_per_l2_gas(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_fee_per_l2_gas();
    Row row = create_kernel_lookup_opcode(dst_offset, FEE_PER_L2_GAS_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_fee_per_l2_gas = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_transaction_fee(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_transaction_fee();
    Row row = create_kernel_lookup_opcode(dst_offset, TRANSACTION_FEE_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_transaction_fee = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_chain_id(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_chain_id();
    Row row = create_kernel_lookup_opcode(dst_offset, CHAIN_ID_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_chain_id = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_version(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_version();
    Row row = create_kernel_lookup_opcode(dst_offset, VERSION_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_version = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_block_number(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_block_number();
    Row row = create_kernel_lookup_opcode(dst_offset, BLOCK_NUMBER_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_block_number = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_coinbase(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_coinbase();
    Row row = create_kernel_lookup_opcode(dst_offset, COINBASE_SELECTOR, ia_value, AvmMemoryTag::FF);
    row.avm_main_sel_op_coinbase = FF(1);

    main_trace.push_back(row);
}

void AvmTraceBuilder::op_timestamp(uint32_t dst_offset)
{
    FF ia_value = kernel_trace_builder.op_timestamp();
    Row row = create_kernel_lookup_opcode(dst_offset, TIMESTAMP_SELECTOR, ia_value, AvmMemoryTag::U64);
    row.avm_main_sel_op_timestamp = FF(1);

    main_trace.push_back(row);
}

/**
 * @brief Cast an element pointed by the address a_offset into type specified by dst_tag and
          store the result in address given by dst_offset.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset Offset of source memory cell.
 * @param dst_offset Offset of destination memory cell.
 * @param dst_tag Destination tag specifying the type the source value must be casted to.
 */
void AvmTraceBuilder::op_cast(uint8_t indirect, uint32_t a_offset, uint32_t dst_offset, AvmMemoryTag dst_tag)
{
    auto const clk = static_cast<uint32_t>(main_trace.size());
    bool tag_match = true;
    uint32_t direct_a_offset = a_offset;
    uint32_t direct_dst_offset = dst_offset;

    bool indirect_a_flag = is_operand_indirect(indirect, 0);
    bool indirect_dst_flag = is_operand_indirect(indirect, 1);

    if (indirect_a_flag) {
        auto read_ind_a =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_A, a_offset);
        direct_a_offset = uint32_t(read_ind_a.val);
        tag_match = tag_match && read_ind_a.tag_match;
    }

    if (indirect_dst_flag) {
        auto read_ind_c =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_C, dst_offset);
        direct_dst_offset = uint32_t(read_ind_c.val);
        tag_match = tag_match && read_ind_c.tag_match;
    }

    // Reading from memory and loading into ia
    auto memEntry = mem_trace_builder.read_and_load_cast_opcode(call_ptr, clk, direct_a_offset, dst_tag);
    FF a = memEntry.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = tag_match ? alu_trace_builder.op_cast(a, dst_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, direct_dst_offset, c, memEntry.tag, dst_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(dst_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ic = c,
        .avm_main_ind_a = indirect_a_flag ? FF(a_offset) : FF(0),
        .avm_main_ind_c = indirect_dst_flag ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(indirect_a_flag)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(indirect_dst_flag)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(direct_a_offset),
        .avm_main_mem_idx_c = FF(direct_dst_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(memEntry.tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_cast = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(dst_tag)),
    });
}
/**
 * @brief Integer division with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the division.
 * @param b_offset An index in memory pointing to the second operand of the division.
 * @param dst_offset An index in memory pointing to the output of the division.
 * @param in_tag The instruction memory tag of the operands.
 */
void AvmTraceBuilder::op_div(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    auto const res = resolve_ind_three(call_ptr, clk, indirect, a_offset, b_offset, dst_offset);
    bool tag_match = res.tag_match;

    // Reading from memory and loading into ia resp. ib.
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, res.direct_a_offset, in_tag, in_tag);
    auto read_b = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, res.direct_b_offset, in_tag, in_tag);
    tag_match = read_a.tag_match && read_b.tag_match;

    // a / b = c
    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c;
    FF inv;
    FF error;

    if (!b.is_zero()) {
        // If b is not zero, we prove it is not by providing its inverse as well
        inv = b.invert();
        c = tag_match ? alu_trace_builder.op_div(a, b, in_tag, clk) : FF(0);
        error = 0;
    } else {
        inv = 1;
        c = 0;
        error = 1;
    }

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, res.direct_c_offset, c, in_tag, in_tag);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = a,
        .avm_main_ib = b,
        .avm_main_ic = c,
        .avm_main_ind_a = res.indirect_flag_a ? FF(a_offset) : FF(0),
        .avm_main_ind_b = res.indirect_flag_b ? FF(b_offset) : FF(0),
        .avm_main_ind_c = res.indirect_flag_c ? FF(dst_offset) : FF(0),
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(res.indirect_flag_a)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(res.indirect_flag_b)),
        .avm_main_ind_op_c = FF(static_cast<uint32_t>(res.indirect_flag_c)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_inv = tag_match ? inv : FF(1),
        .avm_main_mem_idx_a = FF(res.direct_a_offset),
        .avm_main_mem_idx_b = FF(res.direct_b_offset),
        .avm_main_mem_idx_c = FF(res.direct_c_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_mem_op_c = FF(1),
        .avm_main_op_err = tag_match ? error : FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .avm_main_rwc = FF(1),
        .avm_main_sel_op_div = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });
}

/**
 * @brief CALLDATACOPY opcode with direct or indirect memory access, i.e.,
 *        direct: M[dst_offset:dst_offset+copy_size] = calldata[cd_offset:cd_offset+copy_size]
 *        indirect: M[M[dst_offset]:M[dst_offset]+copy_size] = calldata[cd_offset:cd_offset+copy_size]
 *        Simplified version with exclusively memory store operations and
 *        values from calldata passed by an array and loaded into
 *        intermediate registers.
 *        Assume that caller passes call_data_mem which is large enough so that
 *        no out-of-bound memory issues occur.
 *        TODO: error handling if dst_offset + copy_size > 2^32 which would lead to
 *              out-of-bound memory write. Similarly, if cd_offset + copy_size is larger
 *              than call_data_mem.size()
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param cd_offset The starting index of the region in calldata to be copied.
 * @param copy_size The number of finite field elements to be copied into memory.
 * @param dst_offset The starting index of memory where calldata will be copied to.
 * @param call_data_mem The vector containing calldata.
 */
void AvmTraceBuilder::calldata_copy(
    uint8_t indirect, uint32_t cd_offset, uint32_t copy_size, uint32_t dst_offset, std::vector<FF> const& call_data_mem)
{
    // We parallelize storing memory operations in chunk of 3, i.e., 1 per intermediate register.
    // The variable pos is an index pointing to the first storing operation (pertaining to intermediate
    // register Ia) relative to cd_offset:
    // cd_offset + pos:       Ia memory store operation
    // cd_offset + pos + 1:   Ib memory store operation
    // cd_offset + pos + 2:   Ic memory store operation

    uint32_t pos = 0;
    uint32_t direct_dst_offset = dst_offset; // Will be overwritten in indirect mode.

    while (pos < copy_size) {
        FF ib(0);
        FF ic(0);
        uint32_t mem_op_b(0);
        uint32_t mem_op_c(0);
        uint32_t mem_idx_b(0);
        uint32_t mem_idx_c(0);
        uint32_t rwb(0);
        uint32_t rwc(0);
        auto clk = static_cast<uint32_t>(main_trace.size());

        FF ia = call_data_mem.at(cd_offset + pos);
        uint32_t mem_op_a(1);
        uint32_t rwa = 1;

        bool indirect_flag = false;
        bool tag_match = true;

        if (pos == 0 && is_operand_indirect(indirect, 0)) {
            indirect_flag = true;
            auto ind_read = mem_trace_builder.indirect_read_and_load_from_memory(
                call_ptr, clk, IndirectRegister::IND_A, dst_offset);
            direct_dst_offset = uint32_t(ind_read.val);
            tag_match = ind_read.tag_match;
        }

        uint32_t mem_idx_a = direct_dst_offset + pos;

        // Storing from Ia
        mem_trace_builder.write_into_memory(
            call_ptr, clk, IntermRegister::IA, mem_idx_a, ia, AvmMemoryTag::U0, AvmMemoryTag::FF);

        if (copy_size - pos > 1) {
            ib = call_data_mem.at(cd_offset + pos + 1);
            mem_op_b = 1;
            mem_idx_b = direct_dst_offset + pos + 1;
            rwb = 1;

            // Storing from Ib
            mem_trace_builder.write_into_memory(
                call_ptr, clk, IntermRegister::IB, mem_idx_b, ib, AvmMemoryTag::U0, AvmMemoryTag::FF);
        }

        if (copy_size - pos > 2) {
            ic = call_data_mem.at(cd_offset + pos + 2);
            mem_op_c = 1;
            mem_idx_c = direct_dst_offset + pos + 2;
            rwc = 1;

            // Storing from Ic
            mem_trace_builder.write_into_memory(
                call_ptr, clk, IntermRegister::IC, mem_idx_c, ic, AvmMemoryTag::U0, AvmMemoryTag::FF);
        }

        main_trace.push_back(Row{
            .avm_main_clk = clk,
            .avm_main_call_ptr = call_ptr,
            .avm_main_ia = ia,
            .avm_main_ib = ib,
            .avm_main_ic = ic,
            .avm_main_ind_a = indirect_flag ? FF(dst_offset) : FF(0),
            .avm_main_ind_op_a = FF(static_cast<uint32_t>(indirect_flag)),
            .avm_main_internal_return_ptr = FF(internal_return_ptr),
            .avm_main_mem_idx_a = FF(mem_idx_a),
            .avm_main_mem_idx_b = FF(mem_idx_b),
            .avm_main_mem_idx_c = FF(mem_idx_c),
            .avm_main_mem_op_a = FF(mem_op_a),
            .avm_main_mem_op_b = FF(mem_op_b),
            .avm_main_mem_op_c = FF(mem_op_c),
            .avm_main_pc = FF(pc++),
            .avm_main_rwa = FF(rwa),
            .avm_main_rwb = FF(rwb),
            .avm_main_rwc = FF(rwc),
            .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
            .avm_main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
        });

        if (copy_size - pos > 2) { // Guard to prevent overflow if copy_size is close to uint32_t maximum value.
            pos += 3;
        } else {
            pos = copy_size;
        }
    }
}

/**
 * @brief RETURN opcode with direct and indirect memory access, i.e.,
 *        direct:   return(M[ret_offset:ret_offset+ret_size])
 *        indirect: return(M[M[ret_offset]:M[ret_offset]+ret_size])
 *        Simplified version with exclusively memory load operations into
 *        intermediate registers and then values are copied to the returned vector.
 *        TODO: taking care of flagging this row as the last one? Special STOP flag?
 *        TODO: error handling if ret_offset + ret_size > 2^32 which would lead to
 *              out-of-bound memory read.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param ret_offset The starting index of the memory region to be returned.
 * @param ret_size The number of elements to be returned.
 * @return The returned memory region as a std::vector.
 */
std::vector<FF> AvmTraceBuilder::return_op(uint8_t indirect, uint32_t ret_offset, uint32_t ret_size)
{
    if (ret_size == 0) {
        halt();
        return {};
    }

    // We parallelize loading memory operations in chunk of 3, i.e., 1 per intermediate register.
    // The variable pos is an index pointing to the first storing operation (pertaining to intermediate
    // register Ia) relative to ret_offset:
    // ret_offset + pos:       Ia memory load operation
    // ret_offset + pos + 1:   Ib memory load operation
    // ret_offset + pos + 2:   Ic memory load operation
    // In indirect mode, ret_offset is first resolved by the first indirect load.

    uint32_t pos = 0;
    std::vector<FF> returnMem;
    uint32_t direct_ret_offset = ret_offset; // Will be overwritten in indirect mode.

    while (pos < ret_size) {
        FF ib(0);
        FF ic(0);
        uint32_t mem_op_b(0);
        uint32_t mem_op_c(0);
        uint32_t mem_idx_b(0);
        uint32_t mem_idx_c(0);
        auto clk = static_cast<uint32_t>(main_trace.size());

        uint32_t mem_op_a(1);
        bool indirect_flag = false;
        bool tag_match = true;

        if (pos == 0 && is_operand_indirect(indirect, 0)) {
            indirect_flag = true;
            auto ind_read = mem_trace_builder.indirect_read_and_load_from_memory(
                call_ptr, clk, IndirectRegister::IND_A, ret_offset);
            direct_ret_offset = uint32_t(ind_read.val);
            tag_match = ind_read.tag_match;
        }

        uint32_t mem_idx_a = direct_ret_offset + pos;

        // Reading and loading to Ia
        auto read_a = mem_trace_builder.read_and_load_from_memory(
            call_ptr, clk, IntermRegister::IA, mem_idx_a, AvmMemoryTag::FF, AvmMemoryTag::FF);
        tag_match = tag_match && read_a.tag_match;

        FF ia = read_a.val;
        returnMem.push_back(ia);

        if (ret_size - pos > 1) {
            mem_op_b = 1;
            mem_idx_b = direct_ret_offset + pos + 1;

            // Reading and loading to Ib
            auto read_b = mem_trace_builder.read_and_load_from_memory(
                call_ptr, clk, IntermRegister::IB, mem_idx_b, AvmMemoryTag::FF, AvmMemoryTag::FF);
            tag_match = tag_match && read_b.tag_match;
            ib = read_b.val;
            returnMem.push_back(ib);
        }

        if (ret_size - pos > 2) {
            mem_op_c = 1;
            mem_idx_c = direct_ret_offset + pos + 2;

            // Reading and loading to Ic
            auto read_c = mem_trace_builder.read_and_load_from_memory(
                call_ptr, clk, IntermRegister::IC, mem_idx_c, AvmMemoryTag::FF, AvmMemoryTag::FF);
            tag_match = tag_match && read_c.tag_match;
            ic = read_c.val;
            returnMem.push_back(ic);
        }

        main_trace.push_back(Row{
            .avm_main_clk = clk,
            .avm_main_call_ptr = call_ptr,
            .avm_main_ia = ia,
            .avm_main_ib = ib,
            .avm_main_ic = ic,
            .avm_main_ind_a = indirect_flag ? FF(ret_offset) : FF(0),
            .avm_main_ind_op_a = FF(static_cast<uint32_t>(indirect_flag)),
            .avm_main_internal_return_ptr = FF(internal_return_ptr),
            .avm_main_mem_idx_a = FF(mem_idx_a),
            .avm_main_mem_idx_b = FF(mem_idx_b),
            .avm_main_mem_idx_c = FF(mem_idx_c),
            .avm_main_mem_op_a = FF(mem_op_a),
            .avm_main_mem_op_b = FF(mem_op_b),
            .avm_main_mem_op_c = FF(mem_op_c),
            .avm_main_pc = FF(pc),
            .avm_main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
            .avm_main_sel_halt = FF(1),
            .avm_main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
            .avm_main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
        });

        if (ret_size - pos > 2) { // Guard to prevent overflow if ret_size is close to uint32_t maximum value.
            pos += 3;
        } else {
            pos = ret_size;
        }
    }
    pc = UINT32_MAX; // This ensures that no subsequent opcode will be executed.
    return returnMem;
}

/**
 * @brief HALT opcode
 *        This opcode effectively stops program execution, and is used in the relation that
 *        ensures the program counter increments on each opcode.
 *        i.e. the program counter should freeze and the halt flag is set to 1.
 */
void AvmTraceBuilder::halt()
{
    auto clk = main_trace.size();

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_call_ptr = call_ptr,
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_pc = FF(pc),
        .avm_main_sel_halt = FF(1),
    });

    pc = UINT32_MAX; // This ensures that no subsequent opcode will be executed.
}

/**
 * @brief JUMP OPCODE
 *        Jumps to a new `jmp_dest`
 *        This function must:
 *          - Set the next program counter to the provided `jmp_dest`.
 *
 * @param jmp_dest - The destination to jump to
 */
void AvmTraceBuilder::jump(uint32_t jmp_dest)
{
    auto clk = main_trace.size();

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = FF(jmp_dest),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_pc = FF(pc),
        .avm_main_sel_jump = FF(1),
    });

    // Adjust parameters for the next row
    pc = jmp_dest;
}

/**
 * @brief INTERNAL_CALL OPCODE
 *        This opcode effectively jumps to a new `jmp_dest` and stores the return program counter
 *        (current program counter + 1) onto a call stack.
 *        This function must:
 *          - Set the next program counter to the provided `jmp_dest`.
 *          - Store the current `pc` + 1 onto the call stack (emulated in memory)
 *          - Increment the return stack pointer (a pointer to where the call stack is in memory)
 *
 *        Note: We use intermediate register to perform memory storage operations.
 *
 * @param jmp_dest - The destination to jump to
 */
void AvmTraceBuilder::internal_call(uint32_t jmp_dest)
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    // We store the next instruction as the return location
    mem_trace_builder.write_into_memory(INTERNAL_CALL_SPACE_ID,
                                        clk,
                                        IntermRegister::IB,
                                        internal_return_ptr,
                                        FF(pc + 1),
                                        AvmMemoryTag::U0,
                                        AvmMemoryTag::U32);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = FF(jmp_dest),
        .avm_main_ib = FF(pc + 1),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_b = FF(internal_return_ptr),
        .avm_main_mem_op_b = FF(1),
        .avm_main_pc = FF(pc),
        .avm_main_rwb = FF(1),
        .avm_main_sel_internal_call = FF(1),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U32)),
    });

    // Adjust parameters for the next row
    pc = jmp_dest;
    internal_return_ptr++;
}

/**
 * @brief INTERNAL_RETURN OPCODE
 *        The opcode returns from an internal call.
 *        This function must:
 *          - Read the return location from the internal_return_ptr
 *          - Set the next program counter to the return location
 *          - Decrement the return stack pointer
 *
 *  TODO(https://github.com/AztecProtocol/aztec-packages/issues/3740): This function MUST come after a call
 * instruction.
 */
void AvmTraceBuilder::internal_return()
{
    auto clk = static_cast<uint32_t>(main_trace.size());

    // Internal return pointer is decremented
    // We want to load the value pointed by the internal pointer
    auto read_a = mem_trace_builder.read_and_load_from_memory(
        INTERNAL_CALL_SPACE_ID, clk, IntermRegister::IA, internal_return_ptr - 1, AvmMemoryTag::U32, AvmMemoryTag::U0);

    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = read_a.val,
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(internal_return_ptr - 1),
        .avm_main_mem_op_a = FF(1),
        .avm_main_pc = pc,
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U32)),
        .avm_main_rwa = FF(0),
        .avm_main_sel_internal_return = FF(1),
        .avm_main_tag_err = FF(static_cast<uint32_t>(!read_a.tag_match)),
    });

    pc = uint32_t(read_a.val);
    internal_return_ptr--;
}

// TODO(ilyas: #6383): Temporary way to bulk write slices
void write_slice_to_memory(uint8_t space_id,
                           AvmMemTraceBuilder& mem_trace,
                           std::vector<Row>& main_trace,
                           uint32_t clk,
                           uint32_t dst_offset,
                           AvmMemoryTag r_tag,
                           AvmMemoryTag w_tag,
                           FF internal_return_ptr,
                           std::vector<FF> const& slice)
{
    // We have 4 registers that we are able to use to write to memory within a single main trace row
    auto register_order = std::array{ IntermRegister::IA, IntermRegister::IB, IntermRegister::IC, IntermRegister::ID };
    // If the slice size isnt a multiple of 4, we still need an extra row to write the remainder
    uint32_t const num_main_rows =
        static_cast<uint32_t>(slice.size()) / 4 + static_cast<uint32_t>(slice.size() % 4 != 0);
    for (uint32_t i = 0; i < num_main_rows; i++) {
        Row main_row{
            .avm_main_clk = clk + i,
            .avm_main_internal_return_ptr = FF(internal_return_ptr),
            .avm_main_r_in_tag = FF(static_cast<uint32_t>(r_tag)),
            .avm_main_w_in_tag = FF(static_cast<uint32_t>(w_tag)),
        };
        // Write 4 values to memory in each_row
        for (uint32_t j = 0; j < 4; j++) {
            auto offset = i * 4 + j;
            // If we exceed the slice size, we break
            if (offset >= slice.size()) {
                break;
            }
            mem_trace.write_into_memory(
                space_id, clk + i, register_order[j], dst_offset + offset, slice.at(offset), r_tag, w_tag);
            // This looks a bit gross, but it is fine for now.
            if (j == 0) {
                main_row.avm_main_ia = slice.at(offset);
                main_row.avm_main_mem_idx_a = FF(dst_offset + offset);
                main_row.avm_main_mem_op_a = FF(1);
                main_row.avm_main_rwa = FF(1);
            } else if (j == 1) {
                main_row.avm_main_ib = slice.at(offset);
                main_row.avm_main_mem_idx_b = FF(dst_offset + offset);
                main_row.avm_main_mem_op_b = FF(1);
                main_row.avm_main_rwb = FF(1);
            } else if (j == 2) {
                main_row.avm_main_ic = slice.at(offset);
                main_row.avm_main_mem_idx_c = FF(dst_offset + offset);
                main_row.avm_main_mem_op_c = FF(1);
                main_row.avm_main_rwc = FF(1);
            } else {
                main_row.avm_main_id = slice.at(offset);
                main_row.avm_main_mem_idx_d = FF(dst_offset + offset);
                main_row.avm_main_mem_op_d = FF(1);
                main_row.avm_main_rwd = FF(1);
            }
        }
        main_trace.emplace_back(main_row);
    }
}

/**
 * @brief To_Radix_LE with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param src_offset An index in memory pointing to the input of the To_Radix_LE conversion.
 * @param dst_offset An index in memory pointing to the output of the To_Radix_LE conversion.
 * @param radix A strict upper bound of each converted limb, i.e., 0 <= limb < radix.
 * @param num_limbs The number of limbs to the value into.
 */
void AvmTraceBuilder::op_to_radix_le(
    uint8_t indirect, uint32_t src_offset, uint32_t dst_offset, uint32_t radix, uint32_t num_limbs)
{
    auto clk = static_cast<uint32_t>(main_trace.size());
    bool tag_match = true;
    uint32_t direct_src_offset = src_offset;
    uint32_t direct_dst_offset = dst_offset;

    bool indirect_src_flag = is_operand_indirect(indirect, 0);
    bool indirect_dst_flag = is_operand_indirect(indirect, 1);

    if (indirect_src_flag) {
        auto read_ind_src =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_A, src_offset);
        direct_src_offset = uint32_t(read_ind_src.val);
        tag_match = tag_match && read_ind_src.tag_match;
    }

    if (indirect_dst_flag) {
        auto read_ind_dst =
            mem_trace_builder.indirect_read_and_load_from_memory(call_ptr, clk, IndirectRegister::IND_B, dst_offset);
        direct_dst_offset = uint32_t(read_ind_dst.val);
        tag_match = tag_match && read_ind_dst.tag_match;
    }

    auto read_src = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IA, direct_src_offset, AvmMemoryTag::FF, AvmMemoryTag::U8);
    // Read in the memory address of where the first limb should be stored (the read_tag must be U32 and write tag U8)
    auto read_dst = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, direct_dst_offset, AvmMemoryTag::FF, AvmMemoryTag::U8);

    FF input = read_src.val;
    FF dst_addr = read_dst.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in gadget table and return a vector of 0
    std::vector<uint8_t> res = tag_match ? conversion_trace_builder.op_to_radix_le(input, radix, num_limbs, clk)
                                         : std::vector<uint8_t>(num_limbs, 0);

    // This is the row that contains the selector to trigger the sel_op_radix_le
    // In this row, we read the input value and the destination address into register A and B respectively
    main_trace.push_back(Row{
        .avm_main_clk = clk,
        .avm_main_call_ptr = call_ptr,
        .avm_main_ia = input,
        .avm_main_ib = dst_addr,
        .avm_main_ic = radix,
        .avm_main_id = num_limbs,
        .avm_main_ind_a = indirect_src_flag ? src_offset : 0,
        .avm_main_ind_b = indirect_dst_flag ? dst_offset : 0,
        .avm_main_ind_op_a = FF(static_cast<uint32_t>(indirect_src_flag)),
        .avm_main_ind_op_b = FF(static_cast<uint32_t>(indirect_dst_flag)),
        .avm_main_internal_return_ptr = FF(internal_return_ptr),
        .avm_main_mem_idx_a = FF(direct_src_offset),
        .avm_main_mem_idx_b = FF(direct_dst_offset),
        .avm_main_mem_op_a = FF(1),
        .avm_main_mem_op_b = FF(1),
        .avm_main_pc = FF(pc++),
        .avm_main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
        .avm_main_sel_op_radix_le = FF(1),
        .avm_main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U8)),
    });
    // Increment the clock so we dont write at the same clock cycle
    // Instead we temporarily encode the writes into the subsequent rows of the main trace
    clk++;

    // MemTrace, write into memory value b from intermediate register ib.
    std::vector<FF> ff_res = {};
    ff_res.reserve(res.size());
    for (auto const& limb : res) {
        ff_res.emplace_back(limb);
    }
    write_slice_to_memory(call_ptr,
                          mem_trace_builder,
                          main_trace,
                          clk,
                          direct_dst_offset,
                          AvmMemoryTag::FF,
                          AvmMemoryTag::U8,
                          FF(internal_return_ptr),
                          ff_res);
}

// Finalise Lookup Counts
//
// For log derivative lookups, we require a column that contains the number of times each lookup is consumed
// As we build the trace, we keep track of the reads made in a mapping, so that they can be applied to the
// counts column here
//
// NOTE: its coupled to pil - this is not the final iteration
void AvmTraceBuilder::finalise_mem_trace_lookup_counts()
{
    for (auto const& [clk, count] : mem_trace_builder.m_tag_err_lookup_counts) {
        main_trace.at(clk).incl_main_tag_err_counts = count;
    }
}

// WARNING: FOR TESTING ONLY
// Generates the minimal lookup table for the binary trace
uint32_t finalize_bin_trace_lookup_for_testing(std::vector<Row>& main_trace, AvmBinaryTraceBuilder& bin_trace_builder)
{
    // Generate ByteLength Lookup table of instruction tags to the number of bytes
    // {U8: 1, U16: 2, U32: 4, U64: 8, U128: 16}
    for (auto const& [clk, count] : bin_trace_builder.byte_operation_counter) {
        // from the clk we can derive the a and b inputs
        auto b = static_cast<uint8_t>(clk);
        auto a = static_cast<uint8_t>(clk >> 8);
        auto op_id = static_cast<uint8_t>(clk >> 16);
        uint8_t bit_op = 0;
        if (op_id == 0) {
            bit_op = a & b;
        } else if (op_id == 1) {
            bit_op = a | b;
        } else {
            bit_op = a ^ b;
        }
        if (clk > (main_trace.size() - 1)) {
            main_trace.push_back(Row{
                .avm_main_clk = FF(clk),
                .avm_byte_lookup_bin_sel = FF(1),
                .avm_byte_lookup_table_input_a = a,
                .avm_byte_lookup_table_input_b = b,
                .avm_byte_lookup_table_op_id = op_id,
                .avm_byte_lookup_table_output = bit_op,
                .lookup_byte_operations_counts = count,
            });
        } else {
            main_trace.at(clk).lookup_byte_operations_counts = count;
            main_trace.at(clk).avm_byte_lookup_bin_sel = FF(1);
            main_trace.at(clk).avm_byte_lookup_table_op_id = op_id;
            main_trace.at(clk).avm_byte_lookup_table_input_a = a;
            main_trace.at(clk).avm_byte_lookup_table_input_b = b;
            main_trace.at(clk).avm_byte_lookup_table_output = bit_op;
        }
        // Add the counter value stored throughout the execution
    }
    return static_cast<uint32_t>(main_trace.size());
}

// WARNING: FOR TESTING ONLY
// Generates the lookup table for the range checks without doing a full 2**16 rows
uint32_t finalize_rng_chks_for_testing(std::vector<Row>& main_trace,
                                       AvmAluTraceBuilder& alu_trace_builder,
                                       AvmMemTraceBuilder& mem_trace_builder,
                                       const std::unordered_map<uint16_t, uint32_t>& mem_rng_check_lo_counts,
                                       const std::unordered_map<uint16_t, uint32_t>& mem_rng_check_mid_counts,
                                       std::unordered_map<uint8_t, uint32_t> mem_rng_check_hi_counts)
{
    // Build the main_trace, and add any new rows with specific clks that line up with lookup reads

    // Is there a "spread-like" operator in cpp or can I make it generric of the first param of the unordered map
    std::vector<std::unordered_map<uint8_t, uint32_t>> u8_rng_chks = { alu_trace_builder.u8_range_chk_counters[0],
                                                                       alu_trace_builder.u8_range_chk_counters[1],
                                                                       alu_trace_builder.u8_pow_2_counters[0],
                                                                       alu_trace_builder.u8_pow_2_counters[1],
                                                                       std::move(mem_rng_check_hi_counts) };

    auto custom_clk = std::set<uint32_t>{};
    for (auto const& row : u8_rng_chks) {
        for (auto const& [key, value] : row) {
            custom_clk.insert(key);
        }
    }
    for (auto const& row : alu_trace_builder.u16_range_chk_counters) {
        for (auto const& [key, value] : row) {
            custom_clk.insert(key);
        }
    }
    for (auto const& row : alu_trace_builder.div_u64_range_chk_counters) {
        for (auto const& [key, value] : row) {
            custom_clk.insert(key);
        }
    }
    for (auto const& [key, value] : mem_rng_check_lo_counts) {
        custom_clk.insert(key);
    }
    for (auto const& [key, value] : mem_rng_check_mid_counts) {
        custom_clk.insert(key);
    }

    for (auto const& [clk, count] : mem_trace_builder.m_tag_err_lookup_counts) {
        custom_clk.insert(clk);
    }

    auto old_size = main_trace.size() - 1;
    for (auto const& clk : custom_clk) {
        if (clk > old_size) {
            main_trace.push_back(Row{ .avm_main_clk = FF(clk) });
        }
    }
    return static_cast<uint32_t>(main_trace.size());
}

/**
 * @brief Finalisation of the memory trace and incorporating it to the main trace.
 *        In particular, sorting the memory trace, setting .m_lastAccess and
 *        adding shifted values (first row). The main trace is moved at the end of
 *        this call.
 *
 * @return The main trace
 */
std::vector<Row> AvmTraceBuilder::finalize(uint32_t min_trace_size, bool range_check_required)
{
    auto mem_trace = mem_trace_builder.finalize();
    auto alu_trace = alu_trace_builder.finalize();
    auto conv_trace = conversion_trace_builder.finalize();
    auto bin_trace = bin_trace_builder.finalize();
    size_t mem_trace_size = mem_trace.size();
    size_t main_trace_size = main_trace.size();
    size_t alu_trace_size = alu_trace.size();
    size_t conv_trace_size = conv_trace.size();
    size_t bin_trace_size = bin_trace.size();

    // Get tag_err counts from the mem_trace_builder
    if (range_check_required) {
        finalise_mem_trace_lookup_counts();
    }

    // Data structure to collect all lookup counts pertaining to 16-bit/32-bit range checks in memory trace
    std::unordered_map<uint16_t, uint32_t> mem_rng_check_lo_counts;
    std::unordered_map<uint16_t, uint32_t> mem_rng_check_mid_counts;
    std::unordered_map<uint8_t, uint32_t> mem_rng_check_hi_counts;

    // Main Trace needs to be at least as big as the biggest subtrace.
    // If the bin_trace_size has entries, we need the main_trace to be as big as our byte lookup table (3 *
    // 2**16 long)
    size_t const lookup_table_size = (bin_trace_size > 0 && range_check_required) ? 3 * (1 << 16) : 0;
    size_t const range_check_size = range_check_required ? UINT16_MAX + 1 : 0;
    std::vector<size_t> trace_sizes = { mem_trace_size,   main_trace_size, alu_trace_size,       lookup_table_size,
                                        range_check_size, conv_trace_size, KERNEL_INPUTS_LENGTH, min_trace_size };
    auto trace_size = std::max_element(trace_sizes.begin(), trace_sizes.end());

    // We only need to pad with zeroes to the size to the largest trace here, pow_2 padding is handled in the
    // subgroup_size check in bb
    // Resize the main_trace to accomodate a potential lookup, filling with default empty rows.
    main_trace_size = *trace_size;
    main_trace.resize(*trace_size, {});

    main_trace.at(*trace_size - 1).avm_main_last = FF(1);

    // Memory trace inclusion

    // We compute in the main loop the timestamp and global address for next row.
    // Perform initialization for index 0 outside of the loop provided that mem trace exists.
    if (mem_trace_size > 0) {
        main_trace.at(0).avm_mem_tsp =
            FF(AvmMemTraceBuilder::NUM_SUB_CLK * mem_trace.at(0).m_clk + mem_trace.at(0).m_sub_clk);
        main_trace.at(0).avm_mem_glob_addr =
            FF(mem_trace.at(0).m_addr + (static_cast<uint64_t>(mem_trace.at(0).m_space_id) << 32));
    }

    for (size_t i = 0; i < mem_trace_size; i++) {
        auto const& src = mem_trace.at(i);
        auto& dest = main_trace.at(i);

        dest.avm_mem_mem_sel = FF(1);
        dest.avm_mem_clk = FF(src.m_clk);
        dest.avm_mem_addr = FF(src.m_addr);
        dest.avm_mem_space_id = FF(src.m_space_id);
        dest.avm_mem_val = src.m_val;
        dest.avm_mem_rw = FF(static_cast<uint32_t>(src.m_rw));
        dest.avm_mem_r_in_tag = FF(static_cast<uint32_t>(src.r_in_tag));
        dest.avm_mem_w_in_tag = FF(static_cast<uint32_t>(src.w_in_tag));
        dest.avm_mem_tag = FF(static_cast<uint32_t>(src.m_tag));
        dest.avm_mem_tag_err = FF(static_cast<uint32_t>(src.m_tag_err));
        dest.avm_mem_one_min_inv = src.m_one_min_inv;
        dest.avm_mem_sel_mov_a = FF(static_cast<uint32_t>(src.m_sel_mov_a));
        dest.avm_mem_sel_mov_b = FF(static_cast<uint32_t>(src.m_sel_mov_b));
        dest.avm_mem_sel_cmov = FF(static_cast<uint32_t>(src.m_sel_cmov));

        dest.incl_mem_tag_err_counts = FF(static_cast<uint32_t>(src.m_tag_err_count_relevant));

        switch (src.m_sub_clk) {
        case AvmMemTraceBuilder::SUB_CLK_LOAD_A:
        case AvmMemTraceBuilder::SUB_CLK_STORE_A:
            dest.avm_mem_op_a = 1;
            break;
        case AvmMemTraceBuilder::SUB_CLK_LOAD_B:
        case AvmMemTraceBuilder::SUB_CLK_STORE_B:
            dest.avm_mem_op_b = 1;
            break;
        case AvmMemTraceBuilder::SUB_CLK_LOAD_C:
        case AvmMemTraceBuilder::SUB_CLK_STORE_C:
            dest.avm_mem_op_c = 1;
            break;
        case AvmMemTraceBuilder::SUB_CLK_LOAD_D:
        case AvmMemTraceBuilder::SUB_CLK_STORE_D:
            dest.avm_mem_op_d = 1;
            break;
        case AvmMemTraceBuilder::SUB_CLK_IND_LOAD_A:
            dest.avm_mem_ind_op_a = 1;
            break;
        case AvmMemTraceBuilder::SUB_CLK_IND_LOAD_B:
            dest.avm_mem_ind_op_b = 1;
            break;
        case AvmMemTraceBuilder::SUB_CLK_IND_LOAD_C:
            dest.avm_mem_ind_op_c = 1;
            break;
        case AvmMemTraceBuilder::SUB_CLK_IND_LOAD_D:
            dest.avm_mem_ind_op_d = 1;
            break;
        default:
            break;
        }

        if (src.m_sel_cmov) {
            dest.avm_mem_skip_check_tag = dest.avm_mem_op_d + dest.avm_mem_op_a * (-dest.avm_mem_sel_mov_a + 1) +
                                          dest.avm_mem_op_b * (-dest.avm_mem_sel_mov_b + 1);
        }

        if (i + 1 < mem_trace_size) {
            auto const& next = mem_trace.at(i + 1);
            auto& dest_next = main_trace.at(i + 1);
            dest_next.avm_mem_tsp = FF(AvmMemTraceBuilder::NUM_SUB_CLK * next.m_clk + next.m_sub_clk);
            dest_next.avm_mem_glob_addr = FF(next.m_addr + (static_cast<uint64_t>(next.m_space_id) << 32));

            FF diff{};
            if (dest_next.avm_mem_glob_addr == dest.avm_mem_glob_addr) {
                diff = dest_next.avm_mem_tsp - dest.avm_mem_tsp;
            } else {
                diff = dest_next.avm_mem_glob_addr - dest.avm_mem_glob_addr;
                dest.avm_mem_lastAccess = FF(1);
            }
            dest.avm_mem_rng_chk_sel = FF(1);

            // Decomposition of diff
            auto const diff_64 = uint64_t(diff);
            auto const diff_hi = static_cast<uint8_t>(diff_64 >> 32);
            auto const diff_mid = static_cast<uint16_t>((diff_64 & UINT32_MAX) >> 16);
            auto const diff_lo = static_cast<uint16_t>(diff_64 & UINT16_MAX);
            dest.avm_mem_diff_hi = FF(diff_hi);
            dest.avm_mem_diff_mid = FF(diff_mid);
            dest.avm_mem_diff_lo = FF(diff_lo);

            // Add the range checks counts
            mem_rng_check_hi_counts[diff_hi]++;
            mem_rng_check_mid_counts[diff_mid]++;
            mem_rng_check_lo_counts[diff_lo]++;
        } else {
            dest.avm_mem_lastAccess = FF(1);
            dest.avm_mem_last = FF(1);
        }
    }

    // Alu trace inclusion
    for (size_t i = 0; i < alu_trace_size; i++) {
        auto const& src = alu_trace.at(i);
        auto& dest = main_trace.at(i);

        dest.avm_alu_clk = FF(static_cast<uint32_t>(src.alu_clk));

        dest.avm_alu_op_add = FF(static_cast<uint32_t>(src.alu_op_add));
        dest.avm_alu_op_sub = FF(static_cast<uint32_t>(src.alu_op_sub));
        dest.avm_alu_op_mul = FF(static_cast<uint32_t>(src.alu_op_mul));
        dest.avm_alu_op_not = FF(static_cast<uint32_t>(src.alu_op_not));
        dest.avm_alu_op_eq = FF(static_cast<uint32_t>(src.alu_op_eq));
        dest.avm_alu_op_lt = FF(static_cast<uint32_t>(src.alu_op_lt));
        dest.avm_alu_op_lte = FF(static_cast<uint32_t>(src.alu_op_lte));
        dest.avm_alu_op_cast = FF(static_cast<uint32_t>(src.alu_op_cast));
        dest.avm_alu_op_cast_prev = FF(static_cast<uint32_t>(src.alu_op_cast_prev));
        dest.avm_alu_cmp_sel = FF(static_cast<uint8_t>(src.alu_op_lt) + static_cast<uint8_t>(src.alu_op_lte));
        dest.avm_alu_rng_chk_sel = FF(static_cast<uint8_t>(src.rng_chk_sel));
        dest.avm_alu_op_shr = FF(static_cast<uint8_t>(src.alu_op_shr));
        dest.avm_alu_op_shl = FF(static_cast<uint8_t>(src.alu_op_shl));
        dest.avm_alu_op_div = FF(static_cast<uint8_t>(src.alu_op_div));

        dest.avm_alu_ff_tag = FF(static_cast<uint32_t>(src.alu_ff_tag));
        dest.avm_alu_u8_tag = FF(static_cast<uint32_t>(src.alu_u8_tag));
        dest.avm_alu_u16_tag = FF(static_cast<uint32_t>(src.alu_u16_tag));
        dest.avm_alu_u32_tag = FF(static_cast<uint32_t>(src.alu_u32_tag));
        dest.avm_alu_u64_tag = FF(static_cast<uint32_t>(src.alu_u64_tag));
        dest.avm_alu_u128_tag = FF(static_cast<uint32_t>(src.alu_u128_tag));

        dest.avm_alu_in_tag = dest.avm_alu_u8_tag + FF(2) * dest.avm_alu_u16_tag + FF(3) * dest.avm_alu_u32_tag +
                              FF(4) * dest.avm_alu_u64_tag + FF(5) * dest.avm_alu_u128_tag +
                              FF(6) * dest.avm_alu_ff_tag;

        dest.avm_alu_ia = src.alu_ia;
        dest.avm_alu_ib = src.alu_ib;
        dest.avm_alu_ic = src.alu_ic;

        dest.avm_alu_cf = FF(static_cast<uint32_t>(src.alu_cf));

        dest.avm_alu_u8_r0 = FF(src.alu_u8_r0);
        dest.avm_alu_u8_r1 = FF(src.alu_u8_r1);

        dest.avm_alu_u16_r0 = FF(src.alu_u16_reg.at(0));
        dest.avm_alu_u16_r1 = FF(src.alu_u16_reg.at(1));
        dest.avm_alu_u16_r2 = FF(src.alu_u16_reg.at(2));
        dest.avm_alu_u16_r3 = FF(src.alu_u16_reg.at(3));
        dest.avm_alu_u16_r4 = FF(src.alu_u16_reg.at(4));
        dest.avm_alu_u16_r5 = FF(src.alu_u16_reg.at(5));
        dest.avm_alu_u16_r6 = FF(src.alu_u16_reg.at(6));
        dest.avm_alu_u16_r7 = FF(src.alu_u16_reg.at(7));
        dest.avm_alu_u16_r8 = FF(src.alu_u16_reg.at(8));
        dest.avm_alu_u16_r9 = FF(src.alu_u16_reg.at(9));
        dest.avm_alu_u16_r10 = FF(src.alu_u16_reg.at(10));
        dest.avm_alu_u16_r11 = FF(src.alu_u16_reg.at(11));
        dest.avm_alu_u16_r12 = FF(src.alu_u16_reg.at(12));
        dest.avm_alu_u16_r13 = FF(src.alu_u16_reg.at(13));
        dest.avm_alu_u16_r14 = FF(src.alu_u16_reg.at(14));

        dest.avm_alu_div_rng_chk_selector = FF(static_cast<uint8_t>(src.div_u64_range_chk_sel));
        dest.avm_alu_div_u16_r0 = FF(src.div_u64_range_chk.at(0));
        dest.avm_alu_div_u16_r1 = FF(src.div_u64_range_chk.at(1));
        dest.avm_alu_div_u16_r2 = FF(src.div_u64_range_chk.at(2));
        dest.avm_alu_div_u16_r3 = FF(src.div_u64_range_chk.at(3));
        dest.avm_alu_div_u16_r4 = FF(src.div_u64_range_chk.at(4));
        dest.avm_alu_div_u16_r5 = FF(src.div_u64_range_chk.at(5));
        dest.avm_alu_div_u16_r6 = FF(src.div_u64_range_chk.at(6));
        dest.avm_alu_div_u16_r7 = FF(src.div_u64_range_chk.at(7));
        dest.avm_alu_op_eq_diff_inv = FF(src.alu_op_eq_diff_inv);

        // Not all rows in ALU are enabled with a selector. For instance,
        // multiplication over u128 is taking two lines.
        if (AvmAluTraceBuilder::is_alu_row_enabled(src)) {
            dest.avm_alu_alu_sel = FF(1);
        }

        if (dest.avm_alu_cmp_sel == FF(1) || dest.avm_alu_rng_chk_sel == FF(1)) {
            dest.avm_alu_a_lo = FF(src.hi_lo_limbs.at(0));
            dest.avm_alu_a_hi = FF(src.hi_lo_limbs.at(1));
            dest.avm_alu_b_lo = FF(src.hi_lo_limbs.at(2));
            dest.avm_alu_b_hi = FF(src.hi_lo_limbs.at(3));
            dest.avm_alu_p_sub_a_lo = FF(src.hi_lo_limbs.at(4));
            dest.avm_alu_p_sub_a_hi = FF(src.hi_lo_limbs.at(5));
            dest.avm_alu_p_sub_b_lo = FF(src.hi_lo_limbs.at(6));
            dest.avm_alu_p_sub_b_hi = FF(src.hi_lo_limbs.at(7));
            dest.avm_alu_res_lo = FF(src.hi_lo_limbs.at(8));
            dest.avm_alu_res_hi = FF(src.hi_lo_limbs.at(9));
            dest.avm_alu_p_a_borrow = FF(static_cast<uint8_t>(src.p_a_borrow));
            dest.avm_alu_p_b_borrow = FF(static_cast<uint8_t>(src.p_b_borrow));
            dest.avm_alu_borrow = FF(static_cast<uint8_t>(src.borrow));
            dest.avm_alu_cmp_rng_ctr = FF(static_cast<uint8_t>(src.cmp_rng_ctr));
            dest.avm_alu_rng_chk_lookup_selector = FF(1);
        }
        if (dest.avm_alu_op_div == FF(1)) {
            dest.avm_alu_op_div_std = uint256_t(src.alu_ia) >= uint256_t(src.alu_ib);
            dest.avm_alu_op_div_a_lt_b = uint256_t(src.alu_ia) < uint256_t(src.alu_ib);
            dest.avm_alu_rng_chk_lookup_selector = FF(1);
            dest.avm_alu_a_lo = FF(src.hi_lo_limbs.at(0));
            dest.avm_alu_a_hi = FF(src.hi_lo_limbs.at(1));
            dest.avm_alu_b_lo = FF(src.hi_lo_limbs.at(2));
            dest.avm_alu_b_hi = FF(src.hi_lo_limbs.at(3));
            dest.avm_alu_p_sub_a_lo = FF(src.hi_lo_limbs.at(4));
            dest.avm_alu_p_sub_a_hi = FF(src.hi_lo_limbs.at(5));
            dest.avm_alu_remainder = src.remainder;
            dest.avm_alu_divisor_lo = src.divisor_lo;
            dest.avm_alu_divisor_hi = src.divisor_hi;
            dest.avm_alu_quotient_lo = src.quotient_lo;
            dest.avm_alu_quotient_hi = src.quotient_hi;
            dest.avm_alu_partial_prod_lo = src.partial_prod_lo;
            dest.avm_alu_partial_prod_hi = src.partial_prod_hi;
        }

        if (dest.avm_alu_op_add == FF(1) || dest.avm_alu_op_sub == FF(1) || dest.avm_alu_op_mul == FF(1)) {
            dest.avm_alu_rng_chk_lookup_selector = FF(1);
        }

        if (dest.avm_alu_op_cast == FF(1)) {
            dest.avm_alu_a_lo = FF(src.hi_lo_limbs.at(0));
            dest.avm_alu_a_hi = FF(src.hi_lo_limbs.at(1));
            dest.avm_alu_p_sub_a_lo = FF(src.hi_lo_limbs.at(2));
            dest.avm_alu_p_sub_a_hi = FF(src.hi_lo_limbs.at(3));
            dest.avm_alu_rng_chk_lookup_selector = FF(1);
        }

        if (dest.avm_alu_op_cast_prev == FF(1)) {
            dest.avm_alu_a_lo = FF(src.hi_lo_limbs.at(0));
            dest.avm_alu_a_hi = FF(src.hi_lo_limbs.at(1));
            dest.avm_alu_rng_chk_lookup_selector = FF(1);
        }

        // Multiplication over u128 expands over two rows.
        if (dest.avm_alu_op_mul == FF(1) && dest.avm_alu_u128_tag) {
            main_trace.at(i + 1).avm_alu_rng_chk_lookup_selector = FF(1);
        }
        if (src.alu_op_shr || src.alu_op_shl) {
            dest.avm_alu_a_lo = FF(src.hi_lo_limbs[0]);
            dest.avm_alu_a_hi = FF(src.hi_lo_limbs[1]);
            dest.avm_alu_b_lo = FF(src.hi_lo_limbs[2]);
            dest.avm_alu_b_hi = FF(src.hi_lo_limbs[3]);
            dest.avm_alu_shift_sel = FF(1);
            dest.avm_alu_shift_lt_bit_len = FF(static_cast<uint8_t>(src.shift_lt_bit_len));
            dest.avm_alu_t_sub_s_bits = FF(src.mem_tag_sub_shift);
            dest.avm_alu_two_pow_s = FF(uint256_t(1) << dest.avm_alu_ib);
            dest.avm_alu_two_pow_t_sub_s = FF(uint256_t(1) << uint256_t(dest.avm_alu_t_sub_s_bits));
            dest.avm_alu_rng_chk_lookup_selector = FF(1);
        }
    }

    auto new_trace_size = range_check_required ? main_trace_size
                                               : finalize_rng_chks_for_testing(main_trace,
                                                                               alu_trace_builder,
                                                                               mem_trace_builder,
                                                                               mem_rng_check_lo_counts,
                                                                               mem_rng_check_mid_counts,
                                                                               mem_rng_check_hi_counts);
    auto old_trace_size = main_trace_size - 1;

    for (size_t i = 0; i < new_trace_size; i++) {
        auto& r = main_trace.at(i);

        if ((r.avm_main_sel_op_add == FF(1) || r.avm_main_sel_op_sub == FF(1) || r.avm_main_sel_op_mul == FF(1) ||
             r.avm_main_sel_op_eq == FF(1) || r.avm_main_sel_op_not == FF(1) || r.avm_main_sel_op_lt == FF(1) ||
             r.avm_main_sel_op_lte == FF(1) || r.avm_main_sel_op_cast == FF(1) || r.avm_main_sel_op_shr == FF(1) ||
             r.avm_main_sel_op_shl == FF(1) || r.avm_main_sel_op_div == FF(1)) &&
            r.avm_main_tag_err == FF(0) && r.avm_main_op_err == FF(0)) {
            r.avm_main_alu_sel = FF(1);
        }

        if (r.avm_main_sel_internal_call == FF(1) || r.avm_main_sel_internal_return == FF(1)) {
            r.avm_main_space_id = INTERNAL_CALL_SPACE_ID;
        } else {
            r.avm_main_space_id = r.avm_main_call_ptr;
        };

        r.avm_main_clk = i > old_trace_size ? r.avm_main_clk : FF(i);
        auto counter = i > old_trace_size ? static_cast<uint32_t>(r.avm_main_clk) : static_cast<uint32_t>(i);
        r.incl_main_tag_err_counts = mem_trace_builder.m_tag_err_lookup_counts[static_cast<uint32_t>(counter)];
        if (counter <= UINT8_MAX) {
            r.lookup_u8_0_counts = alu_trace_builder.u8_range_chk_counters[0][static_cast<uint8_t>(counter)];
            r.lookup_u8_1_counts = alu_trace_builder.u8_range_chk_counters[1][static_cast<uint8_t>(counter)];
            r.lookup_pow_2_0_counts = alu_trace_builder.u8_pow_2_counters[0][static_cast<uint8_t>(counter)];
            r.lookup_pow_2_1_counts = alu_trace_builder.u8_pow_2_counters[1][static_cast<uint8_t>(counter)];
            r.lookup_mem_rng_chk_hi_counts = mem_rng_check_hi_counts[static_cast<uint8_t>(counter)];
            r.avm_main_sel_rng_8 = FF(1);
            r.avm_main_table_pow_2 = uint256_t(1) << uint256_t(counter);
        }
        if (counter <= UINT16_MAX) {
            // We add to the clk here in case our trace is smaller than our range checks
            // There might be a cleaner way to do this in the future as this only applies
            // when our trace (excluding range checks) is < 2**16
            r.lookup_u16_0_counts = alu_trace_builder.u16_range_chk_counters[0][static_cast<uint16_t>(counter)];
            r.lookup_u16_1_counts = alu_trace_builder.u16_range_chk_counters[1][static_cast<uint16_t>(counter)];
            r.lookup_u16_2_counts = alu_trace_builder.u16_range_chk_counters[2][static_cast<uint16_t>(counter)];
            r.lookup_u16_3_counts = alu_trace_builder.u16_range_chk_counters[3][static_cast<uint16_t>(counter)];
            r.lookup_u16_4_counts = alu_trace_builder.u16_range_chk_counters[4][static_cast<uint16_t>(counter)];
            r.lookup_u16_5_counts = alu_trace_builder.u16_range_chk_counters[5][static_cast<uint16_t>(counter)];
            r.lookup_u16_6_counts = alu_trace_builder.u16_range_chk_counters[6][static_cast<uint16_t>(counter)];
            r.lookup_u16_7_counts = alu_trace_builder.u16_range_chk_counters[7][static_cast<uint16_t>(counter)];
            r.lookup_u16_8_counts = alu_trace_builder.u16_range_chk_counters[8][static_cast<uint16_t>(counter)];
            r.lookup_u16_9_counts = alu_trace_builder.u16_range_chk_counters[9][static_cast<uint16_t>(counter)];
            r.lookup_u16_10_counts = alu_trace_builder.u16_range_chk_counters[10][static_cast<uint16_t>(counter)];
            r.lookup_u16_11_counts = alu_trace_builder.u16_range_chk_counters[11][static_cast<uint16_t>(counter)];
            r.lookup_u16_12_counts = alu_trace_builder.u16_range_chk_counters[12][static_cast<uint16_t>(counter)];
            r.lookup_u16_13_counts = alu_trace_builder.u16_range_chk_counters[13][static_cast<uint16_t>(counter)];
            r.lookup_u16_14_counts = alu_trace_builder.u16_range_chk_counters[14][static_cast<uint16_t>(counter)];

            r.lookup_mem_rng_chk_mid_counts = mem_rng_check_mid_counts[static_cast<uint16_t>(counter)];
            r.lookup_mem_rng_chk_lo_counts = mem_rng_check_lo_counts[static_cast<uint16_t>(counter)];

            r.lookup_div_u16_0_counts = alu_trace_builder.div_u64_range_chk_counters[0][static_cast<uint16_t>(counter)];
            r.lookup_div_u16_1_counts = alu_trace_builder.div_u64_range_chk_counters[1][static_cast<uint16_t>(counter)];
            r.lookup_div_u16_2_counts = alu_trace_builder.div_u64_range_chk_counters[2][static_cast<uint16_t>(counter)];
            r.lookup_div_u16_3_counts = alu_trace_builder.div_u64_range_chk_counters[3][static_cast<uint16_t>(counter)];
            r.lookup_div_u16_4_counts = alu_trace_builder.div_u64_range_chk_counters[4][static_cast<uint16_t>(counter)];
            r.lookup_div_u16_5_counts = alu_trace_builder.div_u64_range_chk_counters[5][static_cast<uint16_t>(counter)];
            r.lookup_div_u16_6_counts = alu_trace_builder.div_u64_range_chk_counters[6][static_cast<uint16_t>(counter)];
            r.lookup_div_u16_7_counts = alu_trace_builder.div_u64_range_chk_counters[7][static_cast<uint16_t>(counter)];
            r.avm_main_sel_rng_16 = FF(1);
        }
    }

    // Add Conversion Gadget table
    for (size_t i = 0; i < conv_trace_size; i++) {
        auto const& src = conv_trace.at(i);
        auto& dest = main_trace.at(i);
        dest.avm_conversion_to_radix_le_sel = FF(static_cast<uint8_t>(src.to_radix_le_sel));
        dest.avm_conversion_clk = FF(src.conversion_clk);
        dest.avm_conversion_input = src.input;
        dest.avm_conversion_radix = FF(src.radix);
        dest.avm_conversion_num_limbs = FF(src.num_limbs);
    }

    // Add Binary Trace table
    for (size_t i = 0; i < bin_trace_size; i++) {
        auto const& src = bin_trace.at(i);
        auto& dest = main_trace.at(i);
        dest.avm_binary_clk = src.binary_clk;
        dest.avm_binary_bin_sel = static_cast<uint8_t>(src.bin_sel);
        dest.avm_binary_acc_ia = src.acc_ia;
        dest.avm_binary_acc_ib = src.acc_ib;
        dest.avm_binary_acc_ic = src.acc_ic;
        dest.avm_binary_in_tag = src.in_tag;
        dest.avm_binary_op_id = src.op_id;
        dest.avm_binary_ia_bytes = src.bin_ia_bytes;
        dest.avm_binary_ib_bytes = src.bin_ib_bytes;
        dest.avm_binary_ic_bytes = src.bin_ic_bytes;
        dest.avm_binary_start = FF(static_cast<uint8_t>(src.start));
        dest.avm_binary_mem_tag_ctr = src.mem_tag_ctr;
        dest.avm_binary_mem_tag_ctr_inv = src.mem_tag_ctr_inv;
    }

    // Only generate precomputed byte tables if we are actually going to use them in this main trace.
    if (bin_trace_size > 0) {
        if (!range_check_required) {
            finalize_bin_trace_lookup_for_testing(main_trace, bin_trace_builder);
        } else {
            // Generate Lookup Table of all combinations of 2, 8-bit numbers and op_id.
            for (size_t op_id = 0; op_id < 3; op_id++) {
                for (size_t input_a = 0; input_a <= UINT8_MAX; input_a++) {
                    for (size_t input_b = 0; input_b <= UINT8_MAX; input_b++) {
                        auto a = static_cast<uint8_t>(input_a);
                        auto b = static_cast<uint8_t>(input_b);

                        // Derive a unique row index given op_id, a, and b.
                        auto main_trace_index = static_cast<uint32_t>((op_id << 16) + (input_a << 8) + b);

                        main_trace.at(main_trace_index).avm_byte_lookup_bin_sel = FF(1);
                        main_trace.at(main_trace_index).avm_byte_lookup_table_op_id = op_id;
                        main_trace.at(main_trace_index).avm_byte_lookup_table_input_a = a;
                        main_trace.at(main_trace_index).avm_byte_lookup_table_input_b = b;
                        // Add the counter value stored throughout the execution
                        main_trace.at(main_trace_index).lookup_byte_operations_counts =
                            bin_trace_builder.byte_operation_counter[main_trace_index];
                        if (op_id == 0) {
                            main_trace.at(main_trace_index).avm_byte_lookup_table_output = a & b;
                        } else if (op_id == 1) {
                            main_trace.at(main_trace_index).avm_byte_lookup_table_output = a | b;
                        } else {
                            main_trace.at(main_trace_index).avm_byte_lookup_table_output = a ^ b;
                        }
                    }
                }
            }
        }
        // Generate ByteLength Lookup table of instruction tags to the number of bytes
        // {U8: 1, U16: 2, U32: 4, U64: 8, U128: 16}
        for (uint8_t avm_in_tag = 0; avm_in_tag < 5; avm_in_tag++) {
            // The +1 here is because the instruction tags we care about (i.e excl U0 and FF) has the range
            // [1,5]
            main_trace.at(avm_in_tag).avm_byte_lookup_bin_sel = FF(1);
            main_trace.at(avm_in_tag).avm_byte_lookup_table_in_tags = avm_in_tag + 1;
            main_trace.at(avm_in_tag).avm_byte_lookup_table_byte_lengths = static_cast<uint8_t>(pow(2, avm_in_tag));
            main_trace.at(avm_in_tag).lookup_byte_lengths_counts =
                bin_trace_builder.byte_length_counter[avm_in_tag + 1];
        }
    }

    // 1. Calculate the lookup counts for each environment access
    // 2. Add public inputs into the kernel column

    // We add the lookup counts in the index of the kernel inputs selectors that are active
    for (uint32_t selector_index : KERNEL_INPUTS_SELECTORS) {
        auto& dest = main_trace.at(selector_index);
        dest.lookup_into_kernel_counts =
            FF(kernel_trace_builder.kernel_selector_counter[static_cast<uint32_t>(selector_index)]);
        dest.avm_kernel_q_public_input_kernel_add_to_table = FF(1);
    }

    for (size_t i = 0; i < KERNEL_INPUTS_LENGTH; i++) {
        main_trace.at(i).avm_kernel_kernel_inputs__is_public = kernel_trace_builder.kernel_inputs.at(i);
    }

    // Adding extra row for the shifted values at the top of the execution trace.
    Row first_row = Row{ .avm_main_first = FF(1), .avm_mem_lastAccess = FF(1) };
    main_trace.insert(main_trace.begin(), first_row);

    auto trace = std::move(main_trace);
    reset();

    return trace;
}

} // namespace bb::avm_trace
