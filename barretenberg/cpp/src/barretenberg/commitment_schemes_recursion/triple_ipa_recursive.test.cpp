#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/pcs_test_utils.hpp"
#include "barretenberg/commitment_schemes/triple_ipa/triple_ipa.hpp"
#include "barretenberg/srs/factories/grumpkin_srs_gen.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

using namespace bb;

namespace {

using NativeCurve = curve::Grumpkin;
using Builder = UltraCircuitBuilder;
using RecursiveCurve = stdlib::grumpkin<Builder>;

class TripleIPARecursiveTest : public CommitmentTest<NativeCurve> {
  public:
    using Fr = typename NativeCurve::ScalarField;
    using CK = CommitmentKey<NativeCurve>;
    using VK = VerifierCommitmentKey<NativeCurve>;
    using Polynomial = bb::Polynomial<Fr>;
    using Commitment = typename NativeCurve::AffineElement;
    using StdlibProof = stdlib::Proof<Builder>;
    using StdlibTranscript = UltraStdlibTranscript;

    static constexpr size_t log_n = 4;
    static constexpr size_t n = 1UL << log_n;
    using NativePCS = TripleIPA<NativeCurve, log_n>;
    using RecursivePCS = TripleIPA<RecursiveCurve, log_n>;
    // The non-cyclic shift tensor as an explicit vector: b_sh[0] = 0, b_sh[i] = eq(u)_{i-1}. Production only exposes
    // the succinct fold (ShiftedEqPolynomial), never the vector, and evaluate_mle(shift=true) asserts a zero constant
    // term, which this suite deliberately violates — so this stays as the explicit oracle, built off the production eq.
    static std::vector<Fr> materialize_shift(const std::vector<Fr>& point)
    {
        const auto eq = ProverEqPolynomial<Fr>::construct(point, log_n);
        std::vector<Fr> result(n, Fr::zero());
        for (size_t idx = 1; idx < n; ++idx) {
            result[idx] = eq[idx - 1];
        }
        return result;
    }

    static Fr inner_product(const Polynomial& left, std::span<const Fr> right)
    {
        BB_ASSERT_EQ(right.size(), n);
        Fr result = Fr::zero();
        for (size_t idx = 0; idx < n; ++idx) {
            result += left[idx] * right[idx];
        }
        return result;
    }

    static CK ck;
    static VK vk;

    static void SetUpTestSuite()
    {
        // Use the file CRS: replacing the global factory with a tiny mem CRS breaks suites sharing this binary
        // (e.g. Shplemini tests that run the ECCVM prover and need the full Grumpkin SRS).
        srs::init_grumpkin_file_crs_factory(srs::bb_crs_path());
        ck = CK(n);
        vk = VK(n, srs::get_grumpkin_crs_factory());
    }

    typename NativePCS::TripleIpaInput create_triple_ipa_input()
    {
        typename NativePCS::TripleIpaInput input;
        const auto multilinear_challenge = this->random_evaluation_point(log_n);
        input.claim_data.unshifted.multilinear_challenge = multilinear_challenge;

        const auto shift_tensor = materialize_shift(multilinear_challenge);

        for (size_t idx = 0; idx < 5; ++idx) {
            auto polynomial = this->random_polynomial(n);
            input.claim_data.unshifted.evaluations.emplace_back(
                polynomial.evaluate_mle(std::span<const Fr>(multilinear_challenge)));
            input.claim_data.unshifted.commitments.emplace_back(ck.commit(polynomial));
            input.unshifted_polynomials.emplace_back(std::move(polynomial));
        }
        using ClaimData = typename NativePCS::TripleIpaClaimData;
        input.claim_data.unshifted.rho_powers =
            ClaimData::rho_powers(this->random_element(), input.unshifted_polynomials.size());

        const std::vector<size_t> shifted_sources = { 1, 3 };
        input.claim_data.shifted.rho_powers = ClaimData::rho_powers(this->random_element(), shifted_sources.size());
        for (const size_t source_idx : shifted_sources) {
            input.claim_data.shifted.commitments.emplace_back(input.claim_data.unshifted.commitments[source_idx]);
            input.claim_data.shifted.source_unshifted_evaluations.emplace_back(
                input.claim_data.unshifted.evaluations[source_idx]);
            input.claim_data.shifted.shifted_evaluations.emplace_back(
                inner_product(input.unshifted_polynomials[source_idx], std::span<const Fr>(shift_tensor)));
            input.shifted_polynomials.emplace_back(input.unshifted_polynomials[source_idx].share());
        }

        input.univariate_polynomial = this->random_polynomial(n);
        input.claim_data.univariate.opening_pair.challenge = this->random_element();
        input.claim_data.univariate.opening_pair.evaluation =
            input.univariate_polynomial.evaluate(input.claim_data.univariate.opening_pair.challenge);
        input.claim_data.univariate.commitment = ck.commit(input.univariate_polynomial);
        return input;
    }

    typename RecursivePCS::TripleIpaInput to_recursive_input(Builder& builder,
                                                             const typename NativePCS::TripleIpaInput& native_input)
    {
        typename RecursivePCS::TripleIpaInput result;
        for (const auto& commitment : native_input.claim_data.unshifted.commitments) {
            result.claim_data.unshifted.commitments.emplace_back(
                RecursiveCurve::Group::from_witness(&builder, commitment));
        }
        for (const auto& evaluation : native_input.claim_data.unshifted.evaluations) {
            result.claim_data.unshifted.evaluations.emplace_back(
                RecursiveCurve::ScalarField::from_witness(&builder, evaluation));
        }
        for (const auto& rho_power : native_input.claim_data.unshifted.rho_powers) {
            result.claim_data.unshifted.rho_powers.emplace_back(
                RecursiveCurve::ScalarField::from_witness(&builder, rho_power));
        }
        for (const auto& coordinate : native_input.claim_data.unshifted.multilinear_challenge) {
            result.claim_data.unshifted.multilinear_challenge.emplace_back(
                RecursiveCurve::ScalarField::from_witness(&builder, coordinate));
        }

        for (const auto& commitment : native_input.claim_data.shifted.commitments) {
            result.claim_data.shifted.commitments.emplace_back(
                RecursiveCurve::Group::from_witness(&builder, commitment));
        }
        for (const auto& evaluation : native_input.claim_data.shifted.shifted_evaluations) {
            result.claim_data.shifted.shifted_evaluations.emplace_back(
                RecursiveCurve::ScalarField::from_witness(&builder, evaluation));
        }
        for (const auto& rho_power : native_input.claim_data.shifted.rho_powers) {
            result.claim_data.shifted.rho_powers.emplace_back(
                RecursiveCurve::ScalarField::from_witness(&builder, rho_power));
        }

        result.claim_data.univariate = {
            { RecursiveCurve::ScalarField::from_witness(&builder,
                                                        native_input.claim_data.univariate.opening_pair.challenge),
              RecursiveCurve::ScalarField::from_witness(&builder,
                                                        native_input.claim_data.univariate.opening_pair.evaluation) },
            RecursiveCurve::Group::from_witness(&builder, native_input.claim_data.univariate.commitment)
        };
        return result;
    }

    NativeTranscript::Proof prove_triple_ipa(const typename NativePCS::TripleIpaInput& input)
    {
        auto prover_transcript = std::make_shared<NativeTranscript>();
        NativePCS::compute_opening_proof(ck, input, prover_transcript);
        return prover_transcript->export_proof();
    }
};

TripleIPARecursiveTest::CK TripleIPARecursiveTest::ck;
TripleIPARecursiveTest::VK TripleIPARecursiveTest::vk;

} // namespace

TEST_F(TripleIPARecursiveTest, RecursiveReduceVerifyEmitsAccumulator)
{
    auto input = create_triple_ipa_input();
    auto proof = prove_triple_ipa(input);

    Builder builder;
    auto recursive_input = to_recursive_input(builder, input);
    auto transcript = std::make_shared<StdlibTranscript>(StdlibProof(builder, proof));
    auto accumulator = RecursivePCS::reduce_verify(recursive_input.claim_data.batch(), transcript);

    EXPECT_EQ(accumulator.u_challenges_inv.size(), log_n);
    EXPECT_TRUE(accumulator.running_truth_value);
    stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);
    builder.finalize_circuit();
    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// A tampered TripleIPA proof must be rejected by the in-circuit relation, not merely by the native
// `running_truth_value` side-channel: corrupting the first prover message (the `TripleIPA:cross_F_shift` cross-sum)
// diverges the verifier's zeta challenges and combined claim from the prover's, so the IPA group-relation
// `assert_equal` cannot close and the circuit becomes unsatisfiable.
TEST_F(TripleIPARecursiveTest, RecursiveReduceVerifyRejectsTamperedProof)
{
    auto input = create_triple_ipa_input();
    auto proof = prove_triple_ipa(input);
    ASSERT_FALSE(proof.empty());
    using ProofElement = std::decay_t<decltype(proof[0])>;
    proof[0] += ProofElement::one();

    Builder builder;
    auto recursive_input = to_recursive_input(builder, input);
    auto transcript = std::make_shared<StdlibTranscript>(StdlibProof(builder, proof));
    auto accumulator = RecursivePCS::reduce_verify(recursive_input.claim_data.batch(), transcript);
    static_cast<void>(accumulator);

    stdlib::recursion::honk::DefaultIO<Builder>::add_default(builder);
    builder.finalize_circuit();
    EXPECT_FALSE(CircuitChecker::check(builder));
}
