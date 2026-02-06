#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/multi_mega_prover.hpp"
#include "barretenberg/ultra_honk/multi_mega_verifier.hpp"

using namespace bb;

class MultiMegaHonkTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Flavor = MultiMegaFlavor;
    using Builder = Flavor::CircuitBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Commitment = typename Flavor::Commitment;
    using Prover = MultiMegaProver;
    using Verifier = MultiMegaVerifier;
    using Proof = typename Flavor::Transcript::Proof;
    using VerificationKey = typename Flavor::VerificationKey;
    using ProverInstance = ProverInstance_<Flavor>;

    /**
     * @brief Construct a manifest for a MultiMega Honk proof
     *
     * @details This is where we define the "Manifest" for a MultiMega Honk proof. The tests in this suite are
     * intended to warn the developer if the Prover/Verifier has deviated from this manifest, however, the
     * Transcript class is not otherwise constrained to follow the manifest.
     *
     * @note Entries in the manifest consist of a name string and a size (bytes), NOT actual data.
     *
     * @return TranscriptManifest
     */
    static TranscriptManifest construct_multi_mega_honk_manifest()
    {
        TranscriptManifest manifest_expected;

        const size_t virtual_log_n = Flavor::VIRTUAL_LOG_N;
        const size_t pcs_log_n = virtual_log_n + Flavor::INTERLEAVING_LOG_K;

        size_t NUM_PUBLIC_INPUTS =
            stdlib::recursion::honk::DefaultIO<typename Flavor::CircuitBuilder>::PUBLIC_INPUTS_SIZE;
        size_t MAX_PARTIAL_RELATION_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;

        size_t frs_per_Fr = FrCodec::calc_num_fields<FF>();
        size_t frs_per_G = FrCodec::calc_num_fields<Commitment>();
        size_t frs_per_uni = MAX_PARTIAL_RELATION_LENGTH * frs_per_Fr;
        size_t frs_per_evals = (Flavor::NUM_ALL_ENTITIES)*frs_per_Fr;

        size_t round = 0;
        // Preamble
        manifest_expected.add_entry(round, "vk_hash", frs_per_Fr);
        manifest_expected.add_entry(round, "public_input_0", frs_per_Fr);
        for (size_t i = 0; i < NUM_PUBLIC_INPUTS; i++) {
            manifest_expected.add_entry(round, "public_input_" + std::to_string(1 + i), frs_per_Fr);
        }
        // Round 1: 5 interleaved witness commitments (before eta)
        manifest_expected.add_entry(round, "INTERLEAVED_WIRES", frs_per_G);
        manifest_expected.add_entry(round, "INTERLEAVED_ECC_OP_WIRES", frs_per_G);
        manifest_expected.add_entry(round, "INTERLEAVED_DATABUS_1", frs_per_G);
        manifest_expected.add_entry(round, "INTERLEAVED_DATABUS_2", frs_per_G);
        manifest_expected.add_entry(round, "INTERLEAVED_DATABUS_3", frs_per_G);
        manifest_expected.add_challenge(round, "eta");

        // Round 2: 2 interleaved witness commitments (after eta)
        round++;
        manifest_expected.add_entry(round, "INTERLEAVED_W_4", frs_per_G);
        manifest_expected.add_entry(round, "INTERLEAVED_LOOKUP", frs_per_G);
        manifest_expected.add_challenge(round, std::array{ "beta", "gamma" });

        // Round 3: 1 interleaved inverses commitment + z_perm
        round++;
        manifest_expected.add_entry(round, "INTERLEAVED_INVERSES", frs_per_G);
        manifest_expected.add_entry(round, "INTERLEAVED_Z_PERM", frs_per_G);
        manifest_expected.add_challenge(round, "alpha");
        manifest_expected.add_challenge(round, "Sumcheck:gate_challenge");

        // Sumcheck rounds
        round++;
        for (size_t i = 0; i < virtual_log_n; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Sumcheck:univariate_" + idx, frs_per_uni);
            std::string label = "Sumcheck:u_" + idx;
            manifest_expected.add_challenge(round, label);
            round++;
        }

        // Sumcheck evaluations + interleaving challenges + batching challenges
        manifest_expected.add_entry(round, "Sumcheck:evaluations", frs_per_evals);
        manifest_expected.add_challenge(round, "Shplemini:interleaving_challenge_0");
        manifest_expected.add_challenge(round, "Shplemini:interleaving_challenge_1");
        manifest_expected.add_challenge(round, "batching_rho"); // Batching challenge for interleaved polys
        manifest_expected.add_challenge(round, "rho");          // Gemini's internal rho challenge

        // Gemini fold commitments (pcs_log_n - 1 folds)
        round++;
        for (size_t i = 1; i < pcs_log_n; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Gemini:FOLD_" + idx, frs_per_G);
        }
        manifest_expected.add_challenge(round, "Gemini:r");

        // Gemini fold evaluations (pcs_log_n evals)
        round++;
        for (size_t i = 1; i <= pcs_log_n; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Gemini:a_" + idx, frs_per_Fr);
        }
        manifest_expected.add_challenge(round, "Shplonk:nu");

        // Shplonk
        round++;
        manifest_expected.add_entry(round, "Shplonk:Q", frs_per_G);
        manifest_expected.add_challenge(round, "Shplonk:z");

        // KZG
        round++;
        manifest_expected.add_entry(round, "KZG:W", frs_per_G);
        manifest_expected.add_challenge(round, "KZG:masking_challenge");

        return manifest_expected;
    }

    void generate_test_circuit(auto& builder)
    {
        // Add some ecc op gates
        for (size_t i = 0; i < 3; ++i) {
            auto point = Flavor::Curve::AffineElement::one() * FF::random_element();
            auto scalar = FF::random_element();
            builder.queue_ecc_mul_accum(point, scalar);
        }
        builder.queue_ecc_eq();

        // Add one conventional gate that utilizes public inputs
        FF a = FF::random_element();
        FF b = FF::random_element();
        FF c = FF::random_element();
        FF d = a + b + c;
        uint32_t a_idx = builder.add_public_variable(a);
        uint32_t b_idx = builder.add_variable(b);
        uint32_t c_idx = builder.add_variable(c);
        uint32_t d_idx = builder.add_variable(d);

        builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, FF(1), FF(1), FF(1), FF(-1), FF(0) });
        stdlib::recursion::honk::DefaultIO<typename Flavor::CircuitBuilder>::add_default(builder);
    }
};

/**
 * @brief Ensure consistency between the manifest hard coded in this testing suite and the one generated by the
 * MultiMega prover over the course of proof construction.
 */
TEST_F(MultiMegaHonkTests, ProverManifestConsistency)
{
    Builder builder;
    generate_test_circuit(builder);

    // Automatically generate a transcript manifest by constructing a proof
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    Prover prover(prover_instance, verification_key);
    prover.transcript->enable_manifest();
    auto proof = prover.construct_proof();

    // Check that the prover generated manifest agrees with the manifest hard coded in this suite
    auto manifest_expected = construct_multi_mega_honk_manifest();
    auto prover_manifest = prover.transcript->get_manifest();
    // Note: a manifest can be printed using manifest.print()
    ASSERT_GT(manifest_expected.size(), 0);
    for (size_t round = 0; round < manifest_expected.size(); ++round) {
        if (prover_manifest[round] != manifest_expected[round]) {
            info("Prover manifest discrepency in round ", round);
            info("Prover manifest:");
            prover_manifest[round].print();
            info("Expected manifest:");
            manifest_expected[round].print();
            FAIL();
        }
    }
}

/**
 * @brief Ensure consistency between the manifest generated by the MultiMega prover over the course of proof
 * construction and the one generated by the verifier over the course of proof verification.
 */
TEST_F(MultiMegaHonkTests, VerifierManifestConsistency)
{
    Builder builder;
    generate_test_circuit(builder);

    // Automatically generate a transcript manifest in the prover by constructing a proof
    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
    Prover prover(prover_instance, verification_key);
    prover.transcript->enable_manifest();
    auto proof = prover.construct_proof();

    // Automatically generate a transcript manifest in the verifier by verifying a proof
    auto verifier_transcript = std::make_shared<typename Flavor::Transcript>();
    verifier_transcript->enable_manifest();
    Verifier verifier(vk_and_hash, verifier_transcript);
    [[maybe_unused]] auto verifier_output = verifier.verify_proof(proof);

    // Check consistency between the manifests generated by the prover and verifier
    auto prover_manifest = prover.transcript->get_manifest();
    auto verifier_manifest = verifier.get_transcript()->get_manifest();

    // Note: a manifest can be printed using manifest.print()
    ASSERT_GT(prover_manifest.size(), 0);
    for (size_t round = 0; round < prover_manifest.size(); ++round) {
        if (prover_manifest[round] != verifier_manifest[round]) {
            info("Prover/Verifier manifest discrepency in round ", round);
            info("Prover manifest:");
            prover_manifest[round].print();
            info("Verifier manifest:");
            verifier_manifest[round].print();
            FAIL();
        }
    }
}

/**
 * @brief Full prove-and-verify test for MultiMega Honk.
 */
TEST_F(MultiMegaHonkTests, FullProveAndVerify)
{
    Builder builder;
    generate_test_circuit(builder);

    auto prover_instance = std::make_shared<ProverInstance>(builder);
    auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<typename Flavor::VKAndHash>(verification_key);
    Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    Verifier verifier(vk_and_hash);
    auto verifier_output = verifier.verify_proof(proof);
    EXPECT_TRUE(verifier_output.result) << "MultiMega proof verification failed";
}

/**
 * @brief Test that interleaved polynomial evaluation via evaluate_mle matches Lagrange-basis reconstruction,
 *        and that commit_interleaved matches commit on the materialized interleaved polynomial.
 *
 * @details For an interleaved polynomial F(X) = f₀(X⁴) + X·f₁(X⁴) + X²·f₂(X⁴) + X³·f₃(X⁴),
 *          the MLE evaluation at (u₀, u₁, u₂, ...) satisfies:
 *            F(u₀, u₁, u₂, ...) = Σⱼ fⱼ(u₂, ...) · Lⱼ(u₀, u₁)
 *          where Lⱼ is the Lagrange basis for the first 2 variables.
 */
TEST_F(MultiMegaHonkTests, InterleavedEvalAndCommitmentRecovery)
{
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE; // 4
    constexpr size_t LOG_K = Flavor::INTERLEAVING_LOG_K;           // 2

    // Use a small polynomial size for the test
    constexpr size_t CHUNK_LOG_N = 4;
    constexpr size_t CHUNK_SIZE = 1 << CHUNK_LOG_N;              // 16
    constexpr size_t INTERLEAVED_SIZE = CHUNK_SIZE * BATCH_SIZE; // 64
    constexpr size_t INTERLEAVED_LOG_N = CHUNK_LOG_N + LOG_K;    // 6

    // Create a commitment key large enough for the interleaved polynomial
    auto ck = CommitmentKey<Curve>(INTERLEAVED_SIZE);

    // --- Test 1: Full batch (4 polynomials) ---
    {
        // Create 4 random chunk polynomials
        std::array<Polynomial<FF>, BATCH_SIZE> chunks;
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            chunks[j] = Polynomial<FF>(CHUNK_SIZE);
            for (size_t i = 0; i < CHUNK_SIZE; ++i) {
                chunks[j].at(i) = FF::random_element();
            }
        }

        // Materialize the interleaved polynomial: F[4i+j] = chunks[j][i]
        Polynomial<FF> interleaved(INTERLEAVED_SIZE);
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            for (size_t j = 0; j < BATCH_SIZE; ++j) {
                interleaved.at(BATCH_SIZE * i + j) = chunks[j][i];
            }
        }

        // Generate random challenge point: (u₀, u₁, u₂, ..., u_{INTERLEAVED_LOG_N-1})
        std::vector<FF> full_challenge(INTERLEAVED_LOG_N);
        for (auto& u : full_challenge) {
            u = FF::random_element();
        }

        // Ground truth: evaluate_mle on the materialized interleaved polynomial
        FF eval_ground_truth = interleaved.evaluate_mle(full_challenge);

        // Lagrange-basis reconstruction: Σⱼ fⱼ(u₂,...) · Lⱼ(u₀, u₁)
        FF u0 = full_challenge[0];
        FF u1 = full_challenge[1];
        std::span<const FF> inner_challenge(full_challenge.data() + LOG_K, CHUNK_LOG_N);

        auto lagrange = MultiMegaVerifier::compute_lagrange_basis(u0, u1);

        FF eval_reconstructed = FF::zero();
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            FF chunk_eval = chunks[j].evaluate_mle(inner_challenge);
            eval_reconstructed += chunk_eval * lagrange[j];
        }

        EXPECT_EQ(eval_ground_truth, eval_reconstructed)
            << "Interleaved MLE evaluation does not match Lagrange reconstruction (full batch)";

        // Commitment test: commit_interleaved vs commit on materialized polynomial
        std::vector<PolynomialSpan<const FF>> chunk_spans;
        chunk_spans.reserve(BATCH_SIZE);
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            chunk_spans.emplace_back(PolynomialSpan<const FF>(chunks[j]));
        }

        Commitment commit_interleaved = ck.commit_interleaved<BATCH_SIZE>(chunk_spans);
        Commitment commit_materialized = ck.commit(interleaved);

        EXPECT_EQ(commit_interleaved, commit_materialized)
            << "commit_interleaved does not match commit on materialized polynomial (full batch)";
    }

    // --- Test 2: Partial batch (e.g. [f₀, ZERO, ZERO, ZERO]) ---
    {
        // Create 1 non-zero chunk polynomial, rest are zero
        Polynomial<FF> chunk0(CHUNK_SIZE);
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            chunk0.at(i) = FF::random_element();
        }

        // Materialize: only slot 0 is non-zero
        Polynomial<FF> interleaved(INTERLEAVED_SIZE);
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            interleaved.at(BATCH_SIZE * i) = chunk0[i];
        }

        std::vector<FF> full_challenge(INTERLEAVED_LOG_N);
        for (auto& u : full_challenge) {
            u = FF::random_element();
        }

        FF eval_ground_truth = interleaved.evaluate_mle(full_challenge);

        FF u0 = full_challenge[0];
        FF u1 = full_challenge[1];
        std::span<const FF> inner_challenge(full_challenge.data() + LOG_K, CHUNK_LOG_N);

        auto lagrange = MultiMegaVerifier::compute_lagrange_basis(u0, u1);
        FF chunk_eval = chunk0.evaluate_mle(inner_challenge);
        FF eval_reconstructed = chunk_eval * lagrange[0]; // only L₀ contributes

        EXPECT_EQ(eval_ground_truth, eval_reconstructed)
            << "Interleaved MLE evaluation does not match Lagrange reconstruction (partial batch)";
    }

    // --- Test 3: Shifted evaluation ---
    {
        // Create a shiftable chunk polynomial (first coefficient is zero)
        Polynomial<FF> chunk0 = Polynomial<FF>::shiftable(CHUNK_SIZE);
        for (size_t i = 1; i < CHUNK_SIZE; ++i) {
            chunk0.at(i) = FF::random_element();
        }

        // Materialize the interleaved polynomial: F[4i] = chunk0[i], rest zero
        // For shift-by-4: the first BATCH_SIZE coefficients must be zero
        Polynomial<FF> interleaved(INTERLEAVED_SIZE);
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            interleaved.at(BATCH_SIZE * i) = chunk0.get(i);
        }

        std::vector<FF> full_challenge(INTERLEAVED_LOG_N);
        for (auto& u : full_challenge) {
            u = FF::random_element();
        }

        // Ground truth: evaluate_mle on the interleaved polynomial with shift=true
        // Note: shift=true in evaluate_mle shifts by 1. For interleaved shift-by-4,
        // we construct the shifted polynomial manually: F_shifted[i] = F[i + BATCH_SIZE]
        Polynomial<FF> interleaved_shifted(INTERLEAVED_SIZE);
        for (size_t i = 0; i + BATCH_SIZE < INTERLEAVED_SIZE; ++i) {
            interleaved_shifted.at(i) = interleaved.get(i + BATCH_SIZE);
        }
        FF eval_shifted_ground_truth = interleaved_shifted.evaluate_mle(full_challenge);

        // Lagrange reconstruction with shifted chunk evals
        FF u0 = full_challenge[0];
        FF u1 = full_challenge[1];
        std::span<const FF> inner_challenge(full_challenge.data() + LOG_K, CHUNK_LOG_N);

        auto lagrange = MultiMegaVerifier::compute_lagrange_basis(u0, u1);
        // For shift-by-4 on interleaved, chunk0 is shifted by 1 in its own domain
        FF chunk_eval_shifted = chunk0.evaluate_mle(inner_challenge, /*shift=*/true);
        FF eval_shifted_reconstructed = chunk_eval_shifted * lagrange[0];

        EXPECT_EQ(eval_shifted_ground_truth, eval_shifted_reconstructed)
            << "Shifted interleaved MLE evaluation does not match Lagrange reconstruction";
    }

    // --- Test 4: Batched evaluation with rho powers (mimics prover/verifier batching) ---
    {
        constexpr size_t NUM_GROUPS = 3;
        FF rho = FF::random_element();

        // Create 3 interleaved groups, each with 4 chunks
        std::array<std::array<Polynomial<FF>, BATCH_SIZE>, NUM_GROUPS> groups;
        for (size_t g = 0; g < NUM_GROUPS; ++g) {
            for (size_t j = 0; j < BATCH_SIZE; ++j) {
                groups[g][j] = Polynomial<FF>(CHUNK_SIZE);
                for (size_t i = 0; i < CHUNK_SIZE; ++i) {
                    groups[g][j].at(i) = FF::random_element();
                }
            }
        }

        // Prover-side: batch chunks by position, then interleave
        // G_j = Σ_g rho^g · group[g][j]
        std::array<Polynomial<FF>, BATCH_SIZE> batched_chunks;
        for (size_t j = 0; j < BATCH_SIZE; ++j) {
            batched_chunks[j] = Polynomial<FF>(CHUNK_SIZE);
            FF rho_pow = FF::one();
            for (size_t g = 0; g < NUM_GROUPS; ++g) {
                batched_chunks[j].add_scaled(PolynomialSpan<const FF>(groups[g][j]), rho_pow);
                rho_pow *= rho;
            }
        }

        // Materialize the batched interleaved polynomial
        Polynomial<FF> batched_interleaved(INTERLEAVED_SIZE);
        for (size_t i = 0; i < CHUNK_SIZE; ++i) {
            for (size_t j = 0; j < BATCH_SIZE; ++j) {
                batched_interleaved.at(BATCH_SIZE * i + j) = batched_chunks[j][i];
            }
        }

        std::vector<FF> full_challenge(INTERLEAVED_LOG_N);
        for (auto& u : full_challenge) {
            u = FF::random_element();
        }

        // Ground truth from materialized batched interleaved polynomial
        FF eval_batched_ground_truth = batched_interleaved.evaluate_mle(full_challenge);

        // Verifier-side: compute individual interleaved evals via Lagrange, then batch with rho
        FF u0 = full_challenge[0];
        FF u1 = full_challenge[1];
        std::span<const FF> inner_challenge(full_challenge.data() + LOG_K, CHUNK_LOG_N);
        auto lagrange = MultiMegaVerifier::compute_lagrange_basis(u0, u1);

        FF eval_batched_reconstructed = FF::zero();
        FF rho_pow = FF::one();
        for (size_t g = 0; g < NUM_GROUPS; ++g) {
            // Compute the interleaved eval for this group: Σ_j chunk[g][j].eval(inner) * L_j
            FF group_eval = FF::zero();
            for (size_t j = 0; j < BATCH_SIZE; ++j) {
                FF chunk_eval = groups[g][j].evaluate_mle(inner_challenge);
                group_eval += chunk_eval * lagrange[j];
            }
            eval_batched_reconstructed += group_eval * rho_pow;
            rho_pow *= rho;
        }

        EXPECT_EQ(eval_batched_ground_truth, eval_batched_reconstructed)
            << "Batched interleaved eval does not match verifier Lagrange reconstruction with rho";
    }
}
