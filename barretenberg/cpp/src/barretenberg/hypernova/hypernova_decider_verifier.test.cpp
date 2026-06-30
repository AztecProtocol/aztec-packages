#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/hypernova/hypernova_decider_prover.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/hypernova/test_utils.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/transcript/transcript_manifest.hpp"
#include "gtest/gtest.h"

#include <optional>
#include <vector>

using namespace bb;

// Folds a "previous accumulator + one instance" group (a 2-claim fold), then runs the HyperNova decider on the
// resulting accumulator both natively and recursively. The folding-specific failure modes (instance tampering) are
// covered in hypernova_verifier.test.cpp; here we cover the decider's binding to the folded accumulator and pin the
// decider transcript manifest.
class HypernovaDeciderVerifierTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

  public:
    using NativeFlavor = bb::MegaKernelFlavor;
    using RecursiveFlavor = bb::MegaKernelRecursiveFlavor;
    using Builder = RecursiveFlavor::CircuitBuilder;
    using NativeFF = NativeFlavor::FF;

    using ProverInstance = ProverInstance_<NativeFlavor>;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using NativeVerifierInstance = VerifierInstance_<NativeFlavor>;
    using RecursiveVerifierInstance = VerifierInstance_<RecursiveFlavor>;

    using FoldingProver = bb::HypernovaFoldingProver;
    using ProverAccumulator = FoldingProver::Accumulator;
    using DeciderProver = bb::HypernovaDeciderProver;
    using NativeDeciderVerifier = HypernovaDeciderVerifier<NativeFlavor>;
    using RecursiveDeciderVerifier = HypernovaDeciderVerifier<RecursiveFlavor>;
    using NativeVerifier = HypernovaFoldingNativeVerifier;
    using RecursiveVerifier = HypernovaFoldingRecursiveVerifier;
    using NativeVerifierAccumulator = NativeVerifier::Accumulator;
    using NativeTranscript = NativeVerifier::Transcript;
    using RecursiveTranscript = RecursiveVerifier::Transcript;

    static constexpr size_t LOG_NUM_GATES = 4;

    enum class TamperingMode : uint8_t { None, FoldedAccumulator };

    /**
     * @brief Build the expected transcript manifest for the HyperNova decider.
     * @details Manifest tracking is enabled after folding, so only decider rounds are tracked. Since the last folding
     * round ends with a challenge (claim_merge_challenge), and the decider starts with a challenge (rho), they share a
     * round:
     * - Round LAST_FOLDING_ROUND: rho challenge
     * - Round LAST_FOLDING_ROUND+1: Gemini FOLD commitments -> Gemini:r challenge
     * - Round LAST_FOLDING_ROUND+2: Gemini evaluations -> Shplonk:nu challenge
     * - Round LAST_FOLDING_ROUND+3: Shplonk:Q commitment -> Shplonk:z challenge
     * - Round LAST_FOLDING_ROUND+4: KZG:W commitment
     */
    static TranscriptManifest build_expected_decider_manifest()
    {
        TranscriptManifest manifest;
        constexpr size_t frs_per_G = FrCodec::calc_num_fields<curve::BN254::AffineElement>();
        constexpr size_t NUM_GEMINI_FOLDS = NativeFlavor::VIRTUAL_LOG_N - 1;
        constexpr size_t NUM_GEMINI_EVALS = NativeFlavor::VIRTUAL_LOG_N;
        constexpr size_t LAST_FOLDING_ROUND = (2 * NativeFlavor::VIRTUAL_LOG_N) + 4;

        // rho challenge (same round as the folding's final challenge)
        manifest.add_challenge(LAST_FOLDING_ROUND, "rho");

        // Gemini FOLD commitments -> Gemini:r
        for (size_t i = 1; i <= NUM_GEMINI_FOLDS; ++i) {
            manifest.add_entry(LAST_FOLDING_ROUND + 1, "Gemini:FOLD_" + std::to_string(i), frs_per_G);
        }
        manifest.add_challenge(LAST_FOLDING_ROUND + 1, "Gemini:r");

        // Gemini evaluations -> Shplonk:nu
        for (size_t i = 1; i <= NUM_GEMINI_EVALS; ++i) {
            manifest.add_entry(LAST_FOLDING_ROUND + 2, "Gemini:a_" + std::to_string(i), 1);
        }
        manifest.add_challenge(LAST_FOLDING_ROUND + 2, "Shplonk:nu");

        // Shplonk:Q -> Shplonk:z
        manifest.add_entry(LAST_FOLDING_ROUND + 3, "Shplonk:Q", frs_per_G);
        manifest.add_challenge(LAST_FOLDING_ROUND + 3, "Shplonk:z");

        // KZG:W
        manifest.add_entry(LAST_FOLDING_ROUND + 4, "KZG:W", frs_per_G);

        return manifest;
    }

    static std::shared_ptr<ProverInstance> generate_new_instance(size_t log_num_gates = LOG_NUM_GATES)
    {
        Builder builder;
        bb::MockCircuits::add_arithmetic_gates(builder, log_num_gates);
        bb::MockCircuits::add_arithmetic_gates_with_public_inputs(builder);
        bb::MockCircuits::add_lookup_gates(builder);
        return std::make_shared<ProverInstance>(builder);
    }

    static std::shared_ptr<RecursiveVerifierInstance> create_recursive_verifier_instance(
        Builder* builder, const std::shared_ptr<NativeVerifierInstance>& native_instance)
    {
        using FF = RecursiveFlavor::FF;
        using Commitment = RecursiveFlavor::Commitment;
        using VerificationKey = RecursiveFlavor::VerificationKey;
        using VKAndHash = RecursiveFlavor::VKAndHash;

        auto recursive_vk =
            std::make_shared<VKAndHash>(std::make_shared<VerificationKey>(builder, native_instance->get_vk()),
                                        FF::from_witness(builder, native_instance->get_vk()->hash()));
        auto recursive_instance = std::make_shared<RecursiveVerifierInstance>(recursive_vk);

        recursive_instance->alpha = FF::from_witness(builder, native_instance->alpha);
        auto native_comms = native_instance->witness_commitments.get_all();
        for (auto [native_comm, recursive_comm] :
             zip_view(native_comms, recursive_instance->witness_commitments.get_all())) {
            recursive_comm = Commitment::from_witness(builder, native_comm);
        }
        recursive_instance->gate_challenges = std::vector<FF>(native_instance->gate_challenges.size());
        for (auto [native_challenge, recursive_challenge] :
             zip_view(native_instance->gate_challenges, recursive_instance->gate_challenges)) {
            recursive_challenge = FF::from_witness(builder, native_challenge);
        }
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
        if constexpr (NativeFlavor::HasZK) {
            recursive_instance->gemini_masking_commitment =
                Commitment::from_witness(builder, native_instance->gemini_masking_commitment);
        }
        return recursive_instance;
    }

    /**
     * @brief Build a valid previous accumulator (a single-instance fold) on a separate, discarded transcript.
     */
    static ProverAccumulator make_previous_accumulator()
    {
        auto transcript = std::make_shared<NativeTranscript>();
        FoldingProver prover(transcript);
        prover.accumulate_instance<NativeFlavor>(generate_new_instance());
        auto [_proof, accumulator] = prover.finalize();
        return accumulator;
    }

    static void test_decider(TamperingMode mode)
    {
        // Previous accumulator (claim 0) folded with one incoming instance (claim 1): a 2-claim fold.
        ProverAccumulator previous_prover_accumulator = make_previous_accumulator();
        NativeVerifierAccumulator previous_native_accumulator =
            previous_prover_accumulator.to_verifier_claim_for_testing();

        auto incoming_instance = generate_new_instance(5);
        auto incoming_vk = std::make_shared<NativeVerificationKey>(incoming_instance->get_precomputed());

        // ---- Prover: fold, then construct the decider proof on the folded accumulator ----
        auto prover_transcript = std::make_shared<NativeTranscript>();
        FoldingProver prover(prover_transcript);
        HonkProof instance_proof = prover.accumulate_instance<NativeFlavor>(incoming_instance, incoming_vk);
        auto [batch_proof, prover_accumulator] = prover.finalize(previous_prover_accumulator);

        // Tamper the folded accumulator's polynomial after folding but before the decider: the decider proof then
        // opens to a value inconsistent with the (honest) committed accumulator the verifier reconstructs.
        if (mode == TamperingMode::FoldedAccumulator) {
            prover_accumulator.non_shifted_polynomial.at(0) = NativeFF::random_element();
        }
        DeciderProver decider_prover(prover_transcript);
        auto decider_proof = decider_prover.construct_proof(prover_accumulator);

        // ---- Native: fold, then verify the decider proof ----
        auto incoming_native_verifier_instance =
            std::make_shared<NativeVerifierInstance>(std::make_shared<NativeFlavor::VKAndHash>(incoming_vk));
        auto native_transcript = std::make_shared<NativeTranscript>();
        NativeVerifier native_verifier(native_transcript);
        native_verifier.accumulate_instance<NativeFlavor>(incoming_native_verifier_instance, instance_proof);
        auto [native_folded, native_accumulator] = native_verifier.finalize(batch_proof, previous_native_accumulator);

        // Pin the decider transcript manifest (only meaningful in the untampered case): enable tracking after
        // folding so only the decider rounds are recorded.
        if (mode == TamperingMode::None) {
            native_transcript->enable_manifest();
        }
        NativeDeciderVerifier native_decider_verifier(native_transcript);
        bool native_decider_verified = native_decider_verifier.verify_proof(native_accumulator, decider_proof).check();

        // ---- Recursive: fold, then verify the decider proof ----
        Builder builder;
        auto incoming_recursive_instance =
            create_recursive_verifier_instance(&builder, incoming_native_verifier_instance);
        auto previous_recursive_accumulator =
            create_recursive_verifier_accumulator(&builder, previous_native_accumulator);
        auto recursive_transcript = std::make_shared<RecursiveTranscript>();
        RecursiveVerifier recursive_verifier(recursive_transcript);
        stdlib::Proof<Builder> stdlib_instance_proof(builder, instance_proof);
        recursive_verifier.accumulate_instance<RecursiveFlavor>(incoming_recursive_instance, stdlib_instance_proof);
        stdlib::Proof<Builder> stdlib_batch_proof(builder, batch_proof);
        auto [recursive_folded, recursive_accumulator] =
            recursive_verifier.finalize(stdlib_batch_proof, previous_recursive_accumulator);
        stdlib::Proof<Builder> stdlib_decider_proof(builder, decider_proof);
        RecursiveDeciderVerifier recursive_decider_verifier(recursive_transcript);
        bool recursive_decider_verified =
            recursive_decider_verifier.verify_proof(recursive_accumulator, stdlib_decider_proof).check();

        const bool tampered = (mode == TamperingMode::FoldedAccumulator);
        // Folding succeeds in both modes (the tampering is applied after folding); the circuit is satisfiable.
        EXPECT_TRUE(native_folded);
        EXPECT_TRUE(recursive_folded);
        EXPECT_TRUE(bb::CircuitChecker::check(builder));
        // The decider pairing check passes iff the folded accumulator was not tampered.
        EXPECT_EQ(native_decider_verified, !tampered);
        EXPECT_EQ(recursive_decider_verified, native_decider_verified);

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

TEST_F(HypernovaDeciderVerifierTests, TamperWithFoldedAccumulator)
{
    test_decider(TamperingMode::FoldedAccumulator);
}
