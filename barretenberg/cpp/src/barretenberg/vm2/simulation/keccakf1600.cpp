#include "barretenberg/vm2/simulation/keccakf1600.hpp"

#include <array>
#include <cassert>
#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

namespace {

MemoryValue rotate_left(MemoryValue x, uint8_t len)
{
    const auto x_uint64_t = x.as<uint64_t>();
    assert(len < 64);
    const auto out_uint64_t = (x_uint64_t << len) | x_uint64_t >> (64 - len);
    return MemoryValue::from(out_uint64_t);
}

} // namespace

// TODO: For fast simulation, we might directly call ethash_keccakf1600 from barretenberg, instead of
// the following with no event emission. In this case, we will probably need two KeccakF1600 classes.
KeccakF1600State KeccakF1600::permutation(const KeccakF1600State& input)
{
    // A lambda which transforms any one dimensional arrays of MemoryValue into a one dimensional array of uint64_t
    auto array_to_uint64 = []<size_t N>(const std::array<MemoryValue, N>& input) {
        std::array<uint64_t, N> output;
        for (size_t i = 0; i < N; i++) {
            output[i] = input[i].template as<uint64_t>();
        }
        return output;
    };

    // A lambda which transforms any two dimensional arrays of MemoryValue into a two dimensional array of uint64_t
    auto two_dim_array_to_uint64 = []<size_t N, size_t M>(const std::array<std::array<MemoryValue, M>, N>& input) {
        std::array<std::array<uint64_t, M>, N> output;
        for (size_t i = 0; i < N; i++) {
            for (size_t j = 0; j < M; j++) {
                output[i][j] = input[i][j].template as<uint64_t>();
            }
        }
        return output;
    };

    std::array<std::array<MemoryValue, 5>, 5> input_memory_values;
    for (size_t i = 0; i < 5; i++) {
        for (size_t j = 0; j < 5; j++) {
            input_memory_values[i][j] = MemoryValue::from(input[i][j]);
        }
    }

    std::array<std::array<MemoryValue, 4>, 5> theta_xor_values;

    // Theta xor computations
    for (size_t i = 0; i < 5; ++i) {
        MemoryValue xor_accumulator = input_memory_values[i][0];
        for (size_t j = 0; j < 4; ++j) {
            xor_accumulator = bitwise.xor_op(xor_accumulator, input_memory_values[i][j + 1]);
            theta_xor_values[i][j] = xor_accumulator;
        }
    }

    // Theta xor values left rotated by 1
    std::array<MemoryValue, 5> theta_xor_final_rotl1_values;
    for (size_t i = 0; i < 5; ++i) {
        theta_xor_final_rotl1_values[i] = rotate_left(theta_xor_values[i][3], 1);
    }

    perm_events.emit({
        .state = input,
        .theta_xor = two_dim_array_to_uint64(theta_xor_values),
        .theta_xor_row_rotl1 = array_to_uint64(theta_xor_final_rotl1_values),
    });

    // TODO: return real keccakf1600 output
    return {};
}

} // namespace bb::avm2::simulation
