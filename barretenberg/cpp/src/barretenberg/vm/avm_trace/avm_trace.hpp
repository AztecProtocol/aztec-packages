#pragma once

#include <stack>

#include "avm_alu_trace.hpp"
#include "avm_binary_trace.hpp"
#include "avm_common.hpp"
#include "avm_instructions.hpp"
#include "avm_mem_trace.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/vm/avm_trace/gadgets/avm_conversion_trace.hpp"
#include "constants.hpp"

#include "barretenberg/relations/generated/avm/avm_main.hpp"
#include "barretenberg/vm/avm_trace/avm_kernel_trace.hpp"

namespace bb::avm_trace {

// This is the internal context that we keep along the lifecycle of bytecode execution
// to iteratively build the whole trace. This is effectively performing witness generation.
// At the end of circuit building, mainTrace can be moved to AvmCircuitBuilder by calling
// AvmCircuitBuilder::set_trace(rows).
class AvmTraceBuilder {

  public:
    AvmTraceBuilder(std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs = {});

    std::vector<Row> finalize(uint32_t min_trace_size = 0, bool range_check_required = false);
    void reset();

    uint32_t getPc() const { return pc; }

    // Addition with direct or indirect memory access.
    void op_add(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Subtraction with direct or indirect memory access.
    void op_sub(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Multiplication with direct or indirect memory access.
    void op_mul(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Finite field division with direct or indirect memory access.
    void op_fdiv(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset);

    // Bitwise not with direct or indirect memory access.
    void op_not(uint8_t indirect, uint32_t a_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Equality with direct or indirect memory access.
    void op_eq(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Bitwise and with direct or indirect memory access.
    void op_and(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Bitwise or with direct or indirect memory access.
    void op_or(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Bitwise xor with direct or indirect memory access.
    void op_xor(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Less Than with direct or indirect memory access.
    void op_lt(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Less Than or Equal to with direct or indirect memory access.
    void op_lte(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Shift Right with direct or indirect memory access.
    void op_shr(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Shift Left with direct or indirect memory access.
    void op_shl(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Set a constant from bytecode with direct or indirect memory access.
    void op_set(uint8_t indirect, uint128_t val, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Move (copy) the value and tag of a memory cell to another one.
    void op_mov(uint8_t indirect, uint32_t src_offset, uint32_t dst_offset);

    // Move (copy) the value and tag of a memory cell to another one whereby the source
    // is determined conditionally based on a conditional value determined by cond_offset.
    void op_cmov(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t cond_offset, uint32_t dst_offset);

    // Call Context
    void op_sender(uint32_t dst_offset);
    void op_address(uint32_t dst_offset);
    void op_portal(uint32_t dst_offset);

    // Fees
    void op_fee_per_da_gas(uint32_t dst_offset);
    void op_fee_per_l2_gas(uint32_t dst_offset);
    void op_transaction_fee(uint32_t dst_offset);

    // Globals
    void op_chain_id(uint32_t dst_offset);
    void op_version(uint32_t dst_offset);
    void op_block_number(uint32_t dst_offset);
    void op_coinbase(uint32_t dst_offset);
    void op_timestamp(uint32_t dst_offset);

    // Cast an element pointed by the address a_offset into type specified by dst_tag and
    // store the result in address given by dst_offset.
    void op_cast(uint8_t indirect, uint32_t a_offset, uint32_t dst_offset, AvmMemoryTag dst_tag);

    // Integer Division with direct or indirect memory access.
    void op_div(uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, AvmMemoryTag in_tag);

    // Jump to a given program counter.
    void jump(uint32_t jmp_dest);

    // Jump to a given program counter; storing the return location on a call stack.
    // TODO(md): this program counter MUST be an operand to the OPCODE.
    void internal_call(uint32_t jmp_dest);

    // Return from a jump.
    void internal_return();

    // Halt -> stop program execution.
    void halt();

    // CALLDATACOPY opcode with direct/indirect memory access, i.e.,
    // direct: M[dst_offset:dst_offset+copy_size] = calldata[cd_offset:cd_offset+copy_size]
    // indirect: M[M[dst_offset]:M[dst_offset]+copy_size] = calldata[cd_offset:cd_offset+copy_size]
    void calldata_copy(uint8_t indirect,
                       uint32_t cd_offset,
                       uint32_t copy_size,
                       uint32_t dst_offset,
                       std::vector<FF> const& call_data_mem);

    // RETURN opcode with direct and indirect memory access, i.e.,
    // direct:   return(M[ret_offset:ret_offset+ret_size])
    // indirect: return(M[M[ret_offset]:M[ret_offset]+ret_size])
    std::vector<FF> return_op(uint8_t indirect, uint32_t ret_offset, uint32_t ret_size);

    // Gadgets
    // --- Conversions
    // To Radix LE conversion operation.
    void op_to_radix_le(uint8_t indirect, uint32_t src_offset, uint32_t dst_offset, uint32_t radix, uint32_t num_limbs);

  private:
    // Used for the standard indirect address resolution of three operands opcode.
    struct IndirectThreeResolution {
        bool tag_match = false;
        uint32_t direct_a_offset;
        uint32_t direct_b_offset;
        uint32_t direct_c_offset;

        bool indirect_flag_a = false;
        bool indirect_flag_b = false;
        bool indirect_flag_c = false;
    };

    std::vector<Row> main_trace;
    AvmMemTraceBuilder mem_trace_builder;
    AvmAluTraceBuilder alu_trace_builder;
    AvmBinaryTraceBuilder bin_trace_builder;
    AvmKernelTraceBuilder kernel_trace_builder;
    AvmConversionTraceBuilder conversion_trace_builder;

    Row create_kernel_lookup_opcode(uint32_t dst_offset, uint32_t selector, FF value, AvmMemoryTag w_tag);
    void finalise_mem_trace_lookup_counts();

    IndirectThreeResolution resolve_ind_three(
        uint8_t space_id, uint32_t clk, uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t c_offset);

    uint32_t pc = 0;
    uint32_t internal_return_ptr =
        0; // After a nested call, it should be initialized with MAX_SIZE_INTERNAL_STACK * call_ptr
    uint8_t call_ptr = 0;
};
} // namespace bb::avm_trace
