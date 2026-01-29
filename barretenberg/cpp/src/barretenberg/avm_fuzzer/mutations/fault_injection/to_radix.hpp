#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint8_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <algorithm>
#include <cstdint>
#include <random>
#include <vector>

namespace bb::avm2::fuzzer {

namespace detail {

enum class ToRadixFaultTarget : uint8_t { ToRadix, ToRadixMemory };

inline void fault_injection_to_radix_event(simulation::ToRadixEvent& event, std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_TORADIX_EVENT_CONFIGURATION.select(rng);
    switch (mutation) {
    case FaultInjectionToRadixEventOptions::Value:
        mutate_field(event.value, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionToRadixEventOptions::Radix:
        event.radix = std::uniform_int_distribution<uint32_t>(2, 256)(rng);
        break;
    case FaultInjectionToRadixEventOptions::Limbs: {
        if (event.limbs.empty()) {
            return;
        }
        auto index = std::uniform_int_distribution<size_t>(0, event.limbs.size() - 1)(rng);
        mutate_uint8_t(event.limbs[index], rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    }
    }
}

inline void fault_injection_to_radix_memory_event(simulation::ToRadixMemoryEvent& event, std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_TORADIX_MEMORY_EVENT_CONFIGURATION.select(rng);
    switch (mutation) {
    case FaultInjectionToRadixMemoryEventOptions::Value:
        mutate_field(event.value, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionToRadixMemoryEventOptions::Radix:
        mutate_uint32_t(event.radix, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionToRadixMemoryEventOptions::NumLimbs:
        if (event.limbs.empty()) {
            event.num_limbs = 0;
            break;
        }
        event.num_limbs = std::uniform_int_distribution<uint32_t>(0, static_cast<uint32_t>(event.limbs.size()))(rng);
        break;
    case FaultInjectionToRadixMemoryEventOptions::DstAddress:
        mutate_uint32_t(event.dst_addr, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionToRadixMemoryEventOptions::SpaceId:
        mutate_uint16_t(event.space_id, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionToRadixMemoryEventOptions::ExecutionClk:
        mutate_uint32_t(event.execution_clk, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionToRadixMemoryEventOptions::IsOutputBits:
        event.is_output_bits = !event.is_output_bits;
        break;
    case FaultInjectionToRadixMemoryEventOptions::Limbs: {
        if (event.limbs.empty()) {
            return;
        }
        auto index = std::uniform_int_distribution<size_t>(0, event.limbs.size() - 1)(rng);
        event.limbs[index] = mutate_memory_value(event.limbs[index], rng);
        break;
    }
    }
}

} // namespace detail

inline void fault_injection_to_radix(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    std::vector<detail::ToRadixFaultTarget> targets;
    if (!events.to_radix.empty()) {
        targets.push_back(detail::ToRadixFaultTarget::ToRadix);
    }
    if (!events.to_radix_memory.empty()) {
        targets.push_back(detail::ToRadixFaultTarget::ToRadixMemory);
    }
    if (targets.empty()) {
        return;
    }

    auto target = targets[std::uniform_int_distribution<size_t>(0, targets.size() - 1)(rng)];
    switch (target) {
    case detail::ToRadixFaultTarget::ToRadix: {
        auto index = std::uniform_int_distribution<size_t>(0, events.to_radix.size() - 1)(rng);
        detail::fault_injection_to_radix_event(events.to_radix[index], rng);
        break;
    }
    case detail::ToRadixFaultTarget::ToRadixMemory: {
        auto index = std::uniform_int_distribution<size_t>(0, events.to_radix_memory.size() - 1)(rng);
        detail::fault_injection_to_radix_memory_event(events.to_radix_memory[index], rng);
        break;
    }
    }
}

} // namespace bb::avm2::fuzzer
