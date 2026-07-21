#pragma once

#include <array>
#include <cstdint>
#include <stdexcept>
#include <string>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Exception thrown on errors during the Keccak-f[1600] permutation.
 *
 * Possible error conditions:
 * - Source or destination slice address out of range.
 * - A source memory value has a tag other than U64.
 */
struct KeccakF1600Exception : public std::runtime_error {
    explicit KeccakF1600Exception(const std::string& message)
        : std::runtime_error("Error in KeccakF1600 permutation: " + message)
    {}
};

/// 5x5 matrix of 64-bit words representing the Keccak state A[x][y].
using KeccakF1600State = std::array<std::array<uint64_t, 5>, 5>;
/// 5x5 matrix of MemoryValue representing the Keccak state (used during simulation).
using KeccakF1600StateMemValues = std::array<std::array<MemoryValue, 5>, 5>;

/**
 * @brief Intermediate values produced by a single Keccak-f[1600] round.
 *
 * Stored as uint64_t for trace generation. All fields use A[x][y] indexing.
 */
struct KeccakF1600RoundData {
    KeccakF1600State state{};                           ///< Round input state.
    std::array<std::array<uint64_t, 4>, 5> theta_xor{}; ///< Accumulated column-parity XORs (4 intermediates per row).
    std::array<uint64_t, 5> theta_xor_row_rotl1{};      ///< Column parity rotated left by 1.
    std::array<uint64_t, 5> theta_combined_xor{};       ///< D[x] = C[(x-1)%5] ^ rot(C[(x+1)%5], 1).
    KeccakF1600State state_theta{};                     ///< State after theta step.
    KeccakF1600State state_rho{};                       ///< State after rho (rotation) step.
    KeccakF1600State state_pi_not{};                    ///< Bitwise NOT of state after pi step.
    KeccakF1600State state_pi_and{};                    ///< AND(NOT(pi[(x+1)%5][y]), pi[(x+2)%5][y]).
    KeccakF1600State state_chi{};                       ///< State after chi step.
    uint64_t state_iota_00 = 0;                         ///< state_chi[0][0] XOR round_constant.
};

/**
 * @brief Event emitted by the Keccak-f[1600] simulation for trace generation.
 *
 * On success all fields are populated. On error, only the fields set before the
 * exception are meaningful (see individual error flags).
 */
struct KeccakF1600Event {
    uint32_t execution_clk = 0;
    MemoryAddress dst_addr = 0;
    MemoryAddress src_addr = 0;
    std::array<MemoryValue, AVM_KECCAKF1600_STATE_SIZE> src_mem_values{};
    uint16_t space_id = 0;
    std::array<KeccakF1600RoundData, AVM_KECCAKF1600_NUM_ROUNDS> rounds{}; ///< Per-round intermediate data.
    bool dst_out_of_range = false;
    bool src_out_of_range = false;
    bool tag_error = false;
};

} // namespace bb::avm2::simulation
