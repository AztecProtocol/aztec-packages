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
    const size_t log_n = 4;
    const size_t n = 1UL << log_n;

    using Fr = typename Params::ScalarField;
    using ProverOpeningClaim = ProverOpeningClaim<Params>;
    using OpeningClaim = OpeningClaim<Params>;
    using Commitment = Params::AffineElement;

    class TestData {
      public:
        std::vector<ProverOpeningClaim> prover_opening_claims;
        std::vector<OpeningClaim> verifier_opening_claims;

        void add_poly_evaluation(const CommitmentKey<Params>& ck, const Polynomial<Fr>& poly)
        {
            auto r = Fr::random_element();
            auto eval = poly.evaluate(r);
            auto commit = ck.commit(poly);
            this->prover_opening_claims.emplace_back(ProverOpeningClaim(poly, { r, eval }));
            this->verifier_opening_claims.emplace_back(OpeningClaim({ r, eval }, commit));
        }

        std::pair<std::vector<Fr>, Polynomial<Fr>> linear_combination(const std::vector<size_t>& indices,
                                                                      const size_t& max_poly_degree)
        {
            std::vector<Fr> coefficients;
            Polynomial<Fr> poly(max_poly_degree);
            for (const auto& index : indices) {
                auto tmp = Fr::random_element();
                coefficients.emplace_back(tmp);
                poly.add_scaled(this->prover_opening_claims[index].polynomial, tmp);
            }

            return std::make_pair(coefficients, poly);
        }

        std::vector<Commitment> extract_commitments()
        {
            std::vector<Commitment> commitments;
            commitments.reserve(verifier_opening_claims.size());
            for (const auto& claim : verifier_opening_claims) {
                commitments.emplace_back(claim.commitment);
            }

            return commitments;
        }
    };

    TestData generate_test_data(const size_t& num_polys, const std::vector<size_t>& poly_degrees)
    {
        TestData setup;

        for (size_t idx = 0; idx < num_polys; idx++) {
            auto tmp_poly = Polynomial<Fr>::random(poly_degrees[idx]);
            auto tmp_commit = this->commit(tmp_poly);
            auto tmp_r = Fr::random_element();
            auto tmp_eval = tmp_poly.evaluate(tmp_r);
            setup.prover_opening_claims.emplace_back(ProverOpeningClaim(tmp_poly, { tmp_r, tmp_eval }));
            setup.verifier_opening_claims.emplace_back(OpeningClaim({ tmp_r, tmp_eval }, tmp_commit));
        }

        return setup;
    }
};

using CurveTypes = ::testing::Types<curve::BN254, curve::Grumpkin>;
TYPED_TEST_SUITE(ShplonkTest, CurveTypes);

// Test of Shplonk prover/verifier for two polynomials of different sizes, each opened at a single (different) point
TYPED_TEST(ShplonkTest, ShplonkSimple)
{
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes, as well as their evaluations at a (single
    // but different) random point and their commitments.
    auto setup = this->generate_test_data(2, { this->n, this->n / 2 });

    // Execute the shplonk prover functionality
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), setup.prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);

    // Initialise verifier transcript from prover transcript
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

    // Execute the shplonk verifier functionality
    const auto batched_verifier_claim = ShplonkVerifier::reduce_verification(
        this->vk().get_g1_identity(), setup.verifier_opening_claims, verifier_transcript);

    this->verify_opening_claim(batched_verifier_claim, batched_opening_claim.polynomial);
}

// Test of Shplonk prover/verifier for polynomials that are linearly dependent
TYPED_TEST(ShplonkTest, ShplonkLinearlyDependent)
{
    using ShplonkProver = ShplonkProver_<TypeParam>;
    using ShplonkVerifier = ShplonkVerifier_<TypeParam>;
    using Fr = typename TypeParam::ScalarField;
    using Commitment = typename ShplonkTest<TypeParam>::Commitment;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes and a random linear combinations
    auto setup = this->generate_test_data(2, { this->n, this->n / 2 });

    // Extract the commitments to be used in the Shplonk verifier
    std::vector<Commitment> commitments = setup.extract_commitments();

    // Linearly combine the polynomials
    auto [coefficients, poly] = setup.linear_combination({ 0, 1 }, this->n);

    // Add evaluation of linear combination
    setup.add_poly_evaluation(this->ck(), poly);

    // Execute the shplonk prover functionality
    auto opening_claims = setup.prover_opening_claims; // Need to copy them because `prove` modifies the opening claims
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);

    // Shplonk verification
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
    ShplonkVerifier verifier(commitments, verifier_transcript);

    // Update internal state for poly1(r1) = eval1
    verifier.update({ 0 },
                    { Fr(1) },
                    { setup.verifier_opening_claims[0].opening_pair.evaluation },
                    setup.verifier_opening_claims[0].opening_pair.challenge);
    // Update internal state for poly2(r2) = eval2
    verifier.update({ 1 },
                    { Fr(1) },
                    { setup.verifier_opening_claims[1].opening_pair.evaluation },
                    setup.verifier_opening_claims[1].opening_pair.challenge);
    // Update internal state for poly3(r3) = eval3
    auto r = setup.verifier_opening_claims[2].opening_pair.challenge;
    verifier.update({ 0, 1 },
                    coefficients,
                    { setup.prover_opening_claims[0].polynomial.evaluate(r),
                      setup.prover_opening_claims[1].polynomial.evaluate(r) },
                    r);

    // Execute the shplonk verifier functionality
    const auto batched_verifier_claim = verifier.finalize(this->vk().get_g1_identity());

    this->verify_opening_claim(batched_verifier_claim, batched_opening_claim.polynomial);
}

// Test of Shplonk prover/verifier for polynomials that are linearly dependent
using ShplonkBN254 = ShplonkTest<curve::BN254>;

TEST_F(ShplonkBN254, ExtractStateAndVerify)
{
    using ShplonkProver = ShplonkProver_<curve::BN254>;
    using ShplonkVerifier = ShplonkVerifier_<curve::BN254>;

    auto prover_transcript = NativeTranscript::prover_init_empty();

    // Generate two random (unrelated) polynomials of two different sizes and a random linear combinations
    auto setup = this->generate_test_data(2, { ShplonkTest<curve::BN254>::n, ShplonkTest<curve::BN254>::n / 2 });

    // Execute the shplonk prover functionality
    const auto batched_opening_claim = ShplonkProver::prove(this->ck(), setup.prover_opening_claims, prover_transcript);
    // An intermediate check to confirm the opening of the shplonk prover witness Q
    this->verify_opening_pair(batched_opening_claim.opening_pair, batched_opening_claim.polynomial);
    // Compute KZG proof
    KZG<curve::BN254>::compute_opening_proof(this->ck(), batched_opening_claim, prover_transcript);

    // Shplonk verification
    auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
    std::vector<Commitment> commitments = setup.extract_commitments();

    // Execute the shplonk verifier functionality
    auto verifier =
        ShplonkVerifier::reduce_verification_no_finalize(setup.verifier_opening_claims, verifier_transcript);

    // Export state
    const auto batched_verifier_claim = verifier.export_state(this->vk().get_g1_identity());

    // KZG verifier
    auto final_proof_points =
        KZG<curve::BN254>::reduce_verify_batch_opening_claim(batched_verifier_claim, verifier_transcript);
    VerifierCommitmentKey<curve::BN254> pcs_vk{};
    ASSERT(pcs_vk.pairing_check(final_proof_points[0], final_proof_points[1]));
}

} // namespace bb
