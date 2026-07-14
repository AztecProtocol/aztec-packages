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

    PCS::TripleIpaInput create_input()
    {
        PCS::TripleIpaInput input;
        const auto multilinear_challenge = this->random_evaluation_point(LOG_N);
        input.claim_data.unshifted.multilinear_challenge = multilinear_challenge;

        const auto shift = shift_tensor(multilinear_challenge);

        for (size_t idx = 0; idx < 5; ++idx) {
            auto polynomial = this->random_polynomial(N);
            input.claim_data.unshifted.evaluations.emplace_back(
                polynomial.evaluate_mle(std::span<const Fr>(multilinear_challenge)));
            input.claim_data.unshifted.commitments.emplace_back(ck.commit(polynomial));
            input.unshifted_polynomials.emplace_back(std::move(polynomial));
        }
        input.claim_data.unshifted.rho_powers =
            PCS::TripleIpaClaimData::rho_powers(this->random_element(), input.unshifted_polynomials.size());

        const std::array<size_t, 2> shifted_sources = { 1, 3 };
        input.claim_data.shifted.rho_powers =
            PCS::TripleIpaClaimData::rho_powers(this->random_element(), shifted_sources.size());
        for (const size_t source_idx : shifted_sources) {
            input.claim_data.shifted.commitments.emplace_back(input.claim_data.unshifted.commitments[source_idx]);
            input.claim_data.shifted.source_unshifted_evaluations.emplace_back(
                input.claim_data.unshifted.evaluations[source_idx]);
            input.claim_data.shifted.shifted_evaluations.emplace_back(
                inner_product(input.unshifted_polynomials[source_idx], std::span<const Fr>(shift)));
            input.shifted_polynomials.emplace_back(input.unshifted_polynomials[source_idx].share());
        }

        input.univariate_polynomial = this->random_polynomial(N);
        input.claim_data.univariate.opening_pair.challenge = this->random_element();
        input.claim_data.univariate.opening_pair.evaluation =
            input.univariate_polynomial.evaluate(input.claim_data.univariate.opening_pair.challenge);
        input.claim_data.univariate.commitment = ck.commit(input.univariate_polynomial);
        return input;
    }

    static NativeTranscript::Proof prove(const PCS::TripleIpaInput& input)
    {
        auto prover_transcript = std::make_shared<NativeTranscript>();
        PCS::compute_opening_proof(ck, input, prover_transcript);
        return prover_transcript->export_proof();
    }

    static bool verify(const PCS::TripleIpaInput& input, const NativeTranscript::Proof& proof)
    {
        auto verifier_transcript = std::make_shared<NativeTranscript>(proof);
        return PCS::reduce_verify(vk, input.claim_data.batch(), verifier_transcript);
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
        PCS::reduce_to_accumulator(input1.claim_data.batch(), std::make_shared<NativeTranscript>(proof1)),
        PCS::reduce_to_accumulator(input2.claim_data.batch(), std::make_shared<NativeTranscript>(proof2)),
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
        PCS::reduce_to_accumulator(input1.claim_data.batch(), std::make_shared<NativeTranscript>(proof1)),
        PCS::reduce_to_accumulator(input2.claim_data.batch(), std::make_shared<NativeTranscript>(proof2)),
    };

    EXPECT_FALSE(PCS::batch_verify_accumulators(vk, std::span<const PCS::NativeAccumulator>(accumulators)));
}
