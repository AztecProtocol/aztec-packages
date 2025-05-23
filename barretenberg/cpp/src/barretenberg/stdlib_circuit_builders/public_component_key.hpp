// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <barretenberg/serialize/msgpack.hpp>
#include <cstdint>

namespace bb {

// The data needed to reconstruct a public input component from its limbs stored in the public inputs
struct PublicComponentKey {
    constexpr static uint32_t DEFAULT_IDX = std::numeric_limits<uint32_t>::max();

    uint32_t start_idx = DEFAULT_IDX; // start index within public inputs array

    bool operator==(const PublicComponentKey&) const = default;

    bool is_set() const { return start_idx != DEFAULT_IDX; }

    MSGPACK_FIELDS(start_idx);
};
} // namespace bb
