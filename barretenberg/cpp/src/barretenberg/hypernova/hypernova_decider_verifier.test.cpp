#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/hypernova/hypernova_decider_prover.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/transcript/transcript_manifest.hpp"
#include "gtest/gtest.h"

using namespace bb;

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1553): improve testing
class HypernovaDeciderVerifierTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

  public:
    // Recursive decider verifier
    using RecursiveHypernovaDeciderVerifier =
        HypernovaDeciderVerifier<bb::MegaRecursiveFlavor_<bb::MegaCircuitBuilder>>;
    using RecursiveFlavor = RecursiveHypernovaDeciderVerifier::Flavor;
    using Builder = RecursiveFlavor::CircuitBuilder;
    using RecursiveTranscript = RecursiveHypernovaDeciderVerifier::Transcript;
    using RecursiveProof = RecursiveHypernovaDeciderVerifier::Proof;

    // Native decider verifier
    using NativeHypernovaDeciderVerifier = HypernovaDeciderVerifier<bb::MegaFlavor>;
    using NativeFlavor = NativeHypernovaDeciderVerifier::Flavor;
    using CommitmentKey = NativeFlavor::CommitmentKey;
    using NativeFF = NativeFlavor::FF;
    using NativeVerifierAccumulator = NativeHypernovaDeciderVerifier::Accumulator;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using NativeTranscript = NativeHypernovaDeciderVerifier::Transcript;

    // Provers
    using HypernovaFoldingProver = bb::HypernovaFoldingProver;
    using NativeProverAccumulator = HypernovaFoldingProver::Accumulator;
    using ProverInstance = HypernovaFoldingProver::ProverInstance;
    using HypernovaDeciderProver = bb::HypernovaDeciderProver;

    // Recursive Verifier
    using RecursiveHypernovaVerifier = HypernovaFoldingVerifier<RecursiveFlavor>;
    using RecursiveVerifierInstance = RecursiveHypernovaVerifier::VerifierInstance;

    // Native Verifier
    using NativeHypernovaVerifier = HypernovaFoldingVerifier<NativeFlavor>;
    using NativeVerifierInstance = NativeHypernovaVerifier::VerifierInstance;

    enum class TamperingMode : uint8_t { None, Accumulator, Instance, FoldedAccumulator };

    /**
     * @brief Build the expected transcript manifest for HyperNova decider
     * @details Manifest tracking is enabled after folding (which uses 50 rounds), so only
     * decider rounds are tracked. Round numbers continue from folding:
     * - Round 50: rho challenge (batching for Gemini)
     * - Round 51: Gemini FOLD commitments -> Gemini:r challenge
     * - Round 52: Gemini evaluations -> Shplonk:nu challenge
     * - Round 53: Shplonk:Q commitment -> Shplonk:z challenge
     * - Round 54: KZG:W commitment -> KZG:masking_challenge
     */
    static TranscriptManifest build_expected_decider_manifest()
    {
        TranscriptManifest manifest;
        constexpr size_t frs_per_G = FrCodec::calc_num_fields<curve::BN254::AffineElement>();
        constexpr size_t NUM_GEMINI_FOLDS = NativeFlavor::VIRTUAL_LOG_N - 1; // 20
        constexpr size_t NUM_GEMINI_EVALS = NativeFlavor::VIRTUAL_LOG_N;     // 21
        constexpr size_t FOLDING_ROUNDS = 50;                                // Rounds used by folding verifier

        // Round 50: rho challenge
        manifest.add_challenge(FOLDING_ROUNDS, "rho");

        // Round 51: Gemini FOLD commitments -> Gemini:r
        for (size_t i = 1; i <= NUM_GEMINI_FOLDS; ++i) {
            manifest.add_entry(FOLDING_ROUNDS + 1, "Gemini:FOLD_" + std::to_string(i), frs_per_G);
        }
        manifest.add_challenge(FOLDING_ROUNDS + 1, "Gemini:r");

        // Round 52: Gemini evaluations -> Shplonk:nu
        for (size_t i = 1; i <= NUM_GEMINI_EVALS; ++i) {
            manifest.add_entry(FOLDING_ROUNDS + 2, "Gemini:a_" + std::to_string(i), 1);
        }
        manifest.add_challenge(FOLDING_ROUNDS + 2, "Shplonk:nu");

        // Round 53: Shplonk:Q -> Shplonk:z
        manifest.add_entry(FOLDING_ROUNDS + 3, "Shplonk:Q", frs_per_G);
        manifest.add_challenge(FOLDING_ROUNDS + 3, "Shplonk:z");

        // Round 54: KZG:W -> KZG:masking_challenge
        manifest.add_entry(FOLDING_ROUNDS + 4, "KZG:W", frs_per_G);
        manifest.add_challenge(FOLDING_ROUNDS + 4, "KZG:masking_challenge");

        return manifest;
    }

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
        size_t comm_idx = 0;
        for (auto& comm : recursive_instance->witness_commitments.get_all()) {
            comm = Commitment::from_witness(builder, native_comms[comm_idx]);
            comm_idx++;
        }

        // Convert gate challenges
        recursive_instance->gate_challenges = std::vector<FF>(native_instance->gate_challenges.size());
        size_t challenge_idx = 0;
        for (auto& challenge : recursive_instance->gate_challenges) {
            challenge = FF::from_witness(builder, native_instance->gate_challenges[challenge_idx]);
            challenge_idx++;
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

    static void tamper_with_accumulator(NativeProverAccumulator& accumulator, const TamperingMode& mode)
    {
        switch (mode) {
        case TamperingMode::None:
        case TamperingMode::Instance:
            break;
        case TamperingMode::Accumulator:
            // Tamper with the accumulator by changing the challenge, this should invalidate the decider proof but not
            // the folding
            accumulator.challenge[0] = NativeFF::random_element();
            break;
        case TamperingMode::FoldedAccumulator:
            // Tamper the folded accumulator by changing one commitment, this should invalidate the PCS but not the
            // folding.
            accumulator.non_shifted_commitment =
                accumulator.non_shifted_commitment + NativeFlavor::Curve::AffineElement::one();
            break;
        }
    };

    static void tamper_with_instance(std::shared_ptr<ProverInstance>& instance, const TamperingMode& mode)
    {
        switch (mode) {
        case TamperingMode::None:
        case TamperingMode::Accumulator:
        case TamperingMode::FoldedAccumulator:
            break;
        case TamperingMode::Instance:
            // Tamper with the instance by changing w_l. This should invalidate the first sumcheck
            instance->polynomials.w_l.at(1) = NativeFF::random_element();
            break;
        }
    };

    static void test_decider(const TamperingMode& mode)
    {
        // Generate accumulator
        auto instance = generate_new_instance();
        auto transcript = std::make_shared<NativeTranscript>();

        HypernovaFoldingProver prover(transcript);
        auto accumulator = prover.instance_to_accumulator(instance);
        tamper_with_accumulator(accumulator, mode);

        // Folding
        auto incoming_instance = generate_new_instance(5);
        tamper_with_instance(incoming_instance, mode);

        auto incoming_vk = std::make_shared<NativeVerificationKey>(incoming_instance->get_precomputed());
        auto incoming_verifier_instance =
            std::make_shared<NativeVerifierInstance>(std::make_shared<NativeFlavor::VKAndHash>(incoming_vk));

        auto prover_transcript = std::make_shared<NativeTranscript>();
        HypernovaFoldingProver folding_prover(prover_transcript);
        auto [folding_proof, folded_accumulator] = folding_prover.fold(accumulator, incoming_instance);
        tamper_with_accumulator(folded_accumulator, mode);

        // Construct Decider proof
        auto ck = CommitmentKey(folded_accumulator.dyadic_size);
        HypernovaDeciderProver decider_prover(prover_transcript);
        auto decider_proof = decider_prover.construct_proof(ck, folded_accumulator);

        // Natively verify the folding
        auto native_transcript = std::make_shared<NativeTranscript>();
        NativeHypernovaVerifier native_verifier(native_transcript);
        auto [first_sumcheck_native, second_sumcheck_native, folded_verifier_accumulator_native] =
            native_verifier.verify_folding_proof(incoming_verifier_instance, folding_proof);

        // Enable manifest tracking before decider verification
        native_transcript->enable_manifest();

        // Natively verify the decider proof
        NativeHypernovaDeciderVerifier decider_verifier(native_transcript);
        auto native_pairing_points = decider_verifier.verify_proof(folded_verifier_accumulator_native, decider_proof);
        bool native_verified = native_pairing_points.check();

        // Recursively verify the folding
        Builder builder;

        auto stdlib_incoming_instance = create_recursive_verifier_instance(&builder, incoming_verifier_instance);
        auto recursive_verifier_transcript = std::make_shared<RecursiveTranscript>();
        RecursiveHypernovaVerifier recursive_verifier(recursive_verifier_transcript);
        RecursiveProof proof(builder, folding_proof);
        auto [first_sumcheck_recursive, second_sumcheck_recursive, folded_verifier_accumulator] =
            recursive_verifier.verify_folding_proof(stdlib_incoming_instance, proof);

        // Recursively verify the Decider proof
        RecursiveProof stdlib_proof(builder, decider_proof);
        RecursiveHypernovaDeciderVerifier recursive_decider_verifier(recursive_verifier_transcript);
        auto recursive_pairing_points =
            recursive_decider_verifier.verify_proof(folded_verifier_accumulator, stdlib_proof);

        // Natively verify pairing points
        auto P0 = recursive_pairing_points.P0.get_value();
        auto P1 = recursive_pairing_points.P1.get_value();
        NativeHypernovaDeciderVerifier::PairingPoints pp(P0, P1);
        auto recursive_verified = pp.check();

        // The circuit is valid if and only if we have not tampered or we have tampered the folded accumulator
        EXPECT_EQ(bb::CircuitChecker::check(builder),
                  mode == TamperingMode::None || mode == TamperingMode::FoldedAccumulator);
        // Pairing point verification should pass as long as we have not tampered the folded accumulator or the
        // accumulator
        EXPECT_EQ(recursive_verified, mode != TamperingMode::FoldedAccumulator && mode != TamperingMode::Accumulator);
        EXPECT_EQ(recursive_verified, native_verified);
        // First sumcheck fails if the instance has been tampered with
        EXPECT_EQ(first_sumcheck_recursive, mode != TamperingMode::Instance);
        EXPECT_EQ(first_sumcheck_recursive, first_sumcheck_native);
        // Second sumcheck fails if the accumulator has been tampered with
        EXPECT_EQ(second_sumcheck_recursive, mode != TamperingMode::Accumulator);
        EXPECT_EQ(second_sumcheck_recursive, second_sumcheck_native);

        // Pin the decider transcript manifest (only check when not tampering)
        if (mode == TamperingMode::None) {
            auto expected_manifest = build_expected_decider_manifest();
            auto verifier_manifest = native_transcript->get_manifest();
            EXPECT_EQ(verifier_manifest, expected_manifest);
        }
    }
};

TEST_F(HypernovaDeciderVerifierTests, NoTampering)
{
    test_decider(TamperingMode::None);
}

TEST_F(HypernovaDeciderVerifierTests, TamperWithAccumulator)
{
    BB_DISABLE_ASSERTS();
    test_decider(TamperingMode::Accumulator);
}

TEST_F(HypernovaDeciderVerifierTests, TamperWithInstance)
{
    BB_DISABLE_ASSERTS();
    test_decider(TamperingMode::Instance);
}

TEST_F(HypernovaDeciderVerifierTests, TamperWithFoldedAccumulator)
{
    test_decider(TamperingMode::FoldedAccumulator);
}
