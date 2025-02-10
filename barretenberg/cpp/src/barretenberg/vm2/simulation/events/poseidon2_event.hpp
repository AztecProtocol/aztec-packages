#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {

struct Poseidon2HashEvent {
    std::vector<FF> inputs; // This input is padded to a multiple of 3
    std::vector<std::array<FF, 4>> intermediate_states;
    FF output;
};

struct Poseidon2PermutationEvent {
    std::array<FF, 4> input;
    std::array<FF, 4> output;
};

} // namespace bb::avm2::simulation
