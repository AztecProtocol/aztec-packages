#include "barretenberg/commitment_schemes/triple_ipa/triple_ipa.hpp"
#include "barretenberg/commitment_schemes/pcs_test_utils.hpp"
#include "barretenberg/srs/factories/grumpkin_srs_gen.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <array>
#include <numeric>

using namespace bb;

namespace {

using Curve = curve::Grumpkin;

class TripleIPATest : public CommitmentTest<Curve> {
  public:
    using Fr = typename Curve::ScalarField;
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;
    using Poly = bb::Polynomial<Fr>;

    static constexpr size_t LOG_N = 4;
    static constexpr size_t N = 1UL << LOG_N;
    static constexpr size_t NUM_UNSHIFTED = 5;
    static constexpr std::array<size_t, 2> SHIFTED_SOURCES = { 1, 3 };
    using PCS = TripleIPA<Curve, LOG_N>;

    static CK ck;
    static VK vk;

    static void SetUpTestSuite()
    {
        // Use the shared file CRS factory (like every other commitment-scheme suite). Installing a small in-memory
        // Grumpkin factory here would shrink the global factory and starve later Grumpkin suites in the same binary.
        srs::init_grumpkin_file_crs_factory(srs::bb_crs_path());
        ck = CK(N);
        vk = VK(N, srs::get_grumpkin_crs_factory());
    }

    static Fr inner_product(const Poly& left, std::span<const Fr> right)
    {
        BB_ASSERT_EQ(right.size(), N);
        Fr result = Fr::zero();
        for (size_t idx = 0; idx < N; ++idx) {
            result += left[idx] * right[idx];
        }
        return result;
    }

    // The non-cyclic shift tensor (b_sh[0] = 0, b_sh[i] = eq(u)_{i-1}) used to compute the shifted-source evaluations.
    // There is no production materializer for it, and evaluate_mle(shift=true) asserts a zero constant term that the
    // random sources here violate, so it is built explicitly off the production eq. (The fold itself is unit-tested in
    // polynomials/shifted_eq_polynomial.test.cpp.)
    static std::vector<Fr> shift_tensor(const std::vector<Fr>& point)
    {
        const auto eq = ProverEqPolynomial<Fr>::construct(point, LOG_N);
        std::vector<Fr> result(N, Fr::zero());
        for (size_t idx = 1; idx < N; ++idx) {
            result[idx] = eq[idx - 1];
        }
        return result;
    }

    PCS::TripleIpaInput create_input(const Fr& rho = Fr::random_element())
    {
        PCS::TripleIpaInput input;
        const auto multilinear_challenge = this->random_evaluation_point(LOG_N);
        std::vector<Curve::AffineElement> commitments, shifted_commitments;
        std::vector<Fr> evaluations, shifted_source_evaluations, shifted_evaluations;

        const auto shift = shift_tensor(multilinear_challenge);

        for (size_t idx = 0; idx < NUM_UNSHIFTED; ++idx) {
            auto polynomial = this->random_polynomial(N);
            evaluations.emplace_back(polynomial.evaluate_mle(std::span<const Fr>(multilinear_challenge)));
            commitments.emplace_back(ck.commit(polynomial));
            input.unshifted_polynomials.emplace_back(std::move(polynomial));
        }

        for (const size_t source_idx : SHIFTED_SOURCES) {
            shifted_commitments.emplace_back(commitments[source_idx]);
            shifted_source_evaluations.emplace_back(evaluations[source_idx]);
            shifted_evaluations.emplace_back(
                inner_product(input.unshifted_polynomials[source_idx], std::span<const Fr>(shift)));
            input.shifted_polynomials.emplace_back(input.unshifted_polynomials[source_idx].share());
        }

        input.univariate_polynomial = this->random_polynomial(N);
        const auto univariate_challenge = this->random_element();
        const OpeningClaim<Curve> univariate{ { univariate_challenge,
                                                input.univariate_polynomial.evaluate(univariate_challenge) },
                                              ck.commit(input.univariate_polynomial) };
        input.claim_data = PCS::TripleIpaClaimData::create(commitments,
                                                           evaluations,
                                                           shifted_commitments,
                                                           shifted_source_evaluations,
                                                           shifted_evaluations,
                                                           multilinear_challenge,
                                                           rho,
                                                           univariate);
        return input;
    }

    static NativeTranscript::Proof prove(const PCS::TripleIpaInput& input)
    {
        auto prover_transcript = std::make_shared<NativeTranscript>();
        PCS::compute_opening_proof(ck, input, prover_transcript);
        return prover_transcript->export_proof();
    }

    static std::shared_ptr<NativeTranscript> transcript_for(const NativeTranscript::Proof& proof)
    {
        auto transcript = std::make_shared<NativeTranscript>();
        transcript->load_proof(proof);
        return transcript;
    }

    static bool verify(const PCS::TripleIpaInput& input, const NativeTranscript::Proof& proof)
    {
        return PCS::reduce_verify(vk, input.claim_data.batch(), transcript_for(proof));
    }
};

TripleIPATest::CK TripleIPATest::ck;
TripleIPATest::VK TripleIPATest::vk;

} // namespace

TEST_F(TripleIPATest, NativeProveVerify)
{
    const auto input = create_input();
    const auto proof = prove(input);
    EXPECT_TRUE(verify(input, proof));
}

TEST_F(TripleIPATest, NativeVerifierDoesNotNeedWitnessPolynomials)
{
    const auto input = create_input();
    const auto proof = prove(input);

    auto verifier_input = input;
    verifier_input.unshifted_polynomials.clear();
    verifier_input.univariate_polynomial = Poly();
    EXPECT_TRUE(verify(verifier_input, proof));
}

// Deferred discharge: reduce each proof to a NativeAccumulator (no SRS-MSM), then settle all of them with a single
// combined MSM via batch_verify_accumulators. This is the path chonk uses to fold many ECCVM openings into one MSM.
TEST_F(TripleIPATest, NativeBatchVerifyAccumulatorsDischargesMultipleProofs)
{
    const auto input1 = create_input();
    const auto proof1 = prove(input1);
    const auto input2 = create_input();
    const auto proof2 = prove(input2);

    std::array<PCS::NativeAccumulator, 2> accumulators{
        PCS::reduce_to_accumulator(input1.claim_data.batch(), transcript_for(proof1)),
        PCS::reduce_to_accumulator(input2.claim_data.batch(), transcript_for(proof2)),
    };

    EXPECT_TRUE(PCS::batch_verify_accumulators(vk, std::span<const PCS::NativeAccumulator>(accumulators)));
}

TEST_F(TripleIPATest, NativeBatchVerifyAccumulatorsRejectsTamperedProof)
{
    const auto input1 = create_input();
    const auto proof1 = prove(input1);
    const auto input2 = create_input();
    auto proof2 = prove(input2);

    ASSERT_FALSE(proof2.empty());
    proof2[0] += bb::fr::one();

    std::array<PCS::NativeAccumulator, 2> accumulators{
        PCS::reduce_to_accumulator(input1.claim_data.batch(), transcript_for(proof1)),
        PCS::reduce_to_accumulator(input2.claim_data.batch(), transcript_for(proof2)),
    };

    EXPECT_FALSE(PCS::batch_verify_accumulators(vk, std::span<const PCS::NativeAccumulator>(accumulators)));
}

TEST_F(TripleIPATest, CreateBatchesWithConsecutiveRhoPowers)
{
    const auto input = create_input(Fr(2));
    const auto& data = input.claim_data;
    const std::vector<Fr> unshifted_weights{ 1, 2, 4, 8, 16 };
    const std::vector<Fr> shifted_weights{ 32, 64 };
    ASSERT_EQ(unshifted_weights.size(), NUM_UNSHIFTED);
    ASSERT_EQ(shifted_weights.size(), SHIFTED_SOURCES.size());
    EXPECT_EQ(data.unshifted.rho_powers, unshifted_weights);
    EXPECT_EQ(data.shifted.rho_powers, shifted_weights);
    const auto claim = data.batch();
    Fr expected = 0;
    for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
        expected += data.unshifted.evaluations[i] * unshifted_weights[i];
    }
    EXPECT_EQ(claim.unshifted_evaluation, expected);
    expected = 0;
    for (size_t i = 0; i < SHIFTED_SOURCES.size(); ++i) {
        expected += data.shifted.shifted_evaluations[i] * shifted_weights[i];
    }
    EXPECT_EQ(claim.shifted_evaluation, expected);
}

TEST_F(TripleIPATest, RhoBatchingBindsIndividualEvaluations)
{
    for (const bool shifted : { false, true }) {
        SCOPED_TRACE(shifted ? "shifted" : "unshifted");
        auto input = create_input(Fr(2));
        auto& evaluations =
            shifted ? input.claim_data.shifted.shifted_evaluations : input.claim_data.unshifted.evaluations;
        evaluations[0] += Fr::one();
        evaluations[1] -= Fr::one();
        const auto proof = prove(input);
        EXPECT_FALSE(verify(input, proof));
    }
}

TEST_F(TripleIPATest, RejectsChangedExternalClaim)
{
    const auto input = create_input();
    const auto proof = prove(input);
    const auto claim = input.claim_data.batch();
    ASSERT_TRUE(PCS::reduce_verify(vk, claim, transcript_for(proof)));
    using Claim = PCS::TripleIpaClaim;
    using Mutation = std::pair<const char*, void (*)(Claim&)>;
    const std::array<Mutation, 7> mutations = { {
        { "unshifted commitment",
          [](Claim& c) { c.unshifted_commitment = c.unshifted_commitment + Curve::AffineElement::one(); } },
        { "shifted commitment",
          [](Claim& c) { c.shifted_commitment = c.shifted_commitment + Curve::AffineElement::one(); } },
        { "univariate commitment",
          [](Claim& c) { c.univariate.commitment = c.univariate.commitment + Curve::AffineElement::one(); } },
        { "unshifted evaluation", [](Claim& c) { c.unshifted_evaluation += Fr::one(); } },
        { "shifted evaluation", [](Claim& c) { c.shifted_evaluation += Fr::one(); } },
        { "univariate evaluation", [](Claim& c) { c.univariate.opening_pair.evaluation += Fr::one(); } },
        { "univariate challenge", [](Claim& c) { c.univariate.opening_pair.challenge += Fr::one(); } },
    } };
    for (const auto& [name, mutate] : mutations) {
        SCOPED_TRACE(name);
        auto changed = claim;
        mutate(changed);
        EXPECT_FALSE(PCS::reduce_verify(vk, changed, transcript_for(proof)));
    }
    for (size_t i = 0; i < claim.multilinear_challenge.size(); ++i) {
        SCOPED_TRACE(i);
        auto changed = claim;
        changed.multilinear_challenge[i] += Fr::one();
        EXPECT_FALSE(PCS::reduce_verify(vk, changed, transcript_for(proof)));
    }
}

TEST_F(TripleIPATest, DischargeRejectsFailedGroupRelation)
{
    const auto input = create_input();
    auto proof = prove(input);
    const auto claim = input.claim_data.batch();
    const auto honest = PCS::reduce_to_accumulator(claim, transcript_for(proof));
    ASSERT_TRUE(honest.relation_succeeded);
    ASSERT_TRUE(PCS::verify_accumulator(vk, honest));

    constexpr size_t scalar_size = FrCodec::calc_num_fields<Fr>();
    ASSERT_GE(proof.size(), scalar_size);
    const auto tail = std::span<bb::fr>(proof).last(scalar_size);
    const Fr a_zero = FrCodec::deserialize_from_fields<Fr>(tail);
    const auto replacement = FrCodec::serialize_to_fields<Fr>(a_zero + Fr::one());
    std::copy(replacement.begin(), replacement.end(), tail.begin());
    const auto bad = PCS::reduce_to_accumulator(claim, transcript_for(proof));
    ASSERT_FALSE(bad.relation_succeeded);
    EXPECT_EQ(bad.u_challenges_inv, honest.u_challenges_inv);
    EXPECT_EQ(bad.claimed_commitment, honest.claimed_commitment);
    EXPECT_FALSE(PCS::verify_accumulator(vk, bad));
    EXPECT_FALSE(PCS::reduce_verify(vk, claim, transcript_for(proof)));
    for (size_t bad_index = 0; bad_index < 2; ++bad_index) {
        SCOPED_TRACE(bad_index);
        std::array<PCS::NativeAccumulator, 2> batch{ honest, honest };
        batch[bad_index] = bad;
        EXPECT_FALSE(PCS::batch_verify_accumulators(vk, batch));
    }
}

TEST_F(TripleIPATest, BatchDischargeBindsClaimedCommitments)
{
    const auto input1 = create_input();
    const auto input2 = create_input();
    const std::array<PCS::NativeAccumulator, 2> honest{
        PCS::reduce_to_accumulator(input1.claim_data.batch(), transcript_for(prove(input1))),
        PCS::reduce_to_accumulator(input2.claim_data.batch(), transcript_for(prove(input2))),
    };
    ASSERT_TRUE(PCS::batch_verify_accumulators(vk, honest));

    // This tests the discharge API with synthetic accumulators, not the reachability of these states from proofs.
    // Without commitment absorption, an offset chosen after rho is known can cancel between two accumulators.
    // Must mirror the labels in IPA::batch_verify_accumulators.
    NativeTranscript unbound;
    for (size_t i = 0; i < honest.size(); ++i) {
        unbound.add_to_hash_buffer("IPA:batch_u_" + std::to_string(i), honest[i].u_challenges_inv);
    }
    const Fr rho = unbound.get_challenge<Fr>("IPA:batch_rho");
    ASSERT_FALSE(rho.is_zero());
    const Curve::Element delta = Curve::Element::one();
    auto changed = honest;
    changed[0].claimed_commitment = (Curve::Element(honest[0].claimed_commitment) + delta).normalize();
    changed[1].claimed_commitment = (Curve::Element(honest[1].claimed_commitment) - delta * rho.invert()).normalize();
    auto combine = [&](const auto& batch) {
        return (Curve::Element(batch[0].claimed_commitment) + batch[1].claimed_commitment * rho).normalize();
    };
    ASSERT_EQ(combine(changed), combine(honest));
    EXPECT_FALSE(PCS::verify_accumulator(vk, changed[0]));
    EXPECT_FALSE(PCS::verify_accumulator(vk, changed[1]));
    EXPECT_FALSE(PCS::batch_verify_accumulators(vk, changed));
}
