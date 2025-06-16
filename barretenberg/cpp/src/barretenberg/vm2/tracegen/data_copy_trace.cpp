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

                      { C::data_copy_data_copy_size, event.data_copy_size.as_ff() }, // FF since it could be anything
                      { C::data_copy_data_copy_size_mem_tag, static_cast<uint8_t>(event.data_copy_size.get_tag()) },
                      { C::data_copy_data_offset, event.data_offset.as_ff() }, // FF since it could be anything
                      { C::data_copy_data_offset_mem_tag, static_cast<uint8_t>(event.data_offset.get_tag()) },

                      { C::data_copy_data_addr, event.data_addr },
                      { C::data_copy_data_size, event.data_size },
                      { C::data_copy_write_addr, event.dst_addr },

                      { C::data_copy_is_top_level, is_top_level ? 1 : 0 },
                      { C::data_copy_parent_id_inv, parent_id_inv },
                  } });

        // The first possible error is the tag check error for data_copy_size and data_offset.
        // They need to be ValueTag::U32, otherwise we terminate immediately with an error.
        if (event.data_copy_size.get_tag() != ValueTag::U32 || event.data_offset.get_tag() != ValueTag::U32) {
            trace.set(row,
                      { {
                          { C::data_copy_sel_end, 1 },
                          { C::data_copy_tag_check_err, 1 },
                          { C::data_copy_err, 1 },
                      } });
            row++;
            continue; // Go to the next event
        }

        // At this point data copy size and data offset are guaranteed to be U32
        // Cast to a wider integer type to detect overflows
        uint64_t copy_size = static_cast<uint64_t>(event.data_copy_size.as<uint32_t>());
        uint64_t data_offset = static_cast<uint64_t>(event.data_offset.as<uint32_t>());

        uint64_t read_size = std::min(data_offset + copy_size, static_cast<uint64_t>(event.data_size));

        // The final possible error is to check that we do not try to read or write out of bounds memory.
        // Note: for enqueued calls, there is no out of bound read since we read from a column.

        // Additions done over uint64_t to avoid overflow issues
        uint64_t read_addr = static_cast<uint64_t>(event.data_addr) + data_offset;
        uint64_t max_read = (read_size + read_addr) * (event.is_nested ? 1 : 0); // 0 if enqueued call
        uint64_t max_write = static_cast<uint64_t>(event.dst_addr) + copy_size;

        bool read_address_overflow = max_read > MAX_MEM_ADDR;
        bool write_address_overflow = max_write > MAX_MEM_ADDR;
        if (read_address_overflow || write_address_overflow) {
            trace.set(
                row,
                { {
                    { C::data_copy_sel_end, 1 },
                    // Add error flag - not we can be out of range for both reads and writes
                    { C::data_copy_src_out_of_range_err, read_address_overflow ? 1 : 0 },
                    { C::data_copy_dst_out_of_range_err, write_address_overflow ? 1 : 0 },
                    { C::data_copy_err, 1 },

                    { C::data_copy_read_addr, read_addr },
                    { C::data_copy_read_count, read_size },
                    { C::data_copy_read_count_inv, FF(read_size).invert() },
                    { C::data_copy_data_size_is_lt, static_cast<uint64_t>(event.data_size) < data_offset + copy_size },
                    // For range checking - we want to explicitly show that max_X > MAX_MEM_ADDR (hence the -1)
                    { C::data_copy_abs_read_diff, max_read - MAX_MEM_ADDR - 1 },
                    { C::data_copy_abs_write_diff, max_write - MAX_MEM_ADDR - 1 },
                } });
            row++;
            continue; // Go to the next event
        }

        // At this point it's safe to perform the data copy operation since there are no longer any errors.

        // This helps in proving read_size = min(read_size, data_offset + copy_size)
        bool is_data_size_lt = static_cast<uint64_t>(event.data_size) < (data_offset + copy_size);
        uint64_t abs_read_count_diff = is_data_size_lt
                                           ? (data_offset + copy_size) - read_addr - 1
                                           : static_cast<uint64_t>(event.data_size) - (data_offset + copy_size);

        for (uint32_t i = 0; i < event.calldata.size(); i++) {
            bool start = i == 0;
            auto current_copy_size = copy_size - i;
            bool end = (current_copy_size - 1) == 0;

            // Short term for some sanity checks
            assert(end && i == event.calldata.size() - 1);

            auto read_count = read_size - i;
            bool is_padding_row = read_count == 0;

            // These are guaranteed not to overflow since we checked the read/write addresses above
            auto write_addr = event.dst_addr + i;
            auto read_addr = is_top_level ? 0 : event.data_addr + data_offset + i;
            bool read_cd_col = is_cd_copy && is_top_level && !is_padding_row;

            // Read from memory if this is not a padding row and we are either RD_COPY-ing or a nested CD_COPY
            bool sel_mem_read = !is_padding_row && (is_rd_copy || event.read_context_id != 0);
            FF value = is_padding_row ? 0 : event.calldata[i];
            FF read_count_inv = is_padding_row ? 0 : FF(read_count).invert();

            FF next_write_count_inv = !end ? FF(current_copy_size).invert() : 0;

            trace.set(
                row,
                { {
                    { C::data_copy_clk, event.execution_clk },
                    { C::data_copy_sel_cd_copy, is_cd_copy ? 1 : 0 },
                    { C::data_copy_sel_rd_copy, is_rd_copy ? 1 : 0 },
                    { C::data_copy_operation_id, static_cast<uint8_t>(event.operation) },

                    { C::data_copy_src_context_id, event.read_context_id },
                    { C::data_copy_dst_context_id, event.write_context_id },
                    { C::data_copy_data_copy_size, current_copy_size },
                    { C::data_copy_data_offset, event.data_offset },
                    { C::data_copy_data_addr, event.data_addr },
                    { C::data_copy_data_size, event.data_size },
                    { C::data_copy_write_addr, write_addr },

                    { C::data_copy_sel_start, start ? 1 : 0 },
                    { C::data_copy_sel_end, end ? 1 : 0 },
                    { C::data_copy_next_write_count_inv, next_write_count_inv },

                    { C::data_copy_sel_mem_write, 1 },

                    { C::data_copy_is_top_level, is_top_level ? 1 : 0 },
                    { C::data_copy_parent_id_inv, parent_id_inv },

                    { C::data_copy_sel_mem_read, sel_mem_read ? 1 : 0 },
                    { C::data_copy_read_addr, read_addr },
                    { C::data_copy_read_count, read_count },
                    { C::data_copy_data_size_is_lt, is_data_size_lt ? 1 : 0 },
                    { C::data_copy_abs_read_count_diff, abs_read_count_diff },
                    { C::data_copy_abs_read_diff, start ? MAX_MEM_ADDR - max_read : 0 },   // MAX_MEM_ADDR >= max_read
                    { C::data_copy_abs_write_diff, start ? MAX_MEM_ADDR - max_write : 0 }, // MAX_MEM_ADDR >= max_write

                    { C::data_copy_read_count_inv, read_count_inv },
                    { C::data_copy_padding, is_padding_row ? 1 : 0 },
                    { C::data_copy_value, value },

                    { C::data_copy_cd_copy_col_read, read_cd_col ? 1 : 0 },
                    { C::data_copy_cd_index, (i + 1) },
                } });
        }

        row++;
    }
}

const InteractionDefinition DataCopyTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_data_copy_mem_read_settings, InteractionType::LookupGeneric>()
        .add<lookup_data_copy_mem_write_settings, InteractionType::LookupGeneric>()
        .add<lookup_data_copy_col_read_settings, InteractionType::LookupGeneric>()
        .add<lookup_data_copy_range_count_diff_settings, InteractionType::LookupGeneric>()
        .add<lookup_data_copy_range_read_settings, InteractionType::LookupGeneric>()
        .add<lookup_data_copy_range_write_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
