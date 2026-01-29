#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint64_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

inline void fault_injection_merkle_check(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.merkle_check.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.merkle_check.size() - 1)(rng);
    auto mutation = BASIC_FAULT_INJECTION_MERKLE_CHECK_EVENT_CONFIGURATION.select(rng);
    auto& event = events.merkle_check[index];
    switch (mutation) {
    case FaultInjectionMerkleCheckEventOptions::LeafValue:
        mutate_field(event.leaf_value, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionMerkleCheckEventOptions::NewLeafValue:
        if (!event.new_leaf_value.has_value()) {
            return;
        }
        mutate_field(event.new_leaf_value.value(), rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionMerkleCheckEventOptions::NewLeafValueToggle:
        if (event.new_leaf_value.has_value()) {
            event.new_leaf_value.reset();
        } else {
            event.new_leaf_value = generate_random_field(rng);
        }
        break;
    case FaultInjectionMerkleCheckEventOptions::LeafIndex:
        mutate_uint64_t(event.leaf_index, rng, BASIC_UINT64_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionMerkleCheckEventOptions::SiblingPathElement: {
        if (event.sibling_path.empty()) {
            return;
        }
        auto element = std::uniform_int_distribution<size_t>(0, event.sibling_path.size() - 1)(rng);
        mutate_field(event.sibling_path[element], rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
    case FaultInjectionMerkleCheckEventOptions::SiblingPathResize:
        if (event.sibling_path.empty() || std::uniform_int_distribution<uint8_t>(0, 1)(rng) == 0) {
            event.sibling_path.push_back(generate_random_field(rng));
        } else {
            auto element = std::uniform_int_distribution<size_t>(0, event.sibling_path.size() - 1)(rng);
            event.sibling_path.erase(event.sibling_path.begin() + static_cast<std::ptrdiff_t>(element));
        }
        break;
    case FaultInjectionMerkleCheckEventOptions::Root:
        mutate_field(event.root, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionMerkleCheckEventOptions::NewRoot:
        if (!event.new_root.has_value()) {
            return;
        }
        mutate_field(event.new_root.value(), rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionMerkleCheckEventOptions::NewRootToggle:
        if (event.new_root.has_value()) {
            event.new_root.reset();
        } else {
            event.new_root = generate_random_field(rng);
        }
        break;
    }
}

} // namespace bb::avm2::fuzzer

