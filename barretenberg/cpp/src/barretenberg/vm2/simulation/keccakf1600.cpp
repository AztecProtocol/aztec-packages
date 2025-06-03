#include "barretenberg/vm2/simulation/keccakf1600.hpp"

#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"

namespace bb::avm2::simulation {

namespace {

MemoryValue unconstrained_rotate_left(MemoryValue x, uint8_t len)
{
    const auto x_uint64_t = x.as<uint64_t>();
    assert(len < 64);
    const auto out_uint64_t = (x_uint64_t << len) | x_uint64_t >> (64 - len);
    return MemoryValue::from(out_uint64_t);
}

// A function which transforms any two-dimensional array of MemoryValue's into a two-dimensional array of uint64_t.
template <size_t N, size_t M>
std::array<std::array<uint64_t, M>, N> two_dim_array_to_uint64(const std::array<std::array<MemoryValue, M>, N>& input)
{
    std::array<std::array<uint64_t, M>, N> output;
    for (size_t i = 0; i < N; i++) {
        for (size_t j = 0; j < M; j++) {
            output[i][j] = input[i][j].template as<uint64_t>();
        }
    }
    return output;
}

// A function which transforms any array of MemoryValue's into an array of uint64_t.
template <size_t N> std::array<uint64_t, N> array_to_uint64(const std::array<MemoryValue, N>& input)
{
    std::array<uint64_t, N> output;
    for (size_t i = 0; i < N; i++) {
        output[i] = input[i].template as<uint64_t>();
    }
    return output;
}

} // namespace

// TODO: For fast simulation, we might directly call ethash_keccakf1600 from barretenberg, instead of
// the following with no event emission. In this case, we will probably need two KeccakF1600 classes.
/**
 * @brief Permutation Keccak-f[1600] consisting in AVM_KECCAKF1600_NUM_ROUNDS (24) rounds and a state of 25 64-bit
 * values (aliased as KeccakF1600State).
 *
 * @param input of KeccakF1600State type
 * @return KeccakF1600State
 */
KeccakF1600State KeccakF1600::permutation(const KeccakF1600State& input)
{
    using KeccakF1600StateMemValues = std::array<std::array<MemoryValue, 5>, 5>;

    // We convert input into Memory values as this type is required for bitwise operations handled
    // by the bitwise sub-trace simulator. We continue by operating over Memory values and convert
    // them back only at the end.
    // TODO(JEAMON): Making this gadget memory aware might anyway get rid of this transformation.
    KeccakF1600StateMemValues state_input_values;
    for (size_t i = 0; i < 5; i++) {
        for (size_t j = 0; j < 5; j++) {
            state_input_values[i][j] = MemoryValue::from(input[i][j]);
        }
    }

    std::array<KeccakF1600RoundData, AVM_KECCAKF1600_NUM_ROUNDS> rounds_data;

    for (uint8_t round = 1; round <= AVM_KECCAKF1600_NUM_ROUNDS; round++) {
        std::array<std::array<MemoryValue, 4>, 5> theta_xor_values;

        // Theta xor computations
        for (size_t i = 0; i < 5; ++i) {
            MemoryValue xor_accumulator = state_input_values[i][0];
            for (size_t j = 0; j < 4; ++j) {
                xor_accumulator = bitwise.xor_op(xor_accumulator, state_input_values[i][j + 1]);
                theta_xor_values[i][j] = xor_accumulator;
            }
        }

        // Theta xor values left rotated by 1
        std::array<MemoryValue, 5> theta_xor_row_rotl1_values;
        for (size_t i = 0; i < 5; ++i) {
            theta_xor_row_rotl1_values[i] = unconstrained_rotate_left(theta_xor_values[i][3], 1);
        }

        // Theta combined xor computation
        std::array<MemoryValue, 5> theta_combined_xor_values;
        for (size_t i = 0; i < 5; ++i) {
            theta_combined_xor_values[i] =
                bitwise.xor_op(theta_xor_values[(i + 4) % 5][3], theta_xor_row_rotl1_values[(i + 1) % 5]);
        }

        // State theta values
        std::array<std::array<MemoryValue, 5>, 5> state_theta_values;
        for (size_t i = 0; i < 5; ++i) {
            for (size_t j = 0; j < 5; ++j) {
                state_theta_values[i][j] = bitwise.xor_op(state_input_values[i][j], theta_combined_xor_values[i]);
            }
        }

        // State rho values
        KeccakF1600StateMemValues state_rho_values;

        // Handle range checks related to Rho round function.
        // For i,j, such that 0 < rotation_len[i][j] <= 32, we range check
        // the highest rotation_len[i][j] number of bits of state_theta_values[i][j].
        // Otherwise, we range check the lowest 64 - rotation_len[i][j] bits.
        for (size_t i = 0; i < 5; ++i) {
            for (size_t j = 0; j < 5; ++j) {
                const uint8_t& len = keccak_rotation_len[i][j];
                // Compute state values after Rho function.
                state_rho_values[i][j] = unconstrained_rotate_left(state_theta_values[i][j], len);
                if (len > 0 && len <= 32) {
                    range_check.assert_range(state_theta_values[i][j].as<uint64_t>() >> (64 - len), len);
                } else if (len > 32) {
                    range_check.assert_range(state_theta_values[i][j].as<uint64_t>() & ((1U << (64 - len)) - 1),
                                             64 - len);
                }
            }
        }

        // state pi values
        KeccakF1600StateMemValues state_pi_values;
        for (size_t i = 0; i < 5; ++i) {
            for (size_t j = 0; j < 5; ++j) {
                state_pi_values[i][j] = state_rho_values[keccak_pi_rho_x_coords[i][j]][i];
            }
        }

        // state "not pi" values
        KeccakF1600StateMemValues state_pi_not_values;
        for (size_t i = 0; i < 5; ++i) {
            for (size_t j = 0; j < 5; ++j) {
                state_pi_not_values[i][j] = ~state_pi_values[i][j];
            }
        }

        // state "pi and" values
        KeccakF1600StateMemValues state_pi_and_values;
        // state chi values
        KeccakF1600StateMemValues state_chi_values;
        for (size_t i = 0; i < 5; ++i) {
            for (size_t j = 0; j < 5; ++j) {
                state_pi_and_values[i][j] =
                    bitwise.and_op(state_pi_not_values[(i + 1) % 5][j], state_pi_values[(i + 2) % 5][j]);
                state_chi_values[i][j] = bitwise.xor_op(state_pi_values[i][j], state_pi_and_values[i][j]);
            }
        }

        // state iota_00 value
        // Recall that round starts with 1
        MemoryValue iota_00_value =
            bitwise.xor_op(state_chi_values[0][0], MemoryValue::from(keccak_round_constants[round - 1]));

        rounds_data[round - 1] = {
            .round = round,
            .state = two_dim_array_to_uint64(state_input_values),
            .theta_xor = two_dim_array_to_uint64(theta_xor_values),
            .theta_xor_row_rotl1 = array_to_uint64(theta_xor_row_rotl1_values),
            .theta_combined_xor = array_to_uint64(theta_combined_xor_values),
            .state_theta = two_dim_array_to_uint64(state_theta_values),
            .state_rho = two_dim_array_to_uint64(state_rho_values),
            .state_pi_not = two_dim_array_to_uint64(state_pi_not_values),
            .state_pi_and = two_dim_array_to_uint64(state_pi_and_values),
            .state_chi = two_dim_array_to_uint64(state_chi_values),
            .state_iota_00 = iota_00_value.as<uint64_t>(),
        };

        state_input_values = state_chi_values;
        state_input_values[0][0] = iota_00_value;
    }

    perm_events.emit({
        .rounds = rounds_data,
    });

    return two_dim_array_to_uint64(state_input_values);
}

} // namespace bb::avm2::simulation
