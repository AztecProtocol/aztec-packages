#pragma once

// TODO(dbanks12): what is Cpp best practice? Import this here or somewhere common/shared?
// It is needed for uint128_t
#include "barretenberg/common/serialize.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

struct RangeCheckEvent {
    uint128_t value;
    uint8_t num_bits;

    bool operator==(const RangeCheckEvent& other) const { return value == other.value && num_bits == other.num_bits; }
};

} // namespace bb::avm2::simulation
