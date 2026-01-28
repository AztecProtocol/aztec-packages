#include "barretenberg/avm_fuzzer/mutations/fault_injection/fault_injection.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/alu.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/bitwise.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/ecadd.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/gt.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/range_check.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/scalar_mul.hpp"
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
    case FaultInjectionEventOptions::BitwiseEvent:
        fault_injection_bitwise(events, rng);
        break;
    case FaultInjectionEventOptions::RangeCheckEvent:
        fault_injection_range_check(events, rng);
        break;
    case FaultInjectionEventOptions::GtEvent:
        fault_injection_gt(events, rng);
        break;
    case FaultInjectionEventOptions::EcaddEvent:
        fault_injection_ecadd(events, rng);
        break;
    case FaultInjectionEventOptions::ScalarMulEvent:
        fault_injection_scalar_mul(events, rng);
        break;
    }
}
