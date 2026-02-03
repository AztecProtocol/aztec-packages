// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <cstdint>

namespace acir_format {

struct RangeConstraint {
    uint32_t witness;
    uint32_t num_bits;

    friend bool operator==(RangeConstraint const& lhs, RangeConstraint const& rhs) = default;
};

} // namespace acir_format
