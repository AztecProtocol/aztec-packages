#include "barretenberg/vm2/tracegen/memory_trace.hpp"

#include <memory>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

// Permutations.
#include "barretenberg/vm2/generated/relations/perms_addressing.hpp"
#include "barretenberg/vm2/generated/relations/perms_keccak_memory.hpp"
#include "barretenberg/vm2/generated/relations/perms_sha256_mem.hpp"

namespace bb::avm2::tracegen {

void MemoryTraceBuilder::process(const simulation::EventEmitterInterface<simulation::MemoryEvent>::Container& events,
                                 TraceContainer& trace)
{
    // Create a vector of pointers to avoid copying the events
    std::vector<const simulation::MemoryEvent*> event_ptrs;
    event_ptrs.reserve(events.size());

    for (const auto& event : events) {
        event_ptrs.push_back(&event);
    }

    std::ranges::sort(event_ptrs, [](const auto* lhs, const auto* rhs) { return lhs->operator<(*rhs); });

    using C = Column;

    uint32_t row = 0;
    for (const auto* event_ptr : event_ptrs) {
        trace.set(row,
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_clk, event_ptr->execution_clk },
                      { C::memory_address, event_ptr->addr },
                      { C::memory_value, event_ptr->value },
                      { C::memory_tag, static_cast<uint8_t>(event_ptr->value.get_tag()) },
                      { C::memory_rw, event_ptr->mode == simulation::MemoryMode::WRITE ? 1 : 0 },
                      { C::memory_space_id, event_ptr->space_id },
                  } });
        row++;
    }
}

const InteractionDefinition MemoryTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::MultiPermutation,
             // Addressing.
             perm_addressing_base_address_from_memory_settings,
             perm_addressing_indirect_from_memory_0_settings,
             perm_addressing_indirect_from_memory_1_settings,
             perm_addressing_indirect_from_memory_2_settings,
             perm_addressing_indirect_from_memory_3_settings,
             perm_addressing_indirect_from_memory_4_settings,
             perm_addressing_indirect_from_memory_5_settings,
             perm_addressing_indirect_from_memory_6_settings,
             // Keccak.
             perm_keccak_memory_slice_to_mem_settings,
             // Sha256.
             perm_sha256_mem_mem_op_0_settings,
             perm_sha256_mem_mem_op_1_settings,
             perm_sha256_mem_mem_op_2_settings,
             perm_sha256_mem_mem_op_3_settings,
             perm_sha256_mem_mem_op_4_settings,
             perm_sha256_mem_mem_op_5_settings,
             perm_sha256_mem_mem_op_6_settings,
             perm_sha256_mem_mem_op_7_settings,
             perm_sha256_mem_mem_input_read_settings
             // Others.
             >(Column::memory_sel);

} // namespace bb::avm2::tracegen
