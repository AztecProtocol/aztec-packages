#include "barretenberg/commitment_schemes/emulated_msm_backend.hpp"

#include "barretenberg/commitment_schemes/gpu_msm_adapter.hpp"
#include "barretenberg/common/assert.hpp"

#include <algorithm>
#include <array>

namespace bb {

namespace {
bool same_point(const gpu_msm::AffinePoint& a, const gpu_msm::AffinePoint& b)
{
    if (a.infinity || b.infinity) {
        return a.infinity == b.infinity;
    }
    for (size_t i = 0; i < 4; ++i) {
        if (a.x.limb[i] != b.x.limb[i] || a.y.limb[i] != b.y.limb[i]) {
            return false;
        }
    }
    return true;
}

// True if `srs` agrees with the resident points at the first, middle and last index they share.
template <class Curve>
bool agrees_with_resident(std::span<const gpu_msm::AffinePoint> resident,
                          std::span<const typename Curve::AffineElement> srs)
{
    const size_t shared = std::min(resident.size(), srs.size());
    if (shared == 0) {
        return false;
    }
    for (const size_t index : std::array<size_t, 3>{ 0, shared / 2, shared - 1 }) {
        if (!same_point(resident[index], gpu_msm_adapter::point_to_affine<Curve>(srs[index]))) {
            return false;
        }
    }
    return true;
}

template <class Curve> gpu_msm::CoreConfig core_config()
{
    gpu_msm::CoreConfig config;
    config.curve = gpu_msm_adapter::core_curve<Curve>();
    return config;
}
} // namespace

template <class Curve> FixedBases<Curve> EmulatedMsmBackend<Curve>::prepare_bases(std::span<const Commitment> srs) const
{
    const std::lock_guard<std::mutex> lock(mutex_);
    if (resident_ != nullptr && agrees_with_resident<Curve>(resident_->points, srs)) {
        if (resident_->points.size() < srs.size()) {
            auto extended = std::make_shared<ResidentPoints>(*resident_);
            const std::vector<gpu_msm::AffinePoint> tail =
                gpu_msm_adapter::points_to_affine<Curve>(srs.subspan(resident_->points.size()));
            extended->points.insert(extended->points.end(), tail.begin(), tail.end());
            resident_ = std::move(extended);
        }
    } else {
        auto fresh = std::make_shared<ResidentPoints>();
        fresh->points = gpu_msm_adapter::points_to_affine<Curve>(srs);
        resident_ = std::move(fresh);
    }
    return FixedBases<Curve>(srs, resident_);
}

template <class Curve>
std::vector<gpu_msm::AffinePoint> EmulatedMsmBackend<Curve>::run_batch(std::span<const gpu_msm::AffinePoint> points,
                                                                       std::span<const gpu_msm::Column> columns) const
{
    if (!serialize_runs_) {
        return run_(points, columns, core_config<Curve>());
    }
    const std::lock_guard<std::mutex> lock(run_mutex_);
    return run_(points, columns, core_config<Curve>());
}

template <class Curve> size_t EmulatedMsmBackend<Curve>::resident_size() const
{
    const std::lock_guard<std::mutex> lock(mutex_);
    return resident_ == nullptr ? 0 : resident_->points.size();
}

template <class Curve>
typename EmulatedMsmBackend<Curve>::Commitment EmulatedMsmBackend<Curve>::commit(const FixedBases<Curve>& bases,
                                                                                 PolynomialSpan<const Fr> polynomial,
                                                                                 bool /*has_duplicates_hint*/) const
{
    const auto* resident = static_cast<const ResidentPoints*>(bases.backend_state().get());
    BB_ASSERT(resident != nullptr, "bases were not prepared by an EmulatedMsmBackend");
    BB_ASSERT_LTE(polynomial.start_index + polynomial.size(), bases.size(), "polynomial exceeds the prepared bases");
    const std::span<const Fr> input(polynomial.span);
    const auto scalars =
        gpu_msm_adapter::scalar_columns_to_u256<Curve>(std::span<const std::span<const Fr>>(&input, 1));
    const gpu_msm::Column column{ scalars.front().get(), polynomial.start_index, input.size() };
    const std::vector<gpu_msm::AffinePoint> results =
        run_batch(std::span<const gpu_msm::AffinePoint>(resident->points).first(bases.size()),
                  std::span<const gpu_msm::Column>(&column, 1));
    return gpu_msm_adapter::affine_to_point<Curve>(results.front());
}

template <class Curve>
std::vector<typename EmulatedMsmBackend<Curve>::Commitment> EmulatedMsmBackend<Curve>::batch_commit(
    const FixedBases<Curve>& bases,
    std::span<PolynomialSpan<Fr>> scalar_spans,
    std::span<const uint32_t> /*dedup_infos*/) const
{
    if (scalar_spans.empty()) {
        return {};
    }
    const auto* resident = static_cast<const ResidentPoints*>(bases.backend_state().get());
    BB_ASSERT(resident != nullptr, "bases were not prepared by an EmulatedMsmBackend");

    std::vector<std::span<const Fr>> inputs;
    inputs.reserve(scalar_spans.size());
    for (const auto& span : scalar_spans) {
        BB_ASSERT_LTE(span.start_index + span.size(), bases.size(), "polynomial exceeds the prepared bases");
        inputs.emplace_back(span.span);
    }
    const auto scalar_storage = gpu_msm_adapter::scalar_columns_to_u256<Curve>(inputs);
    std::vector<gpu_msm::Column> columns;
    columns.reserve(scalar_spans.size());
    for (size_t i = 0; i < scalar_spans.size(); ++i) {
        columns.push_back(gpu_msm::Column{ scalar_storage[i].get(), scalar_spans[i].start_index, inputs[i].size() });
    }

    return gpu_msm_adapter::affine_to_points<Curve>(
        run_batch(std::span<const gpu_msm::AffinePoint>(resident->points).first(bases.size()), columns));
}

template class EmulatedMsmBackend<curve::BN254>;
template class EmulatedMsmBackend<curve::Grumpkin>;

} // namespace bb
