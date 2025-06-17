#include "barretenberg/vm2/simulation/keccakf1600.hpp"

#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
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
 * @param context
 * @param dst_addr Base slice address pointing to output of KeccakF1600 permutation.
 * @param src_addr Address pointing to a contiguous memory slice containing KeccakF1600State input.
 */
void KeccakF1600::permutation(ContextInterface& context, MemoryAddress dst_addr, MemoryAddress src_addr)
{
    KeccakF1600Event keccakf1600_event;
    keccakf1600_event.execution_clk = execution_id_manager.get_execution_id();
    keccakf1600_event.dst_addr = dst_addr;
    keccakf1600_event.src_addr = src_addr;

    try {
        // We need to perform two range checks to determine whether dst_addr and src_addr correspond to
        // a memory slice which is out-of-range. This is a clear circuit leakage into simulation.
        constexpr MemoryAddress HIGHEST_SLICE_ADDRESS = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 1;
        bool src_out_of_range = src_addr > HIGHEST_SLICE_ADDRESS;
        bool dst_out_of_range = dst_addr > HIGHEST_SLICE_ADDRESS;

        MemoryAddress src_abs_diff =
            src_out_of_range ? src_addr - HIGHEST_SLICE_ADDRESS - 1 : HIGHEST_SLICE_ADDRESS - src_addr;
        MemoryAddress dst_abs_diff =
            dst_out_of_range ? dst_addr - HIGHEST_SLICE_ADDRESS - 1 : HIGHEST_SLICE_ADDRESS - dst_addr;

        keccakf1600_event.src_out_of_range = src_out_of_range;
        keccakf1600_event.dst_out_of_range = dst_out_of_range;
        keccakf1600_event.src_abs_diff = src_abs_diff;
        keccakf1600_event.dst_abs_diff = dst_abs_diff;

        auto& memory = context.get_memory();
        keccakf1600_event.space_id = memory.get_space_id();

        // We group both possible out-of-range errors in the same temporality group.
        // Therefore, we perform both range checks no matter what.
        range_check.assert_range(src_abs_diff, AVM_MEMORY_NUM_BITS);
        range_check.assert_range(dst_abs_diff, AVM_MEMORY_NUM_BITS);

        if (src_out_of_range) {
            throw KeccakF1600Exception(format("Read slice out of range: ", src_addr));
        }
        if (dst_out_of_range) {
            throw KeccakF1600Exception(format("Write slice out of range: ", dst_addr));
        }

        // We work with MemoryValue as this type is required for bitwise operations handled
        // by the bitwise sub-trace simulator. We continue by operating over Memory values and convert
        // them back only at the end (event emission).
        KeccakF1600StateMemValues src_mem_values;
        src_mem_values.fill(std::array<MemoryValue, 5>{ MemoryValue::from<uint64_t>(0) });

        // Slice read and tag check
        for (size_t i = 0; i < 5; i++) {
            for (size_t j = 0; j < 5; j++) {
                const auto addr = src_addr + static_cast<MemoryAddress>((i * 5) + j);
                const auto mem_val = memory.get(addr);
                const auto tag = mem_val.get_tag();
                src_mem_values[i][j] = mem_val;

                if (tag != MemoryTag::U64) {
                    keccakf1600_event.tag_error = true;
                    keccakf1600_event.src_mem_values = src_mem_values;

                    throw KeccakF1600Exception(
                        format("Read slice tag invalid - addr: ", addr, " tag: ", static_cast<uint32_t>(tag)));
                }
            }
        }

        // Initialize state input values with values read from memory.
        KeccakF1600StateMemValues state_input_values = src_mem_values;
        keccakf1600_event.src_mem_values = src_mem_values;

        std::array<KeccakF1600RoundData, AVM_KECCAKF1600_NUM_ROUNDS> rounds_data;

        for (uint8_t round_idx = 0; round_idx < AVM_KECCAKF1600_NUM_ROUNDS; round_idx++) {
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
            // state "not pi" values
            KeccakF1600StateMemValues state_pi_values;
            KeccakF1600StateMemValues state_pi_not_values;
            for (size_t i = 0; i < 5; ++i) {
                for (size_t j = 0; j < 5; ++j) {
                    state_pi_values[i][j] = state_rho_values[keccak_pi_rho_x_coords[i][j]][i];
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
                bitwise.xor_op(state_chi_values[0][0], MemoryValue::from(keccak_round_constants[round_idx]));

            rounds_data[round_idx] = {
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

        // Slice write
        for (size_t i = 0; i < 5; i++) {
            for (size_t j = 0; j < 5; j++) {
                memory.set(dst_addr + static_cast<MemoryAddress>((i * 5) + j), state_input_values[i][j]);
            }
        }

        keccakf1600_event.rounds = rounds_data;
        perm_events.emit(KeccakF1600Event(keccakf1600_event));

    } catch (const KeccakF1600Exception& e) {
        perm_events.emit(KeccakF1600Event(keccakf1600_event));
        throw e;
    }
}

} // namespace bb::avm2::simulation
