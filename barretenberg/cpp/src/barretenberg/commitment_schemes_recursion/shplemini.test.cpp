#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
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
    using NativeCurve = typename Curve::NativeCurve;
    using NativePCS = std::conditional_t<std::same_as<NativeCurve, curve::BN254>, KZG<NativeCurve>, IPA<NativeCurve>>;
    using CommitmentKey = typename NativePCS::CK;
    using ShpleminiProver = ShpleminiProver_<NativeCurve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using NativeFr = typename Curve::NativeCurve::ScalarField;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using MockClaimGen = MockClaimGenerator<NativeCurve>;

    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto run_shplemini = [](size_t log_circuit_size) {
        using diff_t = std::vector<NativeFr>::difference_type;

        size_t N = 1 << log_circuit_size;
        const auto padding_indicator_array =
            stdlib::compute_padding_indicator_array<Curve, CONST_PROOF_SIZE_LOG_N>(log_circuit_size);
        constexpr size_t NUM_POLYS = 5;
        constexpr size_t NUM_SHIFTED = 2;
        constexpr size_t NUM_RIGHT_SHIFTED_BY_K = 1;

        CommitmentKey commitment_key(16384);

        std::vector<NativeFr> u_challenge;
        u_challenge.reserve(CONST_PROOF_SIZE_LOG_N);
        for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
            u_challenge.emplace_back(NativeFr::random_element(&shplemini_engine));
        };

        // Truncate to real size to create mock claims.
        std::vector<NativeFr> truncated_u_challenge(u_challenge.begin(),
                                                    u_challenge.begin() + static_cast<diff_t>(log_circuit_size));
        // Construct mock multivariate polynomial opening claims
        MockClaimGen mock_claims(
            N, NUM_POLYS, NUM_SHIFTED, NUM_RIGHT_SHIFTED_BY_K, truncated_u_challenge, commitment_key);

        // Initialize an empty NativeTranscript
        auto prover_transcript = NativeTranscript::prover_init_empty();
        auto prover_opening_claims =
            ShpleminiProver::prove(N, mock_claims.polynomial_batcher, u_challenge, commitment_key, prover_transcript);
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
        auto stdlib_unshifted_commitments =
            commitments_to_witnesses(mock_claims.claim_batcher.get_unshifted().commitments);
        auto stdlib_to_be_shifted_commitments =
            commitments_to_witnesses(mock_claims.claim_batcher.get_shifted().commitments);
        auto stdlib_to_be_right_shifted_commitments =
            commitments_to_witnesses(mock_claims.claim_batcher.get_right_shifted_by_k().commitments);
        auto stdlib_unshifted_evaluations = elements_to_witness(mock_claims.claim_batcher.get_unshifted().evaluations);
        auto stdlib_shifted_evaluations = elements_to_witness(mock_claims.claim_batcher.get_shifted().evaluations);
        auto stdlib_right_shifted_evaluations =
            elements_to_witness(mock_claims.claim_batcher.get_right_shifted_by_k().evaluations);

        std::vector<Fr> u_challenge_in_circuit;
        u_challenge_in_circuit.reserve(CONST_PROOF_SIZE_LOG_N);

        for (auto u : u_challenge) {
            u_challenge_in_circuit.emplace_back(Fr::from_witness(&builder, u));
        }

        ClaimBatcher claim_batcher{
            .unshifted = ClaimBatch{ RefVector(stdlib_unshifted_commitments), RefVector(stdlib_unshifted_evaluations) },
            .shifted = ClaimBatch{ RefVector(stdlib_to_be_shifted_commitments), RefVector(stdlib_shifted_evaluations) },
            .right_shifted_by_k = ClaimBatch{ RefVector(stdlib_to_be_right_shifted_commitments),
                                              RefVector(stdlib_right_shifted_evaluations) },
            .k_shift_magnitude = MockClaimGen::k_magnitude
        };

        const auto opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                  claim_batcher,
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
