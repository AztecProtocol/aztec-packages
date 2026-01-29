#pragma once
#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

inline void mutate_embedded_curve_point(EmbeddedCurvePoint& point, std::mt19937_64& rng)
{
    EmbeddedCurvePointMutationOptions option = BASIC_EMBEDDED_CURVE_POINT_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case EmbeddedCurvePointMutationOptions::SetIdentity:
        point = EmbeddedCurvePoint::infinity();
        break;
    case EmbeddedCurvePointMutationOptions::SetGenerator:
        point = EmbeddedCurvePoint::one();
        break;
    case EmbeddedCurvePointMutationOptions::SetInvalid:
        point = EmbeddedCurvePoint(generate_random_field(rng), generate_random_field(rng), false);
        break;
    case EmbeddedCurvePointMutationOptions::SetInfiniteWithNonZeroX:
        point = EmbeddedCurvePoint(generate_random_field(rng), 0, true);
        break;
    }
}

inline void fault_injection_ecadd(bb::avm2::simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.ecc_add.empty()) {
        return;
    }
    uint32_t choice = std::uniform_int_distribution<uint32_t>(0, 2)(rng);
    size_t index = std::uniform_int_distribution<size_t>(0, events.ecc_add.size() - 1)(rng);
    switch (choice) {
    case 0:
        mutate_embedded_curve_point(events.ecc_add[index].p, rng);
        break;
    case 1:
        mutate_embedded_curve_point(events.ecc_add[index].q, rng);
        break;
    case 2:
        mutate_embedded_curve_point(events.ecc_add[index].result, rng);
        break;
    default:
        throw std::runtime_error("unreachable");
    }
}

inline void fault_injection_ecadd_memory(bb::avm2::simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.ecc_add_mem.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.ecc_add_mem.size() - 1)(rng);
    auto option = BASIC_FAULT_INJECTION_ECCADD_MEMORY_EVENT_CONFIGURATION.select(rng);
    switch (option) {
    case FaultInjectionEccAddMemoryEventOptions::PointP:
        mutate_embedded_curve_point(events.ecc_add_mem[index].p, rng);
        break;
    case FaultInjectionEccAddMemoryEventOptions::PointQ:
        mutate_embedded_curve_point(events.ecc_add_mem[index].q, rng);
        break;
    case FaultInjectionEccAddMemoryEventOptions::Result:
        mutate_embedded_curve_point(events.ecc_add_mem[index].result, rng);
        break;
    case FaultInjectionEccAddMemoryEventOptions::DstAddress:
        mutate_uint32_t(events.ecc_add_mem[index].dst_address, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionEccAddMemoryEventOptions::SpaceId:
        mutate_uint16_t(events.ecc_add_mem[index].space_id, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionEccAddMemoryEventOptions::ExecutionClk:
        mutate_uint32_t(events.ecc_add_mem[index].execution_clk, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    }
}

} // namespace bb::avm2::fuzzer
