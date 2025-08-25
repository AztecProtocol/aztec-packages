#include "barretenberg/vm2/tracegen/memory_trace.hpp"

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_memory.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

void MemoryTraceBuilder::process(const simulation::EventEmitterInterface<simulation::MemoryEvent>::Container& events,
                                 TraceContainer& trace)
{
    using simulation::MemoryEvent;
    using simulation::MemoryMode;

    // Create a vector of pointers to avoid copying the events.
    std::vector<const simulation::MemoryEvent*> event_ptrs;
    const size_t trace_size = events.size();
    event_ptrs.reserve(trace_size);

    for (const auto& event : events) {
        event_ptrs.push_back(&event);
    }

    std::ranges::sort(event_ptrs, [](const auto* lhs, const auto* rhs) { return lhs->operator<(*rhs); });

    using C = Column;

    // We use shift in this trace and keep the first row empty.
    uint32_t row = 1;

    for (uint32_t i = 0; i < trace_size; i++) {
        const auto& event = *event_ptrs[i];
        const bool is_last = i + 1 == trace_size;
        const auto& next_event = !is_last ? *event_ptrs[i + 1]
                                          : MemoryEvent{
                                                .execution_clk = 0,
                                                .mode = MemoryMode::READ,
                                                .addr = 0,
                                                .value = MemoryValue::from_tag(static_cast<ValueTag>(0), 0),
                                                .space_id = 0,
                                            };

        const uint64_t global_addr = (static_cast<uint64_t>(event.space_id) << 32) + event.addr;
        const uint64_t next_global_addr = (static_cast<uint64_t>(next_event.space_id) << 32) + next_event.addr;
        const uint64_t timestamp =
            (static_cast<uint64_t>(event.execution_clk) << 1) + static_cast<uint64_t>(event.mode);
        const uint64_t next_timestamp =
            (static_cast<uint64_t>(next_event.execution_clk) << 1) + static_cast<uint64_t>(next_event.mode);

        const bool last_access = global_addr != next_global_addr || is_last;
        const uint64_t two_consecutive_writes =
            static_cast<uint64_t>(event.mode) * static_cast<uint64_t>(next_event.mode);

        const uint64_t global_addr_diff = next_global_addr - global_addr;
        uint64_t diff = last_access ? global_addr_diff : (next_timestamp - timestamp - two_consecutive_writes);

        if (is_last) {
            diff = 0;
        }

        const bool sel_tag_is_ff = event.value.get_tag() == MemoryTag::FF;

        trace.set(row,
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_value, event.value },
                      { C::memory_tag, static_cast<uint8_t>(event.value.get_tag()) },
                      { C::memory_space_id, event.space_id },
                      { C::memory_address, event.addr },
                      { C::memory_clk, event.execution_clk },
                      { C::memory_rw, event.mode == MemoryMode::WRITE ? 1 : 0 },
                      { C::memory_sel_rng_chk, is_last ? 0 : 1 },
                      { C::memory_global_addr, global_addr },
                      { C::memory_timestamp, timestamp },
                      { C::memory_lastAccess, last_access },
                      { C::memory_glob_addr_diff_inv, last_access ? FF(global_addr_diff).invert() : FF(0) },
                      { C::memory_diff, diff },
                      { C::memory_limb_0_, diff & 0xFFFF },
                      { C::memory_limb_1_, (diff >> 16) & 0xFFFF },
                      { C::memory_limb_2_, (diff >> 32) },
                      { C::memory_sel_tag_is_ff, sel_tag_is_ff ? 1 : 0 },
                      { C::memory_tag_ff_diff_inv,
                        sel_tag_is_ff ? FF(0)
                                      : (FF(static_cast<uint8_t>(event.value.get_tag())) -
                                         FF(static_cast<uint8_t>(MemoryTag::FF)))
                                            .invert() },
                      { C::memory_sel_rng_write, (event.mode == MemoryMode::WRITE && !sel_tag_is_ff) ? 1 : 0 },
                      { C::memory_max_bits, get_tag_bits(event.value.get_tag()) },
                  } });
        row++;
    }
}

const InteractionDefinition MemoryTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_memory_range_check_limb_0_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_memory_range_check_limb_1_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_memory_range_check_limb_2_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_memory_tag_max_bits_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_memory_range_check_write_tagged_value_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
