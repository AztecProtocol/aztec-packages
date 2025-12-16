#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"

#include <cassert>
#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_data_copy.hpp"
#include "barretenberg/vm2/generated/relations/perms_data_copy.hpp"
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

        // todo(ilyas): Can optimize this as we only need the inverse if CD_COPY as well
        bool is_top_level = event.read_context_id == 0;
        FF parent_id_inv = is_top_level ? 0 : FF(event.read_context_id).invert();

        // While we know at this point data copy size and data offset are guaranteed to be U32
        // we cast to a wider integer type to detect overflows
        uint64_t copy_size = static_cast<uint64_t>(event.data_copy_size);
        uint64_t data_offset = static_cast<uint64_t>(event.data_offset);
        uint64_t max_read_index = std::min(data_offset + copy_size, static_cast<uint64_t>(event.data_size));

        uint64_t max_read_addr = static_cast<uint64_t>(event.data_addr) + max_read_index;
        uint64_t max_write_addr = static_cast<uint64_t>(event.dst_addr) + copy_size;

        trace.set(row,
                  { {
                      // Unconditional values
                      { C::data_copy_clk, event.execution_clk },
                      { C::data_copy_sel_start, 1 },
                      { C::data_copy_sel_cd_copy, is_cd_copy ? 1 : 0 },
                      { C::data_copy_sel_cd_copy_start, is_cd_copy ? 1 : 0 },
                      { C::data_copy_sel_rd_copy, is_rd_copy ? 1 : 0 },
                      { C::data_copy_sel_rd_copy_start, is_rd_copy ? 1 : 0 },
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

                      // Compute Max Read Index
                      { C::data_copy_offset_plus_size, data_offset + copy_size },
                      { C::data_copy_offset_plus_size_is_gt, data_offset + copy_size > event.data_size ? 1 : 0 },
                      { C::data_copy_max_read_index, max_read_index },

                      // Max Addresses
                      { C::data_copy_max_mem_addr, MAX_MEM_ADDR },
                      { C::data_copy_max_read_addr, max_read_addr },
                      { C::data_copy_max_write_addr, max_write_addr },

                  } });

        /////////////////////////////
        // Memory Address Range Check
        /////////////////////////////
        // We need to check that the read and write addresses are within the valid memory range.
        // Note: for enqueued calls, there is no out of bound read since we read from a column.

        bool read_address_overflow = max_read_addr > MAX_MEM_ADDR;
        bool write_address_overflow = max_write_addr > MAX_MEM_ADDR;
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

        auto reads_left = data_offset > max_read_index ? 0 : max_read_index - data_offset;

        /////////////////////////////
        // Check for Zero Sized Copy
        /////////////////////////////
        // This has to happen outside of the next loop since we will not enter it if the copy size is zero
        if (copy_size == 0) {
            trace.set(row,
                      { {
                          { C::data_copy_sel_start_no_err, 1 },
                          { C::data_copy_sel_end, 1 },
                          { C::data_copy_sel_write_count_is_zero, 1 },
                          { C::data_copy_write_count_zero_inv, copy_size == 0 ? 0 : FF(copy_size).invert() },
                      } });
            row++;
            continue; // Go to the next event
        }

        /////////////////////////////
        // Process Data Copy Rows
        /////////////////////////////
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
                          { C::data_copy_read_addr_plus_one, read_cd_col ? read_addr + 1 : 0 },

                          { C::data_copy_reads_left_inv, reads_left_inv },
                          { C::data_copy_padding, is_padding_row ? 1 : 0 },
                          { C::data_copy_value, value },

                          { C::data_copy_cd_copy_col_read, read_cd_col ? 1 : 0 },

                          // Reads Left
                          { C::data_copy_reads_left, reads_left },
                          { C::data_copy_offset_gt_max_read_index, (start && data_offset > max_read_index) ? 1 : 0 },

                          // Non-zero Copy Size
                          { C::data_copy_write_count_zero_inv, start ? FF(copy_size).invert() : 0 },
                      } });

            reads_left = reads_left == 0 ? 0 : reads_left - 1;
            row++;
        }
    }
}

const InteractionDefinition DataCopyTraceBuilder::interactions =
    InteractionDefinition()
        // Enqueued Call Col Read
        .add<lookup_data_copy_col_read_settings, InteractionType::LookupGeneric>()
        // GT checks
        .add<lookup_data_copy_max_read_index_gt_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        .add<lookup_data_copy_check_src_addr_in_range_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        .add<lookup_data_copy_check_dst_addr_in_range_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        .add<lookup_data_copy_offset_gt_max_read_index_settings, InteractionType::LookupGeneric>(Column::gt_sel);
} // namespace bb::avm2::tracegen
