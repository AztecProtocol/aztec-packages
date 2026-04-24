#include "barretenberg/vm2/simulation/gadgets/data_copy.hpp"

#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

namespace {

/**
 * @brief Helper function to populate a CD copy event.
 *
 */
DataCopyEvent create_cd_event(ContextInterface& context,
                              uint32_t clk,
                              uint32_t copy_size,
                              uint32_t offset,
                              MemoryAddress dst_addr,
                              std::vector<MemoryValue> calldata = {})
{
    return DataCopyEvent{
        .execution_clk = clk,
        .operation = DataCopyOperation::CD_COPY,
        .copying_data = std::move(calldata),
        .write_context_id = context.get_context_id(),
        .read_context_id = context.get_parent_id(),
        .data_copy_size = copy_size,
        .data_offset = offset,
        .src_data_addr = context.get_parent_cd_addr(),
        .src_data_size = context.get_parent_cd_size(),
        .is_nested = context.has_parent(),
        .dst_addr = dst_addr,
    };
}

/**
 * @brief Helper function to populate a RD copy event.
 *
 */
DataCopyEvent create_rd_event(ContextInterface& context,
                              uint32_t clk,
                              uint32_t copy_size,
                              uint32_t offset,
                              MemoryAddress dst_addr,
                              std::vector<MemoryValue> returndata = {})
{
    return DataCopyEvent{
        .execution_clk = clk,
        .operation = DataCopyOperation::RD_COPY,
        .copying_data = std::move(returndata),
        .write_context_id = context.get_context_id(),
        // This handles the case where there is no last child (i.e. new enqueued call)
        .read_context_id = context.get_last_child_id(),
        .data_copy_size = copy_size,
        .data_offset = offset,
        .src_data_addr = context.get_last_rd_addr(),
        .src_data_size = context.get_last_rd_size(),
        .is_nested = context.has_parent(),
        .dst_addr = dst_addr,
    };
}

} // namespace

// This is std::min but creates the relevant greater than event
uint64_t DataCopy::min(uint64_t a, uint64_t b)
{
    // Looks weird but ironically similar to the std::min implementation
    // i.e if a == b, return a
    if (gt.gt(a, b)) {
        return b;
    }
    return a;
}

/**
 * Notes on DataCopy:
 * The simulation for DataCopy has a lot of subtle complexity due to the requirements of the circuit constraints.
 * The main complexity comes from the need to have the following 32-bit range checks
 * (1) Computing read_index_upper_bound via min, which is used to determine the final index in the cd/rd
 *     to read up to.
 * (2) Clamping reads at the memory boundary when src_addr + read_index_upper_bound exceeds AVM_MEMORY_SIZE.
 * (3) Checking that writes are within bounds of the memory (only dst out of range is an error).
 * (4) Checking whether the offset exceeds the clamped read index upper bound to determine the actual number
 *     of elements from calldata/returndata to read (i.e. from [offset, clamped]).
 **/

/**
 * @brief Writes calldata into dst_addr. There is slight difference in how enqueued and nested contexts are handled,
 *        this is mostly encapsulated in context.get_calldata()
 * @param copy_size The size of calldata to copy (u32).
 * @param offset The offset in calldata to start copying from (u32).
 * @param dst_addr The address in memory to write the calldata to.
 * @throws DataCopyException if the write memory access is out of bounds.
 **/
void DataCopy::cd_copy(ContextInterface& context, uint32_t copy_size, uint32_t offset, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    uint32_t clk = execution_id_manager.get_execution_id();

    // This section is a bit leaky, but is necessary to ensure the correct gt events are generated.
    // This work is duplicated in context.get_calldata() - but it avoids us having a gt there.

    // Operations are performed over uint64_t in case the addition overflows, but the result is guaranteed to
    // fit in 32 bits since get_parent_cd_size() returns a u32 (constrained by a CALL or 0 if an enqueued
    uint64_t read_index_upper_bound = min(static_cast<uint64_t>(offset) + copy_size, context.get_parent_cd_size());
    uint64_t read_addr_upper_bound = read_index_upper_bound + context.get_parent_cd_addr();

    uint64_t write_addr_upper_bound = static_cast<uint64_t>(dst_addr) + copy_size;

    // Both GT events must be emitted regardless of outcome (circuit requires them).
    bool src_reads_exceed_mem = gt.gt(read_addr_upper_bound, AVM_MEMORY_SIZE);
    bool write_out_of_range = gt.gt(write_addr_upper_bound, AVM_MEMORY_SIZE);

    // Only dst out of range is an error. Src out of range is handled by clamping reads and padding
    if (write_out_of_range) {
        events.emit(create_cd_event(context, clk, copy_size, offset, dst_addr));
        throw DataCopyException(
            format("Attempting to write out of bounds memory: write_addr_upper_bound = ", write_addr_upper_bound));
    }

    // Clamp reads at the memory boundary.
    uint64_t clamped_read_index_upper_bound =
        src_reads_exceed_mem ? (AVM_MEMORY_SIZE - context.get_parent_cd_addr()) : read_index_upper_bound;

    // Read the clamped amount and pad to copy_size with zeros.
    std::vector<MemoryValue> padded_calldata;
    if (gt.gt(clamped_read_index_upper_bound, static_cast<uint64_t>(offset))) {
        uint32_t effective_reads = static_cast<uint32_t>(clamped_read_index_upper_bound - offset);
        padded_calldata = context.get_calldata(offset, effective_reads);
    }
    padded_calldata.resize(copy_size, MemoryValue::from<FF>(0));

    // We do not enforce any tag check and upcast to FF transparently.
    for (uint32_t i = 0; i < copy_size; i++) {
        memory.set(dst_addr + i, MemoryValue::from<FF>(padded_calldata[i].as_ff()));
    }

    // We need to pass the original tags of the calldata to the circuit.
    events.emit(create_cd_event(context, clk, copy_size, offset, dst_addr, std::move(padded_calldata)));
}

/**
 * @brief Copies returndata from the last executed context to the dst_addr.
 * @param copy_size The size of returndata to copy (u32).
 * @param offset The offset in returndata to start copying from (u32).
 * @param dst_addr The address in memory to write the returndata to.
 * @throws DataCopyException if the write memory access is out of bounds.
 **/
void DataCopy::rd_copy(ContextInterface& context, uint32_t copy_size, uint32_t offset, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    uint32_t clk = execution_id_manager.get_execution_id();

    // Check cd_copy for why we do this here even though it is in get_returndata()
    uint64_t read_index_upper_bound = min(static_cast<uint64_t>(offset) + copy_size, context.get_last_rd_size());
    uint64_t read_addr_upper_bound = read_index_upper_bound + context.get_last_rd_addr();

    uint64_t write_addr_upper_bound = static_cast<uint64_t>(dst_addr) + copy_size;

    // Both GT events must be emitted regardless of outcome (circuit requires them).
    bool src_reads_exceed_mem = gt.gt(read_addr_upper_bound, AVM_MEMORY_SIZE);
    bool write_out_of_range = gt.gt(write_addr_upper_bound, AVM_MEMORY_SIZE);

    // Only dst out of range is an error. Src out of range is handled by clamping reads and padding
    if (write_out_of_range) {
        events.emit(create_rd_event(context, clk, copy_size, offset, dst_addr));
        throw DataCopyException(
            format("Attempting to write out of bounds memory: write_addr_upper_bound = ", write_addr_upper_bound));
    }

    // Clamp reads at the memory boundary.
    uint64_t clamped_read_index_upper_bound =
        src_reads_exceed_mem ? (AVM_MEMORY_SIZE - context.get_last_rd_addr()) : read_index_upper_bound;

    // Read the clamped amount and pad to copy_size with zeros.
    std::vector<MemoryValue> padded_returndata;
    if (gt.gt(clamped_read_index_upper_bound, static_cast<uint64_t>(offset))) {
        uint32_t effective_reads = static_cast<uint32_t>(clamped_read_index_upper_bound - offset);
        padded_returndata = context.get_returndata(offset, effective_reads);
    }
    padded_returndata.resize(copy_size, MemoryValue::from<FF>(0));

    // We do not enforce any tag check and upcast to FF transparently.
    for (uint32_t i = 0; i < copy_size; i++) {
        memory.set(dst_addr + i, MemoryValue::from<FF>(padded_returndata[i].as_ff()));
    }

    // We need to pass the original tags of the returndata to the circuit.
    events.emit(create_rd_event(context, clk, copy_size, offset, dst_addr, std::move(padded_returndata)));
}

} // namespace bb::avm2::simulation
