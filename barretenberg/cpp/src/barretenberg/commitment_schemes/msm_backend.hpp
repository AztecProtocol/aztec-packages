#pragma once

#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
#include <vector>

namespace bb {

/**
 * @brief The first `size()` points of a curve's fixed SRS, as prepared by an `MsmBackend`.
 *
 * @details `points()` is the host view. `backend_state()` is whatever the backend that prepared these
 * bases keeps alongside it (for example a buffer already converted or uploaded to a device); it is
 * opaque to everyone else and keeps that buffer alive for as long as this object exists. Copies share
 * the state. Pass bases only to the backend that prepared them.
 */
template <class Curve> class FixedBases {
  public:
    using Commitment = typename Curve::AffineElement;

    FixedBases() = default;
    explicit FixedBases(std::span<const Commitment> points, std::shared_ptr<const void> backend_state = nullptr)
        : points_(points)
        , backend_state_(std::move(backend_state))
    {}

    std::span<const Commitment> points() const { return points_; }
    size_t size() const { return points_.size(); }
    const std::shared_ptr<const void>& backend_state() const { return backend_state_; }

  private:
    std::span<const Commitment> points_;
    std::shared_ptr<const void> backend_state_;
};

/**
 * @brief The multi-scalar multiplications behind `CommitmentKey::commit` and `batch_commit`.
 *
 * @details A `CommitmentKey` holds a shared pointer to one of these and forwards to it, so an
 * alternative implementation (for example a GPU one) is injected at construction. Implementations
 * are used through `const` references from several threads, so any state they keep must be
 * guarded internally.
 */
template <class Curve> class MsmBackend {
  public:
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

    MsmBackend() = default;
    MsmBackend(const MsmBackend&) = delete;
    MsmBackend& operator=(const MsmBackend&) = delete;
    virtual ~MsmBackend() = default;

    /**
     * @brief Prepare the first `srs.size()` points of the curve's SRS for repeated use.
     *
     * @details Every caller passes a prefix of the same SRS, so a backend may keep the longest prefix it has
     * seen and, for a longer request, prepare only the points beyond it. The returned bases stay valid after
     * later calls. `srs` must outlive the returned bases.
     */
    virtual FixedBases<Curve> prepare_bases(std::span<const Commitment> srs) const = 0;

    /**
     * @brief Commit to one polynomial: sum_j polynomial[start + j] * bases[start + j].
     * @param has_duplicates_hint True if the polynomial is known to repeat coefficient values.
     */
    virtual Commitment commit(const FixedBases<Curve>& bases,
                              PolynomialSpan<const Fr> polynomial,
                              bool has_duplicates_hint) const = 0;

    /**
     * @brief Commit to several polynomials against the same bases.
     * @param dedup_infos Per-polynomial duplicate hints, as produced by `CommitmentKey::batch_commit`.
     */
    virtual std::vector<Commitment> batch_commit(const FixedBases<Curve>& bases,
                                                 std::span<PolynomialSpan<Fr>> scalar_spans,
                                                 std::span<const uint32_t> dedup_infos) const = 0;
};

/**
 * @brief The existing CPU Pippenger.
 */
template <class Curve> class CpuMsmBackend final : public MsmBackend<Curve> {
  public:
    using Fr = typename MsmBackend<Curve>::Fr;
    using Commitment = typename MsmBackend<Curve>::Commitment;

    FixedBases<Curve> prepare_bases(std::span<const Commitment> srs) const override { return FixedBases<Curve>(srs); }

    Commitment commit(const FixedBases<Curve>& bases,
                      PolynomialSpan<const Fr> polynomial,
                      bool has_duplicates_hint) const override
    {
        return scalar_multiplication::pippenger_unsafe<Curve>(polynomial, bases.points(), has_duplicates_hint);
    }

    std::vector<Commitment> batch_commit(const FixedBases<Curve>& bases,
                                         std::span<PolynomialSpan<Fr>> scalar_spans,
                                         std::span<const uint32_t> dedup_infos) const override
    {
        auto results = scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(
            bases.points(), scalar_spans, /*handle_edge_cases=*/false, dedup_infos);
        return std::vector<Commitment>(results.begin(), results.end());
    }
};

} // namespace bb
