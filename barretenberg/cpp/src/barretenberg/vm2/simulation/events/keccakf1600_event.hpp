#pragma once

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include <array>
#include <cstdint>

namespace bb::avm2::simulation {

using KeccakF1600State = std::array<std::array<uint64_t, 5>, 5>;

struct KeccakF1600RoundData {
    uint8_t round;
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
};

struct KeccakF1600Event {
    MemoryAddress dst_offset;
    MemoryAddress src_offset;
    uint32_t space_id;
    std::array<KeccakF1600RoundData, AVM_KECCAKF1600_NUM_ROUNDS> rounds;
};

} // namespace bb::avm2::simulation
