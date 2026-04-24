#include "barretenberg/vm2/tracegen/opcodes/emit_public_log_trace.hpp"

#include <cstdint>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_emit_public_log.hpp"
#include "barretenberg/vm2/simulation/events/emit_public_log_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

using C = Column;

/**
 * @brief Process emit-public-log events into trace rows.
 *
 * @param events The container of emit-public-log simulation events.
 * @param trace The trace container to populate with constrained columns.
 */
void EmitPublicLogTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::EmitPublicLogEvent>::Container& events, TraceContainer& trace)
{
    uint32_t row = 1;
    process_with_discard(events, [&](const simulation::EmitPublicLogWriteEvent& event, bool discard) {
        // error = error_out_of_bounds | error_too_many_log_fields | error_tag_mismatch | is_static
        bool error = event.error_memory_out_of_bounds || event.error_too_many_log_fields || event.error_tag_mismatch ||
                     event.is_static;

        FF log_address = FF(event.log_address);
        bool seen_wrong_tag = false;

        for (uint32_t i = 0; i < event.log_size + PUBLIC_LOG_HEADER_LENGTH; ++i) {
            bool is_log_length_row = i == 0;
            bool is_contract_address_row = i == 1;
            bool is_value_row = i > 1;
            uint32_t remaining_rows = PUBLIC_LOG_HEADER_LENGTH + event.log_size - 1 - i;

            FF value = 0;
            ValueTag tag = ValueTag::FF;

            if (is_value_row) {
                uint32_t value_index = i - PUBLIC_LOG_HEADER_LENGTH;
                if (value_index < event.values.size()) {
                    value = event.values[value_index].as_ff();
                    tag = event.values[value_index].get_tag();
                }
            }

            bool correct_tag = tag == ValueTag::FF;
            if (!correct_tag) {
                seen_wrong_tag = true;
            }

            uint32_t expected_next_log_fields =
                event.prev_num_public_log_fields + PUBLIC_LOG_HEADER_LENGTH + event.log_size;

            FF public_inputs_value = 0;

            if (is_log_length_row) {
                public_inputs_value = event.log_size;
            } else if (is_contract_address_row) {
                public_inputs_value = event.contract_address;
            } else if (is_value_row) {
                public_inputs_value = value;
            }

            trace.set(row,
                      { {
                          { C::emit_public_log_sel, 1 },
                          { C::emit_public_log_execution_clk, event.execution_clk },
                          { C::emit_public_log_space_id, event.space_id },
                          { C::emit_public_log_log_address, log_address },
                          { C::emit_public_log_log_size, event.log_size },
                          { C::emit_public_log_contract_address, event.contract_address },
                          { C::emit_public_log_prev_num_public_log_fields, event.prev_num_public_log_fields },
                          { C::emit_public_log_next_num_public_log_fields, event.next_num_public_log_fields },
                          { C::emit_public_log_is_static, event.is_static },
                          { C::emit_public_log_error, error },
                          { C::emit_public_log_discard, discard },
                          { C::emit_public_log_start, i == 0 },
                          { C::emit_public_log_end, i == event.log_size + PUBLIC_LOG_HEADER_LENGTH - 1 },
                          { C::emit_public_log_remaining_rows, remaining_rows },
                          { C::emit_public_log_remaining_rows_inv, remaining_rows }, // Will be inverted in batch later
                          { C::emit_public_log_error_out_of_bounds, event.error_memory_out_of_bounds },
                          { C::emit_public_log_max_mem_size, static_cast<uint64_t>(AVM_MEMORY_SIZE) },
                          { C::emit_public_log_end_log_address_upper_bound, log_address + event.log_size },
                          { C::emit_public_log_error_too_many_log_fields, event.error_too_many_log_fields },
                          { C::emit_public_log_expected_next_log_fields, expected_next_log_fields },
                          { C::emit_public_log_max_public_logs_payload_length, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH },
                          { C::emit_public_log_error_tag_mismatch, event.error_tag_mismatch },
                          { C::emit_public_log_seen_wrong_tag, seen_wrong_tag },
                          { C::emit_public_log_sel_write_to_public_inputs, !error && !discard },
                          { C::emit_public_log_is_write_contract_address, is_contract_address_row },
                          { C::emit_public_log_is_write_memory_value, is_value_row },
                          { C::emit_public_log_sel_read_memory, is_value_row && !event.error_memory_out_of_bounds },
                          { C::emit_public_log_value, value },
                          { C::emit_public_log_tag, static_cast<uint8_t>(tag) },
                          { C::emit_public_log_correct_tag, correct_tag },
                          { C::emit_public_log_tag_inv, static_cast<uint8_t>(tag) }, // Will be inverted in batch later
                          { C::emit_public_log_public_inputs_index,
                            AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX +
                                FLAT_PUBLIC_LOGS_HEADER_LENGTH + event.prev_num_public_log_fields + i },
                          { C::emit_public_log_public_inputs_value, public_inputs_value },
                      } });

            row++;
            if (is_value_row) {
                log_address++;
            }
        }
    });

    // Batch invert the columns.
    trace.invert_columns({ { C::emit_public_log_remaining_rows_inv, C::emit_public_log_tag_inv } });
}

const InteractionDefinition EmitPublicLogTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupGeneric, lookup_emit_public_log_check_log_fields_count_settings>(Column::gt_sel)
        .add<InteractionType::LookupGeneric, lookup_emit_public_log_check_memory_out_of_bounds_settings>(Column::gt_sel)
        .add<InteractionType::LookupIntoIndexedByRow, lookup_emit_public_log_write_data_to_public_inputs_settings>();

} // namespace bb::avm2::tracegen
