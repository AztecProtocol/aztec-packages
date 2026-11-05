// Tests for the MSM backend injected into CommitmentKey::commit/batch_commit. They compare
// commitments, proof byte vectors, and verification/throw outcomes.

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/emulated_msm_backend.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/msm_backend_factory.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <gtest/gtest.h>

namespace bb {

class CommitmentKeyMsmBackendTest : public ::testing::Test {
  public:
    using Curve = curve::BN254;
    using CK = CommitmentKey<Curve>;
    using Fr = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    using GroupElement = Curve::Element;
    using Polynomial = bb::Polynomial<Fr>;

    static constexpr size_t kNumPoints = 4096;

    static std::shared_ptr<const MsmBackend<Curve>> emulated_backend()
    {
        return std::make_shared<EmulatedMsmBackend<Curve>>();
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

    // The five shapes criterion 9 requires.
    static Polynomial dense_random_poly() { return Polynomial::random(1 << 12); }

    static Polynomial sparse_poly()
    {
        constexpr size_t n = 1 << 10;
        Polynomial poly(n);
        // 5% nonzero, well under the 10% ceiling, well above "all zero".
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

// ---------------------------------------------------------------------------------------------
// Criterion 5: default-constructible, copy-constructible, copy-assignable.
// ---------------------------------------------------------------------------------------------
TEST_F(CommitmentKeyMsmBackendTest, DefaultConstructCopyConstructCopyAssign)
{
    CK default_key;
    EXPECT_FALSE(default_key.initialized());

    CK built_key(kNumPoints, emulated_backend());
    EXPECT_TRUE(built_key.initialized());

    CK copy_constructed(built_key);
    EXPECT_TRUE(copy_constructed.initialized());

    CK copy_assigned;
    copy_assigned = built_key;
    EXPECT_TRUE(copy_assigned.initialized());
}

// ---------------------------------------------------------------------------------------------
// Criterion 9: emulation backend commitment == CPU backend commitment == naive reference, for
// each of the five required shapes.
// ---------------------------------------------------------------------------------------------
TEST_F(CommitmentKeyMsmBackendTest, CommitDenseRandomPolynomial)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    CK ck_cpu(kNumPoints);
    Polynomial poly = dense_random_poly();

    Commitment emulated = ck_emulated.commit(poly);
    Commitment cpu = ck_cpu.commit(poly);
    Commitment naive = commit_naive(ck_cpu, poly);

    EXPECT_EQ(emulated, cpu);
    EXPECT_EQ(emulated, naive);
}

TEST_F(CommitmentKeyMsmBackendTest, CommitSparsePolynomial)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    CK ck_cpu(kNumPoints);
    Polynomial poly = sparse_poly();

    Commitment emulated = ck_emulated.commit(poly);
    Commitment cpu = ck_cpu.commit(poly);
    Commitment naive = commit_naive(ck_cpu, poly);

    EXPECT_EQ(emulated, cpu);
    EXPECT_EQ(emulated, naive);
}

TEST_F(CommitmentKeyMsmBackendTest, CommitWithStartIndex)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    CK ck_cpu(kNumPoints);
    Polynomial poly = start_index_poly();

    Commitment emulated = ck_emulated.commit(poly);
    Commitment cpu = ck_cpu.commit(poly);
    Commitment naive = commit_naive(ck_cpu, poly);

    EXPECT_EQ(emulated, cpu);
    EXPECT_EQ(emulated, naive);
}

TEST_F(CommitmentKeyMsmBackendTest, CommitAllZeroPolynomial)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    CK ck_cpu(kNumPoints);
    Polynomial poly = all_zero_poly();

    Commitment emulated = ck_emulated.commit(poly);
    Commitment cpu = ck_cpu.commit(poly);

    EXPECT_TRUE(emulated.is_point_at_infinity());
    EXPECT_EQ(emulated, cpu);
}

TEST_F(CommitmentKeyMsmBackendTest, CommitSingleCoefficientPolynomial)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    CK ck_cpu(kNumPoints);
    Polynomial poly = single_coefficient_poly();

    Commitment emulated = ck_emulated.commit(poly);
    Commitment cpu = ck_cpu.commit(poly);
    Commitment naive = commit_naive(ck_cpu, poly);

    EXPECT_EQ(emulated, cpu);
    EXPECT_EQ(emulated, naive);
}

// ---------------------------------------------------------------------------------------------
// Criterion 10: batch_commit (direct entry point, not start_batch) on a batch mixing the five
// shapes, through the emulation backend, equals per-polynomial commit on the same key.
// ---------------------------------------------------------------------------------------------
TEST_F(CommitmentKeyMsmBackendTest, BatchCommitDirectMixedShapes)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    std::vector<Polynomial> polys = five_shapes();

    RefVector<Polynomial> poly_refs(polys);
    std::vector<Commitment> batch_commitments = ck_emulated.batch_commit(poly_refs);

    ASSERT_EQ(batch_commitments.size(), polys.size());
    for (size_t i = 0; i < polys.size(); ++i) {
        Commitment individual = ck_emulated.commit(polys[i]);
        EXPECT_EQ(batch_commitments[i], individual);
    }
}

// ---------------------------------------------------------------------------------------------
// Criterion 11: the production entry point (start_batch -> add_to_batch ->
// commit_and_send_to_verifier), through the emulation backend, matches per-polynomial commit on
// the same key and matches the identical sequence driven on a CPU-backed key. has_duplicates_hint
// is exercised both true and false. Repeated once more with the CommitBatch obtained from a copy
// of the emulated key.
// ---------------------------------------------------------------------------------------------
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
    CK ck_emulated(kNumPoints, emulated_backend());
    CK ck_cpu(kNumPoints);
    std::vector<Polynomial> polys_emulated = five_shapes();
    std::vector<Polynomial> polys_cpu = polys_emulated; // identical coefficients

    std::vector<Commitment> emulated_results = run_production_batch_path(ck_emulated, polys_emulated);
    std::vector<Commitment> cpu_results = run_production_batch_path(ck_cpu, polys_cpu);

    ASSERT_EQ(emulated_results.size(), polys_emulated.size());
    ASSERT_EQ(cpu_results.size(), emulated_results.size());
    for (size_t i = 0; i < emulated_results.size(); ++i) {
        Commitment individual = ck_emulated.commit(polys_emulated[i]);
        EXPECT_EQ(emulated_results[i], individual);
        EXPECT_EQ(emulated_results[i], cpu_results[i]);
    }
}

TEST_F(CommitmentKeyMsmBackendTest, ProductionBatchPathFromCopiedKey)
{
    CK original(kNumPoints, emulated_backend());
    CK copy_constructed(original);
    CK copy_assigned;
    copy_assigned = original;

    std::vector<Polynomial> polys_a = five_shapes();
    std::vector<Polynomial> polys_b = polys_a;

    std::vector<Commitment> from_copy_construct = run_production_batch_path(copy_constructed, polys_a);
    std::vector<Commitment> from_copy_assign = run_production_batch_path(copy_assigned, polys_b);

    ASSERT_EQ(from_copy_construct.size(), polys_a.size());
    ASSERT_EQ(from_copy_assign.size(), polys_a.size());
    for (size_t i = 0; i < from_copy_construct.size(); ++i) {
        Commitment individual = original.commit(polys_a[i]);
        EXPECT_EQ(from_copy_construct[i], individual);
        EXPECT_EQ(from_copy_assign[i], individual);
    }
}

// ---------------------------------------------------------------------------------------------
// Criterion 12: input polynomial coefficients are unchanged after a commit/batch_commit call
// through the emulation backend.
// ---------------------------------------------------------------------------------------------
TEST_F(CommitmentKeyMsmBackendTest, CoefficientsUnchangedAfterCommit)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    Polynomial poly = dense_random_poly();
    std::vector<Fr> before(poly.coeffs().begin(), poly.coeffs().end());

    ck_emulated.commit(poly);

    std::vector<Fr> after(poly.coeffs().begin(), poly.coeffs().end());
    EXPECT_EQ(before, after);
}

TEST_F(CommitmentKeyMsmBackendTest, CoefficientsUnchangedAfterBatchCommit)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    std::vector<Polynomial> polys = { dense_random_poly(), sparse_poly(), start_index_poly() };
    ASSERT_GE(polys.size(), 3u);

    std::vector<std::vector<Fr>> before;
    for (const auto& poly : polys) {
        before.emplace_back(poly.coeffs().begin(), poly.coeffs().end());
    }

    RefVector<Polynomial> poly_refs(polys);
    ck_emulated.batch_commit(poly_refs);

    for (size_t i = 0; i < polys.size(); ++i) {
        std::vector<Fr> after(polys[i].coeffs().begin(), polys[i].coeffs().end());
        EXPECT_EQ(before[i], after);
    }
}

// ---------------------------------------------------------------------------------------------
// Criterion 13: a proof-level test. Two commitment keys (CPU-backed, emulation-backed) over the
// same SRS and polynomial produce byte-identical KZG opening proofs, and both verify.
// ---------------------------------------------------------------------------------------------
TEST_F(CommitmentKeyMsmBackendTest, ProofBytesIdenticalCpuVsEmulatedAndBothVerify)
{
    using PCS = KZG<Curve>;
    constexpr size_t n = 64;

    CK ck_cpu(n);
    CK ck_emulated(n, emulated_backend());

    Polynomial witness = Polynomial::random(n);
    const Fr challenge = Fr::random_element();
    const Fr evaluation = witness.evaluate(challenge);
    OpeningPair<Curve> opening_pair{ challenge, evaluation };

    Commitment commitment_cpu = ck_cpu.commit(witness);
    Commitment commitment_emulated = ck_emulated.commit(witness);
    EXPECT_EQ(commitment_cpu, commitment_emulated);

    Polynomial witness_for_cpu = witness;
    Polynomial witness_for_emulated = witness;

    auto prover_transcript_cpu = NativeTranscript::test_prover_init_empty();
    PCS::compute_opening_proof(ck_cpu, { witness_for_cpu, opening_pair }, prover_transcript_cpu);

    auto prover_transcript_emulated = NativeTranscript::test_prover_init_empty();
    PCS::compute_opening_proof(ck_emulated, { witness_for_emulated, opening_pair }, prover_transcript_emulated);

    EXPECT_EQ(prover_transcript_cpu->test_get_proof_data(), prover_transcript_emulated->test_get_proof_data());

    OpeningClaim<Curve> opening_claim{ opening_pair, commitment_cpu };

    auto verifier_transcript_cpu = NativeTranscript::test_verifier_init_empty(prover_transcript_cpu);
    auto pairing_points_cpu = PCS::reduce_verify(opening_claim, verifier_transcript_cpu);
    EXPECT_TRUE(pairing_points_cpu.check());

    auto verifier_transcript_emulated = NativeTranscript::test_verifier_init_empty(prover_transcript_emulated);
    auto pairing_points_emulated = PCS::reduce_verify(opening_claim, verifier_transcript_emulated);
    EXPECT_TRUE(pairing_points_emulated.check());
}

// ---------------------------------------------------------------------------------------------
// Injection: the key computes with the backend it was given and copies share it.
// ---------------------------------------------------------------------------------------------
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

TEST_F(CommitmentKeyMsmBackendTest, CopiesShareTheInjectedBackend)
{
    const Commitment sentinel = Commitment::one() * Fr(11);
    CK original(kNumPoints, std::make_shared<FixedResultBackend>(sentinel));
    CK copy_constructed(original);
    CK copy_assigned;
    copy_assigned = original;
    Polynomial poly = single_coefficient_poly();
    EXPECT_EQ(copy_constructed.commit(poly), sentinel);
    EXPECT_EQ(copy_assigned.commit(poly), sentinel);
}

// ---------------------------------------------------------------------------------------------
// Prepared bases: the emulated backend keeps the longest converted SRS prefix.
// ---------------------------------------------------------------------------------------------
TEST_F(CommitmentKeyMsmBackendTest, PreparedBasesReuseAndExtendTheResidentPrefix)
{
    auto backend = std::make_shared<EmulatedMsmBackend<Curve>>();
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

TEST_F(CommitmentKeyMsmBackendTest, PreparedBasesExtendWithoutReconvertingThePrefix)
{
    auto backend = std::make_shared<EmulatedMsmBackend<Curve>>();
    CK ck(kNumPoints, backend);
    const std::span<const Commitment> srs = ck.get_monomial_points();

    auto fresh_backend = std::make_shared<EmulatedMsmBackend<Curve>>();
    FixedBases<Curve> small = fresh_backend->prepare_bases(srs.first(128));
    EXPECT_EQ(fresh_backend->resident_size(), 128u);
    FixedBases<Curve> large = fresh_backend->prepare_bases(srs.first(512));
    EXPECT_EQ(fresh_backend->resident_size(), 512u);

    Polynomial poly = Polynomial::random(512);
    EXPECT_EQ(fresh_backend->commit(large, poly, false), commit_naive(ck, poly));
    Polynomial small_poly = Polynomial::random(128);
    EXPECT_EQ(fresh_backend->commit(small, small_poly, false), commit_naive(ck, small_poly));
}

TEST_F(CommitmentKeyMsmBackendTest, PreparedBasesReplacedWhenThePointsDiffer)
{
    EmulatedMsmBackend<Curve> backend;
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

// ---------------------------------------------------------------------------------------------
// Grumpkin: the emulated backend agrees with the CPU Pippenger and a naive sum on synthetic bases.
// ---------------------------------------------------------------------------------------------
class GrumpkinEmulatedBackendTest : public ::testing::Test {
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

TEST_F(GrumpkinEmulatedBackendTest, CommitMatchesCpuAndNaive)
{
    EmulatedMsmBackend<Curve> emulated;
    CpuMsmBackend<Curve> cpu;
    const std::vector<Commitment> bases = random_bases(600);
    const FixedBases<Curve> emulated_bases = emulated.prepare_bases(bases);
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
        const Commitment emulated_result = emulated.commit(emulated_bases, span, false);
        EXPECT_EQ(emulated_result, cpu.commit(cpu_bases, span, false));
        EXPECT_EQ(emulated_result, naive(bases, *poly));
    }
}

TEST_F(GrumpkinEmulatedBackendTest, BatchCommitMatchesCpu)
{
    EmulatedMsmBackend<Curve> emulated;
    CpuMsmBackend<Curve> cpu;
    const std::vector<Commitment> bases = random_bases(400);
    const FixedBases<Curve> emulated_bases = emulated.prepare_bases(bases);
    const FixedBases<Curve> cpu_bases = cpu.prepare_bases(bases);

    std::vector<Polynomial> polys = { Polynomial::random(400), Polynomial::random(150), Polynomial(64) };
    std::vector<PolynomialSpan<Fr>> spans_for_emulated;
    std::vector<PolynomialSpan<Fr>> spans_for_cpu;
    std::vector<Polynomial> cpu_polys = polys;
    for (size_t i = 0; i < polys.size(); ++i) {
        spans_for_emulated.emplace_back(polys[i].start_index(), polys[i].coeffs());
        spans_for_cpu.emplace_back(cpu_polys[i].start_index(), cpu_polys[i].coeffs());
    }

    const std::vector<Commitment> emulated_results = emulated.batch_commit(emulated_bases, spans_for_emulated, {});
    const std::vector<Commitment> cpu_results = cpu.batch_commit(cpu_bases, spans_for_cpu, {});
    EXPECT_EQ(emulated_results, cpu_results);
    EXPECT_TRUE(emulated_results.back().is_point_at_infinity());
}

TEST_F(CommitmentKeyMsmBackendTest, NullBackendIsRejected)
{
    ASSERT_THROW_OR_ABORT((CK(kNumPoints, std::shared_ptr<const MsmBackend<Curve>>{})), "requires an MSM backend");
}

// ---------------------------------------------------------------------------------------------
// Criterion 7: a copy (by construction, and separately by assignment) of an emulation-backed key
// still produces correct commitments.
// ---------------------------------------------------------------------------------------------
TEST_F(CommitmentKeyMsmBackendTest, EmulatedCopyConstructedKeyStillCorrect)
{
    CK original(kNumPoints, emulated_backend());
    CK copy(original);
    Polynomial poly = sparse_poly();

    Commitment commitment = copy.commit(poly);
    Commitment naive = commit_naive(original, poly);
    EXPECT_EQ(commitment, naive);
}

TEST_F(CommitmentKeyMsmBackendTest, EmulatedCopyAssignedKeyStillCorrect)
{
    CK original(kNumPoints, emulated_backend());
    CK copy;
    copy = original;
    Polynomial poly = sparse_poly();

    Commitment commitment = copy.commit(poly);
    Commitment naive = commit_naive(original, poly);
    EXPECT_EQ(commitment, naive);
}

// ---------------------------------------------------------------------------------------------
// Criterion 26: has_duplicates_hint / dedup_infos are advisory; the emulation backend's result is
// unaffected by them, for a polynomial/batch containing repeated coefficient values.
// ---------------------------------------------------------------------------------------------
TEST_F(CommitmentKeyMsmBackendTest, DuplicatesHintIgnoredForCommit)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    constexpr size_t n = 64;
    Polynomial poly(n);
    const Fr repeated_value = Fr::random_element();
    for (size_t i = 0; i < n; ++i) {
        poly.at(i) = repeated_value;
    }

    Commitment with_hint = ck_emulated.commit(poly, /*has_duplicates_hint=*/true);
    Commitment without_hint = ck_emulated.commit(poly, /*has_duplicates_hint=*/false);
    Commitment naive = commit_naive(ck_emulated, poly);

    EXPECT_EQ(with_hint, without_hint);
    EXPECT_EQ(with_hint, naive);
}

TEST_F(CommitmentKeyMsmBackendTest, DuplicatesHintIgnoredForBatchCommit)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    constexpr size_t n = 64;
    Polynomial repeated_poly(n);
    const Fr repeated_value = Fr::random_element();
    for (size_t i = 0; i < n; ++i) {
        repeated_poly.at(i) = repeated_value;
    }
    std::vector<Polynomial> polys = { repeated_poly, dense_random_poly() };

    RefVector<Polynomial> poly_refs(polys);
    std::vector<uint32_t> dedup_infos = { 1, 0 };

    std::vector<Commitment> with_hints = ck_emulated.batch_commit(poly_refs, dedup_infos);
    std::vector<Commitment> without_hints = ck_emulated.batch_commit(poly_refs, {});

    ASSERT_EQ(with_hints.size(), 2u);
    ASSERT_EQ(without_hints.size(), 2u);
    for (size_t i = 0; i < 2; ++i) {
        Commitment individual = ck_emulated.commit(polys[i]);
        EXPECT_EQ(with_hints[i], without_hints[i]);
        EXPECT_EQ(with_hints[i], individual);
    }
}

// ---------------------------------------------------------------------------------------------
// Criterion 27: existing error/edge-case behaviour through the emulation backend matches the CPU
// backend.
// ---------------------------------------------------------------------------------------------
TEST_F(CommitmentKeyMsmBackendTest, ErrorOversizedSpanThrows)
{
    CK ck_emulated(16, emulated_backend());
    // get_monomial_size() may exceed the requested 16 (the underlying SRS is loaded in larger
    // fixed chunks), so size strictly relative to what the key actually reports, not to the
    // constructor argument.
    Polynomial poly(ck_emulated.get_monomial_size() + 1);
    ASSERT_THROW_OR_ABORT(ck_emulated.commit(poly), "Attempting to commit to a polynomial that needs");
}

TEST_F(CommitmentKeyMsmBackendTest, ErrorUninitializedKeyThrows)
{
    CK uninitialized_key(emulated_backend());
    EXPECT_FALSE(uninitialized_key.initialized());
    Polynomial poly(2);
    ASSERT_THROW_OR_ABORT(uninitialized_key.commit(poly), "Commitment key is not initialized");
}

TEST_F(CommitmentKeyMsmBackendTest, ErrorEmptyBatchCommitMatchesCpu)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    CK ck_cpu(kNumPoints);

    RefVector<Polynomial> empty_refs;
    std::vector<Commitment> emulated_result = ck_emulated.batch_commit(empty_refs);
    std::vector<Commitment> cpu_result = ck_cpu.batch_commit(empty_refs);

    EXPECT_TRUE(emulated_result.empty());
    EXPECT_EQ(emulated_result, cpu_result);
}

TEST_F(CommitmentKeyMsmBackendTest, ErrorZeroLengthSpanMatchesCpu)
{
    CK ck_emulated(kNumPoints, emulated_backend());
    CK ck_cpu(kNumPoints);

    PolynomialSpan<const Fr> zero_span(0, std::span<const Fr>{});
    Commitment emulated_result = ck_emulated.commit(zero_span);
    Commitment cpu_result = ck_cpu.commit(zero_span);

    EXPECT_TRUE(emulated_result.is_point_at_infinity());
    EXPECT_EQ(emulated_result, cpu_result);
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
