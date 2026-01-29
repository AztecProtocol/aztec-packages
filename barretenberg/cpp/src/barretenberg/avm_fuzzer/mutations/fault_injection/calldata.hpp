#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

inline void fault_injection_calldata(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.calldata_events.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.calldata_events.size() - 1)(rng);
    auto mutation = BASIC_FAULT_INJECTION_CALLDATA_EVENT_CONFIGURATION.select(rng);
    auto& event = events.calldata_events[index];
    switch (mutation) {
    case FaultInjectionCalldataEventOptions::ContextId:
        mutate_uint32_t(event.context_id, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionCalldataEventOptions::Calldata: {
        if (event.calldata.empty()) {
            return;
        }
        auto element = std::uniform_int_distribution<size_t>(0, event.calldata.size() - 1)(rng);
        mutate_field(event.calldata[element], rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
    }
}

} // namespace bb::avm2::fuzzer

