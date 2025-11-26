#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"

#include <algorithm>
#include <cassert>
#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_data_copy.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Builds the data copy trace.
 *
 * This trace handles CALLDATACOPY and RETURNDATACOPY (both enqueued and nested) events.
 * The enum DataCopyOperation is used to distinguish between the two operations and is set
 * in the field operation of the DataCopyEvent.
 *
 * Memory I/O, this subtrace can potentially read and write across two different memory
 * space ids (indicated by the context_ids). All memory reads are performed in the src context
 * (using the src_context_id) and writes are performed in the current executing context (using dst_context_id).
 * For an enqueued call, we do not read from memory as there is no parent context but read from
 * the calldata column.
 *
 * Error Handling:
 * There is one class of errors that is checked: memory out of range accesses for reads and writes.
 * Both are part of the same temporality group and therefore are checked simultaneously.
 * If an error occurs, we populate a single row with the error flag set.
 *
 * Writing Data:
 * If the copy size is zero, we do not read or write any data.
 * If the copy size is non-zero, we read and write the data to the current context.
 * For each read/write, we populate one row in the trace.
 *
 * Padding Data:
 * If we read past the end of the data, we populate a padding row (value = 0).
 *
 * Precondition: If there is no error, the field copying_data is a vector of size copy_size.
 *
 * @param events The events to process.
 * @param trace The trace to populate.
 */
void DataCopyTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::DataCopyEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;
    uint32_t row = 1;
    for (const auto& event : events) {
        const bool is_cd_copy = event.operation == simulation::DataCopyOperation::CD_COPY;
        const bool is_rd_copy = event.operation == simulation::DataCopyOperation::RD_COPY;
        const bool is_top_level = event.read_context_id == 0;
        const FF parent_id_inv = is_top_level ? 0 : FF(event.read_context_id); // Will be inverted in batch later

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
                      { C::data_copy_sel, 1 },
                      { C::data_copy_clk, event.execution_clk },
                      { C::data_copy_sel_start, 1 },
                      { C::data_copy_sel_cd_copy, is_cd_copy ? 1 : 0 },
                      { C::data_copy_sel_cd_copy_start, is_cd_copy ? 1 : 0 },
                      { C::data_copy_sel_rd_copy_start, is_rd_copy ? 1 : 0 },

                      { C::data_copy_src_context_id, event.read_context_id },
                      { C::data_copy_dst_context_id, event.write_context_id },

                      { C::data_copy_copy_size, event.data_copy_size },
                      { C::data_copy_offset, event.data_offset },

                      { C::data_copy_src_addr, event.src_data_addr },
                      { C::data_copy_src_data_size, event.src_data_size },
                      { C::data_copy_dst_addr, event.dst_addr },

                      { C::data_copy_is_top_level, is_top_level ? 1 : 0 },
                      { C::data_copy_parent_id_inv, parent_id_inv }, // Will be inverted in batch later

                      // Compute Data Index Upper Bound
                      { C::data_copy_offset_plus_size, data_offset + copy_size },
                      { C::data_copy_offset_plus_size_is_gt, data_offset + copy_size > event.src_data_size ? 1 : 0 },
                      { C::data_copy_data_index_upper_bound, data_index_upper_bound },

                      // Addresses Upper Bounds
                      { C::data_copy_mem_size, static_cast<uint64_t>(AVM_MEMORY_SIZE) },
                      { C::data_copy_read_addr_upper_bound, read_addr_upper_bound },
                      { C::data_copy_write_addr_upper_bound, write_addr_upper_bound },

                  } });

        /////////////////////////////
        // Memory Address Range Check
        /////////////////////////////
        // We need to check that the read and write addresses are within the valid memory range.
        // Note: for enqueued calls, there is no out of bound read since we read from a column.

        bool read_address_overflow = read_addr_upper_bound > AVM_MEMORY_SIZE;
        bool write_address_overflow = write_addr_upper_bound > AVM_MEMORY_SIZE;
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
            FF value = is_padding_row ? 0 : event.copying_data[i].as_ff();
            // Circuit only enforces tag consistency for memory reads.
            FF tag = sel_mem_read ? static_cast<FF>(static_cast<uint8_t>(event.copying_data[i].get_tag())) : 0;

            trace.set(
                row,
                { {
                    { C::data_copy_sel, 1 },
                    { C::data_copy_clk, event.execution_clk },
                    { C::data_copy_sel_cd_copy, is_cd_copy ? 1 : 0 },

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
                    { C::data_copy_parent_id_inv, parent_id_inv }, // Will be inverted in batch later

                    { C::data_copy_sel_mem_read, sel_mem_read ? 1 : 0 },
                    { C::data_copy_read_addr, read_addr },
                    { C::data_copy_read_addr_plus_one, read_cd_col ? read_addr + 1 : 0 },

                    { C::data_copy_reads_left_inv, reads_left }, // Will be inverted in batch later
                    { C::data_copy_padding, is_padding_row ? 1 : 0 },
                    { C::data_copy_value, value },
                    { C::data_copy_tag, tag },

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
