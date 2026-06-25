#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/test_utils/proof_structures.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include <gtest/gtest.h>

using namespace bb;

#ifdef STARKNET_GARAGA_FLAVORS
using FlavorTypes = ::testing::Types<UltraFlavor,
                                     UltraKeccakFlavor,
                                     UltraStarknetFlavor,
                                     UltraStarknetZKFlavor,
                                     UltraZKFlavor,
                                     UltraKeccakZKFlavor,
                                     MegaFlavor,
                                     MegaZKFlavor>;
#else
using FlavorTypes =
    ::testing::Types<UltraFlavor, UltraKeccakFlavor, UltraZKFlavor, UltraKeccakZKFlavor, MegaFlavor, MegaZKFlavor>;
#endif

template <typename Flavor> class HonkTranscriptTests : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using VerificationKey = Flavor::VerificationKey;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using ProverInstance = ProverInstance_<Flavor>;
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using IO = DefaultIO;
    using Verifier = UltraVerifier_<Flavor, IO>;
    using Proof = typename Flavor::Transcript::Proof;

    /**
     * @brief Construct a manifest for a Honk proof (Ultra or Mega)
     *
     * @details This is where we define the "Manifest" for a Honk proof. The tests in this suite are
     * intended to warn the developer if the Prover/Verifier has deviated from this manifest, however, the
     * Transcript class is not otherwise constrained to follow the manifest.
     *
     * @note Entries in the manifest consist of a name string and a size (bytes), NOT actual data.
     *
     * @return TranscriptManifest
     */
    TranscriptManifest construct_honk_manifest(const size_t& log_n)
    {
        TranscriptManifest manifest_expected;

        const size_t virtual_log_n = Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : log_n;

        size_t MAX_PARTIAL_RELATION_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
        // Size of types is number of bb::frs needed to represent the types
        // UltraKeccak uses uint256_t for commitments and frs, so we need to handle that differently.
        size_t data_types_per_Frs = [] {
            if constexpr (IsKeccakFlavor<Flavor>) {
                return U256Codec::calc_num_fields<FF>();
            } else {
                return FrCodec::calc_num_fields<FF>();
            }
        }();
        size_t data_types_per_G = [] {
            if constexpr (IsKeccakFlavor<Flavor>) {
                return U256Codec::calc_num_fields<Commitment>();
            } else {
                return FrCodec::calc_num_fields<Commitment>();
            }
        }();
        size_t frs_per_uni = MAX_PARTIAL_RELATION_LENGTH * data_types_per_Frs;
        size_t frs_per_evals = (Flavor::NUM_ALL_ENTITIES)*data_types_per_Frs;

        size_t round = 0;
        manifest_expected.add_entry(round, "vk_hash", data_types_per_Frs);

        manifest_expected.add_entry(round, "public_input_0", data_types_per_Frs);
        constexpr size_t PUBLIC_INPUTS_SIZE = IO::PUBLIC_INPUTS_SIZE;
        for (size_t i = 0; i < PUBLIC_INPUTS_SIZE; i++) {
            manifest_expected.add_entry(round, "public_input_" + std::to_string(1 + i), data_types_per_Frs);
        }

        // For flavors with Gemini masking: masking polynomial commitment is sent at end of oink
        if constexpr (flavor_has_gemini_masking<Flavor>()) {
            manifest_expected.add_entry(round, "Gemini:masking_poly_comm", data_types_per_G);
        }
        manifest_expected.add_entry(round, "W_L", data_types_per_G);
        manifest_expected.add_entry(round, "W_R", data_types_per_G);
        manifest_expected.add_entry(round, "W_O", data_types_per_G);

        if constexpr (Flavor::HasEccOpQueue) {
            manifest_expected.add_entry(round, "ECC_OP_WIRE_1", data_types_per_G);
            manifest_expected.add_entry(round, "ECC_OP_WIRE_2", data_types_per_G);
            manifest_expected.add_entry(round, "ECC_OP_WIRE_3", data_types_per_G);
            manifest_expected.add_entry(round, "ECC_OP_WIRE_4", data_types_per_G);
        }
        // Bus list is flavor-specific: MegaZK keeps only kernel_calldata (the hiding kernel's
        // sole bus); MegaFlavor carries the full five-bus set.
        constexpr std::array<const char*, 5> ALL_BUSES = {
            "KERNEL_CALLDATA", "FIRST_APP_CALLDATA", "SECOND_APP_CALLDATA", "THIRD_APP_CALLDATA", "RETURN_DATA"
        };
        if constexpr (Flavor::HasDataBus) {
            for (size_t i = 0; i < Flavor::NUM_BUS_COLUMNS; ++i) {
                manifest_expected.add_entry(round, ALL_BUSES[i], data_types_per_G);
                manifest_expected.add_entry(round, std::string(ALL_BUSES[i]) + "_READ_COUNTS", data_types_per_G);
            }
        }

        // eta and the ROM-LogUp offset rom_logup_gamma are sampled only when the flavor carries the
        // memory relation; flavors without it (e.g. MegaZK) skip the challenges entirely, and the W_4 commit stays in
        // the same Fiat-Shamir round as the prior wire/bus commitments.
        if constexpr (Flavor::HasMemory) {
            manifest_expected.add_challenge(round, std::array{ "eta", "rom_logup_gamma" });
            round++;
        }
        if constexpr (Flavor::HasLogDerivLookup) {
            manifest_expected.add_entry(round, "LOOKUP_READ_COUNTS", data_types_per_G);
            manifest_expected.add_entry(round, "LOOKUP_READ_TAGS", data_types_per_G);
        }
        manifest_expected.add_entry(round, "W_4", data_types_per_G);
        manifest_expected.add_challenge(round, std::array{ "beta", "gamma" });

        round++;
        if constexpr (Flavor::HasLogDerivLookup) {
            manifest_expected.add_entry(round, "LOOKUP_INVERSES", data_types_per_G);
        }
        if constexpr (Flavor::HasDataBus) {
            for (size_t i = 0; i < Flavor::NUM_BUS_COLUMNS; ++i) {
                manifest_expected.add_entry(round, std::string(ALL_BUSES[i]) + "_INVERSES", data_types_per_G);
            }
        }
        manifest_expected.add_entry(round, "Z_PERM", data_types_per_G);

        manifest_expected.add_challenge(round, "alpha");
        manifest_expected.add_challenge(round, "Sumcheck:gate_challenge");
        round++;

        if constexpr (Flavor::HasZK) {
            manifest_expected.add_entry(round, "Libra:concatenation_commitment", data_types_per_G);
            manifest_expected.add_entry(round, "Libra:Sum", data_types_per_Frs);
            manifest_expected.add_challenge(round, "Libra:Challenge");
            round++;
        }

        for (size_t i = 0; i < virtual_log_n; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Sumcheck:univariate_" + idx, frs_per_uni);
            std::string label = "Sumcheck:u_" + idx;
            manifest_expected.add_challenge(round, label);
            round++;
        }

        manifest_expected.add_entry(round, "Sumcheck:evaluations", frs_per_evals);

        if constexpr (Flavor::HasZK) {
            manifest_expected.add_entry(round, "Libra:claimed_evaluation", data_types_per_Frs);
            manifest_expected.add_entry(round, "Libra:grand_sum_commitment", data_types_per_G);
            manifest_expected.add_entry(round, "Libra:quotient_commitment", data_types_per_G);
        }

        manifest_expected.add_challenge(round, "rho");

        round++;
        for (size_t i = 1; i < virtual_log_n; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Gemini:FOLD_" + idx, data_types_per_G);
        }
        manifest_expected.add_challenge(round, "Gemini:r");
        round++;
        for (size_t i = 1; i <= virtual_log_n; ++i) {
            std::string idx = std::to_string(i);
            manifest_expected.add_entry(round, "Gemini:a_" + idx, data_types_per_Frs);
        }

        if constexpr (Flavor::HasZK) {
            manifest_expected.add_entry(round, "Libra:concatenation_eval", data_types_per_Frs);
            manifest_expected.add_entry(round, "Libra:shifted_grand_sum_eval", data_types_per_Frs);
            manifest_expected.add_entry(round, "Libra:grand_sum_eval", data_types_per_Frs);
            manifest_expected.add_entry(round, "Libra:quotient_eval", data_types_per_Frs);
        }

        manifest_expected.add_challenge(round, "Shplonk:nu");
        round++;
        manifest_expected.add_entry(round, "Shplonk:Q", data_types_per_G);
        manifest_expected.add_challenge(round, "Shplonk:z");

        round++;
        manifest_expected.add_entry(round, "KZG:W", data_types_per_G);

        return manifest_expected;
    }

    void generate_test_circuit(Builder& builder)
    {
        FF a = 1;
        builder.add_variable(a);
        builder.add_public_variable(a);
        IO::add_default(builder);
    }

    Proof export_serialized_proof(Prover& prover, const size_t num_public_inputs, const size_t log_n)
    {
        // reset internal variables needed for exporting the proof
        // Note: this excludes IPA proof length since export_proof appends it separately
        size_t proof_length = ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n) + num_public_inputs;
        prover.get_transcript()->test_set_proof_parsing_state(0, proof_length);
        return prover.export_proof();
    }
};

TYPED_TEST_SUITE(HonkTranscriptTests, FlavorTypes);

/**
 * @brief Ensure consistency between the manifest hard coded in this testing suite and the one generated by the
 * standard honk prover over the course of proof construction.
 */
TYPED_TEST(HonkTranscriptTests, ProverManifestConsistency)
{
    // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
    auto builder = typename TestFixture::Builder();
    TestFixture::generate_test_circuit(builder);

    // Automatically generate a transcript manifest by constructing a proof
    auto prover_instance = std::make_shared<typename TestFixture::ProverInstance>(builder);
    auto verification_key = std::make_shared<typename TestFixture::VerificationKey>(prover_instance->get_precomputed());
    typename TestFixture::Prover prover(prover_instance, verification_key);
    prover.get_transcript()->enable_manifest();
    auto proof = prover.construct_proof();

    // Check that the prover generated manifest agrees with the manifest hard coded in this suite
    auto manifest_expected = TestFixture::construct_honk_manifest(prover.log_dyadic_size());
    auto prover_manifest = prover.get_transcript()->get_manifest();
    // Note: a manifest can be printed using manifest.print()
    manifest_expected.print();
    prover_manifest.print();
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
 * @brief Ensure consistency between the manifest generated by the honk prover over the course of proof
 * construction and the one generated by the verifier over the course of proof verification.
 */
TYPED_TEST(HonkTranscriptTests, VerifierManifestConsistency)
{
    // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
    auto builder = typename TestFixture::Builder();
    TestFixture::generate_test_circuit(builder);

    // Automatically generate a transcript manifest in the prover by constructing a proof
    auto prover_instance = std::make_shared<typename TestFixture::ProverInstance>(builder);
    auto verification_key = std::make_shared<typename TestFixture::VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<typename TypeParam::VKAndHash>(verification_key);
    typename TestFixture::Prover prover(prover_instance, verification_key);
    prover.get_transcript()->enable_manifest();
    auto proof = prover.construct_proof();

    // Automatically generate a transcript manifest in the verifier by verifying a proof
    auto verifier_transcript = std::make_shared<typename TypeParam::Transcript>();
    verifier_transcript->enable_manifest();
    typename TestFixture::Verifier verifier(vk_and_hash, verifier_transcript);
    [[maybe_unused]] auto _ = verifier.verify_proof(proof);

    // Check consistency between the manifests generated by the prover and verifier
    auto prover_manifest = prover.get_transcript()->get_manifest();
    auto verifier_manifest = verifier.get_transcript()->get_manifest();

    // Note: a manifest can be printed using manifest.print()
    ASSERT_GT(prover_manifest.size(), 0);
    for (size_t round = 0; round < prover_manifest.size(); ++round) {
        ASSERT_EQ(prover_manifest[round], verifier_manifest[round])
            << "Prover/Verifier manifest discrepency in round " << round;
    }
}

/**
 * @brief Check that multiple challenges can be generated and sanity check
 * @details We generate 6 challenges that are each 128 bits, and check that they are not 0.
 */
TYPED_TEST(HonkTranscriptTests, ChallengeGenerationTest)
{
    using Flavor = TypeParam;
    using FF = Flavor::FF;
    // initialized with random value sent to verifier
    auto transcript = TypeParam::Transcript::test_prover_init_empty();
    // test a bunch of challenges
    std::vector<std::string> challenge_labels{ "a", "b", "c", "d", "e", "f" };
    auto challenges = transcript->template get_challenges<FF>(challenge_labels);
    // check they are not 0
    for (size_t i = 0; i < challenges.size(); ++i) {
        ASSERT_NE(challenges[i], 0) << "Challenge " << i << " is 0";
    }
    constexpr uint32_t random_val{ 17 }; // arbitrary
    transcript->send_to_verifier("random val", random_val);
    // test more challenges
    challenge_labels = { "a", "b", "c" };
    challenges = transcript->template get_challenges<FF>(challenge_labels);
    ASSERT_NE(challenges[0], 0) << "Challenge a is 0";
    ASSERT_NE(challenges[1], 0) << "Challenge b is 0";
    ASSERT_NE(challenges[2], 0) << "Challenge c is 0";
}

TYPED_TEST(HonkTranscriptTests, StructureTest)
{
    using Flavor = TypeParam;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    // Construct a simple circuit of size n = 8 (i.e. the minimum circuit size)
    auto builder = typename TestFixture::Builder();
    TestFixture::generate_test_circuit(builder);

    // Automatically generate a transcript manifest by constructing a proof
    auto prover_instance = std::make_shared<typename TestFixture::ProverInstance>(builder);
    auto verification_key = std::make_shared<typename TestFixture::VerificationKey>(prover_instance->get_precomputed());
    auto vk_and_hash = std::make_shared<typename TypeParam::VKAndHash>(verification_key);
    typename TestFixture::Prover prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();
    typename TestFixture::Verifier verifier(vk_and_hash);
    EXPECT_TRUE(verifier.verify_proof(proof).result);

    const size_t virtual_log_n = Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : prover_instance->log_dyadic_size();

    // Use StructuredProof test utility to deserialize/serialize proof data
    StructuredProof<Flavor> proof_structure;

    // try deserializing and serializing with no changes and check proof is still valid
    proof_structure.deserialize(
        prover.get_transcript()->test_get_proof_data(), verification_key->num_public_inputs, virtual_log_n);
    proof_structure.serialize(prover.get_transcript()->test_get_proof_data(), virtual_log_n);

    proof = TestFixture::export_serialized_proof(prover, prover_instance->num_public_inputs(), virtual_log_n);
    // we have changed nothing so proof is still valid
    typename TestFixture::Verifier verifier2(vk_and_hash);
    EXPECT_TRUE(verifier2.verify_proof(proof).result);

    Commitment one_group_val = Commitment::one();
    FF rand_val = FF::random_element();
    proof_structure.z_perm_comm = one_group_val * rand_val; // choose random object to modify
    proof = TestFixture::export_serialized_proof(prover, prover_instance->num_public_inputs(), virtual_log_n);
    // we have not serialized it back to the proof so it should still be fine
    typename TestFixture::Verifier verifier3(vk_and_hash);
    EXPECT_TRUE(verifier3.verify_proof(proof).result);

    proof_structure.serialize(prover.get_transcript()->test_get_proof_data(), virtual_log_n);
    proof = TestFixture::export_serialized_proof(prover, prover_instance->num_public_inputs(), virtual_log_n);
    // the proof is now wrong after serializing it
    typename TestFixture::Verifier verifier4(vk_and_hash);
    EXPECT_FALSE(verifier4.verify_proof(proof).result);

    proof_structure.deserialize(
        prover.get_transcript()->test_get_proof_data(), verification_key->num_public_inputs, virtual_log_n);
    EXPECT_EQ(static_cast<Commitment>(proof_structure.z_perm_comm), one_group_val * rand_val);
}
