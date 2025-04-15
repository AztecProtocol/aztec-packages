#include "barretenberg/vm2/simulation/poseidon2.hpp"

#include <array>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"

using bb::crypto::Poseidon2Bn254ScalarFieldParams;
using bb::crypto::Poseidon2Permutation;

namespace bb::avm2::simulation {

FF Poseidon2::hash(const std::vector<FF>& input)
{
    size_t input_size = input.size();
    // The number of permutation events required to process the input
    auto num_perm_events = (input_size / 3) + static_cast<size_t>(input_size % 3 != 0);
    std::vector<std::array<FF, 4>> intermediate_states;
    // We reserve space for the intermediate permutation states and 1 additional space for the initial state
    intermediate_states.reserve(num_perm_events + 1);

    // The unpadded length of the input is set as the IV
    // The initial permutation state is seeded with the iv at the last input index
    const uint256_t iv = static_cast<uint256_t>(input_size) << 64;
    std::array<FF, 4> perm_state = { 0, 0, 0, iv };
    intermediate_states.push_back(perm_state);

    // Also referred to as cache but is the inputs that will be passed to the permutation function
    std::vector<std::array<FF, 4>> perm_inputs;

    for (size_t i = 0; i < num_perm_events; i++) {
        // We can at most absorb a chunk of 3 elements
        size_t chunk_size = std::min(input_size, static_cast<size_t>(3));
        // Mix the input chunk into the previous permutation output state
        for (size_t j = 0; j < chunk_size; j++) {
            perm_state[j] += input[(i * 3) + j];
        }
        perm_state = permutation(perm_state);
        intermediate_states.push_back(perm_state);

        input_size -= chunk_size;
    }

    hash_events.emit(
        { .inputs = input, .intermediate_states = std::move(intermediate_states), .output = perm_state[0] });
    return perm_state[0];
}

std::array<FF, 4> Poseidon2::permutation(const std::array<FF, 4>& input)
{
    std::array<FF, 4> output = Poseidon2Permutation<Poseidon2Bn254ScalarFieldParams>::permutation(input);
    perm_events.emit({ .input = input, .output = output });
    return output;
}

} // namespace bb::avm2::simulation
