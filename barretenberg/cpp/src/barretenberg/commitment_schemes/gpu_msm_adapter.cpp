#include "barretenberg/commitment_schemes/gpu_msm_adapter.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <algorithm>

namespace bb::gpu_msm_adapter {

namespace {
// Batches at or below this size are converted on the calling thread.
constexpr size_t PARALLEL_CONVERSION_THRESHOLD = 1 << 12;

gpu_msm::U256 to_u256(const uint256_t& value)
{
    return gpu_msm::U256{ { value.data[0], value.data[1], value.data[2], value.data[3] } };
}

uint256_t from_u256(const gpu_msm::U256& value)
{
    return uint256_t(value.limb[0], value.limb[1], value.limb[2], value.limb[3]);
}
} // namespace

template <class Curve> gpu_msm::U256 scalar_to_u256(const typename Curve::ScalarField& scalar)
{
    return to_u256(uint256_t(scalar));
}

template <class Curve> typename Curve::ScalarField u256_to_scalar(const gpu_msm::U256& value)
{
    return typename Curve::ScalarField(from_u256(value));
}

template <class Curve> gpu_msm::AffinePoint point_to_affine(const typename Curve::AffineElement& point)
{
    if (point.is_point_at_infinity()) {
        return gpu_msm::AffinePoint{ gpu_msm::U256{}, gpu_msm::U256{}, true };
    }
    return gpu_msm::AffinePoint{ to_u256(uint256_t(point.x)), to_u256(uint256_t(point.y)), false };
}

template <class Curve> typename Curve::AffineElement affine_to_point(const gpu_msm::AffinePoint& point)
{
    using Element = typename Curve::AffineElement;
    if (point.infinity) {
        return Element::infinity();
    }
    using BaseField = typename Element::Fq;
    return Element(BaseField(from_u256(point.x)), BaseField(from_u256(point.y)));
}

template <class Curve> std::vector<gpu_msm::U256> scalars_to_u256(std::span<const typename Curve::ScalarField> scalars)
{
    std::vector<gpu_msm::U256> result(scalars.size());
    parallel_for_range(
        scalars.size(),
        [&](size_t start, size_t end) {
            for (size_t i = start; i < end; ++i) {
                result[i] = scalar_to_u256<Curve>(scalars[i]);
            }
        },
        PARALLEL_CONVERSION_THRESHOLD);
    return result;
}

template <class Curve>
std::vector<std::unique_ptr<gpu_msm::U256[]>> scalar_columns_to_u256(
    std::span<const std::span<const typename Curve::ScalarField>> columns)
{
    constexpr size_t TASK_SIZE = 1 << 14;
    struct Task {
        size_t column;
        size_t begin;
        size_t end;
    };
    std::vector<std::unique_ptr<gpu_msm::U256[]>> buffers;
    buffers.reserve(columns.size());
    std::vector<Task> tasks;
    for (size_t c = 0; c < columns.size(); ++c) {
        const size_t size = columns[c].size();
        buffers.emplace_back(size == 0 ? nullptr : new gpu_msm::U256[size]);
        for (size_t begin = 0; begin < size; begin += TASK_SIZE) {
            tasks.push_back(Task{ c, begin, std::min(size, begin + TASK_SIZE) });
        }
    }
    parallel_for(tasks.size(), [&](size_t t) {
        const Task& task = tasks[t];
        const auto& column = columns[task.column];
        gpu_msm::U256* out = buffers[task.column].get();
        for (size_t i = task.begin; i < task.end; ++i) {
            out[i] = scalar_to_u256<Curve>(column[i]);
        }
    });
    return buffers;
}

template <class Curve>
std::vector<gpu_msm::AffinePoint> points_to_affine(std::span<const typename Curve::AffineElement> points)
{
    std::vector<gpu_msm::AffinePoint> result(points.size());
    parallel_for_range(
        points.size(),
        [&](size_t start, size_t end) {
            for (size_t i = start; i < end; ++i) {
                result[i] = point_to_affine<Curve>(points[i]);
            }
        },
        PARALLEL_CONVERSION_THRESHOLD);
    return result;
}

template <class Curve>
std::vector<typename Curve::AffineElement> affine_to_points(std::span<const gpu_msm::AffinePoint> points)
{
    std::vector<typename Curve::AffineElement> result;
    result.reserve(points.size());
    for (const auto& point : points) {
        result.push_back(affine_to_point<Curve>(point));
    }
    return result;
}

#define GPU_MSM_ADAPTER_INSTANTIATE(CURVE)                                                                             \
    template gpu_msm::U256 scalar_to_u256<CURVE>(const CURVE::ScalarField&);                                           \
    template CURVE::ScalarField u256_to_scalar<CURVE>(const gpu_msm::U256&);                                           \
    template gpu_msm::AffinePoint point_to_affine<CURVE>(const CURVE::AffineElement&);                                 \
    template CURVE::AffineElement affine_to_point<CURVE>(const gpu_msm::AffinePoint&);                                 \
    template std::vector<gpu_msm::U256> scalars_to_u256<CURVE>(std::span<const CURVE::ScalarField>);                   \
    template std::vector<std::unique_ptr<gpu_msm::U256[]>> scalar_columns_to_u256<CURVE>(                              \
        std::span<const std::span<const CURVE::ScalarField>>);                                                         \
    template std::vector<gpu_msm::AffinePoint> points_to_affine<CURVE>(std::span<const CURVE::AffineElement>);         \
    template std::vector<CURVE::AffineElement> affine_to_points<CURVE>(std::span<const gpu_msm::AffinePoint>);

GPU_MSM_ADAPTER_INSTANTIATE(curve::BN254)
GPU_MSM_ADAPTER_INSTANTIATE(curve::Grumpkin)

#undef GPU_MSM_ADAPTER_INSTANTIATE

} // namespace bb::gpu_msm_adapter
