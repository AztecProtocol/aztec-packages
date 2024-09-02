#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

#include <gtest/gtest.h>

using namespace bb;

template <class PCS> class ShpleminiRecursionTest : public CommitmentTest<typename PCS::Curve::NativeCurve> {};

numeric::RNG& engine = numeric::get_debug_randomness();

/**
 * @brief Test full Prover/Verifier protocol for proving single multilinear evaluation
 *
 */
TEST(ShpleminiRecursionTest, ProveAndVerifySingle)
{
    // Define some useful type aliases
    using Builder = UltraCircuitBuilder;
    using Curve = typename stdlib::bn254<Builder>;
    using NativeCurve = typename Curve::NativeCurve;
    using Commitment = typename Curve::AffineElement;
    using NativeCommitment = typename Curve::AffineElementNative;
    using NativeCurve = typename Curve::NativeCurve;
    using NativePCS = std::conditional_t<std::same_as<NativeCurve, curve::BN254>, KZG<NativeCurve>, IPA<NativeCurve>>;
    using CommitmentKey = typename NativePCS::CK;
    using GeminiProver = GeminiProver_<NativeCurve>;
    using ShplonkProver = ShplonkProver_<NativeCurve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using ZeroMorphProver = ZeroMorphProver_<NativeCurve>;
    using Fr = typename Curve::ScalarField;
    using NativeFr = typename Curve::NativeCurve::ScalarField;
    using Polynomial = bb::Polynomial<NativeFr>;
    using ZeroMorphVerifier = ZeroMorphVerifier_<Curve>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;

    constexpr size_t N = 2;
    constexpr size_t NUM_UNSHIFTED = 1;
    constexpr size_t NUM_SHIFTED = 0;

    srs::init_crs_factory("../srs_db/ignition");

    std::vector<NativeFr> u_challenge = { NativeFr::random_element(&engine) };

    // Construct some random multilinear polynomials f_i and their evaluations v_i = f_i(u)
    std::vector<Polynomial> f_polynomials; // unshifted polynomials
    std::vector<NativeFr> v_evaluations;
    for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
        f_polynomials.emplace_back(Polynomial::random(N));
        f_polynomials[i][0] = NativeFr(0); // ensure f is "shiftable"
        v_evaluations.emplace_back(f_polynomials[i].evaluate_mle(u_challenge));
    }

    // Construct some "shifted" multilinear polynomials h_i as the left-shift-by-1 of f_i
    std::vector<Polynomial> g_polynomials; // to-be-shifted polynomials
    std::vector<Polynomial> h_polynomials; // shifts of the to-be-shifted polynomials
    std::vector<NativeFr> w_evaluations;
    for (size_t i = 0; i < NUM_SHIFTED; ++i) {
        g_polynomials.emplace_back(f_polynomials[i]);
        h_polynomials.emplace_back(g_polynomials[i].shifted());
        w_evaluations.emplace_back(h_polynomials[i].evaluate_mle(u_challenge));
    }

    std::vector<Fr> claimed_evaluations;
    claimed_evaluations.reserve(v_evaluations.size() + w_evaluations.size());
    claimed_evaluations.insert(claimed_evaluations.end(), v_evaluations.begin(), v_evaluations.end());
    claimed_evaluations.insert(claimed_evaluations.end(), w_evaluations.begin(), w_evaluations.end());

    // Compute commitments [f_i]
    std::vector<NativeCommitment> f_commitments;
    auto commitment_key = std::make_shared<CommitmentKey>(1024);
    for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
        f_commitments.emplace_back(commitment_key->commit(f_polynomials[i]));
    }

    // Construct container of commitments of the "to-be-shifted" polynomials [g_i] (= [f_i])
    std::vector<NativeCommitment> g_commitments;
    for (size_t i = 0; i < NUM_SHIFTED; ++i) {
        g_commitments.emplace_back(f_commitments[i]);
    }

    // Initialize an empty NativeTranscript
    auto prover_transcript = NativeTranscript::prover_init_empty();

    FF rho = transcript->template get_challenge<FF>("rho");
    std::vector<FF> rhos = gemini::powers_of_rho(rho, NUM_POLYNOMIALS);
    size_t circuit_size = N;
    // Batch the unshifted polynomials and the to-be-shifted polynomials using ρ
    Polynomial batched_poly_unshifted(circuit_size); // batched unshifted polynomials
    size_t poly_idx = 0;                             // TODO(#391) zip
    for (auto& unshifted_poly : g_polynomials) {
        batched_poly_unshifted.add_scaled(unshifted_poly, rhos[poly_idx]);
        ++poly_idx;
    }

    Polynomial batched_poly_to_be_shifted(circuit_size); // batched to-be-shifted polynomials
    for (auto& to_be_shifted_poly : h_polynomials) {
        batched_poly_to_be_shifted.add_scaled(to_be_shifted_poly, rhos[poly_idx]);
        ++poly_idx;
    };

    // Compute d-1 polynomials Fold^(i), i = 1, ..., d-1.
    fold_polynomials =
        Gemini::compute_gemini_polynomials(u_challenge, batched_poly_unshifted, batched_poly_to_be_shifted);
    // Comute and add to trasnscript the commitments [Fold^(i)], i = 1, ..., d-1
    for (size_t l = 0; l < accumulator->proving_key.log_circuit_size - 1; ++l) {
        Commitment current_commitment = commitment_key->commit(fold_polynomials[l + 2]);
        transcript->send_to_verifier("Gemini:FOLD_" + std::to_string(l + 1), current_commitment);
    }

    const FF r_challenge = transcript->template get_challenge<FF>("Gemini:r");

    gemini_output =
        Gemini::compute_fold_polynomial_evaluations(sumcheck_challenges, std ::move(fold_polynomials), r_challenge);

    for (size_t l = 0; l < accumulator->proving_key.log_circuit_size; ++l) {
        std::string label = "Gemini:a_" + std::to_string(l);
        const auto& evaluation = gemini_output[l + 1].opening_pair.evaluation;
        transcript->send_to_verifier(label, evaluation);
    }

    nu_challenge = transcript->template get_challenge<FF>("Shplonk:nu");

    batched_quotient_Q = Shplonk::compute_batched_quotient(gemini_output, nu_challenge);

    Commitment batched_commitment_Q = commitment_key->commit(batched_quotient_Q);
    // commit to Q(X) and add [Q] to the transcript
    transcript->send_to_verifier("Shplonk:Q", batched_commitment_Q);
    const FF z_challenge = transcript->template get_challenge<FF>("Shplonk:z");

    shplonk_output = Shplonk::compute_partially_evaluated_batched_quotient(
        gemini_output, batched_quotient_Q, nu_challenge, z_challenge);

    Builder builder;
    StdlibProof<Builder> stdlib_proof = bb::convert_proof_to_witness(&builder, prover_transcript->proof_data);
    auto stdlib_verifier_transcript = std::make_shared<Transcript>(stdlib_proof);
    [[maybe_unused]] auto _ = stdlib_verifier_transcript->template receive_from_prover<Fr>("Init");

    // Execute Verifier protocol without the need for vk prior the final check
    const auto commitments_to_witnesses = [&builder](const auto& commitments) {
        std::vector<Commitment> commitments_in_biggroup(commitments.size());
        std::transform(commitments.begin(),
                       commitments.end(),
                       commitments_in_biggroup.begin(),
                       [&builder](const auto& native_commitment) {
                           return Commitment::from_witness(&builder, native_commitment);
                       });
        return commitments_in_biggroup;
    };
    const auto elements_to_witness = [&](const auto& elements) {
        std::vector<Fr> elements_in_circuit(elements.size());
        std::transform(elements.begin(),
                       elements.end(),
                       elements_in_circuit.begin(),
                       [&builder](const auto& native_element) { return Fr::from_witness(&builder, native_element); });
        return elements_in_circuit;
    };
    auto stdlib_f_commitments = commitments_to_witnesses(f_commitments);
    auto stdlib_g_commitments = commitments_to_witnesses(g_commitments);
    auto stdlib_v_evaluations = elements_to_witness(v_evaluations);
    auto stdlib_w_evaluations = elements_to_witness(w_evaluations);

    std::vector<Fr> u_challenge_in_circuit(CONST_PROOF_SIZE_LOG_N);
    std::fill_n(u_challenge_in_circuit.begin(), CONST_PROOF_SIZE_LOG_N, Fr::from_witness(&builder, 0));
    u_challenge_in_circuit[0] = Fr::from_witness(&builder, u_challenge[0]);

    [[maybe_unused]] auto opening_claim =
        ShpleminiVerifier::accumulate_batch_mul_arguments(log_circuit_size,
                                                          RefVector(stdlib_f_commitments), // unshifted
                                                          RefVector(stdlib_g_commitments),
                                                          RefVector(claimed_evaluations),
                                                          u_challenge,
                                                          Commitment::one(&builder),
                                                          stdlib_verifier_transcript)

            EXPECT_TRUE(CircuitChecker::check(builder));
}
