#pragma once

#include <stack>

#include "AvmMini_common.hpp"
#include "AvmMini_mem_trace.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

#include "barretenberg/relations/generated/AvmMini/avm_mini.hpp"

namespace proof_system {

// This is the internal context that we keep along the lifecycle of bytecode execution
// to iteratively build the whole trace. This is effectively performing witness generation.
// At the end of circuit building, mainTrace can be moved to AvmMiniCircuitBuilder by calling
// AvmMiniCircuitBuilder::set_trace(rows).
class AvmMiniTraceBuilder {

  public:
    static const size_t CALLSTACK_OFFSET = 896; // TODO(md): Temporary reserved area 896 - 1024

    AvmMiniTraceBuilder();

    // Temporary helper to initialize memory.
    void setFFMem(size_t idx, FF el, AvmMemoryTag tag);

    std::vector<Row> finalize();
    void reset();

    // Addition with direct memory access.
    void add(uint32_t aOffset, uint32_t bOffset, uint32_t dstOffset, AvmMemoryTag inTag);

    // Subtraction with direct memory access.
    void sub(uint32_t aOffset, uint32_t bOffset, uint32_t dstOffset, AvmMemoryTag inTag);

    // Multiplication with direct memory access.
    void mul(uint32_t aOffset, uint32_t bOffset, uint32_t dstOffset, AvmMemoryTag inTag);

    // Division with direct memory access.
    void div(uint32_t aOffset, uint32_t bOffset, uint32_t dstOffset, AvmMemoryTag inTag);

    // Jump to a given program counter.
    void jump(uint32_t jmpDest);

    // Jump to a given program counter; storing the return location on a call stack.
    // TODO(md): this program counter MUST be an operand to the OPCODE.
    void internal_call(uint32_t jmpDest);

    // Return from a jump.
    void internal_return();

    // Halt -> stop program execution.
    void halt();

    // CALLDATACOPY opcode with direct memory access, i.e.,
    // M[dstOffset:dstOffset+copySize] = calldata[cdOffset:cdOffset+copySize]
    void callDataCopy(uint32_t cdOffset, uint32_t copySize, uint32_t dstOffset, std::vector<FF> const& callDataMem);

    // RETURN opcode with direct memory access, i.e.,
    // return(M[retOffset:retOffset+retSize])
    std::vector<FF> returnOP(uint32_t retOffset, uint32_t retSize);

  private:
    std::vector<Row> mainTrace;
    AvmMiniMemTraceBuilder memTraceBuilder;

    uint32_t pc = 0;
    uint32_t internal_return_ptr = CALLSTACK_OFFSET;
    std::stack<uint32_t> internal_call_stack = {};
};
} // namespace proof_system
