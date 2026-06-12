#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <sstream>
#include <vector>

using namespace bb;

namespace {

using Curve = curve::BN254;
using FF = Curve::ScalarField;
using Commitment = Curve::AffineElement;
using ProverClaim = MultilinearBatchingProverClaim;
using VerifierClaim = MultilinearBatchingVerifierClaim<Curve>;

class MultilinearBatchingWitnessDuplicateTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Size of the slot polynomials; the protocol pads every polynomial up to 2^VIRTUAL_LOG_N virtual variables, so
    // the actual size only needs to be small.
    static constexpr size_t LOG_N = 5;
    static constexpr size_t VIRTUAL_LOG_N = MultilinearBatchingFlavor::VIRTUAL_LOG_N;
    static constexpr size_t NUM_CLAIMS = CHONK_MAX_CLAIMS_PER_KERNEL;

    /**
     * @brief Evaluate the (zero-padded) multilinear extension of `poly` at the full VIRTUAL_LOG_N-variate point `r`.
     */
    static FF mle_padded(const Polynomial<FF>& poly, const std::vector<FF>& r, bool shift = false)
    {
        std::vector<FF> head(r.begin(), r.begin() + LOG_N);
        FF value = poly.evaluate_mle(head, shift);
        for (size_t j = LOG_N; j < r.size(); ++j) {
            value *= (FF(1) - r[j]);
        }
        return value;
    }

    struct ClaimSet {
        std::vector<ProverClaim> prover_claims;
        std::vector<VerifierClaim> verifier_claims;
    };

    /**
     * @brief Build NUM_CLAIMS honest, mutually consistent batching claims with real commitments and evaluations.
     */
    static ClaimSet build_honest_claims()
    {
        const size_t dyadic_size = 1UL << LOG_N;
        CommitmentKey<Curve> commitment_key(dyadic_size);

        ClaimSet set;
        for (size_t i = 0; i < NUM_CLAIMS; ++i) {
            std::vector<FF> challenge(VIRTUAL_LOG_N);
            for (auto& c : challenge) {
                c = FF::random_element();
            }

            Polynomial<FF> non_shifted = Polynomial<FF>::random(dyadic_size);
            Polynomial<FF> shifted = Polynomial<FF>::random(dyadic_size - 1, dyadic_size, /*start_index=*/1);

            const FF non_shifted_eval = mle_padded(non_shifted, challenge);
            const FF shifted_eval = mle_padded(shifted, challenge, /*shift=*/true);
            const Commitment non_shifted_commitment = commitment_key.commit(non_shifted);
            const Commitment shifted_commitment = commitment_key.commit(shifted);

            set.verifier_claims.push_back(VerifierClaim{ .challenge = challenge,
                                                         .non_shifted_evaluation = non_shifted_eval,
                                                         .shifted_evaluation = shifted_eval,
                                                         .non_shifted_commitment = non_shifted_commitment,
                                                         .shifted_commitment = shifted_commitment });
            set.prover_claims.push_back(ProverClaim{ .challenge = std::move(challenge),
                                                     .non_shifted_evaluation = non_shifted_eval,
                                                     .shifted_evaluation = shifted_eval,
                                                     .non_shifted_polynomial = std::move(non_shifted),
                                                     .shifted_polynomial = std::move(shifted),
                                                     .non_shifted_commitment = non_shifted_commitment,
                                                     .shifted_commitment = shifted_commitment,
                                                     .dyadic_size = dyadic_size });
        }
        return set;
    }
};

TEST_F(MultilinearBatchingWitnessDuplicateTests, RecursiveVerifierWitnessDuplicates)
{
    ClaimSet set = build_honest_claims();

    auto prover_transcript = std::make_shared<NativeTranscript>();
    // Seed the transcript so the first batching challenge is not drawn from an empty hash buffer; in production the
    // shared transcript already holds the group's instance sumchecks at this point.
    prover_transcript->send_to_verifier("init", FF::random_element());
    MultilinearBatchingProver prover(std::move(set.prover_claims), prover_transcript);
    HonkProof proof = prover.construct_proof();

    using RecursiveVerifier = MultilinearBatchingRecursiveVerifier;
    using RecursiveCurve = typename RecursiveVerifier::Curve;
    using RecursiveClaim = MultilinearBatchingVerifierClaim<RecursiveCurve>;
    using RecursiveFF = typename RecursiveCurve::ScalarField;

    MegaCircuitBuilder builder;
    auto transcript = std::make_shared<typename RecursiveVerifier::Transcript>();
    typename RecursiveVerifier::Proof stdlib_proof(builder, proof);
    transcript->load_proof(stdlib_proof);
    RecursiveFF seed = transcript->template receive_from_prover<RecursiveFF>("init");
    // The seed stands in for the prior transcript content (the group's instance sumchecks), which in production is
    // constrained elsewhere in the kernel; here it is only hashed, so fix it to keep the analyzer from flagging it.
    seed.fix_witness();

    std::vector<RecursiveClaim> recursive_claims;
    recursive_claims.reserve(set.verifier_claims.size());
    for (const auto& claim : set.verifier_claims) {
        RecursiveClaim recursive_claim = RecursiveClaim::template stdlib_from_native<RecursiveCurve>(&builder, claim);
        // The claims stand in for values the kernel would receive already constrained; clear the free-witness tags so
        // the verifier's origin-tag mechanism does not flag them when they mix with transcript values.
        for (auto& challenge_element : recursive_claim.challenge) {
            challenge_element.unset_free_witness_tag();
        }
        recursive_claim.non_shifted_evaluation.unset_free_witness_tag();
        recursive_claim.shifted_evaluation.unset_free_witness_tag();
        // Each input evaluation is consumed exactly once (in the target-sum computation); in production it is
        // produced by the instance sumcheck verifier in the same circuit. Fix the witnesses so the StaticAnalyzer
        // does not flag them as under-constrained.
        recursive_claim.non_shifted_evaluation.fix_witness();
        recursive_claim.shifted_evaluation.fix_witness();
        recursive_claim.non_shifted_commitment.unset_free_witness_tag();
        recursive_claim.shifted_commitment.unset_free_witness_tag();
        recursive_claims.push_back(std::move(recursive_claim));
    }

    RecursiveVerifier verifier(transcript);
    auto [verified, new_claim] = verifier.verify_proof(recursive_claims);

    EXPECT_TRUE(verified);
    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));

    // The output claim is consumed downstream in production (the kernel propagates it to the next accumulation step);
    // here it is unused, so fix its witnesses to keep the StaticAnalyzer from flagging them as under-constrained.
    for (auto& challenge_element : new_claim.challenge) {
        challenge_element.fix_witness();
    }
    new_claim.non_shifted_evaluation.fix_witness();
    new_claim.shifted_evaluation.fix_witness();
    new_claim.non_shifted_commitment.fix_witness();
    new_claim.shifted_commitment.fix_witness();

    info("Multilinear batching recursive verifier: finalized num gates = ",
         builder.get_num_finalized_gates_inefficient());

    auto analyzer = cdg::MegaStaticAnalyzer(builder);
    auto [connected_components, variables_in_one_gate] = analyzer.analyze_circuit();
    EXPECT_EQ(connected_components.size(), 1);
    for (const uint32_t var_idx : variables_in_one_gate) {
        analyzer.print_variable_info(var_idx);
    }
    EXPECT_EQ(variables_in_one_gate.size(), 0);

    analyzer.fill_witness_duplicate_map({}, cdg::WitnessDuplicateFilterMode::TRIAGE_VALUE_FILTERS);
    for (const auto& [value, witness_indices] : analyzer.get_witness_duplicate_map()) {
        std::stringstream indices_stream;
        for (const uint32_t witness_idx : witness_indices) {
            indices_stream << witness_idx << " ";
        }
        info("Value: ", value, ", witness indices: ", indices_stream.str());
    }
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().empty());
}

} // namespace
