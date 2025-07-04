#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include "gtest/gtest.h"

using namespace bb;

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = ::testing::Types<UltraFlavor,
                                     UltraKeccakFlavor,
                                     UltraStarknetFlavor,
                                     UltraStarknetZKFlavor,
                                     UltraRollupFlavor,
                                     UltraZKFlavor,
                                     UltraKeccakZKFlavor>;
#else
using FlavorTypes =
    ::testing::Types<UltraFlavor, UltraKeccakFlavor, UltraRollupFlavor, UltraZKFlavor, UltraKeccakZKFlavor>;
#endif
template <typename Flavor> class UltraTranscriptTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using VerificationKey = Flavor::VerificationKey;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    /**
     * @brief Construct a manifest for a Ultra Honk proof
     *
     * @details This is where we define the "Manifest" for a Ultra Honk proof. The tests in this suite are
     * intented to warn the developer if the Prover/Verifier has deviated from this manifest, however, the
     * Transcript class is not otherwise contrained to follow the manifest.
     *
     * @note Entries in the manifest consist of a name string and a size (bytes), NOT actual data.
     *
     * @return TranscriptManifest
     */
    TranscriptManifest construct_ultra_honk_manifest()
    {
        TranscriptManifest manifest_expected;

        size_t MAX_PARTIAL_RELATION_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
        size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;
        // Size of types is number of bb::frs needed to represent the types
        size_t frs_per_Fr = bb::field_conversion::calc_num_bn254_frs<FF>();
        size_t frs_per_G = bb::field_conversion::calc_num_bn254_frs<Commitment>();
        size_t frs_per_uni = MAX_PARTIAL_RELATION_LENGTH * frs_per_Fr;
        size_t frs_per_evals = (Flavor::NUM_ALL_ENTITIES)*frs_per_Fr;

        size_t round = 0;
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1427): Add VK FS to solidity verifier.
        if constexpr (!IsAnyOf<Flavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
            manifest_expected.add_entry(round, "vk_circuit_size", frs_per_Fr);
            manifest_expected.add_entry(round, "vk_num_public_inputs", frs_per_Fr);
            manifest_expected.add_entry(round, "vk_pub_inputs_offset", frs_per_Fr);
            manifest_expected.add_entry(round, "vk_pairing_points_start_idx", frs_per_Fr);
            if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
                manifest_expected.add_entry(round, "vk_ipa_claim_start_idx", frs_per_Fr);
            }
            for (size_t i = 0; i < Flavor::NUM_PRECOMPUTED_ENTITIES; i++) {
                manifest_expected.add_entry(round, "vk_commitment", frs_per_G);
            }
            manifest_expected.add_challenge(round, "vk_hash");
            round++;
        } else {
            size_t frs_per_uint32 = bb::field_conversion::calc_num_bn254_frs<uint32_t>();
            manifest_expected.add_entry(round, "vk_circuit_size", frs_per_uint32);
            manifest_expected.add_entry(round, "vk_num_public_inputs", frs_per_uint32);
            manifest_expected.add_entry(round, "vk_pub_inputs_offset", frs_per_uint32);
        }

        manifest_expected.add_entry(round, "public_input_0", frs_per_Fr);
        for (size_t i = 0; i < PAIRING_POINTS_SIZE; i++) {
            manifest_expected.add_entry(round, "public_input_" + std::to_string(1 + i), frs_per_Fr);
        }
        if constexpr (HasIPAAccumulator<Flavor>) {
            for (size_t i = 0; i < IPA_CLAIM_SIZE; i++) {
                manifest_expected.add_entry(
                    round, "public_input_" + std::to_string(1 + PAIRING_POINTS_SIZE + i), frs_per_Fr);
            }
        }
        manifest_expected.add_entry(round, "W_L", frs_per_G);
        manifest_expected.add_entry(round, "W_R", frs_per_G);
        manifest_expected.add_entry(round, "W_O", frs_per_G);
        manifest_expected.add_challenge(round, "eta", "eta_two", "eta_three");

        round++;
        manifest_expected.add_entry(round, "LOOKUP_READ_COUNTS", frs_per_G);
        manifest_expected.add_entry(round, "LOOKUP_READ_TAGS", frs_per_G);
        manifest_expected.add_entry(round, "W_4", frs_per_G);
        manifest_expected.add_challenge(round, "beta", "gamma");

        round++;
        manifest_expected.add_entry(round, "LOOKUP_INVERSES", frs_per_G);
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

        manifest_expected.add_entry(round, "Sumcheck:evaluations", frs_per_evals);

        if constexpr (Flavor::HasZK) {
            manifest_expected.add_entry(round, "Libra:claimed_evaluation", frs_per_Fr);
            manifest_expected.add_entry(round, "Libra:grand_sum_commitment", frs_per_G);
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
            manifest_expected.add_entry(round, "Libra:shifted_grand_sum_eval", frs_per_Fr);
            manifest_expected.add_entry(round, "Libra:grand_sum_eval", frs_per_Fr);
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

    void generate_test_circuit(Builder& builder)
    {
        FF a = 1;
        builder.add_variable(a);
        builder.add_public_variable(a);
        stdlib::recursion::PairingPoints<Builder>::add_default_to_public_inputs(builder);
        if constexpr (HasIPAAccumulator<Flavor>) {
            auto [stdlib_opening_claim, ipa_proof] =
                IPA<stdlib::grumpkin<Builder>>::create_fake_ipa_claim_and_proof(builder);
            stdlib_opening_claim.set_public();
            builder.ipa_proof = ipa_proof;
        }
    }

    void generate_random_test_circuit(Builder& builder)
    {
        auto a = FF::random_element();
        auto b = FF::random_element();
        builder.add_variable(a);
        builder.add_public_variable(a);
        builder.add_public_variable(b);

        if constexpr (HasIPAAccumulator<Flavor>) {
            auto [stdlib_opening_claim, ipa_proof] =
                IPA<stdlib::grumpkin<Builder>>::create_fake_ipa_claim_and_proof(builder);
            stdlib_opening_claim.set_public();
            builder.ipa_proof = ipa_proof;
        }
    }

    HonkProof export_serialized_proof(Prover prover, const size_t num_public_inputs)
    {
        // reset internal variables needed for exporting the proof
        prover.transcript->num_frs_written = Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + num_public_inputs;
        prover.transcript->proof_start = 0;
        return prover.export_proof();
    }
};

TYPED_TEST_SUITE(UltraTranscriptTests, FlavorTypes);

/**
 * @brief Ensure consistency between the manifest hard coded in this testing suite and the one generated by the
 * standard honk prover over the course of proof construction.
 */
TYPED_TEST(UltraTranscriptTests, ProverManifestConsistency)
{
    // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
    auto builder = typename TestFixture::Builder();
    TestFixture::generate_test_circuit(builder);

    // Automatically generate a transcript manifest by constructing a proof
    auto proving_key = std::make_shared<typename TestFixture::DeciderProvingKey>(builder);
    auto verification_key =
        std::make_shared<typename TestFixture::VerificationKey>(proving_key->polynomials, proving_key->metadata);
    typename TestFixture::Prover prover(proving_key, verification_key);
    prover.transcript->enable_manifest();
    auto proof = prover.construct_proof();

    // Check that the prover generated manifest agrees with the manifest hard coded in this suite
    auto manifest_expected = TestFixture::construct_ultra_honk_manifest();
    auto prover_manifest = prover.transcript->get_manifest();
    // Note: a manifest can be printed using manifest.print()
    manifest_expected.print();
    prover_manifest.print();
    ASSERT(manifest_expected.size() > 0);
    for (size_t round = 0; round < manifest_expected.size(); ++round) {
        if (prover_manifest[round] != manifest_expected[round]) {
            info("Prover manifest discrepency in round ", round);
            info("Prover manifest:");
            prover_manifest[round].print();
            info("Expected manifest:");
            manifest_expected[round].print();
            ASSERT(false);
        }
    }
}

/**
 * @brief Ensure consistency between the manifest generated by the ultra honk prover over the course of proof
 * construction and the one generated by the verifier over the course of proof verification.
 *
 */
TYPED_TEST(UltraTranscriptTests, VerifierManifestConsistency)
{

    // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
    auto builder = typename TestFixture::Builder();
    TestFixture::generate_test_circuit(builder);

    // Automatically generate a transcript manifest in the prover by constructing a proof
    auto proving_key = std::make_shared<typename TestFixture::DeciderProvingKey>(builder);
    auto verification_key =
        std::make_shared<typename TestFixture::VerificationKey>(proving_key->polynomials, proving_key->metadata);
    typename TestFixture::Prover prover(proving_key, verification_key);
    prover.transcript->enable_manifest();
    auto proof = prover.construct_proof();

    // Automatically generate a transcript manifest in the verifier by verifying a proof
    typename TestFixture::Verifier verifier(verification_key);
    verifier.transcript->enable_manifest();
    HonkProof honk_proof;
    HonkProof ipa_proof;
    if constexpr (HasIPAAccumulator<TypeParam>) {
        verifier.ipa_verification_key = VerifierCommitmentKey<curve::Grumpkin>(1 << CONST_ECCVM_LOG_N);
        const size_t HONK_PROOF_LENGTH = TypeParam::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH;
        const size_t num_public_inputs = static_cast<uint32_t>(verification_key->num_public_inputs);
        // The extra calculation is for the IPA proof length.
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1182): Handle in ProofSurgeon.
        ASSERT(proof.size() == HONK_PROOF_LENGTH + IPA_PROOF_LENGTH + num_public_inputs);
        // split out the ipa proof
        const std::ptrdiff_t honk_proof_with_pub_inputs_length =
            static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);
        ipa_proof = HonkProof(proof.begin() + honk_proof_with_pub_inputs_length, proof.end());
        honk_proof = HonkProof(proof.begin(), proof.begin() + honk_proof_with_pub_inputs_length);
    } else {
        honk_proof = proof;
    }
    verifier.verify_proof(honk_proof, ipa_proof);

    // Check consistency between the manifests generated by the prover and verifier
    auto prover_manifest = prover.transcript->get_manifest();
    auto verifier_manifest = verifier.transcript->get_manifest();

    // Note: a manifest can be printed using manifest.print()
    ASSERT(prover_manifest.size() > 0);
    for (size_t round = 0; round < prover_manifest.size(); ++round) {
        ASSERT_EQ(prover_manifest[round], verifier_manifest[round])
            << "Prover/Verifier manifest discrepency in round " << round;
    }
}

/**
 * @brief Check that multiple challenges can be generated and sanity check
 * @details We generate 6 challenges that are each 128 bits, and check that they are not 0.
 *
 */
TYPED_TEST(UltraTranscriptTests, ChallengeGenerationTest)
{
    using Flavor = TypeParam;
    using FF = Flavor::FF;
    // initialized with random value sent to verifier
    auto transcript = TypeParam::Transcript::prover_init_empty();
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

TYPED_TEST(UltraTranscriptTests, StructureTest)
{
    using Flavor = TypeParam;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
    auto builder = typename TestFixture::Builder();
    if constexpr (IsAnyOf<TypeParam, UltraRollupFlavor>) {
        GTEST_SKIP() << "Not built for this parameter";
    }
    TestFixture::generate_test_circuit(builder);

    // Automatically generate a transcript manifest by constructing a proof
    auto proving_key = std::make_shared<typename TestFixture::DeciderProvingKey>(builder);
    auto verification_key =
        std::make_shared<typename TestFixture::VerificationKey>(proving_key->polynomials, proving_key->metadata);
    typename TestFixture::Prover prover(proving_key, verification_key);
    auto proof = prover.construct_proof();
    typename TestFixture::Verifier verifier(verification_key);
    EXPECT_TRUE(verifier.verify_proof(proof));

    // try deserializing and serializing with no changes and check proof is still valid
    prover.transcript->deserialize_full_transcript(verification_key->num_public_inputs);
    prover.transcript->serialize_full_transcript();
    // reset verifier's transcript
    verifier.transcript = std::make_shared<typename Flavor::Transcript>();

    proof = TestFixture::export_serialized_proof(prover, proving_key->num_public_inputs());
    EXPECT_TRUE(verifier.verify_proof(proof)); // we have changed nothing so proof is still valid

    Commitment one_group_val = Commitment::one();
    FF rand_val = FF::random_element();
    prover.transcript->z_perm_comm = one_group_val * rand_val;             // choose random object to modify
    verifier.transcript = std::make_shared<typename Flavor::Transcript>(); // reset verifier's transcript
    proof = TestFixture::export_serialized_proof(prover, proving_key->num_public_inputs());
    EXPECT_TRUE(verifier.verify_proof(proof)); // we have not serialized it back to the proof so it should still be fine

    prover.transcript->serialize_full_transcript();
    verifier.transcript = std::make_shared<typename Flavor::Transcript>(); // reset verifier's transcript
    proof = TestFixture::export_serialized_proof(prover, proving_key->num_public_inputs());
    EXPECT_FALSE(verifier.verify_proof(proof)); // the proof is now wrong after serializing it

    prover.transcript->deserialize_full_transcript(verification_key->num_public_inputs);
    EXPECT_EQ(static_cast<Commitment>(prover.transcript->z_perm_comm), one_group_val * rand_val);
}

TYPED_TEST(UltraTranscriptTests, ProofLengthTest)
{
    if constexpr (!IsAnyOf<TypeParam, UltraRollupFlavor, UltraFlavor>) {
        GTEST_SKIP() << "Not built for this parameter";
    } else {
        // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
        auto builder = typename TypeParam::CircuitBuilder();
        TestFixture::generate_test_circuit(builder);

        // Automatically generate a transcript manifest by constructing a proof
        auto proving_key = std::make_shared<typename TestFixture::DeciderProvingKey>(builder);
        auto verification_key =
            std::make_shared<typename TestFixture::VerificationKey>(proving_key->polynomials, proving_key->metadata);
        typename TestFixture::Prover prover(proving_key, verification_key);
        auto proof = prover.construct_proof();
        EXPECT_EQ(proof.size(), TypeParam::PROOF_LENGTH_WITHOUT_PUB_INPUTS + builder.public_inputs.size());
    }
}
