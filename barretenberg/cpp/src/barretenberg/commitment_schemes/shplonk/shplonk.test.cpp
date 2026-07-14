#include "shplonk.hpp"
#include "../pcs_test_utils.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include <algorithm>
#include <gtest/internal/gtest-internal.h>
#include <iterator>
#include <random>
#include <vector>
namespace bb {
template <class Params> class ShplonkTest : public CommitmentTest<Params> {};

static constexpr size_t LOG_DEGREE = 4;
static constexpr size_t MAX_POLY_DEGREE = 1UL << LOG_DEGREE;

using CurveTypes = ::testing::Types<curve::BN254, curve::Grumpkin>;
TYPED_TEST_SUITE(ShplonkTest, CurveTypes);

// Test of Shplonk prover/verifier for two polynomials of different sizes, each opened at a single (different) point
TYPED_TEST(ShplonkTest, ShplonkSimple)
{
    using ClaimData = UnivariateClaimData<TypeParam>;
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;

    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes, as well as their evaluations at a (single
    // but different) random point and their commitments.
    auto setup = this->generate_claim_data({ MAX_POLY_DEGREE, MAX_POLY_DEGREE / 2 });

    // Execute the shplonk prover functionality
    auto prover_opening_claims = ClaimData::prover_opening_claims(setup);
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);

    // Initialize verifier transcript from prover transcript
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    // Execute the shplonk verifier functionality
    const auto batched_verifier_claim = ShplonkVerifier::reduce_verification(
        this->vk().get_g1_identity(), ClaimData::verifier_opening_claims(setup), verifier_transcript);

    this->verify_opening_claim(batched_verifier_claim, batched_opening_claim.polynomial);
}

// Test exporting batch claim from Shplonk verifier and verification
TYPED_TEST(ShplonkTest, ExportBatchClaimAndVerify)
{
    using ClaimData = UnivariateClaimData<TypeParam>;
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;

    auto prover_transcript = NativeTranscript::test_prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes and a random linear combinations
    auto setup = this->generate_claim_data({ MAX_POLY_DEGREE, MAX_POLY_DEGREE / 2 });

    // Execute the shplonk prover functionality
    auto prover_opening_claims = ClaimData::prover_opening_claims(setup);
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);
    if constexpr (std::is_same_v<TypeParam, curve::BN254>) {
        // Compute KZG proof
        KZG<curve::BN254>::compute_opening_proof(this->ck(), batched_opening_claim, prover_transcript);
    } else {
        // Compute IPA proof
        IPA<curve::Grumpkin, LOG_DEGREE>::compute_opening_proof(this->ck(), batched_opening_claim, prover_transcript);
    }

    // Shplonk verification
    auto verifier_transcript = NativeTranscript::test_verifier_init_empty(prover_transcript);

    auto verifier_opening_claims = ClaimData::verifier_opening_claims(setup);

    if constexpr (std::is_same_v<TypeParam, curve::BN254>) {
        // Execute the shplonk verifier functionality lazily and export the batch opening claim
        auto verifier = ShplonkVerifier::reduce_verification_no_finalize(verifier_opening_claims, verifier_transcript);
        auto batched_verifier_claim = verifier.export_batch_opening_claim(this->vk().get_g1_identity());

        // KZG verifier
        auto final_proof_points = KZG<curve::BN254>::reduce_verify_batch_opening_claim(
            std::move(batched_verifier_claim), verifier_transcript);
        ASSERT_TRUE(final_proof_points.check());
    } else {
        // Reduce the claims to a single opening claim and verify it via IPA, mirroring the ECCVM univariate flow
        const auto batched_verifier_claim = ShplonkVerifier::reduce_verification(
            this->vk().get_g1_identity(), verifier_opening_claims, verifier_transcript);
        auto vk = create_verifier_commitment_key<VerifierCommitmentKey<curve::Grumpkin>>();
        const bool verified =
            IPA<curve::Grumpkin, LOG_DEGREE>::reduce_verify(vk, batched_verifier_claim, verifier_transcript);
        EXPECT_TRUE(verified);
    }
}
} // namespace bb
