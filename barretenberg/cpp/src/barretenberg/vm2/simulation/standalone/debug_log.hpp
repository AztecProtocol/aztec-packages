#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/debug_log.hpp"

namespace bb::avm2::simulation {

class NoopDebugLogger : public DebugLoggerInterface {
  public:
    void debug_log(MemoryInterface& /*memory*/,
                   AztecAddress /*contract_address*/,
                   MemoryAddress /*level_offset*/,
                   MemoryAddress /*message_offset*/,
                   uint16_t /*message_size*/,
                   MemoryAddress /*fields_offset*/,
                   MemoryAddress /*fields_size_offset*/) override
    {}
};

using LogFn = std::function<void(const std::string&)>;

class DebugLogger : public DebugLoggerInterface {
  public:
    DebugLogger(DebugLogLevel level, uint32_t max_memory_reads, LogFn log_fn)
        : level(level)
        , max_memory_reads(max_memory_reads)
        , log_fn(std::move(log_fn))
    {}

    void debug_log(MemoryInterface& memory,
                   AztecAddress contract_address,
                   MemoryAddress level_offset,
                   MemoryAddress message_offset,
                   uint16_t message_size,
                   MemoryAddress fields_offset,
                   MemoryAddress fields_size_offset) override;

    std::vector<DebugLog> dump_logs() { return std::move(debug_logs); }

  private:
    bool isLevelEnabled(DebugLogLevel level) const;

    static std::string applyStringFormatting(const std::string& formatStr, const std::span<FF>& args);

    DebugLogLevel level;
    uint32_t max_memory_reads;
    LogFn log_fn;

    std::vector<DebugLog> debug_logs;
    uint32_t total_memory_reads = 0;
};

} // namespace bb::avm2::simulation
