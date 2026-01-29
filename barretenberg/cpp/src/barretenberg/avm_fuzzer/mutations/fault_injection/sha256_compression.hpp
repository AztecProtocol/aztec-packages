#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

inline void fault_injection_sha256_compression(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.sha256_compression.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.sha256_compression.size() - 1)(rng);
    auto mutation = BASIC_FAULT_INJECTION_SHA256_COMPRESSION_EVENT_CONFIGURATION.select(rng);
    auto& event = events.sha256_compression[index];
    switch (mutation) {
    case FaultInjectionSha256CompressionEventOptions::State: {
        auto element = std::uniform_int_distribution<size_t>(0, event.state.size() - 1)(rng);
        event.state[element] = mutate_memory_value(event.state[element], rng);
        break;
    }
    case FaultInjectionSha256CompressionEventOptions::Input: {
        if (event.input.empty()) {
            return;
        }
        if (event.input.size() > 1 && std::uniform_int_distribution<uint8_t>(0, 3)(rng) == 0) {
            auto src = std::uniform_int_distribution<size_t>(0, event.input.size() - 1)(rng);
            auto dst = std::uniform_int_distribution<size_t>(0, event.input.size() - 1)(rng);
            event.input[dst] = event.input[src];
            return;
        }
        auto element = std::uniform_int_distribution<size_t>(0, event.input.size() - 1)(rng);
        event.input[element] = mutate_memory_value(event.input[element], rng);
        break;
    }
    case FaultInjectionSha256CompressionEventOptions::Output: {
        if (event.output.size() > 1 && std::uniform_int_distribution<uint8_t>(0, 3)(rng) == 0) {
            auto src = std::uniform_int_distribution<size_t>(0, event.output.size() - 1)(rng);
            auto dst = std::uniform_int_distribution<size_t>(0, event.output.size() - 1)(rng);
            event.output[dst] = event.output[src];
            return;
        }
        auto element = std::uniform_int_distribution<size_t>(0, event.output.size() - 1)(rng);
        event.output[element] = mutate_memory_value(event.output[element], rng);
        break;
    }
    case FaultInjectionSha256CompressionEventOptions::StateAddr:
        mutate_uint32_t(event.state_addr, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionSha256CompressionEventOptions::InputAddr:
        mutate_uint32_t(event.input_addr, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionSha256CompressionEventOptions::OutputAddr:
        mutate_uint32_t(event.output_addr, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionSha256CompressionEventOptions::SpaceId:
        mutate_uint16_t(event.space_id, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionSha256CompressionEventOptions::ExecutionClk:
        mutate_uint32_t(event.execution_clk, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    }
}

} // namespace bb::avm2::fuzzer
