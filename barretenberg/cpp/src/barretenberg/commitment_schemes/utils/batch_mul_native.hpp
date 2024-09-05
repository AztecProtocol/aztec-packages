#pragma once
#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include <vector>

namespace bb {
template <typename Curve> class CommitmentSchemesUtils {

  public:
    using Commitment = typename Curve::AffineElement;
    using FF = typename Curve::ScalarField;

    /**
     * @brief Utility for native batch multiplication of group elements
     * @note This is used only for native verification and is not optimized for efficiency
     */
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
};
} // namespace bb