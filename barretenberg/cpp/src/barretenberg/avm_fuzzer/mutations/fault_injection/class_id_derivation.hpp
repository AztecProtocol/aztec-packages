#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

inline void fault_injection_class_id_derivation(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.class_id_derivation.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.class_id_derivation.size() - 1)(rng);
    auto mutation = BASIC_FAULT_INJECTION_CLASS_ID_DERIVATION_EVENT_CONFIGURATION.select(rng);
    auto& event = events.class_id_derivation[index];
    switch (mutation) {
    case FaultInjectionClassIdDerivationEventOptions::ClassId:
        mutate_field(event.klass.id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionClassIdDerivationEventOptions::ArtifactHash:
        mutate_field(event.klass.artifact_hash, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionClassIdDerivationEventOptions::PrivateFunctionsRoot:
        mutate_field(event.klass.private_functions_root, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionClassIdDerivationEventOptions::PublicBytecodeCommitment:
        mutate_field(event.klass.public_bytecode_commitment, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}

} // namespace bb::avm2::fuzzer
