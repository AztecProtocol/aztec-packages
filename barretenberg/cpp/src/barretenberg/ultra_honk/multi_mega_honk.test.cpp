#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>

#include "barretenberg/common/log.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
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
