// Tests for the MSM backend injected into CommitmentKey::commit and batch_commit.
//
// They run in CI without a GPU. They check that a CommitmentKey with the default CPU backend still commits as before,
// and that GpuMsmBackend and the adapter in gpu_msm_adapter.hpp (type conversion, infinity and empty columns, the
// cached SRS prefix) produce the same commitments, proof bytes and error behaviour as the CPU backend. The MSM itself
// is replaced by a CPU reference runner, so these tests do not exercise the CUDA kernels; gpu_msm_tests/test_cuda.cpp
// does.

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gpu_msm_adapter.hpp"
#include "barretenberg/commitment_schemes/gpu_msm_backend.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/msm_backend_factory.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>

namespace bb {

namespace {
// Reference runner for GpuMsmBackend: converts the core's plain-data inputs back to barretenberg types and computes
// each column with the CPU Pippenger, so the backend and the adapter are tested without a device.
template <class Curve>
std::vector<gpu_msm::AffinePoint> reference_run(std::span<const gpu_msm::AffinePoint> points,
                                                std::span<const gpu_msm::Column> columns)
{
    using Fr = typename Curve::ScalarField;
    std::vector<gpu_msm::AffinePoint> results;
    results.reserve(columns.size());
    for (const auto& column : columns) {
        std::vector<Fr> scalars;
        scalars.reserve(column.size);
        for (uint64_t j = 0; j < column.size; ++j) {
            scalars.push_back(gpu_msm_adapter::u256_to_scalar<Curve>(column.scalars[j]));
        }
        const auto bases = gpu_msm_adapter::affine_to_points<Curve>(points.subspan(column.start, column.size));
        const auto result =
            scalar_multiplication::pippenger_unsafe<Curve>(PolynomialSpan<const Fr>(0, scalars), bases, false);
        results.push_back(gpu_msm_adapter::point_to_affine<Curve>(result));
    }
    return results;
}

std::vector<gpu_msm::AffinePoint> reference_runner(std::span<const gpu_msm::AffinePoint> points,
                                                   std::span<const gpu_msm::Column> columns,
                                                   const gpu_msm::CoreConfig& config)
{
    return config.curve == gpu_msm::Curve::Grumpkin ? reference_run<curve::Grumpkin>(points, columns)
                                                    : reference_run<curve::BN254>(points, columns);
}
} // namespace

class CommitmentKeyMsmBackendTest : public ::testing::Test {
  public:
    using Curve = curve::BN254;
    using CK = CommitmentKey<Curve>;
    using Fr = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using GroupElement = Curve::Element;
    using Polynomial = bb::Polynomial<Fr>;

    static constexpr size_t kNumPoints = 4096;

    static std::shared_ptr<const MsmBackend<Curve>> gpu_backend()
    {
        return std::make_shared<GpuMsmBackend<Curve>>(&reference_runner);
    }

    static void SetUpTestSuite() { srs::init_file_crs_factory(srs::bb_crs_path()); }

    // Naive reference MSM, as in commitment_key.test.cpp: result = sum srs[i] * poly[i].
    static Commitment commit_naive(const CK& ck, const Polynomial& poly)
    {
        if (poly.size() == 0) {
            return Commitment::infinity();
        }
        auto srs = ck.get_monomial_points();
        GroupElement result = srs[poly.start_index()] * poly[poly.start_index()];
        for (size_t i = poly.start_index() + 1; i < poly.end_index(); ++i) {
            result += srs[i] * poly[i];
        }
        return result.normalize();
    }

    static Polynomial dense_random_poly() { return Polynomial::random(1 << 12); }

    static Polynomial sparse_poly()
    {
        constexpr size_t n = 1 << 10;
        Polynomial poly(n);
        // Sparse: one nonzero coefficient in twenty.
        for (size_t i = 0; i < n; i += 20) {
            poly.at(i) = Fr::random_element();
        }
        return poly;
    }

    static Polynomial start_index_poly()
    {
        constexpr size_t start_index = 1 << 7;
        constexpr size_t size = 1 << 8;
        constexpr size_t virtual_size = start_index + size;
        Polynomial poly(size, virtual_size, start_index);
        for (size_t i = 0; i < size; ++i) {
            poly.at(start_index + i) = Fr::random_element();
        }
        return poly;
    }

    static Polynomial all_zero_poly() { return Polynomial(64); }

    static Polynomial single_coefficient_poly()
    {
        Polynomial poly(1);
        poly.at(0) = Fr::random_element();
        return poly;
    }

    static std::vector<Polynomial> five_shapes()
    {
        return { dense_random_poly(), sparse_poly(), start_index_poly(), all_zero_poly(), single_coefficient_poly() };
    }
};

TEST_F(CommitmentKeyMsmBackendTest, DefaultConstructCopyConstructCopyAssign)
{
    CK default_key;
    EXPECT_FALSE(default_key.initialized());

    CK built_key(kNumPoints, gpu_backend());
    EXPECT_TRUE(built_key.initialized());

    CK copy_constructed(built_key);
    EXPECT_TRUE(copy_constructed.initialized());

    CK copy_assigned;
    copy_assigned = built_key;
    EXPECT_TRUE(copy_assigned.initialized());
}

TEST_F(CommitmentKeyMsmBackendTest, CommitDenseRandomPolynomial)
{
    CK ck_gpu(kNumPoints, gpu_backend());
    CK ck_cpu(kNumPoints);
    Polynomial poly = dense_random_poly();

    Commitment gpu = ck_gpu.commit(poly);
    Commitment cpu = ck_cpu.commit(poly);
    Commitment naive = commit_naive(ck_cpu, poly);

    EXPECT_EQ(gpu, cpu);
    EXPECT_EQ(gpu, naive);
}

TEST_F(CommitmentKeyMsmBackendTest, CommitSparsePolynomial)
{
    CK ck_gpu(kNumPoints, gpu_backend());
    CK ck_cpu(kNumPoints);
    Polynomial poly = sparse_poly();

    Commitment gpu = ck_gpu.commit(poly);
    Commitment cpu = ck_cpu.commit(poly);
    Commitment naive = commit_naive(ck_cpu, poly);

    EXPECT_EQ(gpu, cpu);
    EXPECT_EQ(gpu, naive);
}

TEST_F(CommitmentKeyMsmBackendTest, CommitWithStartIndex)
{
    CK ck_gpu(kNumPoints, gpu_backend());
    CK ck_cpu(kNumPoints);
    Polynomial poly = start_index_poly();

    Commitment gpu = ck_gpu.commit(poly);
    Commitment cpu = ck_cpu.commit(poly);
    Commitment naive = commit_naive(ck_cpu, poly);

    EXPECT_EQ(gpu, cpu);
    EXPECT_EQ(gpu, naive);
}

TEST_F(CommitmentKeyMsmBackendTest, CommitAllZeroPolynomial)
{
    CK ck_gpu(kNumPoints, gpu_backend());
    CK ck_cpu(kNumPoints);
    Polynomial poly = all_zero_poly();

    Commitment gpu = ck_gpu.commit(poly);
    Commitment cpu = ck_cpu.commit(poly);

    EXPECT_TRUE(gpu.is_point_at_infinity());
    EXPECT_EQ(gpu, cpu);
}

TEST_F(CommitmentKeyMsmBackendTest, BatchCommitDirectMixedShapes)
{
    CK ck_gpu(kNumPoints, gpu_backend());
    std::vector<Polynomial> polys = five_shapes();

    RefVector<Polynomial> poly_refs(polys);
    std::vector<Commitment> batch_commitments = ck_gpu.batch_commit(poly_refs);

    ASSERT_EQ(batch_commitments.size(), polys.size());
    for (size_t i = 0; i < polys.size(); ++i) {
        Commitment individual = ck_gpu.commit(polys[i]);
        EXPECT_EQ(batch_commitments[i], individual);
    }
}

namespace {
std::vector<CommitmentKeyMsmBackendTest::Commitment> run_production_batch_path(
    CommitmentKeyMsmBackendTest::CK& ck, std::vector<CommitmentKeyMsmBackendTest::Polynomial>& polys)
{
    auto transcript = NativeTranscript::test_prover_init_empty();
    auto batch = ck.start_batch();
    for (size_t i = 0; i < polys.size(); ++i) {
        batch.add_to_batch(polys[i], "poly_" + std::to_string(i), /*has_duplicates_hint=*/(i % 2 == 0));
    }
    return batch.commit_and_send_to_verifier(transcript);
}
} // namespace

TEST_F(CommitmentKeyMsmBackendTest, ProductionBatchPath)
{
    CK ck_gpu(kNumPoints, gpu_backend());
    CK ck_cpu(kNumPoints);
    std::vector<Polynomial> polys_gpu = five_shapes();
    std::vector<Polynomial> polys_cpu = polys_gpu; // identical coefficients

    std::vector<Commitment> gpu_results = run_production_batch_path(ck_gpu, polys_gpu);
    std::vector<Commitment> cpu_results = run_production_batch_path(ck_cpu, polys_cpu);

    ASSERT_EQ(gpu_results.size(), polys_gpu.size());
    ASSERT_EQ(cpu_results.size(), gpu_results.size());
    for (size_t i = 0; i < gpu_results.size(); ++i) {
        Commitment individual = ck_gpu.commit(polys_gpu[i]);
        EXPECT_EQ(gpu_results[i], individual);
        EXPECT_EQ(gpu_results[i], cpu_results[i]);
    }
}

TEST_F(CommitmentKeyMsmBackendTest, CoefficientsUnchangedAfterBatchCommit)
{
    CK ck_gpu(kNumPoints, gpu_backend());
    std::vector<Polynomial> polys = { dense_random_poly(), sparse_poly(), start_index_poly() };
    ASSERT_GE(polys.size(), 3u);

    std::vector<std::vector<Fr>> before;
    for (const auto& poly : polys) {
        before.emplace_back(poly.coeffs().begin(), poly.coeffs().end());
    }

    RefVector<Polynomial> poly_refs(polys);
    ck_gpu.batch_commit(poly_refs);

    for (size_t i = 0; i < polys.size(); ++i) {
        std::vector<Fr> after(polys[i].coeffs().begin(), polys[i].coeffs().end());
        EXPECT_EQ(before[i], after);
    }
}

TEST_F(CommitmentKeyMsmBackendTest, ProofBytesIdenticalCpuVsGpuAndBothVerify)
{
    using PCS = KZG<Curve>;
    constexpr size_t n = 64;

    CK ck_cpu(n);
    CK ck_gpu(n, gpu_backend());

    Polynomial witness = Polynomial::random(n);
    const Fr challenge = Fr::random_element();
    const Fr evaluation = witness.evaluate(challenge);
    OpeningPair<Curve> opening_pair{ challenge, evaluation };

    Commitment commitment_cpu = ck_cpu.commit(witness);
    Commitment commitment_gpu = ck_gpu.commit(witness);
    EXPECT_EQ(commitment_cpu, commitment_gpu);

    Polynomial witness_for_cpu = witness;
    Polynomial witness_for_gpu = witness;

    auto prover_transcript_cpu = NativeTranscript::test_prover_init_empty();
    PCS::compute_opening_proof(ck_cpu, { witness_for_cpu, opening_pair }, prover_transcript_cpu);

    auto prover_transcript_gpu = NativeTranscript::test_prover_init_empty();
    PCS::compute_opening_proof(ck_gpu, { witness_for_gpu, opening_pair }, prover_transcript_gpu);

    EXPECT_EQ(prover_transcript_cpu->test_get_proof_data(), prover_transcript_gpu->test_get_proof_data());

    OpeningClaim<Curve> opening_claim{ opening_pair, commitment_cpu };

    auto verifier_transcript_cpu = NativeTranscript::test_verifier_init_empty(prover_transcript_cpu);
    auto pairing_points_cpu = PCS::reduce_verify(opening_claim, verifier_transcript_cpu);
    EXPECT_TRUE(pairing_points_cpu.check());

    auto verifier_transcript_gpu = NativeTranscript::test_verifier_init_empty(prover_transcript_gpu);
    auto pairing_points_gpu = PCS::reduce_verify(opening_claim, verifier_transcript_gpu);
    EXPECT_TRUE(pairing_points_gpu.check());
}

// Injection: the key computes with the backend it was given and copies share it.
namespace {
// Returns a fixed commitment for every request, so a test can tell which backend ran.
class FixedResultBackend final : public MsmBackend<curve::BN254> {
  public:
    explicit FixedResultBackend(Commitment result)
        : result_(result)
    {}
    FixedBases<curve::BN254> prepare_bases(std::span<const Commitment> srs) const override
    {
        return FixedBases<curve::BN254>(srs);
    }
    Commitment commit(const FixedBases<curve::BN254>&, PolynomialSpan<const Fr>, bool) const override
    {
        return result_;
    }
    std::vector<Commitment> batch_commit(const FixedBases<curve::BN254>&,
                                         std::span<PolynomialSpan<Fr>> scalar_spans,
                                         std::span<const uint32_t>) const override
    {
        return std::vector<Commitment>(scalar_spans.size(), result_);
    }

  private:
    Commitment result_;
};
} // namespace

TEST_F(CommitmentKeyMsmBackendTest, InjectedBackendComputesTheCommitments)
{
    const Commitment sentinel = Commitment::one() * Fr(7);
    CK ck(kNumPoints, std::make_shared<FixedResultBackend>(sentinel));
    Polynomial poly = single_coefficient_poly();
    EXPECT_EQ(ck.commit(poly), sentinel);

    std::vector<Polynomial> polys = { single_coefficient_poly(), single_coefficient_poly() };
    RefVector<Polynomial> poly_refs(polys);
    EXPECT_EQ(ck.batch_commit(poly_refs), (std::vector<Commitment>{ sentinel, sentinel }));
}

// Prepared bases: the GPU backend keeps the longest converted SRS prefix.
TEST_F(CommitmentKeyMsmBackendTest, PreparedBasesReuseAndExtendTheResidentPrefix)
{
    auto backend = std::make_shared<GpuMsmBackend<Curve>>(&reference_runner);
    CK ck(kNumPoints, backend);
    const std::span<const Commitment> srs = ck.get_monomial_points();
    ASSERT_GT(srs.size(), 64u);
    EXPECT_EQ(backend->resident_size(), srs.size());

    // A shorter prefix of the same SRS reuses the resident points.
    FixedBases<Curve> shorter = backend->prepare_bases(srs.first(64));
    EXPECT_EQ(shorter.size(), 64u);
    EXPECT_EQ(backend->resident_size(), srs.size());

    // The handle still computes correct commitments after the resident block was extended elsewhere.
    Polynomial poly = Polynomial::random(64);
    EXPECT_EQ(backend->commit(shorter, poly, false), commit_naive(ck, poly));
}

TEST_F(CommitmentKeyMsmBackendTest, PreparedBasesReplacedWhenThePointsDiffer)
{
    GpuMsmBackend<Curve> backend(&reference_runner);
    CK ck(kNumPoints);
    const std::span<const Commitment> srs = ck.get_monomial_points();
    std::vector<Commitment> other(256);
    for (size_t i = 0; i < other.size(); ++i) {
        other[i] = Commitment::one() * Fr(i + 2);
    }

    backend.prepare_bases(srs.first(512));
    EXPECT_EQ(backend.resident_size(), 512u);
    FixedBases<Curve> replaced = backend.prepare_bases(other);
    EXPECT_EQ(backend.resident_size(), 256u);

    Polynomial poly = Polynomial::random(256);
    GroupElement expected = other[0] * poly[0];
    for (size_t i = 1; i < 256; ++i) {
        expected += other[i] * poly[i];
    }
    EXPECT_EQ(backend.commit(replaced, poly, false), Commitment(expected.normalize()));
}

// Grumpkin: the GPU backend agrees with the CPU Pippenger and a naive sum on synthetic bases.
class GrumpkinGpuBackendTest : public ::testing::Test {
  public:
    using Curve = curve::Grumpkin;
    using Fr = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using GroupElement = Curve::Element;
    using Polynomial = bb::Polynomial<Fr>;

    static std::vector<Commitment> random_bases(size_t n)
    {
        std::vector<Commitment> bases(n);
        for (auto& base : bases) {
            base = Commitment::one() * Fr::random_element();
        }
        return bases;
    }

    static Commitment naive(std::span<const Commitment> bases, const Polynomial& poly)
    {
        GroupElement result = GroupElement::infinity();
        for (size_t i = poly.start_index(); i < poly.end_index(); ++i) {
            result += bases[i] * poly[i];
        }
        return result.normalize();
    }
};

TEST_F(GrumpkinGpuBackendTest, CommitMatchesCpuAndNaive)
{
    GpuMsmBackend<Curve> gpu(&reference_runner);
    CpuMsmBackend<Curve> cpu;
    const std::vector<Commitment> bases = random_bases(600);
    const FixedBases<Curve> gpu_bases = gpu.prepare_bases(bases);
    const FixedBases<Curve> cpu_bases = cpu.prepare_bases(bases);

    Polynomial dense = Polynomial::random(600);
    Polynomial sparse(600);
    for (size_t i = 0; i < 600; i += 17) {
        sparse.at(i) = Fr::random_element();
    }
    Polynomial offset(200, 500, 300);
    for (size_t i = 300; i < 500; ++i) {
        offset.at(i) = Fr::random_element();
    }
    for (const Polynomial* poly : { &dense, &sparse, &offset }) {
        const PolynomialSpan<const Fr> span(poly->start_index(), poly->coeffs());
        const Commitment gpu_result = gpu.commit(gpu_bases, span, false);
        EXPECT_EQ(gpu_result, cpu.commit(cpu_bases, span, false));
        EXPECT_EQ(gpu_result, naive(bases, *poly));
    }
}

TEST_F(GrumpkinGpuBackendTest, BatchCommitMatchesCpu)
{
    GpuMsmBackend<Curve> gpu(&reference_runner);
    CpuMsmBackend<Curve> cpu;
    const std::vector<Commitment> bases = random_bases(400);
    const FixedBases<Curve> gpu_bases = gpu.prepare_bases(bases);
    const FixedBases<Curve> cpu_bases = cpu.prepare_bases(bases);

    std::vector<Polynomial> polys = { Polynomial::random(400), Polynomial::random(150), Polynomial(64) };
    std::vector<PolynomialSpan<Fr>> spans_for_gpu;
    std::vector<PolynomialSpan<Fr>> spans_for_cpu;
    std::vector<Polynomial> cpu_polys = polys;
    for (size_t i = 0; i < polys.size(); ++i) {
        spans_for_gpu.emplace_back(polys[i].start_index(), polys[i].coeffs());
        spans_for_cpu.emplace_back(cpu_polys[i].start_index(), cpu_polys[i].coeffs());
    }

    const std::vector<Commitment> gpu_results = gpu.batch_commit(gpu_bases, spans_for_gpu, {});
    const std::vector<Commitment> cpu_results = cpu.batch_commit(cpu_bases, spans_for_cpu, {});
    EXPECT_EQ(gpu_results, cpu_results);
    EXPECT_TRUE(gpu_results.back().is_point_at_infinity());
}

TEST_F(CommitmentKeyMsmBackendTest, NullBackendIsRejected)
{
    ASSERT_THROW_OR_ABORT((CK(kNumPoints, std::shared_ptr<const MsmBackend<Curve>>{})), "requires an MSM backend");
}

TEST_F(CommitmentKeyMsmBackendTest, ErrorOversizedSpanThrows)
{
    CK ck_gpu(16, gpu_backend());
    // get_monomial_size() may exceed the requested 16 (the underlying SRS is loaded in larger
    // fixed chunks), so size strictly relative to what the key actually reports, not to the
    // constructor argument.
    Polynomial poly(ck_gpu.get_monomial_size() + 1);
    ASSERT_THROW_OR_ABORT(ck_gpu.commit(poly), "Attempting to commit to a polynomial that needs");
}

TEST_F(CommitmentKeyMsmBackendTest, ErrorEmptyBatchCommitMatchesCpu)
{
    CK ck_gpu(kNumPoints, gpu_backend());
    CK ck_cpu(kNumPoints);

    RefVector<Polynomial> empty_refs;
    std::vector<Commitment> gpu_result = ck_gpu.batch_commit(empty_refs);
    std::vector<Commitment> cpu_result = ck_cpu.batch_commit(empty_refs);

    EXPECT_TRUE(gpu_result.empty());
    EXPECT_EQ(gpu_result, cpu_result);
}

TEST_F(CommitmentKeyMsmBackendTest, ErrorZeroLengthSpanMatchesCpu)
{
    CK ck_gpu(kNumPoints, gpu_backend());
    CK ck_cpu(kNumPoints);

    PolynomialSpan<const Fr> zero_span(0, std::span<const Fr>{});
    Commitment gpu_result = ck_gpu.commit(zero_span);
    Commitment cpu_result = ck_cpu.commit(zero_span);

    EXPECT_TRUE(gpu_result.is_point_at_infinity());
    EXPECT_EQ(gpu_result, cpu_result);
}

// The backend a prover is built with (CUDA in a GPU_MSM build, the CPU Pippenger otherwise) commits to the
// five shapes, singly and through the production batch path, exactly as the default CPU key does.
TEST_F(CommitmentKeyMsmBackendTest, FactoryBackendMatchesCpu)
{
    CK ck_factory(kNumPoints, make_msm_backend<Curve>());
    CK ck_cpu(kNumPoints);
    std::vector<Polynomial> polys_factory = five_shapes();
    std::vector<Polynomial> polys_cpu = polys_factory;

    for (const Polynomial& poly : polys_factory) {
        EXPECT_EQ(ck_factory.commit(poly), ck_cpu.commit(poly));
    }
    const std::vector<Commitment> factory_results = run_production_batch_path(ck_factory, polys_factory);
    const std::vector<Commitment> cpu_results = run_production_batch_path(ck_cpu, polys_cpu);
    EXPECT_EQ(factory_results, cpu_results);
}

} // namespace bb
