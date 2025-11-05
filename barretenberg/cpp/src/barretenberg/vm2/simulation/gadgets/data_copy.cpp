#include "barretenberg/vm2/simulation/gadgets/data_copy.hpp"

#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
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
                              const std::vector<MemoryValue>& calldata = {})
{
    return DataCopyEvent{
        .execution_clk = clk,
        .operation = DataCopyOperation::CD_COPY,
        .copying_data = calldata,
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
                              const std::vector<MemoryValue>& returndata = {})
{
    return DataCopyEvent{
        .execution_clk = clk,
        .operation = DataCopyOperation::RD_COPY,
        .copying_data = returndata,
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
 * (1) Computing the data_index_upper_bound via min, which is used to determine the final index in the cd/rd to read up
 *to. (2) In error handling to check that reads and writes are within bounds of the memory. (3) In computing the actual
 *number of elements from calldata/returndata to read (i.e. from [offset, data_index_upper_bound])
 **/

/**
 * @brief Writes calldata into dst_addr. There is slight difference in how enqueued and nested contexts are handled,
 *        this is mostly encapsulated in context.get_calldata()
 * @param copy_size The size of calldata to copy (u32).
 * @param offset The offset in calldata to start copying from (u32).
 * @param dst_addr The address in memory to write the calldata to.
 * @throws DataCopyException if a read or write memory access is out of bounds.
 **/
void DataCopy::cd_copy(ContextInterface& context, uint32_t copy_size, uint32_t offset, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    uint32_t clk = execution_id_manager.get_execution_id();

    // This section is a bit leaky, but is necessary to ensure the correct gt events are generated.
    // This work is duplicated in context.get_calldata() - but it avoids us having a gt there.

    // Operations are performed over uint64_t in case the addition overflows, but the result in guaranteed to
    // fit in 32 bits since get_parent_cd_size() returns a u32 (constrained by a CALL or 0 if an enqueued call).
    uint64_t data_index_upper_bound = min(static_cast<uint64_t>(offset) + copy_size, context.get_parent_cd_size());

    // Check that we will not access out of bounds memory.
    uint64_t read_addr_upper_bound = data_index_upper_bound + context.get_parent_cd_addr();
    uint64_t write_addr_upper_bound = static_cast<uint64_t>(dst_addr) + copy_size;

    // Need all of this to happen regardless
    bool read_out_of_range = gt.gt(read_addr_upper_bound, AVM_MEMORY_SIZE);
    bool write_out_of_range = gt.gt(write_addr_upper_bound, AVM_MEMORY_SIZE);

    if (read_out_of_range || write_out_of_range) {
        const std::string error_msg = format("Attempting to access out of bounds memory: read_addr_upper_bound = ",
                                             read_addr_upper_bound,
                                             " write_addr_upper_bound = ",
                                             write_addr_upper_bound);

        events.emit(create_cd_event(context, clk, copy_size, offset, dst_addr));

        // Throw something generic that execution will interpret as an opcode error.
        throw DataCopyException(error_msg);
    }

    // If we get to this point, we know we will be error free
    std::vector<MemoryValue> padded_calldata(copy_size, MemoryValue::from<FF>(0)); // Initialize with zeros
    // Calldata is retrieved from [offset, data_index_upper_bound)
    // If data_index_upper_bound > offset, we read the data.
    if (gt.gt(data_index_upper_bound, static_cast<uint64_t>(offset))) {
        padded_calldata = context.get_calldata(offset, copy_size);
    }

    // We do not enforce any tag check and upcast to FF transparently.
    for (uint32_t i = 0; i < copy_size; i++) {
        memory.set(dst_addr + i, MemoryValue::from<FF>(padded_calldata[i].as_ff()));
    }

    // We need to pass the original tags of the calldata to the circuit.
    events.emit(create_cd_event(context, clk, copy_size, offset, dst_addr, padded_calldata));
}

/**
 * @brief Copies returndata from the last executed context to the dst_addr.
 * @param copy_size The size of returndata to copy (u32).
 * @param offset The offset in returndata to start copying from (u32).
 * @param dst_addr The address in memory to write the returndata to.
 * @throws DataCopyException if a read or write memory access is out of bounds.
 **/
void DataCopy::rd_copy(ContextInterface& context, uint32_t copy_size, uint32_t offset, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    uint32_t clk = execution_id_manager.get_execution_id();

    // Check cd_copy for why we do this here even though it is in get_returndata()
    uint64_t data_index_upper_bound = min(static_cast<uint64_t>(offset) + copy_size, context.get_last_rd_size());

    uint64_t read_addr_upper_bound = data_index_upper_bound + context.get_last_rd_addr();
    uint64_t write_addr_upper_bound = static_cast<uint64_t>(dst_addr) + copy_size;

    // Need both of this to happen regardless
    bool read_out_of_range = gt.gt(read_addr_upper_bound, AVM_MEMORY_SIZE);
    bool write_out_of_range = gt.gt(write_addr_upper_bound, AVM_MEMORY_SIZE);

    if (read_out_of_range || write_out_of_range) {
        const std::string error_msg = format("Attempting to access out of bounds memory: read_addr_upper_bound = ",
                                             read_addr_upper_bound,
                                             " write_addr_upper_bound = ",
                                             write_addr_upper_bound);

        events.emit(create_rd_event(context, clk, copy_size, offset, dst_addr));

        // Throw something generic that execution will interpret as an opcode error.
        throw DataCopyException(error_msg);
    }

    // If we get to this point, we know we will be error free

    // This is typically handled by the loop within get_returndata(), but we need to emit a range check in circuit
    // so we need to be explicit about it.
    // Returndata is retrieved from [offset, data_index_upper_bound), if data_index_upper_bound > offset, we will read
    // the data.
    std::vector<MemoryValue> padded_returndata(copy_size, MemoryValue::from<FF>(0)); // Initialize with zeros
    if (gt.gt(data_index_upper_bound, static_cast<uint64_t>(offset))) {
        padded_returndata = context.get_returndata(offset, copy_size);
    }

    // We do not enforce any tag check and upcast to FF transparently.
    for (uint32_t i = 0; i < copy_size; i++) {
        memory.set(dst_addr + i, MemoryValue::from<FF>(padded_returndata[i].as_ff()));
    }

    // We need to pass the original tags of the returndata to the circuit.
    events.emit(create_rd_event(context, clk, copy_size, offset, dst_addr, padded_returndata));
}

} // namespace bb::avm2::simulation
