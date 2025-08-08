#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
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
    using StdlibProof = bb::stdlib::Proof<Builder>;

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
        StdlibProof stdlib_proof(builder, prover_transcript->export_proof());
        auto stdlib_verifier_transcript = std::make_shared<Transcript>();
        stdlib_verifier_transcript->load_proof(stdlib_proof);
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

        VerifierCommitmentKey<NativeCurve> vk;
        EXPECT_EQ(vk.pairing_check(pairing_points[0].get_value(), pairing_points[1].get_value()), true);

        // Return finalised number of gates;
        return builder.num_gates;
    };

    size_t num_gates_6 = run_shplemini(6);
    size_t num_gates_13 = run_shplemini(13);
    EXPECT_EQ(num_gates_6, num_gates_13);
}

TEST(ShpleminiRecursionTest, GoblinProveAndVerifyShortScalars)
{
    // Define some useful type aliases
    using Builder = MegaCircuitBuilder;
    using Curve = typename stdlib::bn254<Builder>;
    using NativeCurve = typename Curve::NativeCurve;
    using Commitment = typename Curve::AffineElement;
    using NativeCurve = typename Curve::NativeCurve;
    using NativePCS = KZG<NativeCurve>;
    using CommitmentKey = typename NativePCS::CK;
    using ShpleminiProver = ShpleminiProver_<NativeCurve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using NativeFr = typename Curve::NativeCurve::ScalarField;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    // using PolynomialBatcher = ShpleminiProver::PolynomialBatcher;
    using MockClaimGen = MockClaimGenerator<NativeCurve>;
    using StdlibProof = bb::stdlib::Proof<Builder>;

    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto run_shplemini = [](size_t log_circuit_size) {
        using diff_t = std::vector<NativeFr>::difference_type;

        size_t N = 1 << log_circuit_size;
        const auto padding_indicator_array =
            stdlib::compute_padding_indicator_array<Curve, CONST_PROOF_SIZE_LOG_N>(log_circuit_size);
        constexpr size_t NUM_POLYS = 3000;
        constexpr size_t NUM_SHIFTED = 300;
        constexpr size_t NUM_RIGHT_SHIFTED_BY_K = 0;

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

        std::array<std::string, NUM_POLYS - 1> unshifted_batching_challenge_labels;
        std::array<std::string, NUM_SHIFTED> shifted_batching_challenge_labels;

        // --------------- New short scalar batching logic
        size_t idx = 0;
        for (auto& challenge_label : unshifted_batching_challenge_labels) {
            challenge_label = "rho_" + std::to_string(idx++);
        }
        for (auto& challenge_label : shifted_batching_challenge_labels) {
            challenge_label = "rho_" + std::to_string(idx++);
        }
        std::array<NativeFr, NUM_POLYS - 1> unshifted_batching_challenges =
            prover_transcript->template get_challenges<NativeFr>(unshifted_batching_challenge_labels);

        std::array<NativeFr, NUM_SHIFTED> shifted_batching_challenges =
            prover_transcript->template get_challenges<NativeFr>(shifted_batching_challenge_labels);

        // squash unshifted polys and their evals
        Polynomial<NativeFr> squashed_unshifted(N);
        squashed_unshifted += mock_claims.polynomial_batcher.unshifted[0];
        for (size_t idx = 0; idx < NUM_POLYS - 1; idx++) {
            auto poly = mock_claims.polynomial_batcher.unshifted[idx + 1];
            squashed_unshifted.add_scaled(poly, unshifted_batching_challenges[idx]);
        }

        Polynomial<NativeFr> squashed_shifted(Polynomial<NativeFr>::shiftable(N));
        idx = 0;
        for (auto& poly : mock_claims.polynomial_batcher.to_be_shifted_by_one) {
            squashed_shifted.add_scaled(poly, shifted_batching_challenges[idx++]);
        }

        mock_claims.polynomial_batcher.unshifted = RefVector{ squashed_unshifted };
        mock_claims.polynomial_batcher.to_be_shifted_by_one = RefVector{ squashed_shifted };

        // -------------- Run ShpleminiProver as before
        auto prover_opening_claims =
            ShpleminiProver::prove(N, mock_claims.polynomial_batcher, u_challenge, commitment_key, prover_transcript);
        KZG<NativeCurve>::compute_opening_proof(commitment_key, prover_opening_claims, prover_transcript);
        Builder builder;
        StdlibProof stdlib_proof(builder, prover_transcript->export_proof());
        auto stdlib_verifier_transcript = std::make_shared<Transcript>();
        stdlib_verifier_transcript->load_proof(stdlib_proof);
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

        auto stdlib_unshifted_evaluations = elements_to_witness(mock_claims.claim_batcher.get_unshifted().evaluations);
        auto stdlib_shifted_evaluations = elements_to_witness(mock_claims.claim_batcher.get_shifted().evaluations);

        std::vector<Fr> u_challenge_in_circuit;
        u_challenge_in_circuit.reserve(CONST_PROOF_SIZE_LOG_N);

        for (auto u : u_challenge) {
            u_challenge_in_circuit.emplace_back(Fr::from_witness(&builder, u));
        }

        ClaimBatcher claim_batcher{
            .unshifted = ClaimBatch{ RefVector(stdlib_unshifted_commitments), RefVector(stdlib_unshifted_evaluations) },
            .shifted = ClaimBatch{ RefVector(stdlib_to_be_shifted_commitments), RefVector(stdlib_shifted_evaluations) }
        };

        // ------------------ Model Verifier short scalar logic -------------------

        std::array<Fr, NUM_POLYS - 1> verifier_unshifted_batching_challenges =
            stdlib_verifier_transcript->template get_challenges<Fr>(unshifted_batching_challenge_labels);

        std::vector<Fr> unshifted_batching_challenges_padded(NUM_POLYS);
        unshifted_batching_challenges_padded[0] = 1;

        // UGGH
        std::copy(verifier_unshifted_batching_challenges.begin(),
                  verifier_unshifted_batching_challenges.end(),
                  unshifted_batching_challenges_padded.begin() + 1);

        std::array<Fr, NUM_SHIFTED> verifier_shifted_batching_challenges =
            stdlib_verifier_transcript->template get_challenges<Fr>(shifted_batching_challenge_labels);
        std::vector<Fr> shifted_batching_challenges_v(NUM_SHIFTED);
        std::copy(verifier_shifted_batching_challenges.begin(),
                  verifier_shifted_batching_challenges.end(),
                  shifted_batching_challenges_v.begin());

        // squash unshifted poly commitments and their evals
        Commitment squashed_unshifted_comm =
            Commitment::batch_mul(claim_batcher.get_unshifted().commitments, unshifted_batching_challenges_padded);
        Fr squashed_unshifted_eval = std::inner_product(unshifted_batching_challenges_padded.begin(),
                                                        unshifted_batching_challenges_padded.end(),
                                                        claim_batcher.get_unshifted().evaluations.begin(),
                                                        Fr(0));

        // squash shifted poly commitments and their evals
        Commitment squashed_shifted_comm =
            Commitment::batch_mul(claim_batcher.get_shifted().commitments, shifted_batching_challenges_v);

        Fr squashed_shifted_eval = std::inner_product(verifier_shifted_batching_challenges.begin(),
                                                      verifier_shifted_batching_challenges.end(),
                                                      claim_batcher.get_shifted().evaluations.begin(),
                                                      Fr(0));

        ClaimBatcher squashed_claim_batcher{
            .unshifted = ClaimBatch{ RefVector(squashed_unshifted_comm), RefVector(squashed_unshifted_eval) },
            .shifted = ClaimBatch(RefVector(squashed_shifted_comm), RefVector(squashed_shifted_eval))
        };

        const auto opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                  squashed_claim_batcher,
                                                                                  u_challenge_in_circuit,
                                                                                  Commitment::one(&builder),
                                                                                  stdlib_verifier_transcript);
        auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(opening_claim, stdlib_verifier_transcript);
        EXPECT_TRUE(CircuitChecker::check(builder));

        VerifierCommitmentKey<NativeCurve> vk;
        EXPECT_EQ(vk.pairing_check(pairing_points[0].get_value(), pairing_points[1].get_value()), true);

        info("NUM GATES ", builder.num_gates);

        info("ECCVM NUM msm rows ", builder.op_queue->get_num_msm_rows());
        info("ECCVM num rows ", builder.op_queue->get_num_rows());

        // Return finalised number of gates;
        return builder.num_gates;
    };

    [[maybe_unused]] size_t num_gates_13 = run_shplemini(10);
}

TEST(ShpleminiRecursionTest, GoblinProveAndVerifyFullScalars)
{
    // Define some useful type aliases
    using Builder = MegaCircuitBuilder;
    using Curve = typename stdlib::bn254<Builder>;
    using NativeCurve = typename Curve::NativeCurve;
    using Commitment = typename Curve::AffineElement;
    using NativeCurve = typename Curve::NativeCurve;
    using NativePCS = KZG<NativeCurve>;
    using CommitmentKey = typename NativePCS::CK;
    using ShpleminiProver = ShpleminiProver_<NativeCurve>;
    using ShpleminiVerifier = ShpleminiVerifier_<Curve>;
    using Fr = typename Curve::ScalarField;
    using NativeFr = typename Curve::NativeCurve::ScalarField;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    // using PolynomialBatcher = ShpleminiProver::PolynomialBatcher;
    using MockClaimGen = MockClaimGenerator<NativeCurve>;
    using StdlibProof = bb::stdlib::Proof<Builder>;
    using ECCVMBuilder = ECCVMFlavor::CircuitBuilder;

    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto run_shplemini = [](size_t log_circuit_size) {
        using diff_t = std::vector<NativeFr>::difference_type;

        size_t N = 1 << log_circuit_size;
        const auto padding_indicator_array =
            stdlib::compute_padding_indicator_array<Curve, CONST_PROOF_SIZE_LOG_N>(log_circuit_size);
        constexpr size_t NUM_POLYS = 3000;
        constexpr size_t NUM_SHIFTED = 300;
        constexpr size_t NUM_RIGHT_SHIFTED_BY_K = 0;

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

        std::array<std::string, NUM_POLYS - 1> unshifted_batching_challenge_labels;
        std::array<std::string, NUM_SHIFTED> shifted_batching_challenge_labels;

        // -------------- Run ShpleminiProver as before
        auto prover_opening_claims =
            ShpleminiProver::prove(N, mock_claims.polynomial_batcher, u_challenge, commitment_key, prover_transcript);
        KZG<NativeCurve>::compute_opening_proof(commitment_key, prover_opening_claims, prover_transcript);
        Builder builder;
        StdlibProof stdlib_proof(builder, prover_transcript->export_proof());
        auto stdlib_verifier_transcript = std::make_shared<Transcript>();
        stdlib_verifier_transcript->load_proof(stdlib_proof);
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

        auto stdlib_unshifted_evaluations = elements_to_witness(mock_claims.claim_batcher.get_unshifted().evaluations);
        auto stdlib_shifted_evaluations = elements_to_witness(mock_claims.claim_batcher.get_shifted().evaluations);

        std::vector<Fr> u_challenge_in_circuit;
        u_challenge_in_circuit.reserve(CONST_PROOF_SIZE_LOG_N);

        for (auto u : u_challenge) {
            u_challenge_in_circuit.emplace_back(Fr::from_witness(&builder, u));
        }

        ClaimBatcher claim_batcher{
            .unshifted = ClaimBatch{ RefVector(stdlib_unshifted_commitments), RefVector(stdlib_unshifted_evaluations) },
            .shifted = ClaimBatch{ RefVector(stdlib_to_be_shifted_commitments), RefVector(stdlib_shifted_evaluations) }
        };

        const auto opening_claim = ShpleminiVerifier::compute_batch_opening_claim(padding_indicator_array,
                                                                                  claim_batcher,
                                                                                  u_challenge_in_circuit,
                                                                                  Commitment::one(&builder),
                                                                                  stdlib_verifier_transcript);
        auto pairing_points = KZG<Curve>::reduce_verify_batch_opening_claim(opening_claim, stdlib_verifier_transcript);
        EXPECT_TRUE(CircuitChecker::check(builder));

        VerifierCommitmentKey<NativeCurve> vk;
        EXPECT_EQ(vk.pairing_check(pairing_points[0].get_value(), pairing_points[1].get_value()), true);

        info("NUM GATES ", builder.num_gates);

        info("ECCVM NUM msm rows ", builder.op_queue->get_num_msm_rows());
        info("ECCVM num rows ", builder.op_queue->get_num_rows());

        [[maybe_unused]] ECCVMBuilder eccvm_prover(builder.op_queue);

        // Return finalised number of gates;
        return builder.num_gates;
    };

    [[maybe_unused]] size_t num_gates_13 = run_shplemini(10);
}
