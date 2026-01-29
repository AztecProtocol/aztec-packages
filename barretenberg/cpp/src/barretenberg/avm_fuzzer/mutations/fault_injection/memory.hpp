#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

inline void fault_injection_memory(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.memory.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.memory.size() - 1)(rng);
    auto mutation = BASIC_FAULT_INJECTION_MEMORY_EVENT_CONFIGURATION.select(rng);
    switch (mutation) {
    case FaultInjectionMemoryEventOptions::Value:
        events.memory[index].value = mutate_memory_value(events.memory[index].value, rng);
        break;
    case FaultInjectionMemoryEventOptions::Address:
        mutate_uint32_t(events.memory[index].addr, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionMemoryEventOptions::SpaceId:
        mutate_uint16_t(events.memory[index].space_id, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionMemoryEventOptions::ExecutionClk:
        mutate_uint32_t(events.memory[index].execution_clk, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionMemoryEventOptions::Mode:
        events.memory[index].mode = events.memory[index].mode == simulation::MemoryMode::READ
                                        ? simulation::MemoryMode::WRITE
                                        : simulation::MemoryMode::READ;
        break;
    }
}

} // namespace bb::avm2::fuzzer
