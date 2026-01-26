#include "barretenberg/avm_fuzzer/mutations/basic_types/uint128_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>
namespace bb::avm2::fuzzer {

void fault_injection_bitwise(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.bitwise.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.bitwise.size() - 1)(rng);
    auto bitwise_mutation = BASIC_FAULT_INJECTION_BITWISE_EVENT_CONFIGURATION.select(rng);
    switch (bitwise_mutation) {
    case FaultInjectionBitwiseEventOptions::Operand:
        if (std::uniform_int_distribution<size_t>(0, 1)(rng) == 0) {
            events.bitwise[index].a = mutate_memory_value(events.bitwise[index].a, rng);
        } else {
            events.bitwise[index].b = mutate_memory_value(events.bitwise[index].b, rng);
        }
        break;
    case FaultInjectionBitwiseEventOptions::Result:
        mutate_uint128_t(events.bitwise[index].res, rng, BASIC_UINT128_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBitwiseEventOptions::Operation:
        events.bitwise[index].operation =
            static_cast<BitwiseOperation>(std::uniform_int_distribution<size_t>(0, 3)(rng));
        break;
    }
}

} // namespace bb::avm2::fuzzer
