#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pcs_test_utils.hpp"

#include <gtest/gtest.h>

using namespace bb;

TEST(IPAKnownCommitment, ProofEqualsProofWithRecomputedCommitment)
{
    using Curve = curve::Grumpkin;
    using Fr = Curve::ScalarField;
    constexpr size_t log_n = 7;
    constexpr size_t n = 1UL << log_n;
    using PCS = IPA<Curve, log_n>;

    const auto ck = create_commitment_key<CommitmentKey<Curve>>(n);
    const auto poly = bb::Polynomial<Fr>::random(n);
    const Fr x = Fr::random_element();
    const ProverOpeningClaim<Curve> claim{ poly, { x, poly.evaluate(x) } };

    auto recomputing_transcript = std::make_shared<NativeTranscript>();
    PCS::compute_opening_proof(ck, claim, recomputing_transcript);

    auto known_commitment_transcript = std::make_shared<NativeTranscript>();
    PCS::compute_opening_proof(ck, claim, ck.commit(poly), known_commitment_transcript);

    EXPECT_EQ(known_commitment_transcript->export_proof(), recomputing_transcript->export_proof());
}
