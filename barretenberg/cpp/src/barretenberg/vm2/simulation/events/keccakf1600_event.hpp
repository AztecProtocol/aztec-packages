#pragma once

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include <array>
#include <cstdint>

namespace bb::avm2::simulation {

enum class KeccakF1600EventError {
    // The read slice is out of range.
    READ_SLICE_OUT_OF_RANGE,
    // The write slice is out of range.
    WRITE_SLICE_OUT_OF_RANGE,
    // A tag int the read slice is invalid (not U64).
    READ_SLICE_TAG_INVALID,
};

inline std::string to_string(KeccakF1600EventError e)
{
    switch (e) {
    case KeccakF1600EventError::READ_SLICE_OUT_OF_RANGE:
        return "READ_SLICE_OUT_OF_RANGE";
    case KeccakF1600EventError::WRITE_SLICE_OUT_OF_RANGE:
        return "WRITE_SLICE_OUT_OF_RANGE";
    case KeccakF1600EventError::READ_SLICE_TAG_INVALID:
        return "READ_SLICE_TAG_INVALID";
    }

    // We catch all the cases above.
    __builtin_unreachable();
}

using KeccakF1600State = std::array<std::array<uint64_t, 5>, 5>;
using KeccakF1600StateMemValues = std::array<std::array<MemoryValue, 5>, 5>;

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
    MemoryAddress dst_addr;
    MemoryAddress src_addr;
    uint32_t space_id;
    KeccakF1600StateMemValues src_mem_values;
    std::array<KeccakF1600RoundData, AVM_KECCAKF1600_NUM_ROUNDS> rounds;
    bool dst_out_of_range = false;
    bool src_out_of_range = false;
    MemoryAddress dst_abs_diff;
    MemoryAddress src_abs_diff;
    bool tag_error = false;
};

} // namespace bb::avm2::simulation
