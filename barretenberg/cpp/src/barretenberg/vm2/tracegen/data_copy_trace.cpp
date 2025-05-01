#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"

#include <cassert>
#include <memory>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_data_copy.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

namespace bb::avm2::tracegen {

namespace {} // namespace

void DataCopyTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::DataCopyEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {

        [[maybe_unused]] uint32_t read_size = std::min(event.data_offset + event.data_copy_size, event.data_size);

        for (uint32_t i = 0; i < event.calldata.size(); i++) {
            bool is_cd_copy = event.operation == simulation::DataCopyOperation::CD_COPY;
            bool is_rd_copy = event.operation == simulation::DataCopyOperation::RD_COPY;

            uint32_t copy_size = event.data_copy_size - i;
            bool end = (copy_size - 1) == 0;
            FF next_write_count_inv = !end ? FF(copy_size - 1).invert() : 0;

            uint32_t write_addr = event.dst_addr + i;
            // Reads
            uint32_t read_addr = event.data_addr + event.data_offset + i; // Check for overflows
            uint32_t read_count = read_size - i;
            bool is_padding_row = read_count == 0;
            // Read from memory if this is not a padding row and we are either RD_COPY-ing or a nested CD_COPY
            bool sel_mem_read = !is_padding_row && (is_rd_copy || event.other_context_id != 0);
            FF value = is_padding_row ? 0 : event.calldata[i];
            FF read_count_inv = is_padding_row ? 0 : FF(read_count).invert();

            // TODO: Can optimise this as we only need the inverse if CD_COPY as well
            bool is_top_level = event.other_context_id == 0;
            FF parent_id_inv = is_top_level ? 0 : FF(event.other_context_id).invert();

            trace.set(row,
                      { {
                          { C::data_copy_sel_cd_copy, is_cd_copy ? 1 : 0 },
                          { C::data_copy_sel_rd_copy, is_rd_copy ? 1 : 0 },
                          { C::data_copy_operation_id, static_cast<uint8_t>(event.operation) },
                          // TODO
                          { C::data_copy_clk, 0 },

                          { C::data_copy_enqueued_call_id, 0 },
                          { C::data_copy_src_context_id, event.context_id },
                          { C::data_copy_dst_context_id, event.other_context_id },
                          { C::data_copy_data_copy_size, copy_size },
                          { C::data_copy_data_offset, event.data_offset },
                          { C::data_copy_data_addr, event.data_addr },
                          { C::data_copy_data_size, event.data_size },
                          { C::data_copy_write_addr, write_addr },

                          { C::data_copy_sel_start, i == 0 ? 1 : 0 },
                          { C::data_copy_sel_end, end ? 1 : 0 },
                          { C::data_copy_next_write_count_inv, next_write_count_inv },
                          { C::data_copy_one, 1 },

                          { C::data_copy_sel_mem_write, 1 },

                          { C::data_copy_is_top_level, is_top_level ? 1 : 0 },
                          { C::data_copy_parent_id_inv, parent_id_inv },

                          { C::data_copy_sel_mem_read, sel_mem_read ? 1 : 0 },
                          { C::data_copy_read_addr, read_addr },
                          { C::data_copy_read_count, read_count },
                          { C::data_copy_read_count_inv, read_count_inv },
                          { C::data_copy_padding, is_padding_row ? 1 : 0 },
                          { C::data_copy_value, value },

                          { C::data_copy_cd_copy_col_read, is_cd_copy && is_top_level ? 1 : 0 },
                          { C::data_copy_cd_index, i },
                      } });
        }
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> DataCopyTraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_data_copy_mem_read_settings_>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_data_copy_mem_write_settings_>>(),
        std::make_unique<LookupIntoDynamicTableGeneric<lookup_data_copy_col_read_settings_>>());
}

} // namespace bb::avm2::tracegen
