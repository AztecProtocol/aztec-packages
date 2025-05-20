#include "barretenberg/vm2/simulation/keccakf1600.hpp"

#include <array>
#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// TODO: For fast simulation, we might directly call ethash_keccakf1600 from barretenberg, instead of
// the following with no event emission. In this case, we will probably need two KeccakF1600 classes.
KeccakF1600::State KeccakF1600::permutation(const State& input)
{
    // A lambda which transforms any two dimensional arrays of MemoryValue into a two dimensional array of uint64_t
    auto transform_to_uint64 = []<size_t N, size_t M>(const std::array<std::array<MemoryValue, M>, N>& input) {
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

    perm_events.emit({ .state = input, .theta_xor_values = transform_to_uint64(theta_xor_values) });

    // TODO: return real keccakf1600 output
    return {};
}

} // namespace bb::avm2::simulation
