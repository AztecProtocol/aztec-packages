#pragma once

#include <array>
#include <cstdint>

namespace bb::avm2::simulation {

using KeccakF1600State = std::array<std::array<uint64_t, 5>, 5>;

// TODO(JEAMON:) We will need memory offset addresses once we make the gagdet memory aware.
struct KeccakF1600Event {
    KeccakF1600State state;
    std::array<std::array<uint64_t, 4>, 5> theta_xor;
    std::array<uint64_t, 5> theta_xor_row_rotl1;
    std::array<uint64_t, 5> theta_combined_xor;
    KeccakF1600State state_theta;
    KeccakF1600State state_rho;
    KeccakF1600State state_pi_not;
    KeccakF1600State state_pi_and;
    KeccakF1600State state_chi;
    uint64_t state_iota_00;
    uint8_t round;
};

} // namespace bb::avm2::simulation
