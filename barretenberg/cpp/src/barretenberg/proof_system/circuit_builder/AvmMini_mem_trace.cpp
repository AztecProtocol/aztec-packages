#include "AvmMini_mem_trace.hpp"

namespace proof_system {

/**
 * @brief Constructor of a memory trace builder of AVM. Only serves to set the capacity of the
 *        underlying traces.
 */
AvmMiniMemTraceBuilder::AvmMiniMemTraceBuilder()
{
    memTrace.reserve(AVM_TRACE_SIZE);
}

/**
 * @brief Resetting the internal state so that a new memory trace can be rebuilt using the same object.
 *
 */
void AvmMiniMemTraceBuilder::reset()
{
    memTrace.clear();
    memory.fill(FF(0));
}

/**
 * @brief A comparator on MemoryTraceEntry to be used by sorting algorithm.
 *
 */
bool AvmMiniMemTraceBuilder::compareMemEntries(const MemoryTraceEntry& left, const MemoryTraceEntry& right)
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

/**
 * @brief Prepare the memory trace to be incorporated into the main trace.
 *
 * @return The memory trace (which is moved).
 */
std::vector<AvmMiniMemTraceBuilder::MemoryTraceEntry> AvmMiniMemTraceBuilder::finalize()
{
    // Sort memTrace
    std::sort(memTrace.begin(), memTrace.end(), compareMemEntries);
    return std::move(memTrace);
}

/**
 * @brief A method to insert a row/entry in the memory trace.
 *
 * @param m_clk Main clock
 * @param m_sub_clk Sub-clock used to order load/store sub operations
 * @param m_addr Address pertaining to the memory operation
 * @param m_val Value (FF) pertaining to the memory operation
 * @param m_in_tag Memory tag pertaining to the instruction
 * @param m_rw Boolean telling whether it is a load (false) or store operation (true).
 */
void AvmMiniMemTraceBuilder::insertInMemTrace(uint32_t const m_clk,
                                              uint32_t const m_sub_clk,
                                              uint32_t const m_addr,
                                              FF const& m_val,
                                              AvmMemoryTag const m_in_tag,
                                              bool const m_rw)
{
    memTrace.emplace_back(MemoryTraceEntry{
        .m_clk = m_clk,
        .m_sub_clk = m_sub_clk,
        .m_addr = m_addr,
        .m_val = m_val,
        .m_tag = m_in_tag,
        .m_in_tag = m_in_tag,
        .m_rw = m_rw,
    });
}

// Memory operations need to be performed before the addition of the corresponding row in
// MainTrace, otherwise the m_clk value will be wrong. This applies to loadInMemTrace and
// storeInMemTrace.

/**
 * @brief Add a memory trace entry for a load with a memory tag mismatching the instruction
 *        memory tag.
 *
 * @param m_clk Main clock
 * @param m_sub_clk Sub-clock used to order load/store sub operations
 * @param m_addr Address pertaining to the memory operation
 * @param m_val Value (FF) pertaining to the memory operation
 * @param m_in_tag Memory tag pertaining to the instruction
 * @param m_tag Memory tag pertaining to the address
 */
void AvmMiniMemTraceBuilder::loadMismatchTagInMemTrace(uint32_t const m_clk,
                                                       uint32_t const m_sub_clk,
                                                       uint32_t const m_addr,
                                                       FF const& m_val,
                                                       AvmMemoryTag const m_in_tag,
                                                       AvmMemoryTag const m_tag)
{
    FF one_min_inv = FF(1) - (FF(static_cast<uint32_t>(m_in_tag)) - FF(static_cast<uint32_t>(m_tag))).invert();
    memTrace.emplace_back(MemoryTraceEntry{ .m_clk = m_clk,
                                            .m_sub_clk = m_sub_clk,
                                            .m_addr = m_addr,
                                            .m_val = m_val,
                                            .m_tag = m_tag,
                                            .m_in_tag = m_in_tag,
                                            .m_tag_err = true,
                                            .m_one_min_inv = one_min_inv });
}

/**
 * @brief Add a memory trace entry corresponding to a memory load into the intermediate
 *        passed register.
 *
 * @param clk The main clock
 * @param intermReg The intermediate register
 * @param addr The memory address
 * @param val The value to be loaded
 * @param m_in_tag The memory tag of the instruction
 */
bool AvmMiniMemTraceBuilder::loadInMemTrace(
    uint32_t clk, IntermRegister intermReg, uint32_t addr, FF const& val, AvmMemoryTag m_in_tag)
{
    uint32_t sub_clk = 0;
    switch (intermReg) {
    case IntermRegister::ia:
        sub_clk = SUB_CLK_LOAD_A;
        break;
    case IntermRegister::ib:
        sub_clk = SUB_CLK_LOAD_B;
        break;
    case IntermRegister::ic:
        sub_clk = SUB_CLK_LOAD_C;
        break;
    }

    auto m_tag = memoryTag.at(addr);
    if (m_tag == AvmMemoryTag::u0 || m_tag == m_in_tag) {
        insertInMemTrace(clk, sub_clk, addr, val, m_in_tag, false);
        return true;
    }

    // Handle memory tag inconsistency
    loadMismatchTagInMemTrace(clk, sub_clk, addr, val, m_in_tag, m_tag);
    return false;
}

/**
 * @brief Add a memory trace entry corresponding to a memory store from the intermediate
 *        register.
 *
 * @param clk The main clock
 * @param intermReg The intermediate register
 * @param addr The memory address
 * @param val The value to be stored
 * @param m_in_tag The memory tag of the instruction
 */
void AvmMiniMemTraceBuilder::storeInMemTrace(
    uint32_t clk, IntermRegister intermReg, uint32_t addr, FF const& val, AvmMemoryTag m_in_tag)
{
    uint32_t sub_clk = 0;
    switch (intermReg) {
    case IntermRegister::ia:
        sub_clk = SUB_CLK_STORE_A;
        break;
    case IntermRegister::ib:
        sub_clk = SUB_CLK_STORE_B;
        break;
    case IntermRegister::ic:
        sub_clk = SUB_CLK_STORE_C;
        break;
    }

    insertInMemTrace(clk, sub_clk, addr, val, m_in_tag, true);
}

/**
 * @brief Handle a read memory operation and load the corresponding value to the
 *        supplied intermediate register. A memory trace entry for the load operation
 *        is added.
 *
 * @param clk Main clock
 * @param intermReg Intermediate register where we load the value
 * @param addr Memory address to be read and loaded
 * @param m_in_tag Memory instruction tag
 * @return Result of the read operation containing the value and a boolean telling
 *         potential mismatch between instruction tag and memory tag of the address.
 */
AvmMiniMemTraceBuilder::MemRead AvmMiniMemTraceBuilder::readAndLoadFromMemory(uint32_t const clk,
                                                                              IntermRegister const intermReg,
                                                                              uint32_t const addr,
                                                                              AvmMemoryTag const m_in_tag)
{
    FF val = memory.at(addr);
    bool tagMatch = loadInMemTrace(clk, intermReg, addr, val, m_in_tag);

    return MemRead{
        .tagMatch = tagMatch,
        .val = val,
    };
}

/**
 * @brief Handle a write memory operation and store the supplied value into memory
 *        at the supplied address. A memory trace entry for the write operation
 *        is added.
 *
 * @param clk Main clock
 * @param intermReg Intermediate register where we write the value
 * @param addr Memory address to be written to
 * @param val Value to be written into memory
 * @param m_in_tag Memory instruction tag
 */
void AvmMiniMemTraceBuilder::writeIntoMemory(
    uint32_t const clk, IntermRegister intermReg, uint32_t addr, FF const& val, AvmMemoryTag m_in_tag)
{
    memory.at(addr) = val;
    memoryTag.at(addr) = m_in_tag;
    storeInMemTrace(clk, intermReg, addr, val, m_in_tag);
}

} // namespace proof_system