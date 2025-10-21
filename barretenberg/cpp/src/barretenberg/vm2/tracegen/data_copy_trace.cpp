#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"

#include <algorithm>
#include <cassert>
#include <cstdint>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_data_copy.hpp"

namespace bb::avm2::tracegen {

constexpr uint64_t MAX_MEM_ADDR = AVM_HIGHEST_MEM_ADDRESS;

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

        // todo(ilyas): Can optimize this as we only need the inverse if CD_COPY as well
        bool is_top_level = event.read_context_id == 0;
        FF parent_id_inv = is_top_level ? 0 : FF(event.read_context_id); // Will be inverted in batch later

        // While we know at this point data copy size and data offset are guaranteed to be U32
        // we cast to a wider integer type to detect overflows
        const uint64_t copy_size = static_cast<uint64_t>(event.data_copy_size);
        const uint64_t data_offset = static_cast<uint64_t>(event.data_offset);
        const uint64_t data_index_upper_bound =
            std::min(data_offset + copy_size, static_cast<uint64_t>(event.src_data_size));

        const uint64_t read_addr_upper_bound = static_cast<uint64_t>(event.src_data_addr) + data_index_upper_bound;
        const uint64_t write_addr_upper_bound = static_cast<uint64_t>(event.dst_addr) + copy_size;

        trace.set(row,
                  { {
                      // Unconditional values
                      { C::data_copy_clk, event.execution_clk },
                      { C::data_copy_sel_start, 1 },
                      { C::data_copy_sel_cd_copy, is_cd_copy ? 1 : 0 },
                      { C::data_copy_sel_cd_copy_start, is_cd_copy ? 1 : 0 },
                      { C::data_copy_sel_rd_copy, is_rd_copy ? 1 : 0 },
                      { C::data_copy_sel_rd_copy_start, is_rd_copy ? 1 : 0 },

                      { C::data_copy_src_context_id, event.read_context_id },
                      { C::data_copy_dst_context_id, event.write_context_id },

                      { C::data_copy_copy_size, event.data_copy_size },
                      { C::data_copy_offset, event.data_offset },

                      { C::data_copy_src_addr, event.src_data_addr },
                      { C::data_copy_src_data_size, event.src_data_size },
                      { C::data_copy_dst_addr, event.dst_addr },

                      { C::data_copy_is_top_level, is_top_level ? 1 : 0 },
                      { C::data_copy_parent_id_inv, parent_id_inv },

                      // Compute Data Index Upper Bound
                      { C::data_copy_offset_plus_size, data_offset + copy_size },
                      { C::data_copy_offset_plus_size_is_gt, data_offset + copy_size > event.src_data_size ? 1 : 0 },
                      { C::data_copy_data_index_upper_bound, data_index_upper_bound },

                      // Addresses Upper Bounds
                      { C::data_copy_mem_size, MAX_MEM_ADDR + 1 },
                      { C::data_copy_read_addr_upper_bound, read_addr_upper_bound },
                      { C::data_copy_write_addr_upper_bound, write_addr_upper_bound },

                  } });

        /////////////////////////////
        // Memory Address Range Check
        /////////////////////////////
        // We need to check that the read and write addresses are within the valid memory range.
        // Note: for enqueued calls, there is no out of bound read since we read from a column.

        bool read_address_overflow = read_addr_upper_bound > MAX_MEM_ADDR + 1;
        bool write_address_overflow = write_addr_upper_bound > MAX_MEM_ADDR + 1;
        if (read_address_overflow || write_address_overflow) {
            trace.set(row,
                      { {
                          { C::data_copy_sel_end, 1 },
                          // Add error flag - note we can be out of range for both reads and writes
                          { C::data_copy_src_out_of_range_err, read_address_overflow ? 1 : 0 },
                          { C::data_copy_dst_out_of_range_err, write_address_overflow ? 1 : 0 },
                          { C::data_copy_err, 1 },
                      } });
            row++;
            continue; // Go to the next event
        }

        // If there is an error, the copying data is empty. Therefore, we have to perform this
        // assertion after the error check.
        assert(event.copying_data.size() == copy_size);

        /////////////////////////////
        // Check for Zero Sized Copy
        /////////////////////////////
        // This has to happen outside of the next loop since we will not enter it if the copy size is zero
        if (copy_size == 0) {
            trace.set(
                row,
                { {
                    { C::data_copy_sel_start_no_err, 1 },
                    { C::data_copy_sel_end, 1 },
                    { C::data_copy_sel_write_count_is_zero, 1 },
                    { C::data_copy_data_index_upper_bound_gt_offset, data_index_upper_bound > data_offset ? 1 : 0 },
                } });
            row++;
            continue; // Go to the next event
        }

        /////////////////////////////
        // Process Data Copy Rows
        /////////////////////////////
        uint32_t reads_left =
            data_offset >= data_index_upper_bound ? 0 : static_cast<uint32_t>(data_index_upper_bound - data_offset);

        for (uint32_t i = 0; i < copy_size; i++) {
            bool start = i == 0;
            auto current_copy_size = copy_size - i;
            bool end = (current_copy_size - 1) == 0;

            bool is_padding_row = reads_left == 0;

            // These are guaranteed not to overflow since we checked the read/write addresses above
            uint64_t read_addr = event.src_data_addr + data_offset + i;
            bool read_cd_col = is_cd_copy && is_top_level && !is_padding_row;

            // Read from memory if this is not a padding row and we are either RD_COPY-ing or a nested CD_COPY
            bool sel_mem_read = !is_padding_row && (is_rd_copy || !is_top_level);
            FF value = is_padding_row ? 0 : event.copying_data[i];

            trace.set(
                row,
                { {
                    { C::data_copy_clk, event.execution_clk },
                    { C::data_copy_sel_cd_copy, is_cd_copy ? 1 : 0 },
                    { C::data_copy_sel_rd_copy, is_rd_copy ? 1 : 0 },

                    { C::data_copy_src_context_id, event.read_context_id },
                    { C::data_copy_dst_context_id, event.write_context_id },
                    { C::data_copy_dst_addr, event.dst_addr + i },

                    { C::data_copy_sel_start_no_err, start ? 1 : 0 },
                    { C::data_copy_sel_end, end ? 1 : 0 },
                    { C::data_copy_copy_size, current_copy_size },
                    { C::data_copy_write_count_minus_one_inv,
                      current_copy_size - 1 }, // Will be inverted in batch later

                    { C::data_copy_sel_mem_write, 1 },

                    { C::data_copy_is_top_level, is_top_level ? 1 : 0 },
                    { C::data_copy_parent_id_inv, parent_id_inv },

                    { C::data_copy_sel_mem_read, sel_mem_read ? 1 : 0 },
                    { C::data_copy_read_addr, read_addr },
                    { C::data_copy_read_addr_plus_one, read_cd_col ? read_addr + 1 : 0 },

                    { C::data_copy_reads_left_inv, reads_left }, // Will be inverted in batch later
                    { C::data_copy_padding, is_padding_row ? 1 : 0 },
                    { C::data_copy_value, value },

                    { C::data_copy_cd_copy_col_read, read_cd_col ? 1 : 0 },

                    // Reads Left
                    { C::data_copy_reads_left, reads_left },
                    { C::data_copy_data_index_upper_bound_gt_offset,
                      (start && data_index_upper_bound > data_offset) ? 1 : 0 },

                    // Non-zero Copy Size
                    { C::data_copy_write_count_zero_inv, start ? FF(copy_size) : 0 }, // Will be inverted in batch later
                } });

            if (reads_left > 0) {
                reads_left--;
            }

            row++;
        }
    }

    // Batch invert the columns.
    trace.invert_columns({ { C::data_copy_parent_id_inv,
                             C::data_copy_write_count_zero_inv,
                             C::data_copy_reads_left_inv,
                             C::data_copy_write_count_minus_one_inv } });
}

const InteractionDefinition DataCopyTraceBuilder::interactions =
    InteractionDefinition()
        // Enqueued Call Col Read
        .add<lookup_data_copy_col_read_settings, InteractionType::LookupGeneric>()
        // GT checks
        .add<lookup_data_copy_offset_plus_size_is_gt_data_size_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        .add<lookup_data_copy_check_src_addr_in_range_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        .add<lookup_data_copy_check_dst_addr_in_range_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        .add<lookup_data_copy_data_index_upper_bound_gt_offset_settings, InteractionType::LookupGeneric>(
            Column::gt_sel);
} // namespace bb::avm2::tracegen
