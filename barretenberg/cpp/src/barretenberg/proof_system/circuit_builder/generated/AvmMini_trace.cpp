#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <sys/types.h>
#include <vector>

#include "./AvmMini_trace.hpp"

#include "barretenberg/relations/generated/AvmMini.hpp"

using namespace barretenberg;
using Flavor = proof_system::honk::flavor::AvmMiniFlavor;
using FF = Flavor::FF;
using Row = proof_system::AvmMini_vm::Row<barretenberg::fr>;

// Anonymous namespace
namespace {

// Number of rows
const size_t N = 256;
const size_t MemSize = 1024;
struct MemoryTraceEntry {
    uint32_t m_clk;
    uint32_t m_sub_clk;
    uint32_t m_addr;
    FF m_val;
    bool m_rw;
};

bool compareMemEntries(const MemoryTraceEntry& left, const MemoryTraceEntry& right)
{
    if (left.m_addr < right.m_addr) {
        return true;
    }

    if (left.m_addr > right.m_addr) {
        return false;
    }

    if (left.m_clk < right.m_clk) {
        return true;
    }

    if (left.m_clk > right.m_clk) {
        return false;
    }

    // No safeguard in case they are equal. The caller should ensure this property.
    // Otherwise, relation will not be satisfied.
    return left.m_sub_clk < right.m_sub_clk;
}

// This is the internal context that we keep along the lifecycle of bytecode execution
// to iteratively build the whole trace. This is effectively performing witness generation.
// At the end of circuit building, mainTrace can be moved to AvmMiniTraceBuilder::rows.
struct TraceCtx {
    std::vector<Row> mainTrace;
    std::vector<MemoryTraceEntry> memTrace; // Sorted entries by m_clk, m_sub_clk
    std::array<FF, MemSize> ffMemory{};     // Memory table for finite field elements
                                            // Used for simulation of memmory table

    void reset()
    {
        mainTrace.clear();
        memTrace.clear();
        ffMemory.fill(FF(0));
    }

    void insertInMemTrace(uint32_t m_clk, uint32_t m_sub_clk, uint32_t m_addr, FF m_val, bool m_rw)
    {
        auto newMemEntry = MemoryTraceEntry{
            .m_clk = m_clk,
            .m_sub_clk = m_sub_clk,
            .m_addr = m_addr,
            .m_val = m_val,
            .m_rw = m_rw,
        };

        long insertionIndex =
            std::lower_bound(memTrace.begin(), memTrace.end(), newMemEntry, compareMemEntries) - memTrace.begin();

        memTrace.insert(memTrace.begin() + insertionIndex, newMemEntry);
    }

    // Memory operations need to be performed before the addition of the corresponding row in
    // mainTrace, otherwise the m_clk value will be wrong. This applies to:
    //       loadAInMemTrace, loadBInMemTrace, loadCInMemTrace
    //       storeAInMemTrace, storeBInMemTrace, storeCInMemTrace

    void loadAInMemTrace(uint32_t addr, FF val)
    {
        insertInMemTrace(static_cast<uint32_t>(mainTrace.size()), 0, addr, val, false);
    }

    void loadBInMemTrace(uint32_t addr, FF val)
    {
        insertInMemTrace(static_cast<uint32_t>(mainTrace.size()), 1, addr, val, false);
    }

    void loadCInMemTrace(uint32_t addr, FF val)
    {
        insertInMemTrace(static_cast<uint32_t>(mainTrace.size()), 2, addr, val, false);
    }

    void storeAInMemTrace(uint32_t addr, FF val)
    {
        insertInMemTrace(static_cast<uint32_t>(mainTrace.size()), 3, addr, val, true);
    }

    void storeBInMemTrace(uint32_t addr, FF val)
    {
        insertInMemTrace(static_cast<uint32_t>(mainTrace.size()), 4, addr, val, true);
    }

    void storeCInMemTrace(uint32_t addr, FF val)
    {
        insertInMemTrace(static_cast<uint32_t>(mainTrace.size()), 5, addr, val, true);
    }

    // Addition over finite field with direct memory access.
    void add(uint32_t s0, uint32_t s1, uint32_t d0)
    {
        // a + b = c
        FF a = ffMemory.at(s0);
        FF b = ffMemory.at(s1);
        FF c = a + b;
        ffMemory.at(d0) = c;

        auto clk = mainTrace.size();

        // Loading into Ia
        loadAInMemTrace(s0, a);

        // Loading into Ib
        loadBInMemTrace(s1, b);

        // Storing from Ic
        storeCInMemTrace(d0, c);

        mainTrace.push_back(Row{
            .avmMini_clk = clk,
            .avmMini_subop = FF(1),
            .avmMini_ia = a,
            .avmMini_ib = b,
            .avmMini_ic = c,
            .avmMini_mem_op_a = FF(1),
            .avmMini_mem_op_b = FF(1),
            .avmMini_mem_op_c = FF(1),
            .avmMini_rwc = FF(1),
            .avmMini_mem_idx_a = FF(s0),
            .avmMini_mem_idx_b = FF(s1),
            .avmMini_mem_idx_c = FF(d0),
        });
    };

    // CALLDATACOPY opcode with direct memory access, i.e.,
    // M_F[d0:d0+s1] = M_calldata[s0:s0+s1]
    // Simplified version with exclusively memory store operations and
    // values from M_calldata passed by an array and loaded into
    // intermediate registers.
    // Assume that caller passes callDataMem which is large enough so that no out-of-bound
    // memory issues occur.
    // TODO: Implement the indirect memory version (maybe not required)
    // TODO: taking care of intermediate register values consistency and propagating their
    // values to the next row when not overwritten.
    void callDataCopy(uint32_t s0, uint32_t s1, uint32_t d0, std::vector<FF> const& callDataMem)
    {
        // We parallelize storing memory operations in chunk of 3, i.e., 1 per intermediate register.
        // This offset points to the first storing operation (pertaining to intermediate register Ia).
        // s0 + offset:       Ia memory store operation
        // s0 + offset + 1:   Ib memory store operation
        // s0 + offset + 1:   Ic memory store operation

        uint32_t offset = 0;

        while (offset < s1) {
            FF ib(0);
            FF ic(0);
            uint32_t mem_op_b(0);
            uint32_t mem_op_c(0);
            uint32_t mem_idx_b(0);
            uint32_t mem_idx_c(0);
            uint32_t rwb(0);
            uint32_t rwc(0);
            auto clk = mainTrace.size();

            FF ia = callDataMem.at(s0 + offset);
            uint32_t mem_op_a(1);
            uint32_t mem_idx_a = d0 + offset;
            uint32_t rwa = 1;

            // Storing from Ia
            ffMemory.at(mem_idx_a) = ia;
            storeAInMemTrace(mem_idx_a, ia);

            if (s1 - offset > 1) {
                ib = callDataMem.at(s0 + offset + 1);
                mem_op_b = 1;
                mem_idx_b = d0 + offset + 1;
                rwb = 1;

                // Storing from Ib
                ffMemory.at(mem_idx_b) = ib;
                storeBInMemTrace(mem_idx_b, ib);
            }

            if (s1 - offset > 2) {
                ic = callDataMem.at(s0 + offset + 2);
                mem_op_c = 1;
                mem_idx_c = d0 + offset + 2;
                rwc = 1;

                // Storing from Ic
                ffMemory.at(mem_idx_c) = ic;
                storeCInMemTrace(mem_idx_c, ic);
            }

            mainTrace.push_back(Row{
                .avmMini_clk = clk,
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

            if (s1 - offset > 2) { // Guard to prevent overflow if s1 is close to uint32_t maximum value.
                offset += 3;
            } else {
                offset = s1;
            }
        }
    }

    // RETURN opcode with direct memory access, i.e.,
    // return M_F[s0:s0+s1]
    // Simplified version with exclusively memory load operations into
    // intermediate registers and then values are copied to the returned vector.
    // TODO: Implement the indirect memory version (maybe not required)
    // TODO: taking care of flagging this row as the last one? Special STOP flag?
    std::vector<FF> returnOP(uint32_t s0, uint32_t s1)
    {
        // We parallelize loading memory operations in chunk of 3, i.e., 1 per intermediate register.
        // This offset points to the first loading operation (pertaining to intermediate register Ia).
        // s0 + offset:       Ia memory load operation
        // s0 + offset + 1:   Ib memory load operation
        // s0 + offset + 1:   Ic memory load operation

        uint32_t offset = 0;
        std::vector<FF> returnMem;

        while (offset < s1) {
            FF ib(0);
            FF ic(0);
            uint32_t mem_op_b(0);
            uint32_t mem_op_c(0);
            uint32_t mem_idx_b(0);
            uint32_t mem_idx_c(0);
            auto clk = mainTrace.size();

            uint32_t mem_op_a(1);
            uint32_t mem_idx_a = s0 + offset;
            FF ia = ffMemory.at(mem_idx_a);

            // Loading from Ia
            returnMem.push_back(ia);
            loadAInMemTrace(mem_idx_a, ia);

            if (s1 - offset > 1) {
                mem_op_b = 1;
                mem_idx_b = s0 + offset + 1;
                ib = ffMemory.at(mem_idx_b);

                // Loading from Ib
                returnMem.push_back(ib);
                loadBInMemTrace(mem_idx_b, ib);
            }

            if (s1 - offset > 2) {
                mem_op_c = 1;
                mem_idx_c = s0 + offset + 2;
                ic = ffMemory.at(mem_idx_c);

                // Loading from Ic
                returnMem.push_back(ic);
                loadCInMemTrace(mem_idx_c, ic);
            }

            mainTrace.push_back(Row{
                .avmMini_clk = clk,
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

            if (s1 - offset > 2) { // Guard to prevent overflow if s1 is close to uint32_t maximum value.
                offset += 3;
            } else {
                offset = s1;
            }
        }
        return returnMem;
    }

    // Temporary helper to initialize memory.
    void setFFMem(size_t idx, FF el) { ffMemory.at(idx) = el; };

    // Finalisation of the memory trace and incorporating it to the main trace.
    // In particular, setting .m_lastAccess and adding shifted values (first row).
    void finalize()
    {
        size_t memTraceSize = memTrace.size();
        size_t mainTraceSize = mainTrace.size();

        // TODO: We will have to handle this through error handling and not an assertion
        // Smaller than N because we have to add an extra initial row to support shifted
        // elements
        assert(memTraceSize < N);
        assert(mainTraceSize < N);

        // Fill the rest with zeros.
        size_t zeroRowsNum = N - mainTraceSize - 1;
        while (zeroRowsNum-- > 0) {
            mainTrace.push_back(Row{});
        }

        size_t lastIndex = (memTraceSize > mainTraceSize) ? memTraceSize - 1 : mainTraceSize - 1;
        mainTrace.at(lastIndex).avmMini_last = FF(1);

        for (size_t i = 0; i < memTraceSize; i++) {
            auto const& src = memTrace.at(i);
            auto& dest = mainTrace.at(i);

            dest.avmMini_m_clk = FF(src.m_clk);
            dest.avmMini_m_sub_clk = FF(src.m_sub_clk);
            dest.avmMini_m_addr = FF(src.m_addr);
            dest.avmMini_m_val = src.m_val;
            dest.avmMini_m_rw = FF(static_cast<uint32_t>(src.m_rw));

            if (i + 1 < memTraceSize) {
                auto const& next = memTrace.at(i + 1);
                dest.avmMini_m_lastAccess = FF(static_cast<uint32_t>(src.m_addr != next.m_addr));
            } else {
                dest.avmMini_m_lastAccess = FF(1);
            }
        }

        // Adding extra row for the shifted values at the top of the execution trace.
        Row first_row = Row{ .avmMini_first = 1 };
        mainTrace.insert(mainTrace.begin(), first_row);
    }
};

} // End of anonymous namespace

namespace proof_system {

std::vector<Row> AvmMiniTraceBuilder::build_trace()
{
    TraceCtx ctx;

    ctx.callDataCopy(0, 3, 2, std::vector<FF>{ 45, 23, 12 });

    // ctx.setFFMem(2, FF(45));
    // ctx.setFFMem(3, FF(23));
    // ctx.setFFMem(4, FF(12));

    ctx.add(2, 3, 4);
    ctx.add(4, 5, 5);
    // ctx.add(5, 5, 5);
    //  ctx.add(5, 5, 5);
    //  ctx.add(5, 5, 5);
    //  ctx.add(5, 5, 5);
    //  ctx.add(3, 5, 6);
    //  ctx.add(5, 6, 7);

    ctx.returnOP(1, 8);

    ctx.finalize();
    return std::move(ctx.mainTrace);

    // This would be required if we call check_circuit().
    // Build the shifts
    // for (size_t i = 1; i < n; i++) {
    //     rows[i - 1].avmMini_m_addr_shift = rows[i].avmMini_m_addr;
    //     rows[i - 1].avmMini_m_rw_shift = rows[i].avmMini_m_rw;
    //     rows[i - 1].avmMini_m_val_shift = rows[i].avmMini_m_val;
    // }

    // for (auto& row : rows) {
    //     info(row.avmMini_clk);
    // }
}
} // namespace proof_system