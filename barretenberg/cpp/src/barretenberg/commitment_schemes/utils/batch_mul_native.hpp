// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include <vector>

namespace bb {
/**
 * @brief Utility for native batch multiplication of group elements
 * @note This is used only for native verification and is not optimized for efficiency
 */
template <typename Commitment, typename FF>
static Commitment batch_mul_native(const std::vector<Commitment>& _points, const std::vector<FF>& _scalars)
{
    std::vector<Commitment> points;
    std::vector<FF> scalars;
    for (size_t i = 0; i < _points.size(); ++i) {
        const auto& point = _points[i];
        const auto& scalar = _scalars[i];

        // TODO: Special handling of point at infinity here due to incorrect serialization.
        if (!scalar.is_zero() && !point.is_point_at_infinity() && !point.y.is_zero()) {
            points.emplace_back(point);
            scalars.emplace_back(scalar);
        }
    }

    if (points.empty()) {
        return Commitment::infinity();
    }

    auto result = points[0] * scalars[0];
    for (size_t idx = 1; idx < scalars.size(); ++idx) {
        result = result + points[idx] * scalars[idx];
    }
    return result;
}

/**
 * @brief Utility for native batch multiplication of group elements
 * @note This is used only for native verification and is not optimized for efficiency
 */
template <typename FF> static FF linear_combination(const std::vector<FF>& as, const std::vector<FF>& bs)
{
    FF result = as[0] * bs[0];
    for (size_t idx = 1; idx < as.size(); ++idx) {
        result += as[idx] * bs[idx];
    }
    return result;
}

} // namespace bb
