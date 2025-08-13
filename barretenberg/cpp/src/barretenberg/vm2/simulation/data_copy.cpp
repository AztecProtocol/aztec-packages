#include "barretenberg/vm2/simulation/data_copy.hpp"

#include <stdexcept>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"

namespace bb::avm2::simulation {

constexpr uint32_t MAX_MEM_ADDR = AVM_HIGHEST_MEM_ADDRESS;

namespace {

DataCopyEvent create_cd_event(ContextInterface& context,
                              const uint32_t clk,
                              const uint32_t cd_copy_size,
                              const uint32_t cd_offset,
                              const MemoryAddress dst_addr,
                              const std::vector<FF>& calldata = {})
{
    return DataCopyEvent{ .execution_clk = clk,
                          .operation = DataCopyOperation::CD_COPY,
                          .calldata = calldata,
                          .write_context_id = context.get_context_id(),
                          .read_context_id = context.get_parent_id(),
                          .data_copy_size = cd_copy_size,
                          .data_offset = cd_offset,
                          .data_addr = context.get_parent_cd_addr(),
                          .data_size = context.get_parent_cd_size(),
                          .is_nested = context.has_parent(),
                          .dst_addr = dst_addr };
}

DataCopyEvent create_rd_event(ContextInterface& context,
                              const uint32_t clk,
                              const uint32_t rd_copy_size,
                              const uint32_t rd_offset,
                              const MemoryAddress dst_addr,
                              const std::vector<FF>& returndata = {})
{
    return DataCopyEvent{ .execution_clk = clk,
                          .operation = DataCopyOperation::RD_COPY,
                          .calldata = returndata,
                          .write_context_id = context.get_context_id(),
                          .read_context_id =
                              context.get_child_context().get_context_id(), /* last returned child context */
                          .data_copy_size = rd_copy_size,
                          .data_offset = rd_offset,
                          .data_addr = context.get_last_rd_addr(),
                          .data_size = context.get_last_rd_size(),
                          .is_nested = context.has_parent(),
                          .dst_addr = dst_addr };
}

} // namespace

// This also creates the relevant range check event depending if a <= b or not.
bool DataCopy::is_lte(uint64_t a, uint64_t b)
{
    if (a <= b) {
        range_check.assert_range(b - a, 32);
        return true;
    }
    // !(a < b), i.e. a >= b
    range_check.assert_range(a - b - 1, 32);
    return false;
}

// This is std::min but creates the relevant range check event
uint64_t DataCopy::min(uint64_t a, uint64_t b)
{
    // Looks weird but ironically similar to the std::min implementation
    // i.e if a == b, return a
    if (is_lte(a, b)) {
        return a;
    }
    return b;
}

/**
 * Notes on DataCopy:
 * The simulation for DataCopy has a lot of subtle complexity due to the requirements of the circuit constraints.
 * The main complexity comes from the need to have the following 32-bit range checks
 * (1) Computing the max_read_index via min, which is used to determine the final index in the cd/rd to read up to.
 * (2) In error handling to check that reads and writes are within bounds of the memory.
 * (3) In computing the actual number of elements from calldata/returndata to read (i.e. from [offset, max_read_index])
 **/

/**
 * @brief Writes calldata into dst_addr. There is slight difference in how enqueued and nested contexts, this is mostly
 *        encapsulated in context.get_calldata()
 * @param cd_copy_size The size of calldata to copy, must be a u32.
 * @param cd_offset The offset in calldata to start copying from, must be a u32.
 * @param dst_addr The address in memory to write the calldata to.
 * @throws DataCopyException if the calldata size or offset are not u32, or if the memory access is out of bounds.
 **/
void DataCopy::cd_copy(ContextInterface& context,
                       const uint32_t copy_size,
                       const uint32_t offset,
                       const MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    uint32_t clk = execution_id_manager.get_execution_id();

    try {
        // It's safe to assume that the calldata size and offset are both u32, since we checked above.

        // This section is a bit leaky, but is necessary to ensure the correct range check events are generated.
        // This work is duplicated in context.get_calldata() - but it avoids us having a range check there.

        // Operations are performed over uint64_t in case the addition overflows, but the result in guaranteed to
        // fit in 32 bits since get_parent_cd_size() returns a u32 (constrained by a CALL or 0 if an enqueued call).
        uint32_t max_read_index = static_cast<uint32_t>(
            min(static_cast<uint64_t>(offset) + copy_size, static_cast<uint64_t>(context.get_parent_cd_size())));

        // Check that we will not access out of bounds memory.
        // todo(ilyas): think of a way to not need to leak enqueued/nested context information here.
        uint64_t max_read_addr = context.has_parent() ? max_read_index + context.get_parent_cd_addr() : 0;
        uint64_t max_write_addr = static_cast<uint64_t>(dst_addr) + copy_size;

        // Need all of this to happen regardless
        bool read_in_range = is_lte(max_read_addr, MAX_MEM_ADDR);
        bool write_in_range = is_lte(max_write_addr, MAX_MEM_ADDR);

        if (!read_in_range || !write_in_range) {
            throw std::runtime_error("Attempting to access out of bounds memory");
        }

        // If we get to this point, we know we will be error free
        std::vector<FF> padded_calldata(copy_size, 0); // Initialize with zeros
        // This is handled by the loop within get_calldata(), but we need to emit a range check in circuit
        // Calldata is retrieved from [offset, max_read_index]
        // if offset > max_read_index, we will read nothing
        if (is_lte(offset, max_read_index)) {
            padded_calldata = context.get_calldata(offset, copy_size);
        }

        for (uint32_t i = 0; i < copy_size; i++) {
            memory.set(dst_addr + i, MemoryValue::from<FF>(padded_calldata[i]));
        }

        events.emit(create_cd_event(context, clk, copy_size, offset, dst_addr, padded_calldata));
    } catch (const std::exception& e) {
        debug("CD_COPY exception: ", e.what());
        events.emit(create_cd_event(context, clk, copy_size, offset, dst_addr));

        // Re-throw something generic that execution will interpret as an opcode error.
        throw DataCopyException();
    }
}

/**
 * @brief Copies returndata from the last executed context to the dst_addr.
 * @param rd_copy_size The size of returndata to copy, must be a u32.
 * @param rd_offset The offset in returndata to start copying from, must be a u32.
 * @param dst_addr The address in memory to write the returndata to.
 * @throws DataCopyException if the returndata size or offset are not u32, or if the memory access is out of bounds.
 **/
void DataCopy::rd_copy(ContextInterface& context,
                       const uint32_t copy_size,
                       const uint32_t offset,
                       const MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    uint32_t clk = execution_id_manager.get_execution_id();

    try {
        // Check cd_copy for why we do this here even though it is in get_returndata()
        uint32_t max_read_index = static_cast<uint32_t>(
            min(static_cast<uint64_t>(offset) + copy_size, static_cast<uint64_t>(context.get_last_rd_size())));

        uint64_t max_read_addr = max_read_index + context.get_last_rd_addr();
        uint64_t max_write_addr = static_cast<uint64_t>(dst_addr) + copy_size;

        // Need both of this to happen regardless
        bool read_in_range = is_lte(max_read_addr, MAX_MEM_ADDR);
        bool write_in_range = is_lte(max_write_addr, MAX_MEM_ADDR);

        if (!read_in_range || !write_in_range) {
            throw std::runtime_error("Attempting to access out of bounds memory");
        }

        // If we get to this point, we know we will be error free

        // This is typically handled by the loop within get_returndata(), but we need to emit a range check in circuit
        // so we need to be explicit about it.
        // Returndata is retrieved from [offset, max_read_index], if offset > max_read_index, we will read nothing.
        std::vector<FF> padded_returndata(copy_size, 0); // Initialize with zeros
        if (is_lte(offset, max_read_index)) {
            padded_returndata = context.get_returndata(offset, copy_size);
        }

        for (uint32_t i = 0; i < copy_size; i++) {
            memory.set(dst_addr + i, MemoryValue::from<FF>(padded_returndata[i]));
        }

        events.emit(create_rd_event(context, clk, copy_size, offset, dst_addr, padded_returndata));

    } catch (const std::exception& e) {
        debug("RD_COPY exception: ", e.what());
        events.emit(create_rd_event(context, clk, copy_size, offset, dst_addr));

        // Re-throw something generic that execution will interpret as an opcode error.
        throw DataCopyException();
    }
}

} // namespace bb::avm2::simulation
