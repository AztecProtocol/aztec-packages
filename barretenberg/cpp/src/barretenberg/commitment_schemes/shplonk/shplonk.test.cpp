#include "shplonk.hpp"
#include "../commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include <algorithm>
#include <gtest/internal/gtest-internal.h>
#include <iterator>
#include <random>
#include <vector>
namespace bb {
template <class Params> class ShplonkTest : public CommitmentTest<Params> {};

using CurveTypes = ::testing::Types<curve::BN254, curve::Grumpkin>;
TYPED_TEST_SUITE(ShplonkTest, CurveTypes);

// Test of Shplonk prover/verifier for two polynomials of different sizes, each opened at a single (different) point
TYPED_TEST(ShplonkTest, ShplonkSimple)
{
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using ProverOpeningClaim = ProverOpeningClaim<TypeParam>;

    using OpeningClaim = OpeningClaim<TypeParam>;

    const size_t log_n = 4;
    const size_t n = 1UL << log_n;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes, as well as their evaluations at a (single but
    // different) random point and their commitments.
    const auto r1 = Fr::random_element();
    auto poly1 = Polynomial<Fr>::random(n);
    const auto eval1 = poly1.evaluate(r1);
    const auto commitment1 = this->commit(poly1);

    const auto r2 = Fr::random_element();
    auto poly2 = Polynomial<Fr>::random(n / 2);
    const auto eval2 = poly2.evaluate(r2);
    const auto commitment2 = this->commit(poly2);

    // Aggregate polynomials and their opening pairs
    std::vector<ProverOpeningClaim> prover_opening_claims = { { poly1, { r1, eval1 } }, { poly2, { r2, eval2 } } };

    // Execute the shplonk prover functionality
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);

    // Aggregate polynomial commitments and their opening pairs
    std::vector<OpeningClaim> verifier_opening_claims = { { { r1, eval1 }, commitment1 },
                                                          { { r2, eval2 }, commitment2 } };

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Execute the shplonk verifier functionality
    const auto batched_verifier_claim = ShplonkVerifier::reduce_verification(
        this->vk().get_g1_identity(), verifier_opening_claims, verifier_transcript);

    this->verify_opening_claim(batched_verifier_claim, batched_opening_claim.polynomial);
}

// Test of Shplonk prover/verifier for polynomials that are linearly dependent
TYPED_TEST(ShplonkTest, ShplonkLinearlyDependent)
{
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename TypeParam::AffineElement;
    using ProverOpeningClaim = ProverOpeningClaim<TypeParam>;

    using OpeningClaim = OpeningClaim<TypeParam>;

    const size_t log_n = 4;
    const size_t n = 1UL << log_n;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes and a random linear combinations
    auto poly1 = Polynomial<Fr>::random(n);
    const auto commitment1 = this->commit(poly1);

    auto poly2 = Polynomial<Fr>::random(n / 2);
    const auto commitment2 = this->commit(poly2);

    // Linearly combine the polynomials
    auto a = Fr::random_element();
    auto b = Fr::random_element();
    Polynomial<Fr> poly3(poly1.size());
    poly3.add_scaled(poly1, a);
    poly3.add_scaled(poly2, b);

    // Generate random evaluations
    const auto r1 = Fr::random_element();
    const auto r2 = Fr::random_element();
    const auto r3 = Fr::random_element();

    const auto eval1 = poly1.evaluate(r1);
    const auto eval2 = poly2.evaluate(r2);
    const auto eval13 = poly1.evaluate(r3);
    const auto eval23 = poly2.evaluate(r3);
    const auto eval3 = a * eval13 + b * eval23;

    // Aggregate polynomials and their opening pairs
    std::vector<ProverOpeningClaim> prover_opening_claims = { { poly1, { r1, eval1 } },
                                                              { poly2, { r2, eval2 } },
                                                              { poly3, { r3, eval3 } } };

    // Execute the shplonk prover functionality
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);

    // Aggregate polynomial commitments and their opening pairs
    std::vector<OpeningClaim> verifier_opening_claims = { { { r1, eval1 }, commitment1 },
                                                          { { r2, eval2 }, commitment2 } };

    // Construct Shplonk verifier
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
    std::vector<Commitment> commitments = { commitment1, commitment2 };

    ShplonkVerifier verifier(commitments, verifier_transcript);

    // Update internal state for poly1(r1) = eval1
    verifier.update({ 1 }, { Fr(1) }, { eval1 }, r1);
    // Update internal state for poly2(r2) = eval2
    verifier.update({ 2 }, { Fr(1) }, { eval2 }, r2);
    // Update internal state for poly3(r3) = eval3
    verifier.update({ 1, 2 }, { a, b }, { eval13, eval23 }, r3);

    // Execute the shplonk verifier functionality
    const auto batched_verifier_claim = verifier.finalize(this->vk().get_g1_identity());

    this->verify_opening_claim(batched_verifier_claim, batched_opening_claim.polynomial);
}
} // namespace bb
