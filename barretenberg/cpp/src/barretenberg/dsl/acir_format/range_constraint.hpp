// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>

namespace acir_format {

struct RangeConstraint {
    uint32_t witness;
    uint32_t num_bits;

    // for serialization, update with any new fields
    MSGPACK_FIELDS(witness, num_bits);
    friend bool operator==(RangeConstraint const& lhs, RangeConstraint const& rhs) = default;
};

} // namespace acir_format
