#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include <gtest/gtest.h>

using namespace bb;

using FlavorTypes = ::testing::Types<MegaFlavor, MegaZKFlavor>;

template <typename Flavor> class MegaTranscriptTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }

    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using FF = Flavor::FF;
    /**
     * @brief Construct a manifest for a Mega Honk proof
     *
     * @details This is where we define the "Manifest" for a Mega Honk proof. The tests in this suite are
     * intented to warn the developer if the Prover/Verifier has deviated from this manifest, however, the
     * Transcript class is not otherwise contrained to follow the manifest.
     *
     * @note Entries in the manifest consist of a name string and a size (bytes), NOT actual data.
     *
     * @return TranscriptManifest
     */
    static TranscriptManifest construct_mega_honk_manifest()
    {
        using Commitment = typename Flavor::Commitment;
        TranscriptManifest manifest_expected;

        size_t MAX_PARTIAL_RELATION_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
        size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;

        size_t frs_per_Fr = bb::field_conversion::calc_num_bn254_frs<FF>();
        size_t frs_per_G = bb::field_conversion::calc_num_bn254_frs<Commitment>();
        size_t frs_per_uni = MAX_PARTIAL_RELATION_LENGTH * frs_per_Fr;
        size_t frs_per_evals = (Flavor::NUM_ALL_ENTITIES)*frs_per_Fr;
        size_t frs_per_uint32 = bb::field_conversion::calc_num_bn254_frs<uint32_t>();

        size_t round = 0;
        manifest_expected.add_entry(round, "circuit_size", frs_per_uint32);
        manifest_expected.add_entry(round, "public_input_size", frs_per_uint32);
        manifest_expected.add_entry(round, "pub_inputs_offset", frs_per_uint32);
        manifest_expected.add_entry(round, "public_input_0", frs_per_Fr);
        manifest_expected.add_entry(round, "W_L", frs_per_G);
        manifest_expected.add_entry(round, "W_R", frs_per_G);
        manifest_expected.add_entry(round, "W_O", frs_per_G);
        manifest_expected.add_entry(round, "ECC_OP_WIRE_1", frs_per_G);
        manifest_expected.add_entry(round, "ECC_OP_WIRE_2", frs_per_G);
        manifest_expected.add_entry(round, "ECC_OP_WIRE_3", frs_per_G);
        manifest_expected.add_entry(round, "ECC_OP_WIRE_4", frs_per_G);
        manifest_expected.add_entry(round, "CALLDATA", frs_per_G);
        manifest_expected.add_entry(round, "CALLDATA_READ_COUNTS", frs_per_G);
        manifest_expected.add_entry(round, "CALLDATA_READ_TAGS", frs_per_G);
        manifest_expected.add_entry(round, "SECONDARY_CALLDATA", frs_per_G);
        manifest_expected.add_entry(round, "SECONDARY_CALLDATA_READ_COUNTS", frs_per_G);
        manifest_expected.add_entry(round, "SECONDARY_CALLDATA_READ_TAGS", frs_per_G);
        manifest_expected.add_entry(round, "RETURN_DATA", frs_per_G);
        manifest_expected.add_entry(round, "RETURN_DATA_READ_COUNTS", frs_per_G);
        manifest_expected.add_entry(round, "RETURN_DATA_READ_TAGS", frs_per_G);
        manifest_expected.add_challenge(round, "eta", "eta_two", "eta_three");

        round++;
        manifest_expected.add_entry(round, "LOOKUP_READ_COUNTS", frs_per_G);
        manifest_expected.add_entry(round, "LOOKUP_READ_TAGS", frs_per_G);
        manifest_expected.add_entry(round, "W_4", frs_per_G);
        manifest_expected.add_challenge(round, "beta", "gamma");

        round++;
        manifest_expected.add_entry(round, "LOOKUP_INVERSES", frs_per_G);
        manifest_expected.add_entry(round, "CALLDATA_INVERSES", frs_per_G);
        manifest_expected.add_entry(round, "SECONDARY_CALLDATA_INVERSES", frs_per_G);
        manifest_expected.add_entry(round, "RETURN_DATA_INVERSES", frs_per_G);
        manifest_expected.add_entry(round, "Z_PERM", frs_per_G);

        std::array<std::string, Flavor::NUM_SUBRELATIONS - 1> alpha_labels;
        for (size_t i = 0; i < NUM_SUBRELATIONS - 1; i++) {
            std::string label = "alpha_" + std::to_string(i);
            alpha_labels[i] = label;
        }

        manifest_expected.add_challenge(round, alpha_labels);
        round++;

        for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            std::string label = "Sumcheck:gate_challenge_" + std::to_string(i);
            manifest_expected.add_challenge(round, label);
            round++;
        }

        if constexpr (Flavor::HasZK) {

            manifest_expected.add_entry(round, "Libra:concatenation_commitment", frs_per_G);
            manifest_expected.add_entry(round, "Libra:Sum", frs_per_Fr);
            manifest_expected.add_challenge(round, "Libra:Challenge");
            round++;
        }

        for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Sumcheck:univariate_" + idx, frs_per_uni);
            std::string label = "Sumcheck:u_" + idx;
            manifest_expected.add_challenge(round, label);
            round++;
        }

        if constexpr (Flavor::HasZK) {
            manifest_expected.add_entry(round, "Libra:claimed_evaluation", frs_per_Fr);
        }

        manifest_expected.add_entry(round, "Sumcheck:evaluations", frs_per_evals);

        if constexpr (Flavor::HasZK) {
            manifest_expected.add_entry(round, "Libra:big_sum_commitment", frs_per_G);
            manifest_expected.add_entry(round, "Libra:quotient_commitment", frs_per_G);

            manifest_expected.add_entry(round, "Gemini:masking_poly_comm", frs_per_G);
            manifest_expected.add_entry(round, "Gemini:masking_poly_eval", frs_per_Fr);
        }

        manifest_expected.add_challenge(round, "rho");

        round++;
        for (size_t i = 1; i < CONST_PROOF_SIZE_LOG_N; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Gemini:FOLD_" + idx, frs_per_G);
        }
        manifest_expected.add_challenge(round, "Gemini:r");
        round++;
        for (size_t i = 1; i <= CONST_PROOF_SIZE_LOG_N; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Gemini:a_" + idx, frs_per_Fr);
        }
        if constexpr (Flavor::HasZK) {
            manifest_expected.add_entry(round, "Libra:concatenation_eval", frs_per_Fr);
            manifest_expected.add_entry(round, "Libra:shifted_big_sum_eval", frs_per_Fr);
            manifest_expected.add_entry(round, "Libra:big_sum_eval", frs_per_Fr);
            manifest_expected.add_entry(round, "Libra:quotient_eval", frs_per_Fr);
        }

        manifest_expected.add_challenge(round, "Shplonk:nu");
        round++;
        manifest_expected.add_entry(round, "Shplonk:Q", frs_per_G);
        manifest_expected.add_challenge(round, "Shplonk:z");

        round++;
        manifest_expected.add_entry(round, "KZG:W", frs_per_G);
        manifest_expected.add_challenge(round); // no challenge

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

        // Add one conventional gates that utilize public inputs
        FF a = FF::random_element();
        FF b = FF::random_element();
        FF c = FF::random_element();
        FF d = a + b + c;
        uint32_t a_idx = builder.add_public_variable(a);
        uint32_t b_idx = builder.add_variable(b);
        uint32_t c_idx = builder.add_variable(c);
        uint32_t d_idx = builder.add_variable(d);

        builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, FF(1), FF(1), FF(1), FF(-1), FF(0) });
    }
};
TYPED_TEST_SUITE(MegaTranscriptTests, FlavorTypes);
/**
 * @brief Ensure consistency between the manifest hard coded in this testing suite and the one generated by the
 * standard honk prover over the course of proof construction.
 */
TYPED_TEST(MegaTranscriptTests, ProverManifestConsistency)
{
    using Flavor = TypeParam;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;

    using Prover = UltraProver_<Flavor>;
    // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
    auto builder = typename Flavor::CircuitBuilder();
    TestFixture::generate_test_circuit(builder);

    // Automatically generate a transcript manifest by constructing a proof
    auto proving_key = std::make_shared<DeciderProvingKey>(builder);
    Prover prover(proving_key);
    auto proof = prover.construct_proof();

    // Check that the prover generated manifest agrees with the manifest hard coded in this suite
    auto manifest_expected = TestFixture::construct_mega_honk_manifest();
    auto prover_manifest = prover.transcript->get_manifest();
    // Note: a manifest can be printed using manifest.print()
    for (size_t round = 0; round < manifest_expected.size(); ++round) {
        if (prover_manifest[round] != manifest_expected[round]) {
            info("Prover manifest discrepency in round ", round);
            prover_manifest[round].print();
            manifest_expected[round].print();
            ASSERT(false);
        }
    }
}

/**
 * @brief Ensure consistency between the manifest generated by the mega honk prover over the course of proof
 * construction and the one generated by the verifier over the course of proof verification.
 *
 */
TYPED_TEST(MegaTranscriptTests, VerifierManifestConsistency)
{
    using Flavor = TypeParam;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
    auto builder = typename Flavor::CircuitBuilder();
    TestFixture::generate_test_circuit(builder);

    // Automatically generate a transcript manifest in the prover by constructing a proof
    auto proving_key = std::make_shared<DeciderProvingKey>(builder);
    Prover prover(proving_key);
    auto proof = prover.construct_proof();

    // Automatically generate a transcript manifest in the verifier by verifying a proof
    auto verification_key = std::make_shared<VerificationKey>(proving_key->proving_key);
    Verifier verifier(verification_key);
    verifier.verify_proof(proof);

    // Check consistency between the manifests generated by the prover and verifier
    auto prover_manifest = prover.transcript->get_manifest();
    prover_manifest.print();

    auto verifier_manifest = verifier.transcript->get_manifest();

    // Note: a manifest can be printed using manifest.print()
    for (size_t round = 0; round < prover_manifest.size(); ++round) {
        if (prover_manifest[round] != verifier_manifest[round]) {
            info("Prover/Verifier manifest discrepency in round ", round);
            prover_manifest[round].print();
            verifier_manifest[round].print();
            ASSERT(false);
        }
    }
}

/**
 * @brief Check that multiple challenges can be generated and sanity check
 * @details We generate 6 challenges that are each 128 bits, and check that they are not 0.
 *
 */
TYPED_TEST(MegaTranscriptTests, ChallengeGenerationTest)
{
    using Flavor = TypeParam;
    using FF = Flavor::FF;
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

TYPED_TEST(MegaTranscriptTests, StructureTest)
{
    using Flavor = TypeParam;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using FF = Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
    typename Flavor::CircuitBuilder builder;
    this->generate_test_circuit(builder);

    // Automatically generate a transcript manifest by constructing a proof
    auto proving_key = std::make_shared<DeciderProvingKey>(builder);
    Prover prover(proving_key);
    auto proof = prover.construct_proof();
    auto verification_key = std::make_shared<VerificationKey>(proving_key->proving_key);
    Verifier verifier(verification_key);
    EXPECT_TRUE(verifier.verify_proof(proof));

    // try deserializing and serializing with no changes and check proof is still valid
    prover.transcript->deserialize_full_transcript();
    prover.transcript->serialize_full_transcript();
    EXPECT_TRUE(verifier.verify_proof(prover.export_proof())); // we have changed nothing so proof is still valid

    Commitment one_group_val = Commitment::one();
    FF rand_val = FF::random_element();
    prover.transcript->z_perm_comm = one_group_val * rand_val; // choose random object to modify
    EXPECT_TRUE(verifier.verify_proof(
        prover.export_proof())); // we have not serialized it back to the proof so it should still be fine

    prover.transcript->serialize_full_transcript();
    EXPECT_FALSE(verifier.verify_proof(prover.export_proof())); // the proof is now wrong after serializing it

    prover.transcript->deserialize_full_transcript();
    EXPECT_EQ(static_cast<Commitment>(prover.transcript->z_perm_comm), one_group_val * rand_val);
}
