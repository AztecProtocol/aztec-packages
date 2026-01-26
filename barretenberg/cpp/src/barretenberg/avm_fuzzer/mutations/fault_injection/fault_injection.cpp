#include "barretenberg/avm_fuzzer/mutations/fault_injection/fault_injection.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/fault_injection_alu.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>
using namespace bb::avm2::simulation;

void bb::avm2::fuzzer::fault_injection(EventsContainer& events, std::mt19937_64& rng)
{
    FaultInjectionEventOptions option = BASIC_FAULT_INJECTION_EVENT_CONFIGURATION.select(rng);
    switch (option) {
    case FaultInjectionEventOptions::AluEvent:
        fault_injection_alu(events, rng);
        break;
    }
}
