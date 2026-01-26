#include "barretenberg/avm_fuzzer/mutations/basic_types/uint128_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>
namespace bb::avm2::fuzzer {

void fault_injection_range_check(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.range_check.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.range_check.size() - 1)(rng);
    auto range_check_mutation = BASIC_FAULT_INJECTION_RANGE_CHECK_EVENT_CONFIGURATION.select(rng);
    switch (range_check_mutation) {
    case FaultInjectionRangeCheckEventOptions::Value:
        mutate_uint128_t(events.range_check[index].value, rng, BASIC_UINT128_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionRangeCheckEventOptions::NumBits:
        events.range_check[index].num_bits = std::uniform_int_distribution<uint8_t>(1, 128)(rng);
        break;
    }
}

} // namespace bb::avm2::fuzzer
