#include "barretenberg/vm2/simulation/data_copy.hpp"

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"

namespace bb::avm2::simulation {

void DataCopy::cd_copy(ContextInterface& context,
                       const uint32_t cd_copy_size,
                       const uint32_t cd_offset,
                       const MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    // todo(ilyas): check out of bounds error
    auto padded_calldata = context.get_calldata(cd_offset, cd_copy_size);

    for (uint32_t i = 0; i < cd_copy_size; i++) {
        memory.set(dst_addr + i, MemoryValue::from<FF>(padded_calldata[i]));
    }

    events.emit(DataCopyEvent{ .execution_clk = execution_id_manager.get_execution_id(),
                               .operation = DataCopyOperation::CD_COPY,
                               .calldata = padded_calldata,
                               .context_id = context.get_context_id(),
                               .write_context_id = context.get_context_id(),
                               .read_context_id = context.get_parent_id(),
                               .data_copy_size = cd_copy_size, // This should be the size of the calldata
                               .data_offset = cd_offset,
                               .data_addr = context.get_parent_cd_addr(),
                               .data_size = context.get_parent_cd_size(),
                               .is_nested = context.has_parent(),
                               .dst_addr = dst_addr });
}

void DataCopy::rd_copy(ContextInterface& context,
                       const uint32_t rd_copy_size,
                       const uint32_t rd_offset,
                       const MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();
    // todo(ilyas): check out of bounds error
    auto padded_returndata = context.get_returndata(rd_offset, rd_copy_size);

    for (uint32_t i = 0; i < rd_copy_size; i++) {
        memory.set(dst_addr + i, MemoryValue::from<FF>(padded_returndata[i]));
    }

    events.emit(DataCopyEvent{ .execution_clk = execution_id_manager.get_execution_id(),
                               .operation = DataCopyOperation::RD_COPY,
                               .calldata = padded_returndata,
                               .context_id = context.get_context_id(),
                               .write_context_id = context.get_context_id(),
                               .read_context_id = context.get_child_context().get_context_id(),
                               .data_copy_size = rd_copy_size,
                               .data_offset = rd_offset,
                               .data_addr = context.get_last_rd_addr(),
                               .data_size = context.get_last_rd_size(),
                               .is_nested = context.has_parent(),
                               .dst_addr = dst_addr });
}

} // namespace bb::avm2::simulation
