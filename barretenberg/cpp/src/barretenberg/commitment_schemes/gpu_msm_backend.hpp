#pragma once

#include "barretenberg/commitment_schemes/msm_backend.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/scalar_multiplication/gpu/msm_core.hpp"

#include <memory>
#include <mutex>

namespace bb {

/**
 * @brief MSM backend for BN254 or Grumpkin over the GPU MSM core. The batched MSM it runs is injected, so the
 *        class builds without a CUDA toolchain: the factory passes `gpu_msm::msm_batch_cuda` with
 *        `serialize_runs`, and tests pass a reference runner.
 *
 * @details `prepare_bases` converts the SRS to the core's point format once and keeps the longest
 * prefix converted so far, which is the host-side stand-in for a device-resident SRS. A longer
 * request converts only the points beyond the resident prefix. A request whose points differ from
 * the resident ones (probed at the first, middle and last resident index) replaces the prefix. The prefix is
 * only reused when several keys are given the same backend instance.
 */
template <class Curve> class GpuMsmBackend final : public MsmBackend<Curve> {
  public:
    using Fr = typename MsmBackend<Curve>::Fr;
    using Commitment = typename MsmBackend<Curve>::Commitment;
    using BatchRunner = std::vector<gpu_msm::AffinePoint> (*)(std::span<const gpu_msm::AffinePoint>,
                                                              std::span<const gpu_msm::Column>,
                                                              const gpu_msm::CoreConfig&);

    /**
     * @param run The batched MSM executed for every `commit` and `batch_commit`.
     * @param serialize_runs Run one batch at a time. Set it for a device runner, whose calls each allocate
     * buffers sized by the whole batch.
     */
    explicit GpuMsmBackend(BatchRunner run, bool serialize_runs = false)
        : run_(run)
        , serialize_runs_(serialize_runs)
    {}

    FixedBases<Curve> prepare_bases(std::span<const Commitment> srs) const override;

    Commitment commit(const FixedBases<Curve>& bases,
                      PolynomialSpan<const Fr> polynomial,
                      bool has_duplicates_hint) const override;

    std::vector<Commitment> batch_commit(const FixedBases<Curve>& bases,
                                         std::span<PolynomialSpan<Fr>> scalar_spans,
                                         std::span<const uint32_t> dedup_infos) const override;

    /// Number of points in the resident prefix.
    size_t resident_size() const;

  private:
    struct ResidentPoints {
        std::vector<gpu_msm::AffinePoint> points;
    };

    std::vector<gpu_msm::AffinePoint> run_batch(std::span<const gpu_msm::AffinePoint> points,
                                                std::span<const gpu_msm::Column> columns) const;

    BatchRunner run_;
    bool serialize_runs_;
    mutable std::mutex run_mutex_;
    mutable std::mutex mutex_;
    mutable std::shared_ptr<const ResidentPoints> resident_;
};

extern template class GpuMsmBackend<curve::BN254>;
extern template class GpuMsmBackend<curve::Grumpkin>;

} // namespace bb
