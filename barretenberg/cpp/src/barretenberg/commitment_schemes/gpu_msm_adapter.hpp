#pragma once

/**
 * @brief The single adapter between barretenberg's BN254 / Grumpkin field and point types and the
 *        plain-data GPU MSM core interface (`bb::gpu_msm::U256` / `AffinePoint` / `Column`,
 *        declared in `ecc/scalar_multiplication/gpu/msm_core.hpp`).
 *
 * @details This is the only place in the tree that converts between barretenberg types and the core's
 * structs. It is intentionally narrow: scalar conversion, point conversion, and the batch forms of each.
 * Every function is a template on the curve (`curve::BN254` or `curve::Grumpkin`, the two instantiated
 * in the .cpp), so a scalar or point of one curve cannot be passed to the conversion for the other.
 * Every function takes and returns by value or `std::span`/`std::vector`.
 */

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/scalar_multiplication/gpu/msm_core.hpp"

#include <memory>
#include <span>
#include <type_traits>
#include <vector>

namespace bb::gpu_msm_adapter {

/// The core's selector for a barretenberg curve.
template <class Curve> constexpr gpu_msm::Curve core_curve()
{
    static_assert(std::is_same_v<Curve, curve::BN254> || std::is_same_v<Curve, curve::Grumpkin>,
                  "the GPU MSM core supports BN254 and Grumpkin");
    return std::is_same_v<Curve, curve::BN254> ? gpu_msm::Curve::Bn254 : gpu_msm::Curve::Grumpkin;
}

/// Canonical (non-Montgomery) scalar <-> gpu_msm::U256.
template <class Curve> gpu_msm::U256 scalar_to_u256(const typename Curve::ScalarField& scalar);
template <class Curve> typename Curve::ScalarField u256_to_scalar(const gpu_msm::U256& value);

/**
 * @brief Affine point <-> gpu_msm::AffinePoint, with infinity handled explicitly. The coordinates are
 * barretenberg's stored Montgomery limbs (reduced to [0, p)), copied with no arithmetic, which is the form the
 * core expects.
 */
template <class Curve> gpu_msm::AffinePoint point_to_affine(const typename Curve::AffineElement& point);
template <class Curve> typename Curve::AffineElement affine_to_point(const gpu_msm::AffinePoint& point);

/// Batch forms, used by the GPU backend to build/consume the core's batched call.
template <class Curve> std::vector<gpu_msm::U256> scalars_to_u256(std::span<const typename Curve::ScalarField> scalars);
/**
 * @brief Convert several scalar columns in one parallel pass into uninitialised buffers.
 * @details Buffer `i` holds `columns[i].size()` entries, every one written here, so no zero-fill is paid and
 * the work spreads across threads even when the columns are individually small.
 */
template <class Curve>
std::vector<std::unique_ptr<gpu_msm::U256[]>> scalar_columns_to_u256(
    std::span<const std::span<const typename Curve::ScalarField>> columns);
template <class Curve>
std::vector<gpu_msm::AffinePoint> points_to_affine(std::span<const typename Curve::AffineElement> points);
template <class Curve>
std::vector<typename Curve::AffineElement> affine_to_points(std::span<const gpu_msm::AffinePoint> points);

} // namespace bb::gpu_msm_adapter
