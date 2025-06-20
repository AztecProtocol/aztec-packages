#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <gtest/gtest.h>

using namespace bb;

class ECCVMTranscriptTests : public ::testing::Test {
  public:
    void SetUp() override { srs::init_file_crs_factory(srs::bb_crs_path()); };
    using FF = grumpkin::fr;
    using Flavor = ECCVMFlavor;
    using Transcript = Flavor::Transcript;

    /**
     * @brief Construct a manifest for a ECCVM Honk proof
     *
     * @details This is where we define the "Manifest" for a ECCVM Honk proof. The tests in this suite are
     * intented to warn the developer if the Prover/Verifier has deviated from this manifest, however, the
     * Transcript class is not otherwise contrained to follow the manifest.
     *
     * @note Entries in the manifest consist of a name string and a size (bytes), NOT actual data.
     *
     * @return TranscriptManifest
     */
    TranscriptManifest construct_eccvm_honk_manifest()
    {
        TranscriptManifest manifest_expected;
        // Size of types is number of bb::frs needed to represent the type
        size_t frs_per_Fr = bb::field_conversion::calc_num_bn254_frs<FF>();
        size_t frs_per_G = bb::field_conversion::calc_num_bn254_frs<typename Flavor::Commitment>();
        size_t frs_per_evals = (Flavor::NUM_ALL_ENTITIES)*frs_per_Fr;

        size_t round = 0;
        manifest_expected.add_entry(round, "TRANSCRIPT_ADD", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_EQ", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_TRANSITION", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_PX", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_PY", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_Z1", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_Z2", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_Z1ZERO", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_Z2ZERO", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_OP", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_X", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_Y", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_POINT_TRANSITION", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_S1LO", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_S2HI", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_S2LO", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_S3HI", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_S3LO", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_S4HI", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_S4LO", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_SKEW", frs_per_G);
        manifest_expected.add_entry(round, "MSM_SIZE_OF_MSM", frs_per_G);
        manifest_expected.add_entry(round, "MSM_ADD2", frs_per_G);
        manifest_expected.add_entry(round, "MSM_ADD3", frs_per_G);
        manifest_expected.add_entry(round, "MSM_ADD4", frs_per_G);
        manifest_expected.add_entry(round, "MSM_X1", frs_per_G);
        manifest_expected.add_entry(round, "MSM_Y1", frs_per_G);
        manifest_expected.add_entry(round, "MSM_X2", frs_per_G);
        manifest_expected.add_entry(round, "MSM_Y2", frs_per_G);
        manifest_expected.add_entry(round, "MSM_X3", frs_per_G);
        manifest_expected.add_entry(round, "MSM_Y3", frs_per_G);
        manifest_expected.add_entry(round, "MSM_X4", frs_per_G);
        manifest_expected.add_entry(round, "MSM_Y4", frs_per_G);
        manifest_expected.add_entry(round, "MSM_COLLISION_X1", frs_per_G);
        manifest_expected.add_entry(round, "MSM_COLLISION_X2", frs_per_G);
        manifest_expected.add_entry(round, "MSM_COLLISION_X3", frs_per_G);
        manifest_expected.add_entry(round, "MSM_COLLISION_X4", frs_per_G);
        manifest_expected.add_entry(round, "MSM_LAMBDA1", frs_per_G);
        manifest_expected.add_entry(round, "MSM_LAMBDA2", frs_per_G);
        manifest_expected.add_entry(round, "MSM_LAMBDA3", frs_per_G);
        manifest_expected.add_entry(round, "MSM_LAMBDA4", frs_per_G);
        manifest_expected.add_entry(round, "MSM_SLICE1", frs_per_G);
        manifest_expected.add_entry(round, "MSM_SLICE2", frs_per_G);
        manifest_expected.add_entry(round, "MSM_SLICE3", frs_per_G);
        manifest_expected.add_entry(round, "MSM_SLICE4", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_RESET_ACCUMULATOR", frs_per_G);
        manifest_expected.add_entry(round, "LOOKUP_READ_COUNTS_0", frs_per_G);
        manifest_expected.add_entry(round, "LOOKUP_READ_COUNTS_1", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_BASE_INFINITY", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_BASE_X_INVERSE", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_BASE_Y_INVERSE", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_ADD_X_EQUAL", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_ADD_Y_EQUAL", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_ADD_LAMBDA", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_INTERMEDIATE_X", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_INTERMEDIATE_Y", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_INFINITY", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_X_INVERSE", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_COUNT_ZERO_AT_TRANSITION", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_COUNT_AT_TRANSITION_INVERSE", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MUL", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_MSM_COUNT", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_SCALAR_SUM", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_S1HI", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_DX", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_DY", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_TX", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_TY", frs_per_G);
        manifest_expected.add_entry(round, "MSM_TRANSITION", frs_per_G);
        manifest_expected.add_entry(round, "MSM_ADD", frs_per_G);
        manifest_expected.add_entry(round, "MSM_DOUBLE", frs_per_G);
        manifest_expected.add_entry(round, "MSM_SKEW", frs_per_G);
        manifest_expected.add_entry(round, "MSM_ACCUMULATOR_X", frs_per_G);
        manifest_expected.add_entry(round, "MSM_ACCUMULATOR_Y", frs_per_G);
        manifest_expected.add_entry(round, "MSM_COUNT", frs_per_G);
        manifest_expected.add_entry(round, "MSM_ROUND", frs_per_G);
        manifest_expected.add_entry(round, "MSM_ADD1", frs_per_G);
        manifest_expected.add_entry(round, "MSM_PC", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_PC", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_PC", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_ROUND", frs_per_G);
        manifest_expected.add_entry(round, "PRECOMPUTE_SELECT", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_ACCUMULATOR_EMPTY", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_ACCUMULATOR_X", frs_per_G);
        manifest_expected.add_entry(round, "TRANSCRIPT_ACCUMULATOR_Y", frs_per_G);
        manifest_expected.add_challenge(round, "beta", "gamma");

        round++;
        manifest_expected.add_entry(round, "LOOKUP_INVERSES", frs_per_G);
        manifest_expected.add_entry(round, "Z_PERM", frs_per_G);
        manifest_expected.add_challenge(round, "Sumcheck:alpha");

        for (size_t i = 0; i < CONST_ECCVM_LOG_N; i++) {
            round++;
            std::string label = "Sumcheck:gate_challenge_" + std::to_string(i);
            manifest_expected.add_challenge(round, label);
        }
        round++;

        manifest_expected.add_entry(round, "Libra:concatenation_commitment", frs_per_G);
        manifest_expected.add_entry(round, "Libra:Sum", frs_per_Fr);
        // get the challenge for the ZK Sumcheck claim
        manifest_expected.add_challenge(round, "Libra:Challenge");

        for (size_t i = 0; i < CONST_ECCVM_LOG_N; ++i) {
            round++;
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Sumcheck:univariate_comm_" + idx, frs_per_G);
            manifest_expected.add_entry(round, "Sumcheck:univariate_" + idx + "_eval_0", frs_per_Fr);
            manifest_expected.add_entry(round, "Sumcheck:univariate_" + idx + "_eval_1", frs_per_Fr);
            std::string label = "Sumcheck:u_" + idx;
            manifest_expected.add_challenge(round, label);
        }

        round++;

        manifest_expected.add_entry(round, "Sumcheck:evaluations", frs_per_evals);
        manifest_expected.add_entry(round, "Libra:claimed_evaluation", frs_per_Fr);
        manifest_expected.add_entry(round, "Libra:grand_sum_commitment", frs_per_G);
        manifest_expected.add_entry(round, "Libra:quotient_commitment", frs_per_G);
        manifest_expected.add_entry(round, "Gemini:masking_poly_comm", frs_per_G);
        manifest_expected.add_entry(round, "Gemini:masking_poly_eval", frs_per_Fr);

        manifest_expected.add_challenge(round, "rho");

        round++;
        for (size_t i = 1; i < CONST_ECCVM_LOG_N; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Gemini:FOLD_" + idx, frs_per_G);
        }
        manifest_expected.add_challenge(round, "Gemini:r");
        round++;
        for (size_t i = 1; i <= CONST_ECCVM_LOG_N; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Gemini:a_" + idx, frs_per_Fr);
        }
        manifest_expected.add_entry(round, "Libra:concatenation_eval", frs_per_Fr);
        manifest_expected.add_entry(round, "Libra:shifted_grand_sum_eval", frs_per_Fr);
        manifest_expected.add_entry(round, "Libra:grand_sum_eval", frs_per_Fr);
        manifest_expected.add_entry(round, "Libra:quotient_eval", frs_per_Fr);
        manifest_expected.add_challenge(round, "Shplonk:nu");
        round++;
        manifest_expected.add_entry(round, "Shplonk:Q", frs_per_G);
        manifest_expected.add_challenge(round, "Shplonk:z");

        round++;
        manifest_expected.add_entry(round, "Translation:concatenated_masking_term_commitment", frs_per_G);
        manifest_expected.add_challenge(round, "Translation:evaluation_challenge_x");

        round++;
        manifest_expected.add_entry(round, "Translation:op", frs_per_Fr);
        manifest_expected.add_entry(round, "Translation:Px", frs_per_Fr);
        manifest_expected.add_entry(round, "Translation:Py", frs_per_Fr);
        manifest_expected.add_entry(round, "Translation:z1", frs_per_Fr);
        manifest_expected.add_entry(round, "Translation:z2", frs_per_Fr);
        manifest_expected.add_challenge(round, "Translation:batching_challenge_v");

        round++;
        manifest_expected.add_entry(round, "Translation:masking_term_eval", frs_per_Fr);
        manifest_expected.add_entry(round, "Translation:grand_sum_commitment", frs_per_G);
        manifest_expected.add_entry(round, "Translation:quotient_commitment", frs_per_G);
        manifest_expected.add_challenge(round, "Translation:small_ipa_evaluation_challenge");

        round++;
        manifest_expected.add_entry(round, "Translation:concatenation_eval", frs_per_Fr);
        manifest_expected.add_entry(round, "Translation:grand_sum_shift_eval", frs_per_Fr);
        manifest_expected.add_entry(round, "Translation:grand_sum_eval", frs_per_Fr);
        manifest_expected.add_entry(round, "Translation:quotient_eval", frs_per_Fr);
        manifest_expected.add_challenge(round, "Shplonk:nu");

        round++;
        manifest_expected.add_entry(round, "Shplonk:Q", frs_per_G);
        manifest_expected.add_challenge(round, "Shplonk:z");

        return manifest_expected;
    }

    TranscriptManifest construct_eccvm_ipa_manifest()
    {
        TranscriptManifest manifest_expected;
        // Size of types is number of bb::frs needed to represent the type
        size_t frs_per_Fr = bb::field_conversion::calc_num_bn254_frs<FF>();
        size_t frs_per_G = bb::field_conversion::calc_num_bn254_frs<typename Flavor::Commitment>();
        size_t frs_per_uint32 = bb::field_conversion::calc_num_bn254_frs<uint32_t>();
        size_t round = 0;
        manifest_expected.add_entry(round, "IPA:poly_degree_plus_1", frs_per_uint32);
        manifest_expected.add_challenge(round, "IPA:generator_challenge");

        for (size_t i = 0; i < CONST_ECCVM_LOG_N; ++i) {
            round++;
            std::string idx = std::to_string(CONST_ECCVM_LOG_N - i - 1);
            manifest_expected.add_entry(round, "IPA:L_" + idx, frs_per_G);
            manifest_expected.add_entry(round, "IPA:R_" + idx, frs_per_G);
            std::string label = "IPA:round_challenge_" + idx;
            manifest_expected.add_challenge(round, label);
        }

        round++;
        manifest_expected.add_entry(round, "IPA:G_0", frs_per_G);
        manifest_expected.add_entry(round, "IPA:a_0", frs_per_Fr);
        return manifest_expected;
    }

    ECCVMCircuitBuilder generate_trace(numeric::RNG* engine = nullptr)
    {
        std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
        using G1 = typename Flavor::CycleGroup;
        using Fr = typename G1::Fr;

        auto generators = G1::derive_generators("test generators", 3);

        typename G1::element a = generators[0];
        typename G1::element b = generators[1];
        typename G1::element c = generators[2];
        Fr x = Fr::random_element(engine);
        Fr y = Fr::random_element(engine);

        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->mul_accumulate(b, y);
        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(b, x);
        op_queue->eq_and_reset();
        op_queue->add_accumulate(c);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->eq_and_reset();
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->mul_accumulate(c, x);
        ECCVMCircuitBuilder builder{ op_queue };
        return builder;
    }
};

numeric::RNG& engine = numeric::get_debug_randomness();

/**
 * @brief Ensure consistency between the manifest hard coded in this testing suite and the one generated by the
 * standard honk prover over the course of proof construction.
 */
TEST_F(ECCVMTranscriptTests, ProverManifestConsistency)
{
    // Construct a simple circuit
    auto builder = this->generate_trace(&engine);

    // Automatically generate a transcript manifest by constructing a proof
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    prover.transcript->enable_manifest();
    prover.ipa_transcript->enable_manifest();
    ECCVMProof proof = prover.construct_proof();

    // Check that the prover generated manifest agrees with the manifest hard coded in this suite
    auto manifest_expected = this->construct_eccvm_honk_manifest();
    auto prover_manifest = prover.transcript->get_manifest();

    // Note: a manifest can be printed using manifest.print()
    ASSERT(manifest_expected.size() > 0);
    for (size_t round = 0; round < manifest_expected.size(); ++round) {
        ASSERT_EQ(prover_manifest[round], manifest_expected[round]) << "Prover manifest discrepency in round " << round;
    }

    auto ipa_manifest_expected = this->construct_eccvm_ipa_manifest();
    auto prover_ipa_manifest = prover.ipa_transcript->get_manifest();

    // Note: a manifest can be printed using manifest.print()
    ASSERT(ipa_manifest_expected.size() > 0);
    for (size_t round = 0; round < ipa_manifest_expected.size(); ++round) {
        ASSERT_EQ(prover_ipa_manifest[round], ipa_manifest_expected[round])
            << "IPA prover manifest discrepency in round " << round;
    }
}

/**
 * @brief Ensure consistency between the manifest generated by the ECCVM honk prover over the course of proof
 * construction and the one generated by the verifier over the course of proof verification.
 *
 */
TEST_F(ECCVMTranscriptTests, VerifierManifestConsistency)
{
    // Construct a simple circuit
    auto builder = this->generate_trace(&engine);

    // Automatically generate a transcript manifest in the prover by constructing a proof
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    prover_transcript->enable_manifest();
    prover.ipa_transcript->enable_manifest();
    ECCVMProof proof = prover.construct_proof();

    // Automatically generate a transcript manifest in the verifier by verifying a proof
    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript);
    verifier.verify_proof(proof);

    // Check consistency between the manifests generated by the prover and verifier
    auto prover_manifest = prover.transcript->get_manifest();
    auto verifier_manifest = verifier.transcript->get_manifest();

    // Note: a manifest can be printed using manifest.print()
    // The last challenge generated by the ECCVM Prover is the translation univariate batching challenge and, on the
    // verifier side, is only generated in the translator verifier hence the ECCVM prover's manifest will have one extra
    // challenge
    ASSERT(prover_manifest.size() > 0);
    for (size_t round = 0; round < prover_manifest.size() - 1; ++round) {
        ASSERT_EQ(prover_manifest[round], verifier_manifest[round])
            << "Prover/Verifier manifest discrepency in round " << round;
    }

    // Check consistency of IPA transcripts
    auto prover_ipa_manifest = prover.ipa_transcript->get_manifest();
    auto verifier_ipa_manifest = verifier.ipa_transcript->get_manifest();
    ASSERT(prover_ipa_manifest.size() > 0);
    for (size_t round = 0; round < prover_ipa_manifest.size(); ++round) {
        ASSERT_EQ(prover_ipa_manifest[round], verifier_ipa_manifest[round])
            << "Prover/Verifier IPA manifest discrepency in round " << round;
    }
}

/**
 * @brief Check that multiple challenges can be generated and sanity check
 * @details We generate 6 challenges that are each 128 bits, and check that they are not 0.
 *
 */
TEST_F(ECCVMTranscriptTests, ChallengeGenerationTest)
{
    // initialized with random value sent to verifier
    auto transcript = Flavor::Transcript::prover_init_empty();
    // test a bunch of challenges
    auto challenges = transcript->template get_challenges<FF>("a", "b", "c", "d", "e", "f");
    // check they are not 0
    for (size_t i = 0; i < challenges.size(); ++i) {
        ASSERT_NE(challenges[i], 0) << "Challenge " << i << " is 0";
    }
    constexpr uint32_t random_val{ 17 }; // arbitrary
    transcript->send_to_verifier("random val", random_val);
    // test more challenges
    auto [a, b, c] = transcript->template get_challenges<FF>("a", "b", "c");

    ASSERT_NE(a, 0) << "Challenge a is 0";
    ASSERT_NE(b, 0) << "Challenge b is 0";
    ASSERT_NE(c, 0) << "Challenge c is 0";
}
