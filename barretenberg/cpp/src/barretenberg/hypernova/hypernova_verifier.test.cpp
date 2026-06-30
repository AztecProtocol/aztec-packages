#include "barretenberg/hypernova/hypernova_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_app_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/hypernova/hypernova_prover.hpp"
#include "barretenberg/hypernova/test_utils.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/transcript/transcript_manifest.hpp"
#include "gtest/gtest.h"

#include <optional>
#include <vector>

using namespace bb;

/**
 * @brief Build the expected HyperNova folding transcript manifest for a "previous accumulator + one instance" fold.
 * @details This is the 2-claim folding session: one incoming instance's Oink + Sumcheck + batching challenges,
 * followed by the 2-claim multilinear batching (the previous accumulator is held in memory, not in the transcript).
 * The two slim flavors differ only in which databus columns are committed (from Flavor::BUILDER_BUS_INDICES) and
 * whether LogDerivLookup is present (apps keep it, kernels drop it). Rounds: oink (0-2), instance sumcheck, batching
 * challenges + MLB alpha, MLB sumcheck, MLB final evaluations + merge challenge.
 */
template <typename Flavor> TranscriptManifest build_expected_folding_manifest()
{
    static_assert(std::is_same_v<Flavor, bb::MegaKernelFlavor> || std::is_same_v<Flavor, bb::MegaAppFlavor>,
                  "expected manifest only defined for MegaKernelFlavor / MegaAppFlavor");
    // Apps keep LogDerivLookup; kernels drop it.
    constexpr bool has_lookup = std::is_same_v<Flavor, bb::MegaAppFlavor>;

    // Databus columns this flavor commits, in builder order, derived from the flavor's bus indices.
    constexpr std::array<const char*, 7> ALL_BUSES = { "KERNEL_CALLDATA",     "FIRST_APP_CALLDATA",
                                                       "SECOND_APP_CALLDATA", "THIRD_APP_CALLDATA",
                                                       "FOURTH_APP_CALLDATA", "FIFTH_APP_CALLDATA",
                                                       "RETURN_DATA" };
    std::vector<std::string> buses;
    for (size_t builder_idx : Flavor::BUILDER_BUS_INDICES) {
        buses.emplace_back(ALL_BUSES[builder_idx]);
    }

    TranscriptManifest manifest;
    constexpr size_t frs_per_G = FrCodec::calc_num_fields<curve::BN254::AffineElement>();
    constexpr size_t NUM_SUMCHECK_UNIVARIATES = Flavor::VIRTUAL_LOG_N;

    size_t round = 0;

    // Round 0: Oink preamble + wires + ECC ops + databus -> eta + rom_logup_gamma challenges
    manifest.add_challenge(round, std::array{ "eta", "rom_logup_gamma" });
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
    for (const auto& bus : buses) {
        manifest.add_entry(round, bus, frs_per_G);
        manifest.add_entry(round, bus + "_READ_COUNTS", frs_per_G);
    }
    round++;

    // Round 1: (lookup read columns) + w_4 -> beta, gamma challenges
    manifest.add_challenge(round, std::array{ "beta", "gamma" });
    if constexpr (has_lookup) {
        manifest.add_entry(round, "LOOKUP_READ_COUNTS", frs_per_G);
        manifest.add_entry(round, "LOOKUP_READ_TAGS", frs_per_G);
    }
    manifest.add_entry(round, "W_4", frs_per_G);
    round++;

    // Round 2: (lookup inverses) + databus inverses + z_perm -> alpha + gate_challenge
    manifest.add_challenge(round, "alpha");
    manifest.add_challenge(round, "HypernovaFoldingProver:gate_challenge");
    if constexpr (has_lookup) {
        manifest.add_entry(round, "LOOKUP_INVERSES", frs_per_G);
    }
    for (const auto& bus : buses) {
        manifest.add_entry(round, bus + "_INVERSES", frs_per_G);
    }
    manifest.add_entry(round, "Z_PERM", frs_per_G);
    round++;

    // Instance sumcheck univariates
    for (size_t i = 0; i < NUM_SUMCHECK_UNIVARIATES; ++i) {
        manifest.add_challenge(round, "Sumcheck:u_" + std::to_string(i));
        manifest.add_entry(round, "Sumcheck:univariate_" + std::to_string(i), 8);
        round++;
    }

    // Unshifted + shifted batching challenges (accumulate_instance), then the batching challenge + MLB alpha
    // (finalize). All consecutive challenges since no new prover data is added in between.
    for (size_t i = 0; i < Flavor::NUM_UNSHIFTED_ENTITIES - 1; ++i) {
        manifest.add_challenge(round, "unshifted_challenge_" + std::to_string(i));
    }
    for (size_t i = 0; i < Flavor::NUM_SHIFTED_ENTITIES - 1; ++i) {
        manifest.add_challenge(round, "shifted_challenge_" + std::to_string(i));
    }
    manifest.add_challenge(round, "claim_batching_challenge");
    manifest.add_challenge(round, "Sumcheck:alpha");
    manifest.add_entry(round, "Sumcheck:evaluations", Flavor::NUM_ALL_ENTITIES);
    round++;

    // MLB sumcheck univariates
    for (size_t i = 0; i < NUM_SUMCHECK_UNIVARIATES; ++i) {
        manifest.add_challenge(round, "Sumcheck:u_" + std::to_string(i));
        manifest.add_entry(round, "Sumcheck:univariate_" + std::to_string(i), 3);
        round++;
    }

    // Final batched evaluations of the original polynomials (6 = 3 entities * 2 claims), then the merge challenge.
    manifest.add_entry(round, "Sumcheck:evaluations", MultilinearBatchingFlavor_</*NumClaims*/ 2>::NUM_ALL_ENTITIES);
    manifest.add_challenge(round, "claim_merge_challenge");

    return manifest;
}

// Exercises the stateful folding scheme end to end: a prover folds a variable number of instances (optionally
// against a previous accumulator), then the native and recursive verifiers fold the same group from the produced
// proofs. The verifiers' accumulators are cross-checked against the prover's. Failure modes specific to HyperNova
// (instance-to-accumulator sumcheck failure) are tested here; the multilinear batching faults (eq-consistency,
// merge-binding, commitment binding) live in multilinear_batching.test.cpp and are not duplicated.
class HypernovaFoldingVerifierTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

  public:
    using KernelFlavor = bb::MegaKernelFlavor;
    using KernelRecursiveFlavor = bb::MegaKernelRecursiveFlavor;
    using AppFlavor = bb::MegaAppFlavor;
    using AppRecursiveFlavor = bb::MegaAppRecursiveFlavor;
    using Builder = KernelRecursiveFlavor::CircuitBuilder;
    using FF = KernelFlavor::FF;

    using FoldingProver = bb::HypernovaFoldingProver;
    using ProverAccumulator = FoldingProver::Accumulator;
    using NativeVerifier = bb::HypernovaFoldingNativeVerifier;
    using RecursiveVerifier = bb::HypernovaFoldingRecursiveVerifier;
    using NativeVerifierAccumulator = NativeVerifier::Accumulator;
    using NativeTranscript = NativeVerifier::Transcript;
    using RecursiveTranscript = RecursiveVerifier::Transcript;

    static constexpr size_t LOG_NUM_GATES = 4;

    enum class TamperingMode : uint8_t { None, Instance };

    template <typename Flavor>
    static std::shared_ptr<ProverInstance_<Flavor>> generate_instance(size_t log_num_gates = LOG_NUM_GATES)
    {
        Builder builder;
        bb::MockCircuits::add_arithmetic_gates(builder, log_num_gates);
        bb::MockCircuits::add_arithmetic_gates_with_public_inputs(builder);
        bb::MockCircuits::add_lookup_gates(builder);
        return std::make_shared<ProverInstance_<Flavor>>(builder);
    }

    static bool compare_prover_verifier_accumulators(const ProverAccumulator& lhs, const NativeVerifierAccumulator& rhs)
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
     * @brief Build a recursive verifier instance from a native one (already populated by the native verifier).
     */
    template <typename NativeFlavor, typename RecursiveFlavor>
    static std::shared_ptr<VerifierInstance_<RecursiveFlavor>> make_recursive_verifier_instance(
        Builder* builder, const std::shared_ptr<VerifierInstance_<NativeFlavor>>& native_instance)
    {
        using FF = typename RecursiveFlavor::FF;
        using Commitment = typename RecursiveFlavor::Commitment;
        using VerificationKey = typename RecursiveFlavor::VerificationKey;
        using VKAndHash = typename RecursiveFlavor::VKAndHash;

        auto recursive_vk =
            std::make_shared<VKAndHash>(std::make_shared<VerificationKey>(builder, native_instance->get_vk()),
                                        FF::from_witness(builder, native_instance->get_vk()->hash()));
        auto recursive_instance = std::make_shared<VerifierInstance_<RecursiveFlavor>>(recursive_vk);

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

    template <typename Flavor> static void tamper_instance(const std::shared_ptr<ProverInstance_<Flavor>>& instance)
    {
        // Tamper with w_l at the first row where q_arith is non-zero (an active arithmetic gate).
        auto& q_arith = instance->polynomials.q_arith();
        for (size_t i = ProverInstance_<Flavor>::TRACE_OFFSET; i < q_arith.end_index(); i++) {
            if (!q_arith[i].is_zero()) {
                instance->polynomials.w_l().at(i) = FF::random_element();
                break;
            }
        }
    }

    /**
     * @brief Build a valid previous accumulator (a single-instance fold) for the prover and verifiers.
     */
    static ProverAccumulator make_previous_accumulator()
    {
        auto transcript = std::make_shared<NativeTranscript>();
        FoldingProver prover(transcript);
        prover.accumulate_instance<KernelFlavor>(generate_instance<KernelFlavor>());
        auto [_proof, accumulator] = prover.finalize();
        return accumulator;
    }

    /**
     * @brief Fold `num_instances` kernel instances with the prover, then verify the group natively and recursively.
     * @param use_previous_accumulator whether to start from a (valid) previous accumulator.
     * @param mode whether to tamper the last instance.
     */
    static void test_folding(size_t num_instances, bool use_previous_accumulator, TamperingMode mode)
    {
        std::vector<std::shared_ptr<ProverInstance_<KernelFlavor>>> prover_instances;
        std::vector<std::shared_ptr<KernelFlavor::VerificationKey>> vks;
        prover_instances.reserve(num_instances);
        vks.reserve(num_instances);
        for (size_t i = 0; i < num_instances; ++i) {
            prover_instances.push_back(generate_instance<KernelFlavor>(LOG_NUM_GATES + i));
            vks.push_back(std::make_shared<KernelFlavor::VerificationKey>(prover_instances.back()->get_precomputed()));
        }
        if (mode == TamperingMode::Instance) {
            tamper_instance<KernelFlavor>(prover_instances.back());
        }

        std::optional<ProverAccumulator> previous_prover_accumulator;
        std::optional<NativeVerifierAccumulator> previous_native_accumulator;
        if (use_previous_accumulator) {
            previous_prover_accumulator = make_previous_accumulator();
            previous_native_accumulator = previous_prover_accumulator->to_verifier_claim_for_testing();
        }

        // ---- Prover ----
        auto prover_transcript = std::make_shared<NativeTranscript>();
        FoldingProver prover(prover_transcript);
        std::vector<HonkProof> proofs;
        proofs.reserve(num_instances);
        for (size_t i = 0; i < num_instances; ++i) {
            proofs.push_back(prover.accumulate_instance<KernelFlavor>(prover_instances[i], vks[i]));
        }
        auto [batch_proof, prover_accumulator] =
            prover.finalize(previous_prover_accumulator.has_value() ? previous_prover_accumulator : std::nullopt);

        // ---- Native verifier ----
        std::vector<std::shared_ptr<VerifierInstance_<KernelFlavor>>> native_verifier_instances;
        native_verifier_instances.reserve(num_instances);
        for (size_t i = 0; i < num_instances; ++i) {
            native_verifier_instances.push_back(
                std::make_shared<VerifierInstance_<KernelFlavor>>(std::make_shared<KernelFlavor::VKAndHash>(vks[i])));
        }
        auto native_transcript = std::make_shared<NativeTranscript>();
        NativeVerifier native_verifier(native_transcript);
        std::vector<bool> native_sumchecks;
        native_sumchecks.reserve(num_instances);
        for (size_t i = 0; i < num_instances; ++i) {
            native_sumchecks.push_back(
                native_verifier.accumulate_instance<KernelFlavor>(native_verifier_instances[i], proofs[i]));
        }
        auto [native_verified, native_accumulator] = native_verifier.finalize(
            batch_proof, previous_native_accumulator.has_value() ? previous_native_accumulator : std::nullopt);

        // ---- Recursive verifier (native instances are now populated) ----
        Builder builder;
        std::vector<std::shared_ptr<VerifierInstance_<KernelRecursiveFlavor>>> recursiver_verifier_instances;
        recursiver_verifier_instances.reserve(num_instances);
        for (size_t i = 0; i < num_instances; ++i) {
            recursiver_verifier_instances.push_back(
                make_recursive_verifier_instance<KernelFlavor, KernelRecursiveFlavor>(&builder,
                                                                                      native_verifier_instances[i]));
        }
        std::optional<RecursiveVerifier::Accumulator> previous_recursive_accumulator;
        if (previous_native_accumulator.has_value()) {
            previous_recursive_accumulator =
                create_recursive_verifier_accumulator(&builder, *previous_native_accumulator);
        }
        auto recursive_transcript = std::make_shared<RecursiveTranscript>();
        RecursiveVerifier recursive_verifier(recursive_transcript);
        std::vector<bool> recursive_sumchecks;
        recursive_sumchecks.reserve(num_instances);
        for (size_t i = 0; i < num_instances; ++i) {
            stdlib::Proof<Builder> stdlib_proof(builder, proofs[i]);
            recursive_sumchecks.push_back(recursive_verifier.accumulate_instance<KernelRecursiveFlavor>(
                recursiver_verifier_instances[i], stdlib_proof));
        }
        stdlib::Proof<Builder> stdlib_batch_proof(builder, batch_proof);
        auto [recursive_verified, recursive_accumulator] = recursive_verifier.finalize(
            stdlib_batch_proof,
            previous_recursive_accumulator.has_value() ? previous_recursive_accumulator : std::nullopt);

        // ---- Assertions ----
        const bool tampered = (mode == TamperingMode::Instance);
        for (size_t i = 0; i < num_instances; ++i) {
            const bool expected = !tampered || i != num_instances - 1;
            EXPECT_EQ(native_sumchecks[i], expected) << "native instance " << i;
            EXPECT_EQ(recursive_sumchecks[i], native_sumchecks[i]) << "recursive instance " << i;
        }
        EXPECT_EQ(bb::CircuitChecker::check(builder), !tampered);
        EXPECT_TRUE(native_verified);
        EXPECT_EQ(recursive_verified, native_verified);
        EXPECT_TRUE(compare_prover_verifier_accumulators(prover_accumulator, native_accumulator));
        EXPECT_TRUE(compare_prover_verifier_accumulators(
            prover_accumulator, recursive_accumulator.template get_value<NativeVerifierAccumulator>()));
    }

    /**
     * @brief Drive a "previous accumulator + one instance" folding session through the native verifier with manifest
     * tracking enabled, and assert the transcript matches the expected manifest. Flavor-general (kernel and app).
     */
    template <typename Flavor> void expect_folding_manifest()
    {
        using NativeTranscript = bb::HypernovaFoldingProver::Transcript;
        using ProverAccumulator = bb::HypernovaFoldingProver::Accumulator;

        // Build a (valid) previous accumulator from a single instance on a separate, discarded transcript.
        ProverAccumulator previous_prover_accumulator = [&] {
            auto transcript = std::make_shared<NativeTranscript>();
            bb::HypernovaFoldingProver prover(transcript);
            prover.accumulate_instance<Flavor>(generate_instance<Flavor>());
            auto [_proof, accumulator] = prover.finalize();
            return accumulator;
        }();
        auto previous_verifier_accumulator = previous_prover_accumulator.to_verifier_claim_for_testing();

        // Prover folds one incoming instance against the previous accumulator -> a 2-claim batch.
        auto incoming_instance = generate_instance<Flavor>(LOG_NUM_GATES + 1);
        auto incoming_vk = std::make_shared<typename Flavor::VerificationKey>(incoming_instance->get_precomputed());
        auto folding_transcript = std::make_shared<NativeTranscript>();
        bb::HypernovaFoldingProver folding_prover(folding_transcript);
        HonkProof instance_proof = folding_prover.accumulate_instance<Flavor>(incoming_instance, incoming_vk);
        auto [batch_proof, _folded] = folding_prover.finalize(previous_prover_accumulator);

        // Verifier replays the same session with manifest tracking enabled.
        auto incoming_verifier_instance =
            std::make_shared<VerifierInstance_<Flavor>>(std::make_shared<typename Flavor::VKAndHash>(incoming_vk));
        auto verifier_transcript = std::make_shared<NativeTranscript>();
        verifier_transcript->enable_manifest();
        bb::HypernovaFoldingNativeVerifier verifier(verifier_transcript);
        verifier.accumulate_instance<Flavor>(incoming_verifier_instance, instance_proof);
        verifier.finalize(batch_proof, previous_verifier_accumulator);

        auto actual_manifest = verifier_transcript->get_manifest();
        auto expected_manifest = build_expected_folding_manifest<Flavor>();
        ASSERT_EQ(actual_manifest.size(), expected_manifest.size());
        for (size_t round = 0; round < actual_manifest.size(); ++round) {
            EXPECT_EQ(actual_manifest[round], expected_manifest[round])
                << "folding manifest discrepancy in round " << round;
        }
    }
};

// Completeness across widths, with and without a previous accumulator.
TEST_F(HypernovaFoldingVerifierTests, FoldVariableWidth)
{
    for (size_t num_instances = 1; num_instances <= CHONK_MAX_CLAIMS_PER_KERNEL; ++num_instances) {
        test_folding(num_instances, /*use_previous_accumulator=*/false, TamperingMode::None);
    }
}

TEST_F(HypernovaFoldingVerifierTests, FoldWithPreviousAccumulator)
{
    for (size_t num_instances = 1; num_instances < CHONK_MAX_CLAIMS_PER_KERNEL; ++num_instances) {
        test_folding(num_instances, /*use_previous_accumulator=*/true, TamperingMode::None);
    }
}

// Folding a group that mixes flavors (a kernel instance and several app instances), as a real inner-kernel group
// does. A single flavor-agnostic verifier folds all of them into one accumulator, cross-checked native vs recursive
// vs prover.
TEST_F(HypernovaFoldingVerifierTests, FoldMixedFlavors)
{
    auto kernel_instance = generate_instance<KernelFlavor>();
    auto app_instance_0 = generate_instance<AppFlavor>(LOG_NUM_GATES + 1);
    auto app_instance_1 = generate_instance<AppFlavor>(LOG_NUM_GATES + 2);
    auto kernel_vk = std::make_shared<KernelFlavor::VerificationKey>(kernel_instance->get_precomputed());
    auto app_vk_0 = std::make_shared<AppFlavor::VerificationKey>(app_instance_0->get_precomputed());
    auto app_vk_1 = std::make_shared<AppFlavor::VerificationKey>(app_instance_1->get_precomputed());

    // ---- Prover: fold [kernel, app, app] into one accumulator ----
    auto prover_transcript = std::make_shared<NativeTranscript>();
    FoldingProver prover(prover_transcript);
    HonkProof kernel_proof = prover.accumulate_instance<KernelFlavor>(kernel_instance, kernel_vk);
    HonkProof app_proof_0 = prover.accumulate_instance<AppFlavor>(app_instance_0, app_vk_0);
    HonkProof app_proof_1 = prover.accumulate_instance<AppFlavor>(app_instance_1, app_vk_1);
    auto [batch_proof, prover_accumulator] = prover.finalize();

    // ---- Native verifier ----
    auto kernel_verifier_instance =
        std::make_shared<VerifierInstance_<KernelFlavor>>(std::make_shared<KernelFlavor::VKAndHash>(kernel_vk));
    auto app_verifier_instance_0 =
        std::make_shared<VerifierInstance_<AppFlavor>>(std::make_shared<AppFlavor::VKAndHash>(app_vk_0));
    auto app_verifier_instance_1 =
        std::make_shared<VerifierInstance_<AppFlavor>>(std::make_shared<AppFlavor::VKAndHash>(app_vk_1));
    auto native_transcript = std::make_shared<NativeTranscript>();
    NativeVerifier native_verifier(native_transcript);
    EXPECT_TRUE(native_verifier.accumulate_instance<KernelFlavor>(kernel_verifier_instance, kernel_proof));
    EXPECT_TRUE(native_verifier.accumulate_instance<AppFlavor>(app_verifier_instance_0, app_proof_0));
    EXPECT_TRUE(native_verifier.accumulate_instance<AppFlavor>(app_verifier_instance_1, app_proof_1));
    auto [native_verified, native_accumulator] = native_verifier.finalize(batch_proof);

    // ---- Recursive verifier ----
    Builder builder;
    auto kernel_recursive_instance =
        make_recursive_verifier_instance<KernelFlavor, KernelRecursiveFlavor>(&builder, kernel_verifier_instance);
    auto app_recursive_instance_0 =
        make_recursive_verifier_instance<AppFlavor, AppRecursiveFlavor>(&builder, app_verifier_instance_0);
    auto app_recursive_instance_1 =
        make_recursive_verifier_instance<AppFlavor, AppRecursiveFlavor>(&builder, app_verifier_instance_1);
    auto recursive_transcript = std::make_shared<RecursiveTranscript>();
    RecursiveVerifier recursive_verifier(recursive_transcript);
    stdlib::Proof<Builder> stdlib_kernel_proof(builder, kernel_proof);
    recursive_verifier.accumulate_instance<KernelRecursiveFlavor>(kernel_recursive_instance, stdlib_kernel_proof);
    stdlib::Proof<Builder> stdlib_app_proof_0(builder, app_proof_0);
    recursive_verifier.accumulate_instance<AppRecursiveFlavor>(app_recursive_instance_0, stdlib_app_proof_0);
    stdlib::Proof<Builder> stdlib_app_proof_1(builder, app_proof_1);
    recursive_verifier.accumulate_instance<AppRecursiveFlavor>(app_recursive_instance_1, stdlib_app_proof_1);
    stdlib::Proof<Builder> stdlib_batch_proof(builder, batch_proof);
    auto [recursive_verified, recursive_accumulator] = recursive_verifier.finalize(stdlib_batch_proof);

    EXPECT_TRUE(bb::CircuitChecker::check(builder));
    EXPECT_TRUE(native_verified);
    EXPECT_EQ(recursive_verified, native_verified);
    EXPECT_TRUE(compare_prover_verifier_accumulators(prover_accumulator, native_accumulator));
    EXPECT_TRUE(compare_prover_verifier_accumulators(
        prover_accumulator, recursive_accumulator.template get_value<NativeVerifierAccumulator>()));
}

// Tampering an incoming instance's witness makes its instance-to-accumulator sumcheck fail (and the recursive
// circuit unsatisfiable), while the other instances and the batching are unaffected.
TEST_F(HypernovaFoldingVerifierTests, TamperInstance)
{
    BB_DISABLE_ASSERTS();
    test_folding(/*num_instances=*/3, /*use_previous_accumulator=*/false, TamperingMode::Instance);
}

// Pin the folding transcript manifest for a previous-accumulator + one-instance (2-claim) fold, for both the kernel
// and app instance flavors (they commit different databus columns and differ on LogDerivLookup).
TEST_F(HypernovaFoldingVerifierTests, KernelFoldingManifestMatchesExpected)
{
    expect_folding_manifest<bb::MegaKernelFlavor>();
}

TEST_F(HypernovaFoldingVerifierTests, AppFoldingManifestMatchesExpected)
{
    expect_folding_manifest<bb::MegaAppFlavor>();
}
