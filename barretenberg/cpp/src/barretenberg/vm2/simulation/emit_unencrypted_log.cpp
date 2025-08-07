#include "barretenberg/vm2/simulation/emit_unencrypted_log.hpp"

#include <cassert>
#include <cstdint>
#include <stdexcept>

namespace bb::avm2::simulation {

void EmitUnencryptedLog::emit_unencrypted_log(MemoryInterface& memory,
                                              ContextInterface& context,
                                              AztecAddress contract_address,
                                              MemoryAddress log_address,
                                              uint32_t log_size)
{
    bool error_too_large = greater_than.gt(log_size, PUBLIC_LOG_SIZE_IN_FIELDS);

    uint64_t end_log_address = static_cast<uint64_t>(log_address) + static_cast<uint64_t>(log_size) - 1;
    bool error_memory_out_of_bounds = greater_than.gt(end_log_address, AVM_HIGHEST_MEM_ADDRESS);

    SideEffectStates side_effect_states = context.get_side_effect_states();
    uint32_t log_index = side_effect_states.numUnencryptedLogs;

    bool error_too_many_logs = log_index == MAX_PUBLIC_LOGS_PER_TX;

    bool error_is_static = context.get_is_static();

    // Will be computed in the loop below
    bool error_tag_mismatch = false;

    std::vector<MemoryValue> values;
    values.reserve(PUBLIC_LOG_SIZE_IN_FIELDS);

    uint32_t num_memory_reads = 0;
    if (!error_memory_out_of_bounds) {
        num_memory_reads = std::min<uint32_t>(log_size, PUBLIC_LOG_SIZE_IN_FIELDS);
    }

    for (uint32_t i = 0; i < num_memory_reads; ++i) {
        MemoryValue value = memory.get(log_address + i);
        if (value.get_tag() != ValueTag::FF) {
            error_tag_mismatch = true;
        }
        values.push_back(value);
    }

    bool error =
        error_too_large || error_memory_out_of_bounds || error_too_many_logs || error_tag_mismatch || error_is_static;

    if (!error) {
        side_effect_states.numUnencryptedLogs = log_index + 1;
    }
    context.set_side_effect_states(side_effect_states);

    events.emit(EmitUnencryptedLogWriteEvent{
        .execution_clk = execution_id_manager.get_execution_id(),
        .contract_address = contract_address,
        .space_id = memory.get_space_id(),
        .log_address = log_address,
        .log_size = log_size,
        .prev_num_unencrypted_logs = log_index,
        .next_num_unencrypted_logs = side_effect_states.numUnencryptedLogs,
        .is_static = error_is_static,
        .values = values,
        .error_too_large = error_too_large,
        .error_memory_out_of_bounds = error_memory_out_of_bounds,
        .error_too_many_logs = error_too_many_logs,
        .error_tag_mismatch = error_tag_mismatch,
    });

    if (error_too_large) {
        throw EmitUnencryptedLogException("Log size too large");
    }
    if (error_memory_out_of_bounds) {
        throw EmitUnencryptedLogException("Memory out of bounds");
    }
    if (error_too_many_logs) {
        throw EmitUnencryptedLogException("Too many logs");
    }
    if (error_tag_mismatch) {
        throw EmitUnencryptedLogException("Tag mismatch");
    }
    if (error_is_static) {
        throw EmitUnencryptedLogException("Static context");
    }
}

void EmitUnencryptedLog::on_checkpoint_created()
{
    events.emit(CheckPointEventType::CREATE_CHECKPOINT);
}

void EmitUnencryptedLog::on_checkpoint_committed()
{
    events.emit(CheckPointEventType::COMMIT_CHECKPOINT);
}

void EmitUnencryptedLog::on_checkpoint_reverted()
{
    events.emit(CheckPointEventType::REVERT_CHECKPOINT);
}

} // namespace bb::avm2::simulation
