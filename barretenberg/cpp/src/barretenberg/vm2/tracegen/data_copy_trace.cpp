#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"

#include <cassert>
#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_data_copy.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

constexpr uint32_t MAX_MEM_ADDR = AVM_HIGHEST_MEM_ADDRESS;

void DataCopyTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::DataCopyEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 1;
    // When processing the events, we need to handle any potential errors and create the respective error columns
    for (const auto& event : events) {
        // We first set elements of the row that are unconditional, i.e. they are always set regardless of success/error

        bool is_cd_copy = event.operation == simulation::DataCopyOperation::CD_COPY;
        bool is_rd_copy = event.operation == simulation::DataCopyOperation::RD_COPY;

        // todo(ilyas): Can optimise this as we only need the inverse if CD_COPY as well
        bool is_top_level = event.read_context_id == 0;
        FF parent_id_inv = is_top_level ? 0 : FF(event.read_context_id).invert();

        // While we know at this point data copy size and data offset are guaranteed to be U32
        // we cast to a wider integer type to detect overflows
        uint64_t copy_size = static_cast<uint64_t>(event.data_copy_size);
        uint64_t data_offset = static_cast<uint64_t>(event.data_offset);

        trace.set(row,
                  { {
                      // Unconditional values
                      { C::data_copy_clk, event.execution_clk },
                      { C::data_copy_sel_start, 1 },
                      { C::data_copy_sel_cd_copy, is_cd_copy ? 1 : 0 },
                      { C::data_copy_sel_rd_copy, is_rd_copy ? 1 : 0 },
                      { C::data_copy_operation_id, static_cast<uint8_t>(event.operation) },
                      { C::data_copy_thirty_two, 32 }, // Need this for range checks

                      { C::data_copy_src_context_id, event.read_context_id },
                      { C::data_copy_dst_context_id, event.write_context_id },

                      { C::data_copy_copy_size, event.data_copy_size },
                      { C::data_copy_offset, event.data_offset },

                      { C::data_copy_src_addr, event.data_addr },
                      { C::data_copy_src_data_size, event.data_size },
                      { C::data_copy_dst_addr, event.dst_addr },

                      { C::data_copy_is_top_level, is_top_level ? 1 : 0 },
                      { C::data_copy_parent_id_inv, parent_id_inv },
                  } });

        /////////////////////////////
        // Memory Address Range Check
        /////////////////////////////
        // The final possible error is to check that we do not try to read or write out of bounds memory.
        // Note: for enqueued calls, there is no out of bound read since we read from a column.

        uint64_t max_read_size = std::min(data_offset + copy_size, static_cast<uint64_t>(event.data_size));
        // This helps in proving read_size = min(read_size, data_offset + copy_size)
        bool is_data_size_lt = static_cast<uint64_t>(event.data_size) < (data_offset + copy_size);
        uint64_t abs_diff_max_read_index = is_data_size_lt
                                               ? (data_offset + copy_size) - event.data_size - 1
                                               : static_cast<uint64_t>(event.data_size) - (data_offset + copy_size);

        // Additions done over uint64_t to avoid overflow issues
        uint64_t max_read_addr = (max_read_size + event.data_addr) * (event.is_nested ? 1 : 0); // 0 if enqueued call
        uint64_t max_write_addr = static_cast<uint64_t>(event.dst_addr) + copy_size;

        bool read_address_overflow = max_read_addr > MAX_MEM_ADDR;
        bool write_address_overflow = max_write_addr > MAX_MEM_ADDR;
        if (read_address_overflow || write_address_overflow) {
            trace.set(
                row,
                { { { C::data_copy_sel_end, 1 },
                    // Add error flag - note we can be out of range for both reads and writes
                    { C::data_copy_src_out_of_range_err, read_address_overflow ? 1 : 0 },
                    { C::data_copy_dst_out_of_range_err, write_address_overflow ? 1 : 0 },
                    { C::data_copy_err, 1 },

                    // Circuit columns for computing max_read_size = std::min(..)
                    { C::data_copy_src_data_size_is_lt, is_data_size_lt ? 1 : 0 },
                    { C::data_copy_abs_diff_max_read_index, abs_diff_max_read_index },

                    // Range checking - we want to explicitly show that max_X > MAX_MEM_ADDR (hence the - 1)
                    { C::data_copy_abs_read_diff,
                      read_address_overflow ? max_read_addr - MAX_MEM_ADDR - 1 : MAX_MEM_ADDR - max_read_addr },
                    { C::data_copy_abs_write_diff,
                      write_address_overflow ? max_write_addr - MAX_MEM_ADDR - 1 : MAX_MEM_ADDR - max_write_addr } } });
            row++;
            continue; // Go to the next event
        }

        // At this point it's safe to perform the data copy operation since there are no longer any errors.
        // Range check helpers for reads_left = min(0, max_read_size - data_offset)
        bool offset_gt_max_read_size = data_offset > max_read_size;
        auto reads_left = offset_gt_max_read_size ? 0 : max_read_size - data_offset;
        auto abs_max_read_offset = offset_gt_max_read_size ? data_offset - max_read_size - 1 : reads_left;

        for (uint32_t i = 0; i < event.calldata.size(); i++) {
            bool start = i == 0;
            auto current_copy_size = copy_size - i;
            bool end = (current_copy_size - 1) == 0;

            bool is_padding_row = reads_left == 0;

            // These are guaranteed not to overflow since we checked the read/write addresses above
            auto read_addr = event.data_addr + data_offset + i;
            bool read_cd_col = is_cd_copy && is_top_level && !is_padding_row;

            // Read from memory if this is not a padding row and we are either RD_COPY-ing or a nested CD_COPY
            bool sel_mem_read = !is_padding_row && (is_rd_copy || event.read_context_id != 0);
            FF value = is_padding_row ? 0 : event.calldata[i];
            FF reads_left_inv = is_padding_row ? 0 : FF(reads_left).invert();

            FF write_count_mins_one_inv = end ? 0 : FF(current_copy_size - 1).invert();

            trace.set(row,
                      { {
                          { C::data_copy_clk, event.execution_clk },
                          { C::data_copy_operation_id, static_cast<uint8_t>(event.operation) },
                          { C::data_copy_sel_cd_copy, is_cd_copy ? 1 : 0 },
                          { C::data_copy_sel_rd_copy, is_rd_copy ? 1 : 0 },
                          { C::data_copy_thirty_two, 32 }, // Need this for range checks

                          { C::data_copy_src_context_id, event.read_context_id },
                          { C::data_copy_dst_context_id, event.write_context_id },
                          { C::data_copy_dst_addr, event.dst_addr + i },

                          { C::data_copy_sel_start_no_err, start ? 1 : 0 },
                          { C::data_copy_sel_end, end ? 1 : 0 },
                          { C::data_copy_copy_size, current_copy_size },
                          { C::data_copy_write_count_minus_one_inv, write_count_mins_one_inv },

                          { C::data_copy_sel_mem_write, 1 },

                          { C::data_copy_is_top_level, is_top_level ? 1 : 0 },
                          { C::data_copy_parent_id_inv, parent_id_inv },

                          { C::data_copy_sel_mem_read, sel_mem_read ? 1 : 0 },
                          { C::data_copy_read_addr, read_addr },
                          { C::data_copy_reads_left, reads_left },

                          // Range Checks
                          { C::data_copy_sel_offset_gt_max_read, start && offset_gt_max_read_size ? 1 : 0 },
                          { C::data_copy_abs_max_read_offset, start ? abs_max_read_offset : 0 },

                          { C::data_copy_src_data_size_is_lt, is_data_size_lt ? 1 : 0 },
                          { C::data_copy_abs_diff_max_read_index, abs_diff_max_read_index },
                          { C::data_copy_abs_read_diff,
                            start ? MAX_MEM_ADDR - max_read_addr : 0 }, // MAX_MEM_ADDR >= max_read_addr
                          { C::data_copy_abs_write_diff,
                            start ? MAX_MEM_ADDR - max_write_addr : 0 }, // MAX_MEM_ADDR >= max_write_addr

                          { C::data_copy_reads_left_inv, reads_left_inv },
                          { C::data_copy_padding, is_padding_row ? 1 : 0 },
                          { C::data_copy_value, value },

                          { C::data_copy_cd_copy_col_read, read_cd_col ? 1 : 0 },
                      } });
            reads_left = reads_left == 0 ? 0 : reads_left - 1;
            row++;
        }
    }
}

const InteractionDefinition DataCopyTraceBuilder::interactions =
    InteractionDefinition()
        // Mem Read / Writes
        .add<lookup_data_copy_mem_read_settings, InteractionType::LookupGeneric>()
        .add<lookup_data_copy_mem_write_settings, InteractionType::LookupGeneric>()
        // Enqueued Call Col Read
        .add<lookup_data_copy_col_read_settings, InteractionType::LookupGeneric>()
        // Range Checks
        .add<lookup_data_copy_range_reads_left_settings, InteractionType::LookupGeneric>()
        .add<lookup_data_copy_range_max_read_size_diff_settings, InteractionType::LookupGeneric>()
        .add<lookup_data_copy_range_read_settings, InteractionType::LookupGeneric>()
        .add<lookup_data_copy_range_write_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
