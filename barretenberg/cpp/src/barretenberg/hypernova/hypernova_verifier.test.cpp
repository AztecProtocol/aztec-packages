#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "gtest/gtest.h"

using namespace bb;

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1553): improve testing
class HypernovaFoldingVerifierTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

  public:
    // Recursive verifier
    using RecursiveHypernovaVerifier = HypernovaFoldingVerifier<bb::MegaRecursiveFlavor_<bb::MegaCircuitBuilder>>;
    using RecursiveFlavor = RecursiveHypernovaVerifier::Flavor;
    using RecursiveVerifierInstance = RecursiveHypernovaVerifier::VerifierInstance;
    using Builder = RecursiveFlavor::CircuitBuilder;
    using RecursiveTranscript = RecursiveHypernovaVerifier::Transcript;
    using RecursiveProof = RecursiveHypernovaVerifier::Proof;

    // Native verifier
    using NativeHypernovaVerifier = HypernovaFoldingVerifier<bb::MegaFlavor>;
    using NativeFlavor = NativeHypernovaVerifier::Flavor;
    using NativeFF = NativeFlavor::FF;
    using NativeVerifierAccumulator = NativeHypernovaVerifier::Accumulator;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using NativeVerifierInstance = NativeHypernovaVerifier::VerifierInstance;
    using NativeTranscript = NativeHypernovaVerifier::Transcript;

    // Prover
    using HypernovaFoldingProver = bb::HypernovaFoldingProver;
    using NativeProverAccumulator = HypernovaFoldingProver::Accumulator;
    using ProverInstance = HypernovaFoldingProver::ProverInstance;

    enum class TamperingMode : uint8_t {
        None,
        Instance,
    };

    static std::shared_ptr<ProverInstance> generate_new_instance(size_t log_num_gates = 4)
    {
        Builder builder;

        bb::MockCircuits::add_arithmetic_gates(builder, log_num_gates);
        bb::MockCircuits::add_arithmetic_gates_with_public_inputs(builder);
        bb::MockCircuits::add_lookup_gates(builder);

        auto instance = std::make_shared<ProverInstance>(builder);

        return instance;
    }

    static bool compare_prover_verifier_accumulators(const NativeProverAccumulator& lhs,
                                                     const NativeVerifierAccumulator& rhs)
    {
        for (size_t idx = 0; auto [challenge_lhs, challenge_rhs] : zip_view(lhs.challenge, rhs.challenge)) {
            if (challenge_lhs != challenge_rhs) {
                info("Mismatch in the challenges at index ", idx);
                return false;
            }
        }
        if (lhs.non_shifted_commitment != rhs.non_shifted_commitment) {
            info("Mismatch in the unshifted commitments");
            return false;
        }
        if (lhs.shifted_commitment != rhs.shifted_commitment) {
            info("Mismatch in the shifted commitments");
            return false;
        }
        if (lhs.non_shifted_evaluation != rhs.non_shifted_evaluation) {
            info("Mismatch in the unshifted evaluations");
            return false;
        }
        if (lhs.shifted_evaluation != rhs.shifted_evaluation) {
            info("Mismatch in the shifted evaluations");
            return false;
        }
        return true;
    }

    static void tampering(std::shared_ptr<ProverInstance>& instance, const TamperingMode& mode)
    {
        switch (mode) {
        case TamperingMode::None:
            break;
        case TamperingMode::Instance:
            // Tamper with the instance by changing w_l. This should invalidate the first sumcheck
            instance->polynomials.w_l.at(1) = NativeFF::random_element();
            break;
        }
    };

    /**
     * @brief Build the expected transcript manifest for HyperNova folding
     * @details The manifest has 50 rounds total:
     * - Oink (rounds 0-2): vk_hash, public inputs, wires, ECC ops, databus, lookup, inverses
     * - Main sumcheck (rounds 3-25): gate_challenge, univariates, evaluations + batching challenges
     * - Batching challenges (round 26): shifted challenges
     * - MLB data (round 27): accumulator commitments/challenges/evaluations
     * - MLB sumcheck (rounds 28-49): univariates, final evaluations + claim_batching_challenge
     */
    static TranscriptManifest build_expected_folding_manifest()
    {
        TranscriptManifest manifest;
        constexpr size_t frs_per_G = FrCodec::calc_num_fields<curve::BN254::AffineElement>();
        constexpr size_t NUM_SUMCHECK_UNIVARIATES = NativeFlavor::VIRTUAL_LOG_N; // 21

        // Round 0: Oink preamble + wires + ECC ops + databus
        manifest.add_entry(0, "vk_hash", 1);
        for (size_t i = 0; i < 4; ++i) {
            manifest.add_entry(0, "public_input_" + std::to_string(i), 1);
        }
        for (const auto& wire : { "W_L", "W_R", "W_O" }) {
            manifest.add_entry(0, wire, frs_per_G);
        }
        for (const auto& wire : { "ECC_OP_WIRE_1", "ECC_OP_WIRE_2", "ECC_OP_WIRE_3", "ECC_OP_WIRE_4" }) {
            manifest.add_entry(0, wire, frs_per_G);
        }
        for (const auto& bus : { "CALLDATA", "SECONDARY_CALLDATA", "RETURN_DATA" }) {
            manifest.add_entry(0, bus, frs_per_G);
            manifest.add_entry(0, std::string(bus) + "_READ_COUNTS", frs_per_G);
            manifest.add_entry(0, std::string(bus) + "_READ_TAGS", frs_per_G);
        }
        manifest.add_challenge(0, std::array{ "eta", "eta_two", "eta_three" });

        // Round 1: lookup + w_4
        manifest.add_entry(1, "LOOKUP_READ_COUNTS", frs_per_G);
        manifest.add_entry(1, "LOOKUP_READ_TAGS", frs_per_G);
        manifest.add_entry(1, "W_4", frs_per_G);
        manifest.add_challenge(1, std::array{ "beta", "gamma" });

        // Round 2: inverses + z_perm
        manifest.add_entry(2, "LOOKUP_INVERSES", frs_per_G);
        manifest.add_entry(2, "CALLDATA_INVERSES", frs_per_G);
        manifest.add_entry(2, "SECONDARY_CALLDATA_INVERSES", frs_per_G);
        manifest.add_entry(2, "RETURN_DATA_INVERSES", frs_per_G);
        manifest.add_entry(2, "Z_PERM", frs_per_G);
        manifest.add_challenge(2, "alpha");

        // Round 3: gate challenge
        manifest.add_challenge(3, "HypernovaFoldingProver:gate_challenge");

        // Rounds 4-24: main sumcheck univariates
        for (size_t i = 0; i < NUM_SUMCHECK_UNIVARIATES; ++i) {
            manifest.add_entry(4 + i, "Sumcheck:univariate_" + std::to_string(i), 8);
            manifest.add_challenge(4 + i, "Sumcheck:u_" + std::to_string(i));
        }

        // Round 25: evaluations + unshifted batching challenges
        manifest.add_entry(25, "Sumcheck:evaluations", 60);
        for (size_t i = 0; i < 55; ++i) {
            manifest.add_challenge(25, "unshifted_challenge_" + std::to_string(i));
        }

        // Round 26: shifted batching challenges
        for (size_t i = 0; i < 5; ++i) {
            manifest.add_challenge(26, "shifted_challenge_" + std::to_string(i));
        }

        // Round 27: MLB accumulator data
        manifest.add_entry(27, "non_shifted_accumulator_commitment", frs_per_G);
        manifest.add_entry(27, "shifted_accumulator_commitment", frs_per_G);
        for (size_t i = 0; i < NUM_SUMCHECK_UNIVARIATES; ++i) {
            manifest.add_entry(27, "accumulator_challenge_" + std::to_string(i), 1);
        }
        manifest.add_entry(27, "accumulator_evaluation_0", 1);
        manifest.add_entry(27, "accumulator_evaluation_1", 1);
        manifest.add_challenge(27, "Sumcheck:alpha");

        // Rounds 28-48: MLB sumcheck univariates
        for (size_t i = 0; i < NUM_SUMCHECK_UNIVARIATES; ++i) {
            manifest.add_entry(28 + i, "Sumcheck:univariate_" + std::to_string(i), 4);
            manifest.add_challenge(28 + i, "Sumcheck:u_" + std::to_string(i));
        }

        // Round 49: final evaluations + claim_batching_challenge
        manifest.add_entry(49, "Sumcheck:evaluations", 6);
        manifest.add_challenge(49, "claim_batching_challenge");

        return manifest;
    }

    static void test_folding(const TamperingMode& mode)
    {
        // Generate accumulator
        auto instance = generate_new_instance();
        auto transcript = std::make_shared<NativeTranscript>();

        bb::HypernovaFoldingProver prover(transcript);
        auto accumulator = prover.instance_to_accumulator(instance);

        // Folding
        auto incoming_instance = generate_new_instance(5);
        tampering(incoming_instance, mode);
        auto incoming_vk = std::make_shared<NativeVerificationKey>(incoming_instance->get_precomputed());
        auto incoming_verifier_instance = std::make_shared<NativeVerifierInstance>(incoming_vk);

        auto folding_transcript = std::make_shared<NativeTranscript>();
        HypernovaFoldingProver folding_prover(folding_transcript);
        auto [folding_proof, folded_accumulator] = folding_prover.fold(accumulator, incoming_instance);

        // Natively verify the folding (with manifest tracking)
        auto native_verifier_transcript = std::make_shared<NativeTranscript>();
        native_verifier_transcript->enable_manifest();
        NativeHypernovaVerifier native_verifier(native_verifier_transcript);
        auto [first_sumcheck_native, second_sumcheck_native, folded_verifier_accumulator_native] =
            native_verifier.verify_folding_proof(incoming_verifier_instance, folding_proof);

        // Recursively verify the folding
        Builder builder;

        auto stdlib_incoming_instance =
            std::make_shared<RecursiveVerifierInstance>(&builder, incoming_verifier_instance);
        auto recursive_verifier_transcript = std::make_shared<RecursiveTranscript>();
        RecursiveHypernovaVerifier recursive_verifier(recursive_verifier_transcript);
        RecursiveProof proof(builder, folding_proof);
        auto [first_sumcheck_recursive, second_sumcheck_recursive, folded_verifier_accumulator] =
            recursive_verifier.verify_folding_proof(stdlib_incoming_instance, proof);

        // If the instance has been tampered with, then the first sumcheck should fail (hence the circuit is not
        // satisfied), but the second should pass
        EXPECT_EQ(bb::CircuitChecker::check(builder), mode == TamperingMode::None);
        EXPECT_EQ(first_sumcheck_recursive, mode == TamperingMode::None);
        EXPECT_EQ(first_sumcheck_recursive, first_sumcheck_native);
        EXPECT_TRUE(second_sumcheck_recursive);
        EXPECT_EQ(second_sumcheck_recursive, second_sumcheck_native);
        EXPECT_TRUE(compare_prover_verifier_accumulators(
            folded_accumulator, folded_verifier_accumulator.get_value<NativeVerifierAccumulator>()));

        // Pin the folding transcript manifest (only check when not tampering)
        if (mode == TamperingMode::None) {
            auto expected_manifest = build_expected_folding_manifest();
            auto verifier_manifest = native_verifier_transcript->get_manifest();
            EXPECT_EQ(verifier_manifest, expected_manifest);
        }
    }
};

TEST_F(HypernovaFoldingVerifierTests, Fold)
{
    test_folding(TamperingMode::None);
}

TEST_F(HypernovaFoldingVerifierTests, TamperInstance)
{
    BB_DISABLE_ASSERTS();
    test_folding(TamperingMode::Instance);
}
