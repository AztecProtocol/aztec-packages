#pragma once

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include <array>
#include <cstdint>
#include <stdexcept>
#include <string>

namespace bb::avm2::simulation {

struct KeccakF1600Exception : public std::runtime_error {
    explicit KeccakF1600Exception(const std::string& message)
        : std::runtime_error("Error in KeccakF1600 permutation: " + message)
    {}
};

using KeccakF1600State = std::array<std::array<uint64_t, 5>, 5>;
using KeccakF1600StateMemValues = std::array<std::array<MemoryValue, 5>, 5>;

struct KeccakF1600RoundData {
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
    uint32_t execution_clk;
    MemoryAddress dst_addr;
    MemoryAddress src_addr;
    KeccakF1600StateMemValues src_mem_values;
    uint32_t space_id;
    std::array<KeccakF1600RoundData, AVM_KECCAKF1600_NUM_ROUNDS> rounds;
    bool dst_out_of_range = false;
    bool src_out_of_range = false;
    MemoryAddress dst_abs_diff;
    MemoryAddress src_abs_diff;
    bool tag_error = false;
};

} // namespace bb::avm2::simulation
