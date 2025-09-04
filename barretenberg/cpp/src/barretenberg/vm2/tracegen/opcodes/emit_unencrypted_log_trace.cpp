#include "barretenberg/vm2/tracegen/opcodes/emit_unencrypted_log_trace.hpp"

#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_emit_unencrypted_log.hpp"
#include "barretenberg/vm2/simulation/events/emit_unencrypted_log_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

using C = Column;

void EmitUnencryptedLogTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::EmitUnencryptedLogEvent>::Container& events,
    TraceContainer& trace)
{
    uint32_t row = 1;
    process_with_discard(events, [&](const simulation::EmitUnencryptedLogWriteEvent& event, bool discard) {
        // error = error_too_large | error_out_of_bounds | error_too_many_logs | error_tag_mismatch | is_static
        // we split the above computation in 2 to reduce the degree of the full relation (7)
        bool error_too_many_logs_wrong_tag_is_static =
            event.error_too_many_logs || event.error_tag_mismatch || event.is_static;
        bool error =
            event.error_too_large || event.error_memory_out_of_bounds || error_too_many_logs_wrong_tag_is_static;

        FF log_address = FF(event.log_address);
        bool seen_wrong_tag = false;

        for (uint32_t i = 0; i < PUBLIC_LOG_SIZE_IN_FIELDS; ++i) {
            uint32_t remaining_rows = PUBLIC_LOG_SIZE_IN_FIELDS - 1 - i;
            FF remaining_rows_inv = remaining_rows == 0 ? 0 : FF(remaining_rows).invert();
            bool is_padding_row = i >= event.log_size;

            FF value = 0;
            ValueTag tag = ValueTag::FF;

            if (i < event.values.size()) {
                value = event.values[i].as_ff();
                tag = event.values[i].get_tag();
            }

            bool correct_tag = tag == ValueTag::FF;
            if (!correct_tag) {
                seen_wrong_tag = true;
            }
            uint8_t numeric_tag = static_cast<uint8_t>(tag);
            FF tag_inv = correct_tag ? 0 : FF(numeric_tag).invert();

            uint32_t max_logs_minus_emitted = MAX_PUBLIC_LOGS_PER_TX - event.prev_num_unencrypted_logs;
            FF max_logs_minus_emitted_inv = max_logs_minus_emitted == 0 ? 0 : FF(max_logs_minus_emitted).invert();

            uint32_t remaining_log_size = event.log_size > i ? event.log_size - i : 0;
            FF remaining_log_size_inv = remaining_log_size == 0 ? 0 : FF(remaining_log_size).invert();

            trace.set(row,
                      { {
                          { C::emit_unencrypted_log_sel, 1 },
                          { C::emit_unencrypted_log_execution_clk, event.execution_clk },
                          { C::emit_unencrypted_log_space_id, event.space_id },
                          { C::emit_unencrypted_log_log_address, log_address + i },
                          { C::emit_unencrypted_log_log_size, event.log_size },
                          { C::emit_unencrypted_log_contract_address, event.contract_address },
                          { C::emit_unencrypted_log_prev_num_unencrypted_logs, event.prev_num_unencrypted_logs },
                          { C::emit_unencrypted_log_next_num_unencrypted_logs, event.next_num_unencrypted_logs },
                          { C::emit_unencrypted_log_is_static, event.is_static },
                          { C::emit_unencrypted_log_error, error },
                          { C::emit_unencrypted_log_discard, discard },
                          { C::emit_unencrypted_log_start, i == 0 },
                          { C::emit_unencrypted_log_end, i == PUBLIC_LOG_SIZE_IN_FIELDS - 1 },
                          { C::emit_unencrypted_log_remaining_rows, remaining_rows },
                          { C::emit_unencrypted_log_remaining_rows_inv, remaining_rows_inv },
                          { C::emit_unencrypted_log_error_too_large, event.error_too_large },
                          { C::emit_unencrypted_log_max_log_size, PUBLIC_LOG_SIZE_IN_FIELDS },
                          { C::emit_unencrypted_log_error_out_of_bounds, event.error_memory_out_of_bounds },
                          { C::emit_unencrypted_log_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
                          { C::emit_unencrypted_log_end_log_address, log_address + event.log_size - 1 },
                          { C::emit_unencrypted_log_error_too_many_logs, event.error_too_many_logs },
                          { C::emit_unencrypted_log_max_logs_minus_emitted_inv, max_logs_minus_emitted_inv },
                          { C::emit_unencrypted_log_error_tag_mismatch, event.error_tag_mismatch },
                          { C::emit_unencrypted_log_seen_wrong_tag, seen_wrong_tag },
                          { C::emit_unencrypted_log_error_too_many_logs_wrong_tag_is_static,
                            error_too_many_logs_wrong_tag_is_static },
                          { C::emit_unencrypted_log_sel_should_write_to_public_inputs, !error && !discard },
                          { C::emit_unencrypted_log_is_padding_row, is_padding_row },
                          { C::emit_unencrypted_log_remaining_log_size, remaining_log_size },
                          { C::emit_unencrypted_log_remaining_log_size_inv, remaining_log_size_inv },
                          { C::emit_unencrypted_log_sel_should_read_memory,
                            !is_padding_row && !event.error_memory_out_of_bounds },
                          { C::emit_unencrypted_log_value, value },
                          { C::emit_unencrypted_log_tag, numeric_tag },
                          { C::emit_unencrypted_log_correct_tag, correct_tag },
                          { C::emit_unencrypted_log_tag_inv, tag_inv },
                          { C::emit_unencrypted_log_public_inputs_index,
                            AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX +
                                event.prev_num_unencrypted_logs * PUBLIC_LOG_SIZE_IN_FIELDS + i },
                      } });

            row++;
        }
    });
}

const InteractionDefinition EmitUnencryptedLogTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_emit_unencrypted_log_check_log_size_too_large_settings, InteractionType::LookupGeneric>()
        .add<lookup_emit_unencrypted_log_check_memory_out_of_bounds_settings, InteractionType::LookupGeneric>()
        .add<lookup_emit_unencrypted_log_write_log_to_public_inputs_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_emit_unencrypted_log_dispatch_exec_emit_unencrypted_log_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
