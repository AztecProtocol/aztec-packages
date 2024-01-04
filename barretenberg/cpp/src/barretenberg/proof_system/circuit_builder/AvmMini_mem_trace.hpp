#pragma once

#include "AvmMini_common.hpp"

namespace proof_system {

class AvmMiniMemTraceBuilder {

  public:
    static const size_t MEM_SIZE = 1024;
    static const uint32_t SUB_CLK_LOAD_A = 0;
    static const uint32_t SUB_CLK_LOAD_B = 1;
    static const uint32_t SUB_CLK_LOAD_C = 2;
    static const uint32_t SUB_CLK_STORE_A = 3;
    static const uint32_t SUB_CLK_STORE_B = 4;
    static const uint32_t SUB_CLK_STORE_C = 5;

    struct MemoryTraceEntry {
        uint32_t m_clk;
        uint32_t m_sub_clk;
        uint32_t m_addr;
        FF m_val{};
        AvmMemoryTag m_tag;
        AvmMemoryTag m_in_tag;
        bool m_rw = false;
        bool m_tag_err = false;
        FF m_one_min_inv{};
    };

    // Structure to return value and tag matching boolean after a memory read.
    struct MemRead {
        bool tagMatch;
        FF val;
    };

    AvmMiniMemTraceBuilder();

    void reset();

    std::vector<MemoryTraceEntry> finalize();

    MemRead readAndLoadFromMemory(uint32_t clk, IntermRegister intermReg, uint32_t addr, AvmMemoryTag m_in_tag);
    void writeIntoMemory(uint32_t clk, IntermRegister intermReg, uint32_t addr, FF const& val, AvmMemoryTag m_in_tag);

  private:
    std::vector<MemoryTraceEntry> memTrace;         // Entries will be sorted by m_clk, m_sub_clk after finalize().
    std::array<FF, MEM_SIZE> memory{};              // Memory table (used for simulation)
    std::array<AvmMemoryTag, MEM_SIZE> memoryTag{}; // The tag of the corresponding memory
                                                    // entry (aligned with the memory array).

    static bool compareMemEntries(const MemoryTraceEntry& left, const MemoryTraceEntry& right);

    void insertInMemTrace(
        uint32_t m_clk, uint32_t m_sub_clk, uint32_t m_addr, FF const& m_val, AvmMemoryTag m_in_tag, bool m_rw);
    void loadMismatchTagInMemTrace(uint32_t m_clk,
                                   uint32_t m_sub_clk,
                                   uint32_t m_addr,
                                   FF const& m_val,
                                   AvmMemoryTag m_in_tag,
                                   AvmMemoryTag m_tag);

    bool loadInMemTrace(uint32_t clk, IntermRegister intermReg, uint32_t addr, FF const& val, AvmMemoryTag m_in_tag);
    void storeInMemTrace(uint32_t clk, IntermRegister intermReg, uint32_t addr, FF const& val, AvmMemoryTag m_in_tag);
};
} // namespace proof_system