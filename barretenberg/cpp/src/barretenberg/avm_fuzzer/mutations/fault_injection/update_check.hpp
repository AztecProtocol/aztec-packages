#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint64_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

inline void fault_injection_update_check(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.update_check_events.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.update_check_events.size() - 1)(rng);
    auto mutation = BASIC_FAULT_INJECTION_UPDATE_CHECK_EVENT_CONFIGURATION.select(rng);
    auto& event = events.update_check_events[index];
    switch (mutation) {
    case FaultInjectionUpdateCheckEventOptions::Address:
        mutate_field(event.address, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionUpdateCheckEventOptions::CurrentClassId:
        mutate_field(event.current_class_id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionUpdateCheckEventOptions::OriginalClassId:
        mutate_field(event.original_class_id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionUpdateCheckEventOptions::PublicDataTreeRoot:
        mutate_field(event.public_data_tree_root, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionUpdateCheckEventOptions::CurrentTimestamp:
        mutate_uint64_t(event.current_timestamp, rng, BASIC_UINT64_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionUpdateCheckEventOptions::UpdateHash:
        mutate_field(event.update_hash, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionUpdateCheckEventOptions::UpdatePreimageMetadata:
        mutate_field(event.update_preimage_metadata, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionUpdateCheckEventOptions::UpdatePreimagePreClassId:
        mutate_field(event.update_preimage_pre_class_id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionUpdateCheckEventOptions::UpdatePreimagePostClassId:
        mutate_field(event.update_preimage_post_class_id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionUpdateCheckEventOptions::DelayedPublicMutableSlot:
        mutate_field(event.delayed_public_mutable_slot, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}

} // namespace bb::avm2::fuzzer
