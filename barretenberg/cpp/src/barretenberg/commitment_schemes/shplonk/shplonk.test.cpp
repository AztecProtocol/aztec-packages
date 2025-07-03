#include "shplonk.hpp"
#include "../commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include <algorithm>
#include <gtest/internal/gtest-internal.h>
#include <iterator>
#include <random>
#include <vector>
namespace bb {
template <class Params> class ShplonkTest : public CommitmentTest<Params> {
  public:
    size_t log_n = 4;
    size_t n = 1UL << log_n;
};

using CurveTypes = ::testing::Types<curve::BN254, curve::Grumpkin>;
TYPED_TEST_SUITE(ShplonkTest, CurveTypes);

// Test of Shplonk prover/verifier for two polynomials of different sizes, each opened at a single (different) point
TYPED_TEST(ShplonkTest, ShplonkSimple)
{
    using ClaimData = UnivariateClaimData<TypeParam>;
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes, as well as their evaluations at a (single
    // but different) random point and their commitments.
    auto setup = this->generate_claim_data({ this->n, this->n / 2 });

    // Execute the shplonk prover functionality
    auto prover_opening_claims = ClaimData::prover_opening_claims(setup);
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);

    // Initialise verifier transcript from prover transcript
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Execute the shplonk verifier functionality
    const auto batched_verifier_claim = ShplonkVerifier::reduce_verification(
        this->vk().get_g1_identity(), ClaimData::verifier_opening_claims(setup), verifier_transcript);

    this->verify_opening_claim(batched_verifier_claim, batched_opening_claim.polynomial);
}

// Test of Shplonk prover/verifier for polynomials that are linearly dependent
TYPED_TEST(ShplonkTest, ShplonkLinearlyDependent)
{
    using ClaimData = UnivariateClaimData<TypeParam>;
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;
    using Fr = typename TypeParam::ScalarField;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes and a random linear combinations
    auto setup = this->generate_claim_data({ this->n, this->n / 2 });

    // Extract the commitments to be used in the Shplonk verifier
    auto commitments = ClaimData::polynomial_commitments(setup);

    // Linearly combine the polynomials and evalu
    auto [coefficients, evals] = this->combine_claims(setup);

    // Execute the shplonk prover functionality
    auto prover_opening_claims = ClaimData::prover_opening_claims(setup);
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);

    // Shplonk verification
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
    ShplonkVerifier verifier(commitments, verifier_transcript);

    // Update internal state for poly1(r1) = eval1
    auto verifier_opening_claims = ClaimData::verifier_opening_claims(setup);
    verifier.update({ 0 },
                    { Fr(1) },
                    { verifier_opening_claims[0].opening_pair.evaluation },
                    verifier_opening_claims[0].opening_pair.challenge);
    // Update internal state for poly2(r2) = eval2
    verifier.update({ 1 },
                    { Fr(1) },
                    { verifier_opening_claims[1].opening_pair.evaluation },
                    verifier_opening_claims[1].opening_pair.challenge);
    // Update internal state for poly3(r3) = eval3
    verifier.update({ 0, 1 }, coefficients, evals, verifier_opening_claims[2].opening_pair.challenge);

    // Execute the shplonk verifier functionality
    const auto batched_verifier_claim = verifier.finalize(this->vk().get_g1_identity());

    this->verify_opening_claim(batched_verifier_claim, batched_opening_claim.polynomial);
}

// Test of Shplonk prover/verifier for polynomials that are linearly dependent
using ShplonkBN254 = ShplonkTest<curve::BN254>;

TEST_F(ShplonkBN254, ExtractStateAndVerify)
{
    using ClaimData = UnivariateClaimData<curve::BN254>;
    using ShplonkProver = ShplonkProver_<curve::BN254>;
    using ShplonkVerifier = ShplonkVerifier_<curve::BN254>;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes and a random linear combinations
    auto setup = this->generate_claim_data({ this->n, this->n / 2 });

    // Execute the shplonk prover functionality
    auto prover_opening_claims = ClaimData::prover_opening_claims(setup);
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);
    // Compute KZG proof
    KZG<curve::BN254>::compute_opening_proof(this->ck(), batched_opening_claim, prover_transcript);

    // Shplonk verification
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Execute the shplonk verifier functionality
    auto verifier_opening_claims = ClaimData::verifier_opening_claims(setup);
    auto verifier = ShplonkVerifier::reduce_verification_no_finalize(verifier_opening_claims, verifier_transcript);

    // Export state
    const auto batched_verifier_claim = verifier.export_state(this->vk().get_g1_identity());

    // KZG verifier
    auto final_proof_points =
        KZG<curve::BN254>::reduce_verify_batch_opening_claim(batched_verifier_claim, verifier_transcript);
    VerifierCommitmentKey<curve::BN254> pcs_vk{};
    ASSERT(pcs_vk.pairing_check(final_proof_points[0], final_proof_points[1]));
}

} // namespace bb
