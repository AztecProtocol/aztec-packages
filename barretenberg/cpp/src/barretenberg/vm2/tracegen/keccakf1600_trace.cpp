#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
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
            C::keccakf1600_theta_xor_row_0,
        },
        {
            C::keccakf1600_theta_xor_11,
            C::keccakf1600_theta_xor_12,
            C::keccakf1600_theta_xor_13,
            C::keccakf1600_theta_xor_row_1,
        },
        {
            C::keccakf1600_theta_xor_21,
            C::keccakf1600_theta_xor_22,
            C::keccakf1600_theta_xor_23,
            C::keccakf1600_theta_xor_row_2,
        },
        {
            C::keccakf1600_theta_xor_31,
            C::keccakf1600_theta_xor_32,
            C::keccakf1600_theta_xor_33,
            C::keccakf1600_theta_xor_row_3,
        },
        {
            C::keccakf1600_theta_xor_41,
            C::keccakf1600_theta_xor_42,
            C::keccakf1600_theta_xor_43,
            C::keccakf1600_theta_xor_row_4,
        },
    },
};

// Mapping indices of theta_xor_row_rotl1 to their columns.
constexpr std::array<C, 5> theta_xor_row_rotl1_cols = {
    {
        C::keccakf1600_theta_xor_row_rotl1_0,
        C::keccakf1600_theta_xor_row_rotl1_1,
        C::keccakf1600_theta_xor_row_rotl1_2,
        C::keccakf1600_theta_xor_row_rotl1_3,
        C::keccakf1600_theta_xor_row_rotl1_4,
    },
};

// Mapping indices of theta_xor_row_msb to their columns.
constexpr std::array<C, 5> theta_xor_row_msb_cols = {
    {
        C::keccakf1600_theta_xor_row_msb_0,
        C::keccakf1600_theta_xor_row_msb_1,
        C::keccakf1600_theta_xor_row_msb_2,
        C::keccakf1600_theta_xor_row_msb_3,
        C::keccakf1600_theta_xor_row_msb_4,
    },
};

// Mapping indices of theta_xor_row_low63 to their columns.
constexpr std::array<C, 5> theta_xor_row_low63_cols = {
    {
        C::keccakf1600_theta_xor_row_low63_0,
        C::keccakf1600_theta_xor_row_low63_1,
        C::keccakf1600_theta_xor_row_low63_2,
        C::keccakf1600_theta_xor_row_low63_3,
        C::keccakf1600_theta_xor_row_low63_4,
    },
};

// Mapping indices of theta_combined_xor to their columns.
constexpr std::array<C, 5> theta_combined_xor_cols = {
    {
        C::keccakf1600_theta_combined_xor_0,
        C::keccakf1600_theta_combined_xor_1,
        C::keccakf1600_theta_combined_xor_2,
        C::keccakf1600_theta_combined_xor_3,
        C::keccakf1600_theta_combined_xor_4,
    },
};

// Mapping indices of state_theta to their columns.
constexpr std::array<std::array<C, 5>, 5> state_theta_cols = {
    {
        {
            C::keccakf1600_state_theta_00,
            C::keccakf1600_state_theta_01,
            C::keccakf1600_state_theta_02,
            C::keccakf1600_state_theta_03,
            C::keccakf1600_state_theta_04,
        },
        {
            C::keccakf1600_state_theta_10,
            C::keccakf1600_state_theta_11,
            C::keccakf1600_state_theta_12,
            C::keccakf1600_state_theta_13,
            C::keccakf1600_state_theta_14,
        },
        {
            C::keccakf1600_state_theta_20,
            C::keccakf1600_state_theta_21,
            C::keccakf1600_state_theta_22,
            C::keccakf1600_state_theta_23,
            C::keccakf1600_state_theta_24,
        },
        {
            C::keccakf1600_state_theta_30,
            C::keccakf1600_state_theta_31,
            C::keccakf1600_state_theta_32,
            C::keccakf1600_state_theta_33,
            C::keccakf1600_state_theta_34,
        },
        {
            C::keccakf1600_state_theta_40,
            C::keccakf1600_state_theta_41,
            C::keccakf1600_state_theta_42,
            C::keccakf1600_state_theta_43,
            C::keccakf1600_state_theta_44,
        },
    },
};

// Mapping indices of state_theta_hi to their columns.
// As index 00 is not used here, we flatten the list and start with 01.
constexpr std::array<C, 24> state_theta_hi_cols = {
    {
        C::keccakf1600_state_theta_hi_01, C::keccakf1600_state_theta_hi_02, C::keccakf1600_state_theta_hi_03,
        C::keccakf1600_state_theta_hi_04, C::keccakf1600_state_theta_hi_10, C::keccakf1600_state_theta_hi_11,
        C::keccakf1600_state_theta_hi_12, C::keccakf1600_state_theta_hi_13, C::keccakf1600_state_theta_hi_14,
        C::keccakf1600_state_theta_hi_20, C::keccakf1600_state_theta_hi_21, C::keccakf1600_state_theta_hi_22,
        C::keccakf1600_state_theta_hi_23, C::keccakf1600_state_theta_hi_24, C::keccakf1600_state_theta_hi_30,
        C::keccakf1600_state_theta_hi_31, C::keccakf1600_state_theta_hi_32, C::keccakf1600_state_theta_hi_33,
        C::keccakf1600_state_theta_hi_34, C::keccakf1600_state_theta_hi_40, C::keccakf1600_state_theta_hi_41,
        C::keccakf1600_state_theta_hi_42, C::keccakf1600_state_theta_hi_43, C::keccakf1600_state_theta_hi_44,
    },
};

// Mapping indices of state_theta_low to their columns.
// As index 00 is not used here, we flatten the list and start with 01.
constexpr std::array<C, 24> state_theta_low_cols = {
    {
        C::keccakf1600_state_theta_low_01, C::keccakf1600_state_theta_low_02, C::keccakf1600_state_theta_low_03,
        C::keccakf1600_state_theta_low_04, C::keccakf1600_state_theta_low_10, C::keccakf1600_state_theta_low_11,
        C::keccakf1600_state_theta_low_12, C::keccakf1600_state_theta_low_13, C::keccakf1600_state_theta_low_14,
        C::keccakf1600_state_theta_low_20, C::keccakf1600_state_theta_low_21, C::keccakf1600_state_theta_low_22,
        C::keccakf1600_state_theta_low_23, C::keccakf1600_state_theta_low_24, C::keccakf1600_state_theta_low_30,
        C::keccakf1600_state_theta_low_31, C::keccakf1600_state_theta_low_32, C::keccakf1600_state_theta_low_33,
        C::keccakf1600_state_theta_low_34, C::keccakf1600_state_theta_low_40, C::keccakf1600_state_theta_low_41,
        C::keccakf1600_state_theta_low_42, C::keccakf1600_state_theta_low_43, C::keccakf1600_state_theta_low_44,
    },
};

// Mapping indices of state_rho to their columns.
// As index 00 is not used here, we flatten the list and start with 01.
constexpr std::array<C, 24> state_rho_cols = {
    {
        C::keccakf1600_state_rho_01, C::keccakf1600_state_rho_02, C::keccakf1600_state_rho_03,
        C::keccakf1600_state_rho_04, C::keccakf1600_state_rho_10, C::keccakf1600_state_rho_11,
        C::keccakf1600_state_rho_12, C::keccakf1600_state_rho_13, C::keccakf1600_state_rho_14,
        C::keccakf1600_state_rho_20, C::keccakf1600_state_rho_21, C::keccakf1600_state_rho_22,
        C::keccakf1600_state_rho_23, C::keccakf1600_state_rho_24, C::keccakf1600_state_rho_30,
        C::keccakf1600_state_rho_31, C::keccakf1600_state_rho_32, C::keccakf1600_state_rho_33,
        C::keccakf1600_state_rho_34, C::keccakf1600_state_rho_40, C::keccakf1600_state_rho_41,
        C::keccakf1600_state_rho_42, C::keccakf1600_state_rho_43, C::keccakf1600_state_rho_44,
    },
};

// Mapping indices of rho rotation constants and the corresponding constant columns.
// As index 00 is not used here, we flatten the list and start with 01.
constexpr std::array<C, 24> rho_rotation_len_cols = {
    {
        C::keccakf1600_rot_64_min_len_01, C::keccakf1600_rot_len_02,        C::keccakf1600_rot_64_min_len_03,
        C::keccakf1600_rot_len_04,        C::keccakf1600_rot_len_10,        C::keccakf1600_rot_64_min_len_11,
        C::keccakf1600_rot_len_12,        C::keccakf1600_rot_64_min_len_13, C::keccakf1600_rot_len_14,
        C::keccakf1600_rot_64_min_len_20, C::keccakf1600_rot_len_21,        C::keccakf1600_rot_64_min_len_22,
        C::keccakf1600_rot_len_23,        C::keccakf1600_rot_64_min_len_24, C::keccakf1600_rot_len_30,
        C::keccakf1600_rot_64_min_len_31, C::keccakf1600_rot_len_32,        C::keccakf1600_rot_len_33,
        C::keccakf1600_rot_64_min_len_34, C::keccakf1600_rot_len_40,        C::keccakf1600_rot_len_41,
        C::keccakf1600_rot_64_min_len_42, C::keccakf1600_rot_len_43,        C::keccakf1600_rot_len_44,
    },
};

// Mapping indices of "pi not" values to their columns
constexpr std::array<std::array<C, 5>, 5> state_pi_not_cols = {
    {
        {
            C::keccakf1600_state_pi_not_00,
            C::keccakf1600_state_pi_not_01,
            C::keccakf1600_state_pi_not_02,
            C::keccakf1600_state_pi_not_03,
            C::keccakf1600_state_pi_not_04,
        },
        {
            C::keccakf1600_state_pi_not_10,
            C::keccakf1600_state_pi_not_11,
            C::keccakf1600_state_pi_not_12,
            C::keccakf1600_state_pi_not_13,
            C::keccakf1600_state_pi_not_14,
        },
        {
            C::keccakf1600_state_pi_not_20,
            C::keccakf1600_state_pi_not_21,
            C::keccakf1600_state_pi_not_22,
            C::keccakf1600_state_pi_not_23,
            C::keccakf1600_state_pi_not_24,
        },
        {
            C::keccakf1600_state_pi_not_30,
            C::keccakf1600_state_pi_not_31,
            C::keccakf1600_state_pi_not_32,
            C::keccakf1600_state_pi_not_33,
            C::keccakf1600_state_pi_not_34,
        },
        {
            C::keccakf1600_state_pi_not_40,
            C::keccakf1600_state_pi_not_41,
            C::keccakf1600_state_pi_not_42,
            C::keccakf1600_state_pi_not_43,
            C::keccakf1600_state_pi_not_44,
        },
    },
};

// Mapping indices of "pi and" values to their columns
constexpr std::array<std::array<C, 5>, 5> state_pi_and_cols = {
    {
        {
            C::keccakf1600_state_pi_and_00,
            C::keccakf1600_state_pi_and_01,
            C::keccakf1600_state_pi_and_02,
            C::keccakf1600_state_pi_and_03,
            C::keccakf1600_state_pi_and_04,
        },
        {
            C::keccakf1600_state_pi_and_10,
            C::keccakf1600_state_pi_and_11,
            C::keccakf1600_state_pi_and_12,
            C::keccakf1600_state_pi_and_13,
            C::keccakf1600_state_pi_and_14,
        },
        {
            C::keccakf1600_state_pi_and_20,
            C::keccakf1600_state_pi_and_21,
            C::keccakf1600_state_pi_and_22,
            C::keccakf1600_state_pi_and_23,
            C::keccakf1600_state_pi_and_24,
        },
        {
            C::keccakf1600_state_pi_and_30,
            C::keccakf1600_state_pi_and_31,
            C::keccakf1600_state_pi_and_32,
            C::keccakf1600_state_pi_and_33,
            C::keccakf1600_state_pi_and_34,
        },
        {
            C::keccakf1600_state_pi_and_40,
            C::keccakf1600_state_pi_and_41,
            C::keccakf1600_state_pi_and_42,
            C::keccakf1600_state_pi_and_43,
            C::keccakf1600_state_pi_and_44,
        },
    },
};

// Mapping indices of chi values to their columns
constexpr std::array<std::array<C, 5>, 5> state_chi_cols = {
    {
        {
            C::keccakf1600_state_chi_00,
            C::keccakf1600_state_chi_01,
            C::keccakf1600_state_chi_02,
            C::keccakf1600_state_chi_03,
            C::keccakf1600_state_chi_04,
        },
        {
            C::keccakf1600_state_chi_10,
            C::keccakf1600_state_chi_11,
            C::keccakf1600_state_chi_12,
            C::keccakf1600_state_chi_13,
            C::keccakf1600_state_chi_14,
        },
        {
            C::keccakf1600_state_chi_20,
            C::keccakf1600_state_chi_21,
            C::keccakf1600_state_chi_22,
            C::keccakf1600_state_chi_23,
            C::keccakf1600_state_chi_24,
        },
        {
            C::keccakf1600_state_chi_30,
            C::keccakf1600_state_chi_31,
            C::keccakf1600_state_chi_32,
            C::keccakf1600_state_chi_33,
            C::keccakf1600_state_chi_34,
        },
        {
            C::keccakf1600_state_chi_40,
            C::keccakf1600_state_chi_41,
            C::keccakf1600_state_chi_42,
            C::keccakf1600_state_chi_43,
            C::keccakf1600_state_chi_44,
        },
    },
};

// Mapping 2-dimensional array indices of state outputs to columns.
constexpr std::array<std::array<C, 5>, 5> state_out_cols = {
    {
        {
            C::keccakf1600_state_out_00,
            C::keccakf1600_state_out_01,
            C::keccakf1600_state_out_02,
            C::keccakf1600_state_out_03,
            C::keccakf1600_state_out_04,
        },
        {
            C::keccakf1600_state_out_10,
            C::keccakf1600_state_out_11,
            C::keccakf1600_state_out_12,
            C::keccakf1600_state_out_13,
            C::keccakf1600_state_out_14,
        },
        {
            C::keccakf1600_state_out_20,
            C::keccakf1600_state_out_21,
            C::keccakf1600_state_out_22,
            C::keccakf1600_state_out_23,
            C::keccakf1600_state_out_24,
        },
        {
            C::keccakf1600_state_out_30,
            C::keccakf1600_state_out_31,
            C::keccakf1600_state_out_32,
            C::keccakf1600_state_out_33,
            C::keccakf1600_state_out_34,
        },
        {
            C::keccakf1600_state_out_40,
            C::keccakf1600_state_out_41,
            C::keccakf1600_state_out_42,
            C::keccakf1600_state_out_43,
            C::keccakf1600_state_out_44,
        },
    },
};

void KeccakF1600TraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::KeccakF1600Event>::Container& events, TraceContainer& trace)
{
    trace.set(C::keccakf1600_last, 0, 1);

    uint32_t row = 1;
    for (const auto& event : events) {
        // Setting the selector, xor operation id, and operation id, round, round cst
        trace.set(C::keccakf1600_sel, row, 1);
        trace.set(C::keccakf1600_bitwise_xor_op_id, row, static_cast<uint8_t>(BitwiseOperation::XOR));
        trace.set(C::keccakf1600_bitwise_and_op_id, row, static_cast<uint8_t>(BitwiseOperation::AND));
        trace.set(C::keccakf1600_round, row, event.round);
        trace.set(C::keccakf1600_round_cst, row, simulation::keccak_round_constants[event.round - 1]);

        // Selectors start and last.
        if (event.round == 1) {
            trace.set(C::keccakf1600_start, row, 1);
        } else if (event.round == AVM_KECCAKF1600_NUM_ROUNDS) {
            trace.set(C::keccakf1600_last, row, 1);
        };

        // Helper "inverse" columns for sel and last.
        trace.set(C::keccakf1600_round_inv, row, FF(event.round).invert());
        trace.set(C::keccakf1600_round_min_num_rounds_inv,
                  row,
                  event.round == AVM_KECCAKF1600_NUM_ROUNDS ? 1
                                                            : FF(event.round - AVM_KECCAKF1600_NUM_ROUNDS).invert());

        // Setting state inputs in their corresponding colums
        for (size_t i = 0; i < 5; i++) {
            for (size_t j = 0; j < 5; j++) {
                trace.set(state_in_cols[i][j], row, event.state[i][j]);
            }
        }

        // Setting theta xor values to their corresponding columns
        for (size_t i = 0; i < 5; i++) {
            for (size_t j = 0; j < 4; j++) {
                trace.set(theta_xor_cols[i][j], row, event.theta_xor[i][j]);
            }
        }

        // Setting theta xor final values left rotated by 1
        // and the msb and low 63 bits values.
        for (size_t i = 0; i < 5; i++) {
            const auto theta_xor_row_rotl1 = event.theta_xor_row_rotl1[i];
            const auto theta_xor_row_msb = theta_xor_row_rotl1 & 1;    // lsb of of the rotated value
            const auto theta_xor_row_low63 = theta_xor_row_rotl1 >> 1; // 63 high bits of the rotated value

            trace.set(theta_xor_row_rotl1_cols[i], row, theta_xor_row_rotl1);
            trace.set(theta_xor_row_msb_cols[i], row, theta_xor_row_msb);
            trace.set(theta_xor_row_low63_cols[i], row, theta_xor_row_low63);
        }

        // Setting theta_combined_xor values
        for (size_t i = 0; i < 5; i++) {
            trace.set(theta_combined_xor_cols[i], row, event.theta_combined_xor[i]);
        }

        // Setting state_theta values
        for (size_t i = 0; i < 5; i++) {
            for (size_t j = 0; j < 5; j++) {
                trace.set(state_theta_cols[i][j], row, event.state_theta[i][j]);
            }
        }

        // Setting state_theta_hi and state_theta_low values.
        // We loop the flatten index k from 1 to 25 and compute
        // 2-dimensional indices i = k/5 and j = k%5
        for (size_t k = 1; k < 25; k++) {
            const size_t i = k / 5;
            const size_t j = k % 5;
            const size_t low_num_bits = 64 - simulation::keccak_rotation_len[i][j];
            const auto state_theta_val = event.state_theta[i][j];
            const auto state_theta_hi = state_theta_val >> low_num_bits;
            const auto state_theta_low = state_theta_val & ((1ULL << low_num_bits) - 1);

            trace.set(state_theta_hi_cols[k - 1], row, state_theta_hi);
            trace.set(state_theta_low_cols[k - 1], row, state_theta_low);
        }

        // Setting the rotation length constants
        // If the constant is <= 32, we set it in the column.
        // Otherwise, we set 64 - constant.
        for (size_t k = 1; k < 25; k++) {
            const size_t i = k / 5;
            const size_t j = k % 5;
            const auto rotation_len = simulation::keccak_rotation_len[i][j];
            const auto value = rotation_len <= 32 ? rotation_len : 64 - rotation_len;
            trace.set(rho_rotation_len_cols[k - 1], row, value);
        }

        // Setting state_rho values
        for (size_t k = 1; k < 25; k++) {
            const size_t i = k / 5;
            const size_t j = k % 5;
            trace.set(state_rho_cols[k - 1], row, event.state_rho[i][j]);
        }

        // Setting "pi not" values
        // Setting "pi and" values
        // Setting chi values
        for (size_t i = 0; i < 5; i++) {
            for (size_t j = 0; j < 5; j++) {
                trace.set(state_pi_not_cols[i][j], row, event.state_pi_not[i][j]);
                trace.set(state_pi_and_cols[i][j], row, event.state_pi_and[i][j]);
                trace.set(state_chi_cols[i][j], row, event.state_chi[i][j]);
            }
        }

        // Setting iota_00
        trace.set(C::keccakf1600_state_iota_00, row, event.state_iota_00);

        // Setting output
        if (event.round == AVM_KECCAKF1600_NUM_ROUNDS) {
            for (size_t i = 0; i < 5; i++) {
                for (size_t j = 0; j < 5; j++) {
                    if (i != 0 || j != 0) {
                        trace.set(state_out_cols[i][j], row, event.state_chi[i][j]);
                    }
                }
            }
        }

        trace.set(state_out_cols[0][0], row, event.state_iota_00);

        row++;
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> KeccakF1600TraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        // Theta XOR values
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_01_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_02_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_03_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_0_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_11_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_12_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_13_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_1_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_21_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_22_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_23_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_2_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_31_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_32_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_33_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_3_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_41_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_42_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_43_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_xor_row_4_settings>>(),
        // Theta XOR combined values
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_0_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_1_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_2_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_3_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_combined_xor_4_settings>>(),
        // State Theta final values
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_00_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_01_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_02_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_03_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_04_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_10_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_11_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_12_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_13_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_14_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_20_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_21_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_22_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_23_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_24_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_30_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_31_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_32_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_33_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_34_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_40_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_41_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_42_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_43_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_theta_44_settings>>(),
        // Range check on some state theta limbs
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_01_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_02_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_03_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_04_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_10_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_11_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_12_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_13_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_14_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_20_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_21_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_22_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_23_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_24_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_30_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_31_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_32_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_33_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_34_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_40_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_41_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_42_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_43_range_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_theta_limb_44_range_settings>>(),
        // "pi and" values
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_00_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_01_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_02_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_03_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_04_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_10_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_11_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_12_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_13_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_14_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_20_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_21_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_22_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_23_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_24_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_30_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_31_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_32_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_33_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_34_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_40_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_41_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_42_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_43_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_pi_and_44_settings>>(),
        // chi values
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_00_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_01_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_02_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_03_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_04_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_10_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_11_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_12_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_13_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_14_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_20_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_21_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_22_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_23_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_24_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_30_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_31_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_32_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_33_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_34_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_40_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_41_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_42_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_43_settings>>(),
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_chi_44_settings>>(),
        // iota_00 value
        std::make_unique<LookupIntoDynamicTableSequential<lookup_keccakf1600_state_iota_00_settings>>(),
        // round constants lookup
        std::make_unique<LookupIntoIndexedByClk<lookup_keccakf1600_round_cst_settings>>());
};

} // namespace bb::avm2::tracegen
