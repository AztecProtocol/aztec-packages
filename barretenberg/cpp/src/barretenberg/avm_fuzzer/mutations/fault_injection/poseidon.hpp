#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <cstdint>
#include <random>
#include <vector>

namespace bb::avm2::fuzzer {

namespace detail {

enum class Poseidon2FaultTarget : uint8_t { Hash, Permutation, PermutationMemory };

inline void fault_injection_poseidon2_hash(simulation::Poseidon2HashEvent& event, std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_POSEIDON2_HASH_EVENT_CONFIGURATION.select(rng);
    if (event.inputs.empty() && event.intermediate_states.empty()) {
        mutation = FaultInjectionPoseidon2HashEventOptions::Output;
    }
    switch (mutation) {
    case FaultInjectionPoseidon2HashEventOptions::Input: {
        if (event.inputs.empty()) {
            return;
        }
        auto index = std::uniform_int_distribution<size_t>(0, event.inputs.size() - 1)(rng);
        mutate_field(event.inputs[index], rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
    case FaultInjectionPoseidon2HashEventOptions::IntermediateState: {
        if (event.intermediate_states.empty()) {
            return;
        }
        auto state_index = std::uniform_int_distribution<size_t>(0, event.intermediate_states.size() - 1)(rng);
        auto element_index = std::uniform_int_distribution<size_t>(0, 3)(rng);
        mutate_field(event.intermediate_states[state_index][element_index], rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
    case FaultInjectionPoseidon2HashEventOptions::Output:
        mutate_field(event.output, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}

inline void fault_injection_poseidon2_permutation(simulation::Poseidon2PermutationEvent& event, std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_POSEIDON2_PERM_EVENT_CONFIGURATION.select(rng);
    auto index = std::uniform_int_distribution<size_t>(0, 3)(rng);
    switch (mutation) {
    case FaultInjectionPoseidon2PermEventOptions::Input:
        mutate_field(event.input[index], rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionPoseidon2PermEventOptions::Output:
        mutate_field(event.output[index], rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}

inline void fault_injection_poseidon2_perm_memory(simulation::Poseidon2PermutationMemoryEvent& event,
                                                  std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_POSEIDON2_PERM_MEMORY_EVENT_CONFIGURATION.select(rng);
    auto index = std::uniform_int_distribution<size_t>(0, 3)(rng);
    switch (mutation) {
    case FaultInjectionPoseidon2PermMemoryEventOptions::Input:
        event.input[index] = mutate_memory_value(event.input[index], rng);
        break;
    case FaultInjectionPoseidon2PermMemoryEventOptions::Output:
        mutate_field(event.output[index], rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionPoseidon2PermMemoryEventOptions::SrcAddress:
        mutate_uint32_t(event.src_address, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionPoseidon2PermMemoryEventOptions::DstAddress:
        mutate_uint32_t(event.dst_address, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionPoseidon2PermMemoryEventOptions::SpaceId:
        mutate_uint16_t(event.space_id, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionPoseidon2PermMemoryEventOptions::ExecutionClk:
        mutate_uint32_t(event.execution_clk, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    }
}

} // namespace detail

inline void fault_injection_poseidon(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    std::vector<detail::Poseidon2FaultTarget> targets;
    if (!events.poseidon2_hash.empty()) {
        targets.push_back(detail::Poseidon2FaultTarget::Hash);
    }
    if (!events.poseidon2_permutation.empty()) {
        targets.push_back(detail::Poseidon2FaultTarget::Permutation);
    }
    if (!events.poseidon2_permutation_mem.empty()) {
        targets.push_back(detail::Poseidon2FaultTarget::PermutationMemory);
    }
    if (targets.empty()) {
        return;
    }

    auto target = targets[std::uniform_int_distribution<size_t>(0, targets.size() - 1)(rng)];
    switch (target) {
    case detail::Poseidon2FaultTarget::Hash: {
        auto index = std::uniform_int_distribution<size_t>(0, events.poseidon2_hash.size() - 1)(rng);
        detail::fault_injection_poseidon2_hash(events.poseidon2_hash[index], rng);
        break;
    }
    case detail::Poseidon2FaultTarget::Permutation: {
        auto index = std::uniform_int_distribution<size_t>(0, events.poseidon2_permutation.size() - 1)(rng);
        detail::fault_injection_poseidon2_permutation(events.poseidon2_permutation[index], rng);
        break;
    }
    case detail::Poseidon2FaultTarget::PermutationMemory: {
        auto index = std::uniform_int_distribution<size_t>(0, events.poseidon2_permutation_mem.size() - 1)(rng);
        detail::fault_injection_poseidon2_perm_memory(events.poseidon2_permutation_mem[index], rng);
        break;
    }
    }
}

} // namespace bb::avm2::fuzzer
