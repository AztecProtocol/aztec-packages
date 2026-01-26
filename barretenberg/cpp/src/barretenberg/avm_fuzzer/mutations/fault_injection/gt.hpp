#include "barretenberg/avm_fuzzer/mutations/basic_types/uint128_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>
namespace bb::avm2::fuzzer {

void fault_injection_gt(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.gt_events.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.gt_events.size() - 1)(rng);
    auto gt_mutation = BASIC_FAULT_INJECTION_GT_EVENT_CONFIGURATION.select(rng);
    switch (gt_mutation) {
    case FaultInjectionGtEventOptions::A:
        mutate_uint128_t(events.gt_events[index].a, rng, BASIC_UINT128_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionGtEventOptions::B:
        mutate_uint128_t(events.gt_events[index].b, rng, BASIC_UINT128_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionGtEventOptions::Result:
        events.gt_events[index].result ^= 1;
        break;
    }
}

} // namespace bb::avm2::fuzzer
