
#include "barretenberg/proof_system/arithmetization/arithmetization.hpp"
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

#include "barretenberg/proof_system/arithmetization/generated/AvmMini_arith.hpp"
#include "barretenberg/proof_system/relations/generated/AvmMini.hpp"

using namespace barretenberg;
using FF = arithmetization::AvmMiniArithmetization::FF;
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

void insertInMemTrace(std::vector<MemoryTraceEntry>& sortedTrace, const MemoryTraceEntry& newMemEntry)
{
    long insertionIndex =
        std::lower_bound(sortedTrace.begin(), sortedTrace.end(), newMemEntry, compareMemEntries) - sortedTrace.begin();

    sortedTrace.insert(sortedTrace.begin() + insertionIndex, newMemEntry);
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

    // Addition over finite field with direct memory access.
    void add(uint32_t s0, uint32_t s1, uint32_t d0)
    {
        // a + b = c
        FF a = ffMemory.at(s0);
        FF b = ffMemory.at(s1);
        FF c = a + b;
        ffMemory.at(d0) = c;

        auto clk = mainTrace.size();

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

        // Loading into Ia
        insertInMemTrace(memTrace,
                         (MemoryTraceEntry{
                             .m_clk = static_cast<uint32_t>(clk),
                             .m_sub_clk = 0,
                             .m_addr = s0,
                             .m_val = a,
                         }));

        // Loading into Ib
        insertInMemTrace(memTrace,
                         (MemoryTraceEntry{
                             .m_clk = static_cast<uint32_t>(clk),
                             .m_sub_clk = 1,
                             .m_addr = s1,
                             .m_val = b,
                         }));

        // Storing from Ic
        insertInMemTrace(memTrace,
                         (MemoryTraceEntry{
                             .m_clk = static_cast<uint32_t>(clk),
                             .m_sub_clk = 5,
                             .m_addr = d0,
                             .m_val = c,
                             .m_rw = true,
                         }));
    };

    // CALLDATACOPY opcode with direct memory access, i.e.,
    // M_F[d0:d0+s1] = M_calldata[s0:s0+s1]
    // Simplified version with excelusively memory store operations and
    // values from M_calldata passed by an array and and loaded into
    // intermediate registers.
    // Assume that caller passes callDataMem which is large enough so that no out-of-bound
    // memory issues occur.
    // TODO: taking care of intermediate register values consistency and propagating their
    // values to the next row when not overwritten.
    void callDataCopy(uint32_t s0, uint32_t s1, uint32_t d0, std::vector<FF> callDataMem)
    {
        uint32_t offset = 0;

        while (offset < s1) {
            FF ib;
            FF ic;
            uint32_t mem_op_a(0);
            uint32_t mem_op_b(0);
            uint32_t mem_op_c(0);
            uint32_t mem_idx_b(0);
            uint32_t mem_idx_c(0);
            uint32_t rwb(0);
            uint32_t rwc(0);
            auto clk = mainTrace.size();

            FF ia = callDataMem.at(s0 + offset);
            uint32_t mem_idx_a = d0 + offset;
            uint32_t rwa = 1;

            // Storing from Ia
            insertInMemTrace(memTrace,
                             (MemoryTraceEntry{
                                 .m_clk = static_cast<uint32_t>(clk),
                                 .m_sub_clk = 3,
                                 .m_addr = mem_idx_a,
                                 .m_val = ia,
                                 .m_rw = true,
                             }));

            if (s1 - offset > 1) {
                ib = callDataMem.at(s0 + offset + 1);
                mem_idx_b = d0 + offset + 1;
                rwb = 1;

                // Storing from Ib
                insertInMemTrace(memTrace,
                                 (MemoryTraceEntry{
                                     .m_clk = static_cast<uint32_t>(clk),
                                     .m_sub_clk = 4,
                                     .m_addr = mem_idx_b,
                                     .m_val = ib,
                                     .m_rw = true,
                                 }));
            }

            if (s1 - offset > 2) {
                ic = callDataMem.at(s0 + offset + 2);
                mem_idx_c = d0 + offset + 2;
                rwc = 1;

                // Storing from Ic
                insertInMemTrace(memTrace,
                                 (MemoryTraceEntry{
                                     .m_clk = static_cast<uint32_t>(clk),
                                     .m_sub_clk = 5,
                                     .m_addr = mem_idx_c,
                                     .m_val = ic,
                                     .m_rw = true,
                                 }));
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

            offset += 3;
        }
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

void AvmMiniTraceBuilder::build_circuit()
{
    TraceCtx ctx;
    ctx.setFFMem(2, FF(45));
    ctx.setFFMem(3, FF(23));
    ctx.setFFMem(5, FF(12));

    ctx.add(2, 3, 4);
    ctx.add(4, 5, 5);
    ctx.add(5, 5, 5);
    ctx.add(5, 5, 5);
    ctx.add(5, 5, 5);
    ctx.add(5, 5, 5);
    ctx.add(3, 5, 6);
    ctx.add(5, 6, 7);

    ctx.finalize();
    rows = std::move(ctx.mainTrace);

    // Basic memory traces validation
    //  m_addr   m_clk   m_val   m_lastAccess   m_rw
    //    2        5       23         0          1
    //    2        8       23         0          0
    //    2        17      15         1          1
    //    5        2       0          0          0
    //    5        24      7          0          1
    //    5        32      7          1          0

    // rows.push_back(Row{ .avmMini_first = 1 }); // First row containing only shifted values.

    // Row row = Row{
    //     .avmMini_m_clk = 5,
    //     .avmMini_m_addr = 2,
    //     .avmMini_m_val = 23,
    //     .avmMini_m_lastAccess = 0,
    //     .avmMini_m_rw = 1,
    // };
    // rows.push_back(row);

    // row = Row{
    //     .avmMini_m_clk = 8,
    //     .avmMini_m_addr = 2,
    //     .avmMini_m_val = 23,
    //     .avmMini_m_lastAccess = 0,
    //     .avmMini_m_rw = 0,
    // };
    // rows.push_back(row);

    // row = Row{
    //     .avmMini_m_clk = 17,
    //     .avmMini_m_addr = 2,
    //     .avmMini_m_val = 15,
    //     .avmMini_m_lastAccess = 1,
    //     .avmMini_m_rw = 1,
    // };
    // rows.push_back(row);

    // row = Row{
    //     .avmMini_m_clk = 2,
    //     .avmMini_m_addr = 5,
    //     .avmMini_m_val = 0,
    //     .avmMini_m_lastAccess = 0,
    //     .avmMini_m_rw = 0,
    // };
    // rows.push_back(row);

    // row = Row{
    //     .avmMini_m_clk = 24,
    //     .avmMini_m_addr = 5,
    //     .avmMini_m_val = 7,
    //     .avmMini_m_lastAccess = 0,
    //     .avmMini_m_rw = 1,
    // };
    // rows.push_back(row);

    // row = Row{
    //     .avmMini_m_clk = 32,
    //     .avmMini_m_addr = 5,
    //     .avmMini_m_val = 7,
    //     .avmMini_m_lastAccess = 1,
    //     .avmMini_m_rw = 0,
    // };
    // rows.push_back(row);

    // // Set the last flag in the last row
    // rows.back().avmMini_last = 1;

    // Build the shifts
    // for (size_t i = 1; i < n; i++) {
    //     rows[i - 1].avmMini_m_addr_shift = rows[i].avmMini_m_addr;
    //     rows[i - 1].avmMini_m_rw_shift = rows[i].avmMini_m_rw;
    //     rows[i - 1].avmMini_m_val_shift = rows[i].avmMini_m_val;
    // }

    info("Built circuit with ", rows.size(), " rows");

    for (size_t i = 0; i < 20; i++) {
        info("m_addr: ", rows[i].avmMini_m_addr);
        info("m_clk: ", rows[i].avmMini_m_clk);
        info("m_sub_clk: ", rows[i].avmMini_m_sub_clk);
        info("m_val: ", rows[i].avmMini_m_val);
        info("m_lastAccess: ", rows[i].avmMini_m_lastAccess);
        info("m_rw: ", rows[i].avmMini_m_rw);
        info("m_val_shift: ", rows[i].avmMini_m_val_shift);
        info("first: ", rows[i].avmMini_first);
        info("last: ", rows[i].avmMini_last);

        // info(rows[i].avmMini_m_val_shift);
        info("===============================");
    }
    // for (auto& row : rows) {
    //     info(row.avmMini_clk);
    // }
}
} // namespace proof_system