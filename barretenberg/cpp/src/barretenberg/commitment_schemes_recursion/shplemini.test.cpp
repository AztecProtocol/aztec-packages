#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;

template <class PCS> class ShpleminiRecursionTest : public CommitmentTest<typename PCS::Curve::NativeCurve> {};

numeric::RNG& shplemini_engine = numeric::get_debug_randomness();

/**
 * @brief Test full recursive verification for 2 multilinear polynomials and a shift of one of them including pairing
 * check and ensure that regardless of circuit size, recursive Shplemini produces the same number of gates.
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
    using ShpleminiProver = ShpleminiProver_<NativeCurve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using NativeFr = typename Curve::NativeCurve::ScalarField;
    using Polynomial = bb::Polynomial<NativeFr>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;

    srs::init_crs_factory(bb::srs::get_ignition_crs_path());
    auto run_shplemini = [](size_t log_circuit_size) {
        size_t N = 1 << log_circuit_size;
        constexpr size_t NUM_UNSHIFTED = 2;
        constexpr size_t NUM_SHIFTED = 1;
        std::vector<NativeFr> u_challenge(log_circuit_size);
        for (size_t idx = 0; idx < log_circuit_size; ++idx) {
            u_challenge[idx] = NativeFr::random_element(&shplemini_engine);
        };
        // Construct some random multilinear polynomials f_i and their evaluations v_i = f_i(u)
        std::vector<Polynomial> f_polynomials; // unshifted polynomials
        std::vector<NativeFr> v_evaluations;
        for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
            f_polynomials.emplace_back(Polynomial::random(N, /*shiftable*/ 1));
            v_evaluations.emplace_back(f_polynomials[i].evaluate_mle(u_challenge));
        }

        // Construct some "shifted" multilinear polynomials h_i as the left-shift-by-1 of f_i
        std::vector<Polynomial> g_polynomials; // to-be-shifted polynomials
        std::vector<Polynomial> h_polynomials; // shifts of the to-be-shifted polynomials
        std::vector<NativeFr> w_evaluations;
        if constexpr (NUM_SHIFTED > 0) {
            for (size_t i = 0; i < NUM_SHIFTED; ++i) {
                g_polynomials.emplace_back(f_polynomials[i]);
                h_polynomials.emplace_back(g_polynomials[i].shifted());
                w_evaluations.emplace_back(f_polynomials[i].evaluate_mle(u_challenge, true));
            }
        }

        // Compute commitments [f_i]
        std::vector<NativeCommitment> f_commitments;
        auto commitment_key = std::make_shared<CommitmentKey>(16384);
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
        auto prover_opening_claims = ShpleminiProver::prove(
            N, RefVector(f_polynomials), RefVector(g_polynomials), u_challenge, commitment_key, prover_transcript);
        KZG<NativeCurve>::compute_opening_proof(commitment_key, prover_opening_claims, prover_transcript);
        Builder builder;
        StdlibProof<Builder> stdlib_proof = bb::convert_native_proof_to_stdlib(&builder, prover_transcript->proof_data);
        auto stdlib_verifier_transcript = std::make_shared<Transcript>(stdlib_proof);
        stdlib_verifier_transcript->template receive_from_prover<Fr>("Init");

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
            std::transform(
                elements.begin(), elements.end(), elements_in_circuit.begin(), [&builder](const auto& native_element) {
                    return Fr::from_witness(&builder, native_element);
                });
            return elements_in_circuit;
        };
        auto stdlib_f_commitments = commitments_to_witnesses(f_commitments);
        auto stdlib_g_commitments = commitments_to_witnesses(g_commitments);
        auto stdlib_v_evaluations = elements_to_witness(v_evaluations);
        auto stdlib_w_evaluations = elements_to_witness(w_evaluations);

        std::vector<Fr> u_challenge_in_circuit;
        u_challenge_in_circuit.reserve(CONST_PROOF_SIZE_LOG_N);
        auto u_iter = u_challenge.begin();

        std::generate_n(std::back_inserter(u_challenge_in_circuit), CONST_PROOF_SIZE_LOG_N, [&] {
            // We still need to do the same
            Fr zero = Fr(0);
            zero.convert_constant_to_fixed_witness(&builder);
            if (u_iter < u_challenge.end()) {
                return Fr::from_witness(&builder, *u_iter++);
            }
            return zero;
        });

        const auto opening_claim = ShpleminiVerifier::compute_batch_opening_claim(Fr::from_witness(&builder, N),
                                                                                  RefVector(stdlib_f_commitments),
                                                                                  RefVector(stdlib_g_commitments),
                                                                                  RefVector(stdlib_v_evaluations),
                                                                                  RefVector(stdlib_w_evaluations),
                                                                                  u_challenge_in_circuit,
                                                                                  Commitment::one(&builder),
                                                                                  stdlib_verifier_transcript);
        auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(opening_claim, stdlib_verifier_transcript);
        EXPECT_TRUE(CircuitChecker::check(builder));

        auto vk = std::make_shared<VerifierCommitmentKey<NativeCurve>>();
        EXPECT_EQ(vk->pairing_check(pairing_points[0].get_value(), pairing_points[1].get_value()), true);

        // Return finalised number of gates;
        return builder.num_gates;
    };

    size_t num_gates_6 = run_shplemini(6);
    size_t num_gates_13 = run_shplemini(13);
    EXPECT_EQ(num_gates_6, num_gates_13);
}
