#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/test_utils.hpp"
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
    using RecursiveVerifierAccumulator = RecursiveHypernovaVerifier::Accumulator;

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

    /**
     * @brief Test helper to create a recursive verifier instance from a native one
     * @details Converts all fields from native to stdlib types for recursive verification testing
     */
    static std::shared_ptr<RecursiveVerifierInstance> create_recursive_verifier_instance(
        Builder* builder, const std::shared_ptr<NativeVerifierInstance>& native_instance)
    {
        using FF = RecursiveFlavor::FF;
        using Commitment = RecursiveFlavor::Commitment;
        using VerificationKey = RecursiveFlavor::VerificationKey;
        using VKAndHash = RecursiveFlavor::VKAndHash;

        // Create recursive VK from native VK
        auto recursive_vk =
            std::make_shared<VKAndHash>(std::make_shared<VerificationKey>(builder, native_instance->get_vk()),
                                        FF::from_witness(builder, native_instance->get_vk()->hash()));

        // Create recursive instance with the recursive VK
        auto recursive_instance = std::make_shared<RecursiveVerifierInstance>(recursive_vk);

        // Convert alpha
        recursive_instance->alpha = FF::from_witness(builder, native_instance->alpha);

        // Convert witness commitments
        auto native_comms = native_instance->witness_commitments.get_all();
        for (auto [native_comm, recursive_comm] :
             zip_view(native_comms, recursive_instance->witness_commitments.get_all())) {
            recursive_comm = Commitment::from_witness(builder, native_comm);
        }

        // Convert gate challenges
        recursive_instance->gate_challenges = std::vector<FF>(native_instance->gate_challenges.size());
        for (auto [native_challenge, recursive_challenge] :
             zip_view(native_instance->gate_challenges, recursive_instance->gate_challenges)) {
            recursive_challenge = FF::from_witness(builder, native_challenge);
        }

        // Convert relation parameters
        recursive_instance->relation_parameters.eta =
            FF::from_witness(builder, native_instance->relation_parameters.eta);
        recursive_instance->relation_parameters.eta_two =
            FF::from_witness(builder, native_instance->relation_parameters.eta_two);
        recursive_instance->relation_parameters.eta_three =
            FF::from_witness(builder, native_instance->relation_parameters.eta_three);
        recursive_instance->relation_parameters.beta =
            FF::from_witness(builder, native_instance->relation_parameters.beta);
        recursive_instance->relation_parameters.gamma =
            FF::from_witness(builder, native_instance->relation_parameters.gamma);
        recursive_instance->relation_parameters.public_input_delta =
            FF::from_witness(builder, native_instance->relation_parameters.public_input_delta);

        // For ZK flavors: convert gemini_masking_commitment
        if constexpr (NativeFlavor::HasZK) {
            recursive_instance->gemini_masking_commitment =
                Commitment::from_witness(builder, native_instance->gemini_masking_commitment);
        }

        return recursive_instance;
    }

    static void tampering(std::shared_ptr<ProverInstance>& instance, const TamperingMode& mode)
    {
        switch (mode) {
        case TamperingMode::None:
            break;
        case TamperingMode::Instance: {
            // Tamper with w_l at the first row where q_arith is non-zero (an active arithmetic gate).
            auto& q_arith = instance->polynomials.q_arith();
            for (size_t i = ProverInstance::TRACE_OFFSET; i < q_arith.end_index(); i++) {
                if (!q_arith[i].is_zero()) {
                    instance->polynomials.w_l().at(i) = NativeFF::random_element();
                    break;
                }
            }
        } break;
        }
    };

    /**
     * @brief Build the expected transcript manifest for HyperNova folding
     * @details The manifest has 53 rounds total:
     * - Oink (rounds 0-2): vk_hash, public inputs, wires, ECC ops, databus, lookup, inverses
     * - Main sumcheck (rounds 3-26): gate_challenge, univariates
     * - Main sumcheck batching (round 27): unshifted/shifted batching challenges + evaluations + MLB alpha
     * - MLB sumcheck (rounds 28-51): univariates
     * - MLB final (round 52): final evaluations + claim_batching_challenge
     */
    static TranscriptManifest build_expected_folding_manifest()
    {
        TranscriptManifest manifest;
        constexpr size_t frs_per_G = FrCodec::calc_num_fields<curve::BN254::AffineElement>();
        constexpr size_t NUM_SUMCHECK_UNIVARIATES = NativeFlavor::VIRTUAL_LOG_N;

        size_t round = 0;

        // Round 0: Oink preamble + wires + ECC ops + databus -> eta challenge
        manifest.add_challenge(round, "eta");
        manifest.add_entry(round, "vk_hash", 1);
        for (size_t i = 0; i < 4; ++i) {
            manifest.add_entry(round, "public_input_" + std::to_string(i), 1);
        }
        for (const auto& wire : { "W_L", "W_R", "W_O" }) {
            manifest.add_entry(round, wire, frs_per_G);
        }
        for (const auto& wire : { "ECC_OP_WIRE_1", "ECC_OP_WIRE_2", "ECC_OP_WIRE_3", "ECC_OP_WIRE_4" }) {
            manifest.add_entry(round, wire, frs_per_G);
        }
        for (const auto& bus :
             { "KERNEL_CALLDATA", "FIRST_APP_CALLDATA", "SECOND_APP_CALLDATA", "THIRD_APP_CALLDATA", "RETURN_DATA" }) {
            manifest.add_entry(round, bus, frs_per_G);
            manifest.add_entry(round, std::string(bus) + "_READ_COUNTS", frs_per_G);
        }
        round++;

        // Round 1: lookup + w_4 -> beta, gamma challenges
        manifest.add_challenge(round, std::array{ "beta", "gamma" });
        manifest.add_entry(round, "LOOKUP_READ_COUNTS", frs_per_G);
        manifest.add_entry(round, "LOOKUP_READ_TAGS", frs_per_G);
        manifest.add_entry(round, "W_4", frs_per_G);
        round++;

        // Round 2: inverses + z_perm -> alpha + gate_challenge (consecutive challenges in same round)
        manifest.add_challenge(round, "alpha");
        manifest.add_challenge(round, "HypernovaFoldingProver:gate_challenge");
        manifest.add_entry(round, "LOOKUP_INVERSES", frs_per_G);
        for (const auto& bus :
             { "KERNEL_CALLDATA", "FIRST_APP_CALLDATA", "SECOND_APP_CALLDATA", "THIRD_APP_CALLDATA", "RETURN_DATA" }) {
            manifest.add_entry(round, std::string(bus) + "_INVERSES", frs_per_G);
        }
        manifest.add_entry(round, "Z_PERM", frs_per_G);
        round++;

        // Rounds 3-23: main sumcheck univariates (21 rounds)
        for (size_t i = 0; i < NUM_SUMCHECK_UNIVARIATES; ++i) {
            manifest.add_challenge(round, "Sumcheck:u_" + std::to_string(i));
            manifest.add_entry(round, "Sumcheck:univariate_" + std::to_string(i), 8);
            round++;
        }

        // Next round: unshifted batching challenges + shifted batching challenges + evaluations + MLB alpha.
        // `Sumcheck:alpha` is consecutive with the batching challenges since no new prover data is added in between.
        for (size_t i = 0; i < MegaFlavor::NUM_UNSHIFTED_ENTITIES - 1; ++i) {
            manifest.add_challenge(round, "unshifted_challenge_" + std::to_string(i));
        }
        for (size_t i = 0; i < MegaFlavor::NUM_SHIFTED_ENTITIES - 1; ++i) {
            manifest.add_challenge(round, "shifted_challenge_" + std::to_string(i));
        }
        manifest.add_challenge(round, "Sumcheck:alpha");
        manifest.add_entry(round, "Sumcheck:evaluations", MegaFlavor::NUM_ALL_ENTITIES);
        round++;

        // MLB sumcheck univariates
        for (size_t i = 0; i < NUM_SUMCHECK_UNIVARIATES; ++i) {
            manifest.add_challenge(round, "Sumcheck:u_" + std::to_string(i));
            manifest.add_entry(round, "Sumcheck:univariate_" + std::to_string(i), 4);
            round++;
        }

        // Final evaluations + claim_batching_challenge
        manifest.add_challenge(round, "claim_batching_challenge");
        manifest.add_entry(round, "Sumcheck:evaluations", 6);

        return manifest;
    }

    static void test_folding(const TamperingMode& mode)
    {
        // Generate accumulator
        auto instance = generate_new_instance();
        auto transcript = std::make_shared<NativeTranscript>();

        bb::HypernovaFoldingProver prover(transcript);
        auto accumulator = prover.instance_to_accumulator(instance);
        auto verifier_accumulator = accumulator.to_verifier_claim_for_testing();

        // Folding
        auto incoming_instance = generate_new_instance(5);
        tampering(incoming_instance, mode);
        auto incoming_vk = std::make_shared<NativeVerificationKey>(incoming_instance->get_precomputed());
        auto incoming_verifier_instance =
            std::make_shared<NativeVerifierInstance>(std::make_shared<NativeFlavor::VKAndHash>(incoming_vk));

        auto folding_transcript = std::make_shared<NativeTranscript>();
        HypernovaFoldingProver folding_prover(folding_transcript);
        auto [folding_proof, folded_accumulator] = folding_prover.fold(std::move(accumulator), incoming_instance);

        // Natively verify the folding (with manifest tracking)
        auto native_verifier_transcript = std::make_shared<NativeTranscript>();
        native_verifier_transcript->enable_manifest();
        NativeHypernovaVerifier native_verifier(native_verifier_transcript);
        auto [first_sumcheck_native, second_sumcheck_native, folded_verifier_accumulator_native] =
            native_verifier.verify_folding_proof(incoming_verifier_instance, verifier_accumulator, folding_proof);

        // Recursively verify the folding
        Builder builder;

        auto stdlib_incoming_instance = create_recursive_verifier_instance(&builder, incoming_verifier_instance);
        auto stdlib_accumulator = create_recursive_verifier_accumulator(&builder, verifier_accumulator);
        auto recursive_verifier_transcript = std::make_shared<RecursiveTranscript>();
        RecursiveHypernovaVerifier recursive_verifier(recursive_verifier_transcript);
        RecursiveProof proof(builder, folding_proof);
        auto [first_sumcheck_recursive, second_sumcheck_recursive, folded_verifier_accumulator] =
            recursive_verifier.verify_folding_proof(stdlib_incoming_instance, stdlib_accumulator, proof);

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
