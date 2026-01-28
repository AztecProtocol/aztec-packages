#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/ecadd.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <random>

namespace bb::avm2::fuzzer {

void mutate_intermediate_state(bb::avm2::simulation::ScalarMulIntermediateState& intermediate_state,
                               std::mt19937_64& rng)
{
    ScalarMulIntermediateStateMutationOptions option =
        BASIC_SCALAR_MUL_INTERMEDIATE_STATE_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case ScalarMulIntermediateStateMutationOptions::Res:
        mutate_embedded_curve_point(intermediate_state.res, rng);
        break;
    case ScalarMulIntermediateStateMutationOptions::Temp:
        mutate_embedded_curve_point(intermediate_state.temp, rng);
        break;
    case ScalarMulIntermediateStateMutationOptions::FlipBit:
        intermediate_state.bit = !intermediate_state.bit;
        break;
    }
}

void fault_injection_scalar_mul(bb::avm2::simulation::EventsContainer& events, std::mt19937_64& rng)
{
    FaultInjectionScalarMul option = BASIC_FAULT_INJECTION_SCALAR_MUL_MUTATION_CONFIGURATION.select(rng);
    size_t index = std::uniform_int_distribution<size_t>(0, events.scalar_mul.size() - 1)(rng);
    switch (option) {
    case FaultInjectionScalarMul::Point:
        mutate_embedded_curve_point(events.scalar_mul[index].point, rng);
        break;
    case FaultInjectionScalarMul::SetScalarZero:
        events.scalar_mul[index].scalar = 0;
        break;
    case FaultInjectionScalarMul::MutateScalar:
        mutate_field(events.scalar_mul[index].scalar, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionScalarMul::MutateIntermediateState:
        mutate_intermediate_state(events.scalar_mul[index].intermediate_states[index], rng);
        break;
    case FaultInjectionScalarMul::Result:
        mutate_embedded_curve_point(events.scalar_mul[index].result, rng);
        break;
    }
}

} // namespace bb::avm2::fuzzer
