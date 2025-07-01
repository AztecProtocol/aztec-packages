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

// Test of Shplonk prover/verifier for two polynomials of different sizes, the first opened at three points, the second
// opened at two points
TYPED_TEST(ShplonkTest, TwoPolysBatchedOpenings)
{
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using ProverOpeningClaim = ProverOpeningClaim<TypeParam>;

    using OpeningClaims = OpeningClaims<TypeParam>;

    const size_t log_n = 4;
    const size_t n = 1UL << log_n;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    const auto r11 = Fr::random_element();
    const auto r12 = Fr::random_element();
    const auto r13 = Fr::random_element();
    auto poly1 = Polynomial<Fr>::random(n);
    const auto eval11 = poly1.evaluate(r11);
    const auto eval12 = poly1.evaluate(r12);
    const auto eval13 = poly1.evaluate(r13);
    const auto commitment1 = this->commit(poly1);

    const auto r21 = Fr::random_element();
    const auto r22 = Fr::random_element();
    auto poly2 = Polynomial<Fr>::random(n / 2);
    const auto eval21 = poly2.evaluate(r21);
    const auto eval22 = poly2.evaluate(r22);
    const auto commitment2 = this->commit(poly2);

    // Aggregate polynomials and their opening pairs
    std::vector<ProverOpeningClaim> prover_opening_claims = { { poly1, { r11, eval11 } },
                                                              { poly1, { r12, eval12 } },
                                                              { poly1, { r13, eval13 } },
                                                              { poly2, { r21, eval21 } },
                                                              { poly2, { r22, eval22 } } };

    // Execute the shplonk prover functionality
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);

    // Aggregate polynomial commitments and their opening pairs
    std::vector<OpeningClaims> verifier_opening_claims = { { { { r11, eval11 }, { r12, eval12 }, { r13, eval13 } },
                                                             commitment1 },
                                                           { { { r21, eval21 }, { r22, eval22 } }, commitment2 } };

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Execute the shplonk verifier functionality
    const auto batched_verifier_claim = ShplonkVerifier::reduce_verification_multiple_claims_same_polynomial(
        this->vk().get_g1_identity(), verifier_opening_claims, verifier_transcript);

    this->verify_opening_claim(batched_verifier_claim, batched_opening_claim.polynomial);
}

// Test of Shplonk prover/verifier for two polynomials of different sizes, the first opened at two points, the second
// opened at one point, expected to fail because prover and verifier aggregate the claims in different order
TYPED_TEST(ShplonkTest, FailureTwoPolysBatchedOpenings)
{
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using ProverOpeningClaim = ProverOpeningClaim<TypeParam>;

    using OpeningClaims = OpeningClaims<TypeParam>;

    const size_t log_n = 4;
    const size_t n = 1UL << log_n;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    const auto r11 = Fr::random_element();
    const auto r12 = Fr::random_element();
    auto poly1 = Polynomial<Fr>::random(n);
    const auto eval11 = poly1.evaluate(r11);
    const auto eval12 = poly1.evaluate(r12);
    const auto commitment1 = this->commit(poly1);

    const auto r2 = Fr::random_element();
    auto poly2 = Polynomial<Fr>::random(n / 2);
    const auto eval2 = poly2.evaluate(r2);
    const auto commitment2 = this->commit(poly2);

    // Aggregate polynomials and their opening pairs
    std::vector<ProverOpeningClaim> prover_opening_claims = { { poly1, { r12, eval12 } },
                                                              { poly1, { r11, eval11 } },
                                                              { poly2, { r2, eval2 } } };

    // Execute the shplonk prover functionality
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);

    // Aggregate polynomial commitments and their opening pairs, order is reversed for the first commitment
    std::vector<OpeningClaims> verifier_opening_claims = { { { { r11, eval11 }, { r12, eval12 } }, commitment1 },
                                                           { { { r2, eval2 } }, commitment2 } };

    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Execute the shplonk verifier functionality
    const auto batched_verifier_claim = ShplonkVerifier::reduce_verification_multiple_claims_same_polynomial(
        this->vk().get_g1_identity(), verifier_opening_claims, verifier_transcript);

    // Verify mismatch between Prover commitment and Verifier commitment
    auto commitment_expected = this->commit(batched_opening_claim.polynomial);
    EXPECT_NE(batched_verifier_claim.commitment, commitment_expected);
}
} // namespace bb
