#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

namespace bb::avm2::tracegen {
using C = Column;

// Mapping 2-dimensional array indices of state inputs to columns.
constexpr std::array<std::array<C, 5>, 5> state_in_cols = {
    {
        {
            C::keccakf1600_state_in_00,
            C::keccakf1600_state_in_01,
            C::keccakf1600_state_in_02,
            C::keccakf1600_state_in_03,
            C::keccakf1600_state_in_04,
        },
        {
            C::keccakf1600_state_in_10,
            C::keccakf1600_state_in_11,
            C::keccakf1600_state_in_12,
            C::keccakf1600_state_in_13,
            C::keccakf1600_state_in_14,
        },
        {
            C::keccakf1600_state_in_20,
            C::keccakf1600_state_in_21,
            C::keccakf1600_state_in_22,
            C::keccakf1600_state_in_23,
            C::keccakf1600_state_in_24,
        },
        {
            C::keccakf1600_state_in_30,
            C::keccakf1600_state_in_31,
            C::keccakf1600_state_in_32,
            C::keccakf1600_state_in_33,
            C::keccakf1600_state_in_34,
        },
        {
            C::keccakf1600_state_in_40,
            C::keccakf1600_state_in_41,
            C::keccakf1600_state_in_42,
            C::keccakf1600_state_in_43,
            C::keccakf1600_state_in_44,
        },
    },
};

// Mapping 2-dimensional array indices of theta xor intermediate value columns.
constexpr std::array<std::array<C, 4>, 5> theta_xor_cols = {
    {
        {
            C::keccakf1600_theta_xor_01,
            C::keccakf1600_theta_xor_02,
            C::keccakf1600_theta_xor_03,
            C::keccakf1600_theta_xor_final_0,
        },
        {
            C::keccakf1600_theta_xor_11,
            C::keccakf1600_theta_xor_12,
            C::keccakf1600_theta_xor_13,
            C::keccakf1600_theta_xor_final_1,
        },
        {
            C::keccakf1600_theta_xor_21,
            C::keccakf1600_theta_xor_22,
            C::keccakf1600_theta_xor_23,
            C::keccakf1600_theta_xor_final_2,
        },
        {
            C::keccakf1600_theta_xor_31,
            C::keccakf1600_theta_xor_32,
            C::keccakf1600_theta_xor_33,
            C::keccakf1600_theta_xor_final_3,
        },
        {
            C::keccakf1600_theta_xor_41,
            C::keccakf1600_theta_xor_42,
            C::keccakf1600_theta_xor_43,
            C::keccakf1600_theta_xor_final_4,
        },
    },
};

void KeccakF1600TraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::KeccakF1600Event>::Container& events, TraceContainer& trace)
{
    uint32_t row = 0;
    for (const auto& event : events) {

        // Setting the selector, xor operation id
        trace.set(C::keccakf1600_sel, row, 1);
        trace.set(C::keccakf1600_bitwise_xor_op_id, row, static_cast<uint8_t>(BitwiseOperation::XOR));

        // Setting state inputs in their corresponding colums
        for (size_t i = 0; i < 5; ++i) {
            for (size_t j = 0; j < 5; ++j) {
                trace.set(state_in_cols[i][j], row, event.state[i][j]);
            }
        }

        // Setting Theta xor values to their corresponding columns
        for (size_t i = 0; i < 5; ++i) {
            for (size_t j = 0; j < 4; ++j) {
                trace.set(theta_xor_cols[i][j], row, event.theta_xor_values[i][j]);
            }
        }
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> KeccakF1600TraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_01_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_02_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_03_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_final_0_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_11_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_12_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_13_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_final_1_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_21_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_22_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_23_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_final_2_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_31_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_32_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_33_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_final_3_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_41_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_42_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_43_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_final_4_settings>>());
}

} // namespace bb::avm2::tracegen
