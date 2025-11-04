#include "barretenberg/vm2/simulation/standalone/debug_log.hpp"

#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"

namespace bb::avm2::simulation {

bool DebugLogger::isLevelEnabled(DebugLogLevel level) const
{
    return this->level != DebugLogLevel::SILENT && level <= this->level;
}

std::string DebugLogger::applyStringFormatting(const std::string& formatStr, const std::span<FF>& args)
{
    // TODO(Alvaro): Change behavior to mimic applyStringFormatting in TS
    std::string message_as_str;
    message_as_str = formatStr + ": [";

    // Add fields
    for (uint32_t i = 0; i < args.size(); ++i) {
        message_as_str += field_to_string(args[i]);
        if (i < args.size() - 1) {
            message_as_str += ", ";
        }
    }
    message_as_str += "]";

    return message_as_str;
}

void DebugLogger::debug_log(MemoryInterface& memory,
                            AztecAddress contract_address,
                            MemoryAddress level_offset,
                            MemoryAddress message_offset,
                            uint16_t message_size,
                            MemoryAddress fields_offset,
                            MemoryAddress fields_size_offset)
{
    // This is a workaround. Do not copy or use in other places.
    auto unconstrained_read = [&memory](MemoryAddress offset) {
        Memory* memory_ptr = dynamic_cast<Memory*>(&memory);
        if (memory_ptr) {
            // This means that we are using the event generating memory.
            return memory_ptr->unconstrained_get(offset);
        } else {
            // This assumes that any other type will not generate events.
            return memory.get(offset);
        }
    };

    // Get the level and validate its tag
    const auto level_value = unconstrained_read(level_offset);
    const uint8_t level_number = level_value.as<uint8_t>();

    // Get the fields size and validate its tag
    const auto fields_size_value = unconstrained_read(fields_size_offset);
    const uint32_t fields_size = fields_size_value.as<uint32_t>();

    const uint32_t memory_reads =
        1 /* level */ + 1 /* fields_size */ + message_size /* message */ + fields_size; /* fields */

    if (memory_reads + total_memory_reads > max_memory_reads) {
        // Unrecoverable error
        throw std::runtime_error(
            "Max debug log memory reads exceeded: " + std::to_string(memory_reads + total_memory_reads) + " > " +
            std::to_string(max_memory_reads));
    }

    // Read message and fields from memory
    std::string message_as_str;
    for (uint32_t i = 0; i < message_size; ++i) {
        const auto message_field = unconstrained_read(message_offset + i);
        message_as_str += static_cast<char>(static_cast<uint8_t>(message_field.as_ff()));
    }
    std::vector<FF> fields;
    fields.reserve(fields_size);

    // Read fields
    for (uint32_t i = 0; i < fields_size; ++i) {
        const auto field = unconstrained_read(fields_offset + i);
        fields.push_back(field.as_ff());
    }

    if (!is_valid_debug_log_level(level_number)) {
        throw std::runtime_error("Invalid debug log level: " + std::to_string(level_number));
    }
    const DebugLogLevel level = static_cast<DebugLogLevel>(level_number);

    debug_logs.push_back({ contract_address, debug_log_level_to_string(level), message_as_str, fields });

    if (isLevelEnabled(level)) {
        log_fn("DEBUGLOG(" + debug_log_level_to_string(level) + "): " + applyStringFormatting(message_as_str, fields));
    }
}

} // namespace bb::avm2::simulation
