#pragma once

#include <array>
#include <cstdint>

namespace bb::avm2::simulation {

struct KeccakF1600Event {
    std::array<std::array<uint64_t, 5>, 5> state;
    std::array<std::array<uint64_t, 4>, 5> theta_xor_values;
};

} // namespace bb::avm2::simulation
