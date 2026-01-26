#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>
namespace bb::avm2::fuzzer {

void fault_injection_alu(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    if (events.alu.empty()) {
        return;
    }
    auto index = std::uniform_int_distribution<size_t>(0, events.alu.size() - 1)(rng);
    auto alu_mutation = BASIC_FAULT_INJECTION_ALU_EVENT_CONFIGURATION.select(rng);
    switch (alu_mutation) {
    case FaultInjectionAluEventOptions::Operand:
        if (std::uniform_int_distribution<size_t>(0, 1)(rng) == 0 ||
            events.alu[index].operation == simulation::AluOperation::NOT) {
            events.alu[index].a = mutate_memory_value(events.alu[index].a, rng);
        } else {
            events.alu[index].b = mutate_memory_value(events.alu[index].b, rng);
        }
        break;
    case FaultInjectionAluEventOptions::Result:
        events.alu[index].c = mutate_memory_value(events.alu[index].c, rng);
        break;
    case FaultInjectionAluEventOptions::Operation:
        events.alu[index].operation =
            static_cast<simulation::AluOperation>(std::uniform_int_distribution<size_t>(0, 11)(rng));
        break;
    case FaultInjectionAluEventOptions::FlipError:
        events.alu[index].error = !events.alu[index].error;
        break;
    }
}

} // namespace bb::avm2::fuzzer
