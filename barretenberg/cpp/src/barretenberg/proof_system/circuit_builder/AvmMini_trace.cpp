#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <sys/types.h>
#include <vector>

#include "AvmMini_trace.hpp"

namespace proof_system {

/**
 * @brief Constructor of a trace builder of AVM. Only serves to set the capacity of the
 *        underlying traces.
 */
AvmMiniTraceBuilder::AvmMiniTraceBuilder()
{
    mainTrace.reserve(AVM_TRACE_SIZE);
}

/**
 * @brief Resetting the internal state so that a new trace can be rebuilt using the same object.
 *
 */
void AvmMiniTraceBuilder::reset()
{
    mainTrace.clear();
    memTraceBuilder.reset();
}

/** TODO: Implement for non finite field types
 * @brief Addition with direct memory access.
 *
 * @param aOffset An index in memory pointing to the first operand of the addition.
 * @param bOffset An index in memory pointing to the second operand of the addition.
 * @param dstOffset An index in memory pointing to the output of the addition.
 * @param inTag The instruction memory tag of the operands.
 */
void AvmMiniTraceBuilder::add(uint32_t aOffset, uint32_t bOffset, uint32_t dstOffset, AvmMemoryTag inTag)
{
    auto clk = static_cast<uint32_t>(mainTrace.size());

    // Reading from memory and loading into ia resp. ib.
    auto readA = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ia, aOffset, inTag);
    auto readB = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ib, bOffset, inTag);
    bool tagMatch = readA.tagMatch && readB.tagMatch;

    // a + b = c
    FF a = readA.val;
    FF b = readB.val;
    FF c = a + b;

    // Write into memory value c from intermediate register ic.
    memTraceBuilder.writeIntoMemory(clk, IntermRegister::ic, dstOffset, c, inTag);

    mainTrace.push_back(Row{
        .avmMini_clk = clk,
        .avmMini_pc = FF(pc++),
        .avmMini_internal_return_ptr = FF(internal_return_ptr),
        .avmMini_sel_op_add = FF(1),
        .avmMini_in_tag = FF(static_cast<uint32_t>(inTag)),
        .avmMini_tag_err = FF(static_cast<uint32_t>(!tagMatch)),
        .avmMini_ia = tagMatch ? a : FF(0),
        .avmMini_ib = tagMatch ? b : FF(0),
        .avmMini_ic = tagMatch ? c : FF(0),
        .avmMini_mem_op_a = FF(1),
        .avmMini_mem_op_b = FF(1),
        .avmMini_mem_op_c = FF(1),
        .avmMini_rwc = FF(1),
        .avmMini_mem_idx_a = FF(aOffset),
        .avmMini_mem_idx_b = FF(bOffset),
        .avmMini_mem_idx_c = FF(dstOffset),
    });
};

/** TODO: Implement for non finite field types
 * @brief Subtraction with direct memory access.
 *
 * @param aOffset An index in memory pointing to the first operand of the subtraction.
 * @param bOffset An index in memory pointing to the second operand of the subtraction.
 * @param dstOffset An index in memory pointing to the output of the subtraction.
 * @param inTag The instruction memory tag of the operands.
 */
void AvmMiniTraceBuilder::sub(uint32_t aOffset, uint32_t bOffset, uint32_t dstOffset, AvmMemoryTag inTag)
{
    auto clk = static_cast<uint32_t>(mainTrace.size());

    // Reading from memory and loading into ia resp. ib.
    auto readA = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ia, aOffset, inTag);
    auto readB = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ib, bOffset, inTag);
    bool tagMatch = readA.tagMatch && readB.tagMatch;

    // a - b = c
    FF a = readA.val;
    FF b = readB.val;
    FF c = a - b;

    // Write into memory value c from intermediate register ic.
    memTraceBuilder.writeIntoMemory(clk, IntermRegister::ic, dstOffset, c, inTag);

    mainTrace.push_back(Row{
        .avmMini_clk = clk,
        .avmMini_pc = FF(pc++),
        .avmMini_internal_return_ptr = FF(internal_return_ptr),
        .avmMini_sel_op_sub = FF(1),
        .avmMini_in_tag = FF(static_cast<uint32_t>(inTag)),
        .avmMini_tag_err = FF(static_cast<uint32_t>(!tagMatch)),
        .avmMini_ia = tagMatch ? a : FF(0),
        .avmMini_ib = tagMatch ? b : FF(0),
        .avmMini_ic = tagMatch ? c : FF(0),
        .avmMini_mem_op_a = FF(1),
        .avmMini_mem_op_b = FF(1),
        .avmMini_mem_op_c = FF(1),
        .avmMini_rwc = FF(1),
        .avmMini_mem_idx_a = FF(aOffset),
        .avmMini_mem_idx_b = FF(bOffset),
        .avmMini_mem_idx_c = FF(dstOffset),
    });
};

/** TODO: Implement for non finite field types
 * @brief Multiplication with direct memory access.
 *
 * @param aOffset An index in memory pointing to the first operand of the multiplication.
 * @param bOffset An index in memory pointing to the second operand of the multiplication.
 * @param dstOffset An index in memory pointing to the output of the multiplication.
 * @param inTag The instruction memory tag of the operands.
 */
void AvmMiniTraceBuilder::mul(uint32_t aOffset, uint32_t bOffset, uint32_t dstOffset, AvmMemoryTag inTag)
{
    auto clk = static_cast<uint32_t>(mainTrace.size());

    // Reading from memory and loading into ia resp. ib.
    auto readA = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ia, aOffset, inTag);
    auto readB = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ib, bOffset, inTag);
    bool tagMatch = readA.tagMatch && readB.tagMatch;

    // a * b = c
    FF a = readA.val;
    FF b = readB.val;
    FF c = a * b;

    // Write into memory value c from intermediate register ic.
    memTraceBuilder.writeIntoMemory(clk, IntermRegister::ic, dstOffset, c, inTag);

    mainTrace.push_back(Row{
        .avmMini_clk = clk,
        .avmMini_pc = FF(pc++),
        .avmMini_internal_return_ptr = FF(internal_return_ptr),
        .avmMini_sel_op_mul = FF(1),
        .avmMini_in_tag = FF(static_cast<uint32_t>(inTag)),
        .avmMini_tag_err = FF(static_cast<uint32_t>(!tagMatch)),
        .avmMini_ia = tagMatch ? a : FF(0),
        .avmMini_ib = tagMatch ? b : FF(0),
        .avmMini_ic = tagMatch ? c : FF(0),
        .avmMini_mem_op_a = FF(1),
        .avmMini_mem_op_b = FF(1),
        .avmMini_mem_op_c = FF(1),
        .avmMini_rwc = FF(1),
        .avmMini_mem_idx_a = FF(aOffset),
        .avmMini_mem_idx_b = FF(bOffset),
        .avmMini_mem_idx_c = FF(dstOffset),
    });
}

/** TODO: Implement for non finite field types
 * @brief Division with direct memory access.
 *
 * @param aOffset An index in memory pointing to the first operand of the division.
 * @param bOffset An index in memory pointing to the second operand of the division.
 * @param dstOffset An index in memory pointing to the output of the division.
 * @param inTag The instruction memory tag of the operands.
 */
void AvmMiniTraceBuilder::div(uint32_t aOffset, uint32_t bOffset, uint32_t dstOffset, AvmMemoryTag inTag)
{
    auto clk = static_cast<uint32_t>(mainTrace.size());

    // Reading from memory and loading into ia resp. ib.
    auto readA = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ia, aOffset, inTag);
    auto readB = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ib, bOffset, inTag);
    bool tagMatch = readA.tagMatch && readB.tagMatch;

    // a * b^(-1) = c
    FF a = readA.val;
    FF b = readB.val;
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
    memTraceBuilder.writeIntoMemory(clk, IntermRegister::ic, dstOffset, c, inTag);

    mainTrace.push_back(Row{
        .avmMini_clk = clk,
        .avmMini_pc = FF(pc++),
        .avmMini_internal_return_ptr = FF(internal_return_ptr),
        .avmMini_sel_op_div = FF(1),
        .avmMini_in_tag = FF(static_cast<uint32_t>(inTag)),
        .avmMini_op_err = tagMatch ? error : FF(1),
        .avmMini_tag_err = FF(static_cast<uint32_t>(!tagMatch)),
        .avmMini_inv = tagMatch ? inv : FF(1),
        .avmMini_ia = tagMatch ? a : FF(0),
        .avmMini_ib = tagMatch ? b : FF(0),
        .avmMini_ic = tagMatch ? c : FF(0),
        .avmMini_mem_op_a = FF(1),
        .avmMini_mem_op_b = FF(1),
        .avmMini_mem_op_c = FF(1),
        .avmMini_rwc = FF(1),
        .avmMini_mem_idx_a = FF(aOffset),
        .avmMini_mem_idx_b = FF(bOffset),
        .avmMini_mem_idx_c = FF(dstOffset),
    });
}

/**
 * @brief CALLDATACOPY opcode with direct memory access, i.e.,
 *        M[dstOffset:dstOffset+copySize] = calldata[cdOffset:cdOffset+copySize]
 *        Simplified version with exclusively memory store operations and
 *        values from M_calldata passed by an array and loaded into
 *        intermediate registers.
 *        Assume that caller passes callDataMem which is large enough so that
 *        no out-of-bound memory issues occur.
 *        TODO: Implement the indirect memory version (maybe not required)
 *        TODO: taking care of intermediate register values consistency and propagating their
 *        values to the next row when not overwritten.
 *
 * @param cdOffset The starting index of the region in calldata to be copied.
 * @param copySize The number of finite field elements to be copied into memory.
 * @param dstOffset The starting index of memory where calldata will be copied to.
 * @param callDataMem The vector containing calldata.
 */
void AvmMiniTraceBuilder::callDataCopy(uint32_t cdOffset,
                                       uint32_t copySize,
                                       uint32_t dstOffset,
                                       std::vector<FF> const& callDataMem)
{
    // We parallelize storing memory operations in chunk of 3, i.e., 1 per intermediate register.
    // The variable pos is an index pointing to the first storing operation (pertaining to intermediate
    // register Ia) relative to cdOffset:
    // cdOffset + pos:       Ia memory store operation
    // cdOffset + pos + 1:   Ib memory store operation
    // cdOffset + pos + 2:   Ic memory store operation

    uint32_t pos = 0;

    while (pos < copySize) {
        FF ib(0);
        FF ic(0);
        uint32_t mem_op_b(0);
        uint32_t mem_op_c(0);
        uint32_t mem_idx_b(0);
        uint32_t mem_idx_c(0);
        uint32_t rwb(0);
        uint32_t rwc(0);
        auto clk = static_cast<uint32_t>(mainTrace.size());

        FF ia = callDataMem.at(cdOffset + pos);
        uint32_t mem_op_a(1);
        uint32_t mem_idx_a = dstOffset + pos;
        uint32_t rwa = 1;

        // Storing from Ia
        memTraceBuilder.writeIntoMemory(clk, IntermRegister::ia, mem_idx_a, ia, AvmMemoryTag::ff);

        if (copySize - pos > 1) {
            ib = callDataMem.at(cdOffset + pos + 1);
            mem_op_b = 1;
            mem_idx_b = dstOffset + pos + 1;
            rwb = 1;

            // Storing from Ib
            memTraceBuilder.writeIntoMemory(clk, IntermRegister::ib, mem_idx_b, ib, AvmMemoryTag::ff);
        }

        if (copySize - pos > 2) {
            ic = callDataMem.at(cdOffset + pos + 2);
            mem_op_c = 1;
            mem_idx_c = dstOffset + pos + 2;
            rwc = 1;

            // Storing from Ic
            memTraceBuilder.writeIntoMemory(clk, IntermRegister::ic, mem_idx_c, ic, AvmMemoryTag::ff);
        }

        mainTrace.push_back(Row{
            .avmMini_clk = clk,
            .avmMini_pc = FF(pc++),
            .avmMini_internal_return_ptr = FF(internal_return_ptr),
            .avmMini_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::ff)),
            .avmMini_ia = ia,
            .avmMini_ib = ib,
            .avmMini_ic = ic,
            .avmMini_mem_op_a = FF(mem_op_a),
            .avmMini_mem_op_b = FF(mem_op_b),
            .avmMini_mem_op_c = FF(mem_op_c),
            .avmMini_rwa = FF(rwa),
            .avmMini_rwb = FF(rwb),
            .avmMini_rwc = FF(rwc),
            .avmMini_mem_idx_a = FF(mem_idx_a),
            .avmMini_mem_idx_b = FF(mem_idx_b),
            .avmMini_mem_idx_c = FF(mem_idx_c),
        });

        if (copySize - pos > 2) { // Guard to prevent overflow if copySize is close to uint32_t maximum value.
            pos += 3;
        } else {
            pos = copySize;
        }
    }
}

/**
 * @brief RETURN opcode with direct memory access, i.e.,
 *        return(M[retOffset:retOffset+retSize])
 *        Simplified version with exclusively memory load operations into
 *        intermediate registers and then values are copied to the returned vector.
 *        TODO: Implement the indirect memory version (maybe not required)
 *        TODO: taking care of flagging this row as the last one? Special STOP flag?
 *
 * @param retOffset The starting index of the memory region to be returned.
 * @param retSize The number of elements to be returned.
 * @return The returned memory region as a std::vector.
 */

std::vector<FF> AvmMiniTraceBuilder::returnOP(uint32_t retOffset, uint32_t retSize)
{
    // We parallelize loading memory operations in chunk of 3, i.e., 1 per intermediate register.
    // The variable pos is an index pointing to the first storing operation (pertaining to intermediate
    // register Ia) relative to retOffset:
    // retOffset + pos:       Ia memory load operation
    // retOffset + pos + 1:   Ib memory load operation
    // retOffset + pos + 2:   Ic memory load operation

    uint32_t pos = 0;
    std::vector<FF> returnMem;

    while (pos < retSize) {
        FF ib(0);
        FF ic(0);
        uint32_t mem_op_b(0);
        uint32_t mem_op_c(0);
        uint32_t mem_idx_b(0);
        uint32_t mem_idx_c(0);
        auto clk = static_cast<uint32_t>(mainTrace.size());

        uint32_t mem_op_a(1);
        uint32_t mem_idx_a = retOffset + pos;

        // Reading and loading to Ia
        auto readA = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ia, mem_idx_a, AvmMemoryTag::ff);
        FF ia = readA.val;
        returnMem.push_back(ia);

        if (retSize - pos > 1) {
            mem_op_b = 1;
            mem_idx_b = retOffset + pos + 1;

            // Reading and loading to Ib
            auto readB = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ib, mem_idx_b, AvmMemoryTag::ff);
            FF ib = readB.val;
            returnMem.push_back(ib);
        }

        if (retSize - pos > 2) {
            mem_op_c = 1;
            mem_idx_c = retOffset + pos + 2;

            // Reading and loading to Ic
            auto readC = memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ic, mem_idx_c, AvmMemoryTag::ff);
            FF ic = readC.val;
            returnMem.push_back(ic);
        }

        mainTrace.push_back(Row{
            .avmMini_clk = clk,
            .avmMini_pc = FF(pc),
            .avmMini_internal_return_ptr = FF(internal_return_ptr),
            .avmMini_sel_halt = FF(1),
            .avmMini_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::ff)),
            .avmMini_ia = ia,
            .avmMini_ib = ib,
            .avmMini_ic = ic,
            .avmMini_mem_op_a = FF(mem_op_a),
            .avmMini_mem_op_b = FF(mem_op_b),
            .avmMini_mem_op_c = FF(mem_op_c),
            .avmMini_mem_idx_a = FF(mem_idx_a),
            .avmMini_mem_idx_b = FF(mem_idx_b),
            .avmMini_mem_idx_c = FF(mem_idx_c),
        });

        if (retSize - pos > 2) { // Guard to prevent overflow if retSize is close to uint32_t maximum value.
            pos += 3;
        } else {
            pos = retSize;
        }
    }
    return returnMem;
}

/**
 * @brief HALT opcode
 *        This opcode effectively stops program execution, and is used in the relation that
 *        ensures the program counter increments on each opcode.
 *        i.e.ythe program counter should freeze and the halt flag is set to 1.
 */
void AvmMiniTraceBuilder::halt()
{
    auto clk = mainTrace.size();

    mainTrace.push_back(Row{
        .avmMini_clk = clk,
        .avmMini_pc = FF(pc),
        .avmMini_internal_return_ptr = FF(internal_return_ptr),
        .avmMini_sel_halt = FF(1),
    });
}

/**
 * @brief JUMP OPCODE
 *        Jumps to a new `jmpDest`
 *        This function must:
 *          - Set the next program counter to the provided `jmpDest`.
 *
 * @param jmpDest - The destination to jump to
 */
void AvmMiniTraceBuilder::jump(uint32_t jmpDest)
{
    auto clk = mainTrace.size();

    mainTrace.push_back(Row{
        .avmMini_clk = clk,
        .avmMini_pc = FF(pc),
        .avmMini_internal_return_ptr = FF(internal_return_ptr),
        .avmMini_sel_jump = FF(1),
        .avmMini_ia = FF(jmpDest),
    });

    // Adjust parameters for the next row
    pc = jmpDest;
}

/**
 * @brief INTERNAL_CALL OPCODE
 *        This opcode effectively jumps to a new `jmpDest` and stores the return program counter
 *        (current program counter + 1) onto a call stack.
 *        This function must:
 *          - Set the next program counter to the provided `jmpDest`.
 *          - Store the current `pc` + 1 onto the call stack (emulated in memory)
 *          - Increment the return stack pointer (a pointer to where the call stack is in memory)
 *
 *        Note: We use intermediate register to perform memory storage operations.
 *
 * @param jmpDest - The destination to jump to
 */
void AvmMiniTraceBuilder::internal_call(uint32_t jmpDest)
{
    auto clk = static_cast<uint32_t>(mainTrace.size());

    // We store the next instruction as the return location
    uint32_t stored_pc = pc + 1;
    internal_call_stack.push(stored_pc);

    // Add the return location to the memory trace
    memTraceBuilder.writeIntoMemory(clk, IntermRegister::ib, internal_return_ptr, FF(stored_pc), AvmMemoryTag::ff);

    mainTrace.push_back(Row{
        .avmMini_clk = clk,
        .avmMini_pc = FF(pc),
        .avmMini_internal_return_ptr = FF(internal_return_ptr),
        .avmMini_sel_internal_call = FF(1),
        .avmMini_ia = FF(jmpDest),
        .avmMini_ib = stored_pc,
        .avmMini_mem_op_b = FF(1),
        .avmMini_rwb = FF(1),
        .avmMini_mem_idx_b = FF(internal_return_ptr),
    });

    // Adjust parameters for the next row
    pc = jmpDest;
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
 *  TODO(https://github.com/AztecProtocol/aztec-packages/issues/3740): This function MUST come after a call instruction.
 */
void AvmMiniTraceBuilder::internal_return()
{
    auto clk = static_cast<uint32_t>(mainTrace.size());

    // Internal return pointer is decremented
    // We want to load the value pointed by the internal pointer
    auto readA =
        memTraceBuilder.readAndLoadFromMemory(clk, IntermRegister::ia, internal_return_ptr - 1, AvmMemoryTag::ff);

    mainTrace.push_back(Row{
        .avmMini_clk = clk,
        .avmMini_pc = pc,
        .avmMini_internal_return_ptr = FF(internal_return_ptr),
        .avmMini_sel_internal_return = FF(1),
        .avmMini_ia = readA.val,
        .avmMini_mem_op_a = FF(1),
        .avmMini_rwa = FF(0),
        .avmMini_mem_idx_a = FF(internal_return_ptr - 1),
    });

    // We want the next row to be the one pointed by jmpDest
    // The next pc should be from the top of the internal call stack + 1
    pc = internal_call_stack.top();
    internal_call_stack.pop();
    internal_return_ptr--;
}

/**
 * @brief Finalisation of the memory trace and incorporating it to the main trace.
 *        In particular, sorting the memory trace, setting .m_lastAccess and
 *        adding shifted values (first row). The main trace is moved at the end of
 *        this call.
 *
 * @return The main trace
 */
std::vector<Row> AvmMiniTraceBuilder::finalize()
{
    auto memTrace = memTraceBuilder.finalize();
    size_t memTraceSize = memTrace.size();
    size_t mainTraceSize = mainTrace.size();

    // TODO: We will have to handle this through error handling and not an assertion
    // Smaller than N because we have to add an extra initial row to support shifted
    // elements
    assert(memTraceSize < AVM_TRACE_SIZE);
    assert(mainTraceSize < AVM_TRACE_SIZE);

    // Fill the rest with zeros.
    size_t zeroRowsNum = AVM_TRACE_SIZE - mainTraceSize - 1;
    while (zeroRowsNum-- > 0) {
        mainTrace.push_back(Row{});
    }

    mainTrace.at(mainTraceSize - 1).avmMini_last = FF(1);

    for (size_t i = 0; i < memTraceSize; i++) {
        auto const& src = memTrace.at(i);
        auto& dest = mainTrace.at(i);

        dest.memTrace_m_clk = FF(src.m_clk);
        dest.memTrace_m_sub_clk = FF(src.m_sub_clk);
        dest.memTrace_m_addr = FF(src.m_addr);
        dest.memTrace_m_val = src.m_val;
        dest.memTrace_m_rw = FF(static_cast<uint32_t>(src.m_rw));
        dest.memTrace_m_in_tag = FF(static_cast<uint32_t>(src.m_in_tag));
        dest.memTrace_m_tag = FF(static_cast<uint32_t>(src.m_tag));
        dest.memTrace_m_tag_err = FF(static_cast<uint32_t>(src.m_tag_err));
        dest.memTrace_m_one_min_inv = src.m_one_min_inv;

        if (i + 1 < memTraceSize) {
            auto const& next = memTrace.at(i + 1);
            dest.memTrace_m_lastAccess = FF(static_cast<uint32_t>(src.m_addr != next.m_addr));
        } else {
            dest.memTrace_m_lastAccess = FF(1);
            dest.memTrace_m_last = FF(1);
        }
    }

    // Adding extra row for the shifted values at the top of the execution trace.
    Row first_row = Row{ .avmMini_first = FF(1), .memTrace_m_lastAccess = FF(1) };
    mainTrace.insert(mainTrace.begin(), first_row);

    auto trace = std::move(mainTrace);
    reset();

    return trace;
}

} // namespace proof_system