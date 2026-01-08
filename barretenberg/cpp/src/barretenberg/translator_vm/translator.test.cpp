#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/transcript/transcript_manifest.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

#include <gtest/gtest.h>
using namespace bb;

using CircuitBuilder = TranslatorFlavor::CircuitBuilder;
using Transcript = TranslatorFlavor::Transcript;
using OpQueue = ECCOpQueue;
static auto& engine = numeric::get_debug_randomness();

class TranslatorTests : public ::testing::Test {
    using G1 = g1::affine_element;
    using Fr = fr;
    using Fq = fq;
    using Flavor = TranslatorFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    /**
     * @brief Build the expected transcript manifest for Translator verification
     * @details The manifest has 26 rounds total:
     * - Round 0: vk_hash, Gemini masking, 82 wire commitments -> beta challenge
     * - Round 1: (empty) -> gamma challenge
     * - Round 2: Z_PERM -> Sumcheck:alpha + all gate challenges
     * - Round 3: Libra:concatenation_commitment + Sum -> Libra:Challenge
     * - Rounds 4-20: Sumcheck univariates (17 rounds)
     * - Round 21: Sumcheck evaluations + Libra commitments -> rho
     * - Round 22: Gemini fold commitments -> Gemini:r
     * - Round 23: Gemini evaluations + Libra evals -> Shplonk:nu
     * - Round 24: Shplonk:Q -> Shplonk:z
     * - Round 25: KZG:W -> KZG:masking_challenge
     */
    static TranscriptManifest build_expected_translator_manifest()
    {
        TranscriptManifest manifest;
        constexpr size_t frs_per_G = FrCodec::calc_num_fields<Flavor::Commitment>();
        constexpr size_t NUM_SUMCHECK_ROUNDS = 17; // CONST_TRANSLATOR_LOG_N + 2

        // Round 0: vk_hash, Gemini masking, wire commitments
        manifest.add_entry(0, "vk_hash", 1);
        manifest.add_entry(0, "Gemini:masking_poly_comm", frs_per_G);

        // Wire commitments (82 total, in order from the manifest dump)
        // clang-format off
        std::vector<std::string> wire_labels = {
            "P_X_LOW_LIMBS", "P_X_HIGH_LIMBS", "P_Y_LOW_LIMBS", "P_Y_HIGH_LIMBS",
            "Z_LOw_LIMBS", "Z_HIGH_LIMBS",
            "ACCUMULATORS_BINARY_LIMBS_0", "ACCUMULATORS_BINARY_LIMBS_1",
            "ACCUMULATORS_BINARY_LIMBS_2", "ACCUMULATORS_BINARY_LIMBS_3",
            "QUOTIENT_LOW_BINARY_LIMBS", "QUOTIENT_HIGH_BINARY_LIMBS",
            "RELATION_WIDE_LIMBS",
            "P_X_LOW_LIMBS_RANGE_CONSTRAINT_0", "P_X_LOW_LIMBS_RANGE_CONSTRAINT_1",
            "P_X_LOW_LIMBS_RANGE_CONSTRAINT_2", "P_X_LOW_LIMBS_RANGE_CONSTRAINT_3",
            "P_X_LOW_LIMBS_RANGE_CONSTRAINT_4", "P_X_LOW_LIMBS_RANGE_CONSTRAINT_TAIL",
            "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_0", "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_1",
            "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_2", "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_3",
            "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_4", "P_X_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL",
            "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_0", "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_1",
            "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_2", "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_3",
            "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_4", "P_Y_LOW_LIMBS_RANGE_CONSTRAINT_TAIL",
            "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_0", "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_1",
            "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_2", "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_3",
            "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_4", "P_Y_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL",
            "Z_LOW_LIMBS_RANGE_CONSTRAINT_0", "Z_LOW_LIMBS_RANGE_CONSTRAINT_1",
            "Z_LOW_LIMBS_RANGE_CONSTRAINT_2", "Z_LOW_LIMBS_RANGE_CONSTRAINT_3",
            "Z_LOW_LIMBS_RANGE_CONSTRAINT_4", "Z_LOW_LIMBS_RANGE_CONSTRAINT_TAIL",
            "Z_HIGH_LIMBS_RANGE_CONSTRAINT_0", "Z_HIGH_LIMBS_RANGE_CONSTRAINT_1",
            "Z_HIGH_LIMBS_RANGE_CONSTRAINT_2", "Z_HIGH_LIMBS_RANGE_CONSTRAINT_3",
            "Z_HIGH_LIMBS_RANGE_CONSTRAINT_4", "Z_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL",
            "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_0", "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_1",
            "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_2", "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_3",
            "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_4", "ACCUMULATOR_LOW_LIMBS_RANGE_CONSTRAINT_TAIL",
            "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_0", "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_1",
            "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_2", "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_3",
            "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_4", "ACCUMULATOR_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL",
            "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_0", "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_1",
            "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_2", "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_3",
            "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_4", "QUOTIENT_LOW_LIMBS_RANGE_CONSTRAINT_TAIL",
            "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_0", "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_1",
            "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_2", "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_3",
            "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_4", "QUOTIENT_HIGH_LIMBS_RANGE_CONSTRAINT_TAIL",
            "RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_0", "RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_1",
            "RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_2", "RELATION_WIDE_LIMBS_RANGE_CONSTRAINT_3",
            "ORDERED_RANGE_CONSTRAINTS_0", "ORDERED_RANGE_CONSTRAINTS_1",
            "ORDERED_RANGE_CONSTRAINTS_2", "ORDERED_RANGE_CONSTRAINTS_3",
            "ORDERED_RANGE_CONSTRAINTS_4",
        };
        // clang-format on
        for (const auto& label : wire_labels) {
            manifest.add_entry(0, label, frs_per_G);
        }
        // beta and gamma are consecutive challenges (no data between), so both in round 0
        manifest.add_challenge(0, "beta");
        manifest.add_challenge(0, "gamma");

        // Round 1: Z_PERM -> Sumcheck:alpha + all gate challenges (same round, no data between them)
        manifest.add_entry(1, "Z_PERM", frs_per_G);
        manifest.add_challenge(1, "Sumcheck:alpha");
        for (size_t i = 0; i < NUM_SUMCHECK_ROUNDS; ++i) {
            manifest.add_challenge(1, "Sumcheck:gate_challenge_" + std::to_string(i));
        }

        // Round 2: Libra concatenation commitment + Sum -> Libra:Challenge
        manifest.add_entry(2, "Libra:concatenation_commitment", frs_per_G);
        manifest.add_entry(2, "Libra:Sum", 1);
        manifest.add_challenge(2, "Libra:Challenge");

        // Rounds 3-19: Sumcheck univariates (17 rounds)
        for (size_t i = 0; i < NUM_SUMCHECK_ROUNDS; ++i) {
            manifest.add_entry(3 + i, "Sumcheck:univariate_" + std::to_string(i), 9);
            manifest.add_challenge(3 + i, "Sumcheck:u_" + std::to_string(i));
        }

        // Round 20: Sumcheck evaluations + Libra commitments -> rho
        manifest.add_entry(20, "Sumcheck:evaluations", 188);
        manifest.add_entry(20, "Libra:claimed_evaluation", 1);
        manifest.add_entry(20, "Libra:grand_sum_commitment", frs_per_G);
        manifest.add_entry(20, "Libra:quotient_commitment", frs_per_G);
        manifest.add_challenge(20, "rho");

        // Round 21: Gemini fold commitments -> Gemini:r
        for (size_t i = 1; i <= 16; ++i) {
            manifest.add_entry(21, "Gemini:FOLD_" + std::to_string(i), frs_per_G);
        }
        manifest.add_challenge(21, "Gemini:r");

        // Round 22: Gemini evaluations + Libra evals -> Shplonk:nu
        for (size_t i = 1; i <= 17; ++i) {
            manifest.add_entry(22, "Gemini:a_" + std::to_string(i), 1);
        }
        manifest.add_entry(22, "Gemini:P_pos", 1);
        manifest.add_entry(22, "Gemini:P_neg", 1);
        manifest.add_entry(22, "Libra:concatenation_eval", 1);
        manifest.add_entry(22, "Libra:shifted_grand_sum_eval", 1);
        manifest.add_entry(22, "Libra:grand_sum_eval", 1);
        manifest.add_entry(22, "Libra:quotient_eval", 1);
        manifest.add_challenge(22, "Shplonk:nu");

        // Round 23: Shplonk:Q -> Shplonk:z
        manifest.add_entry(23, "Shplonk:Q", frs_per_G);
        manifest.add_challenge(23, "Shplonk:z");

        // Round 24: KZG:W -> KZG:masking_challenge
        manifest.add_entry(24, "KZG:W", frs_per_G);
        manifest.add_challenge(24, "KZG:masking_challenge");

        return manifest;
    }

    // Helper function to add no-ops
    static void add_random_ops(std::shared_ptr<bb::ECCOpQueue>& op_queue, size_t count = 1)
    {
        for (size_t i = 0; i < count; i++) {
            op_queue->random_op_ultra_only();
        }
    }

    static void add_mixed_ops(std::shared_ptr<bb::ECCOpQueue>& op_queue, size_t count = 100)
    {
        auto P1 = G1::random_element();
        auto P2 = G1::random_element();
        auto z = Fr::random_element();
        for (size_t i = 0; i < count; i++) {
            op_queue->add_accumulate(P1);
            op_queue->mul_accumulate(P2, z);
        }
        op_queue->eq_and_reset();
    }

    // Construct a test circuit based on some random operations
    static CircuitBuilder generate_test_circuit(const Fq& batching_challenge_v,
                                                const Fq& evaluation_challenge_x,
                                                const size_t circuit_size_parameter = 500)
    {

        // Add the same operations to the ECC op queue; the native computation is performed under the hood.
        auto op_queue = std::make_shared<bb::ECCOpQueue>();
        op_queue->no_op_ultra_only();
        add_random_ops(op_queue, CircuitBuilder::NUM_RANDOM_OPS_START);
        add_mixed_ops(op_queue, circuit_size_parameter / 2);
        op_queue->merge();
        add_mixed_ops(op_queue, circuit_size_parameter / 2);
        add_random_ops(op_queue, CircuitBuilder::NUM_RANDOM_OPS_END);
        op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

        return CircuitBuilder{ batching_challenge_v, evaluation_challenge_x, op_queue };
    }

    static bool prove_and_verify(const CircuitBuilder& circuit_builder,
                                 const Fq& evaluation_challenge_x,
                                 const Fq& batching_challenge_v)
    {
        // Setup prover transcript
        auto prover_transcript = std::make_shared<Transcript>();
        prover_transcript->send_to_verifier("init", Fq::random_element());
        auto initial_transcript = prover_transcript->export_proof();

        // Setup verifier transcript
        auto verifier_transcript = std::make_shared<Transcript>(initial_transcript);
        verifier_transcript->template receive_from_prover<Fq>("init");

        // Create proving key and prover
        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        TranslatorProver prover{ proving_key, prover_transcript };

        // Generate proof
        auto proof = prover.construct_proof();

        // Commit to op queue wires
        std::array<TranslatorFlavor::Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
        op_queue_commitments[0] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.op);
        op_queue_commitments[1] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_lo_y_hi);
        op_queue_commitments[2] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_hi_z_1);
        op_queue_commitments[3] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.y_lo_z_2);

        // Get accumulated_result from the prover
        uint256_t accumulated_result = prover.get_accumulated_result();

        // Create verifier
        TranslatorVerifier verifier(verifier_transcript,
                                    proof,
                                    evaluation_challenge_x,
                                    batching_challenge_v,
                                    accumulated_result,
                                    op_queue_commitments);

        // Verify proof: get reduction result and check all components
        auto result = verifier.reduce_to_pairing_check();
        return result.pairing_points.check() && result.reduction_succeeded;
    }
};

/**
 * @brief Check that size of a Translator proof matches the corresponding constant
 *@details If this test FAILS, then the following (non-exhaustive) list should probably be updated as well:
 * - Proof length formula in translator_flavor.hpp, etc...
 * - translator_transcript.test.cpp
 * - constants in yarn-project in: constants.nr, constants.gen.ts, ConstantsGen.sol
 */
TEST_F(TranslatorTests, ProofLengthCheck)
{
    using Fq = fq;

    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    // Generate a circuit and its verification key (computed at runtime from the proving key)
    CircuitBuilder circuit_builder = generate_test_circuit(batching_challenge_v, evaluation_challenge_x);

    // Setup prover transcript
    auto prover_transcript = std::make_shared<Transcript>();
    prover_transcript->send_to_verifier("init", Fq::random_element());
    prover_transcript->export_proof();
    auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
    TranslatorProver prover{ proving_key, prover_transcript };

    // Generate proof
    auto proof = prover.construct_proof();

    EXPECT_EQ(proof.size(), TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
}

/**
 * @brief Test simple circuit with public inputs
 *
 */
TEST_F(TranslatorTests, Basic)
{
    using Fq = fq;

    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    // Generate a circuit without no-ops
    CircuitBuilder circuit_builder = generate_test_circuit(batching_challenge_v, evaluation_challenge_x);

    EXPECT_TRUE(TranslatorCircuitChecker::check(circuit_builder));
    bool verified = prove_and_verify(circuit_builder, evaluation_challenge_x, batching_challenge_v);
    EXPECT_TRUE(verified);
}

/**
 * @brief Test Translator operates correctly for AVM i.e. when we only run Goblin on a single table of ecc ops and we
 * should not expect random ops to appear at the end of Translator trace.
 *
 */
TEST_F(TranslatorTests, BasicAvmMode)
{
    using Fq = fq;

    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    // Add the same operations to the ECC op queue; the native computation is performed under the hood.
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    op_queue->no_op_ultra_only();
    add_random_ops(op_queue, CircuitBuilder::NUM_RANDOM_OPS_START);
    add_mixed_ops(op_queue, 100);
    op_queue->merge();
    auto circuit_builder = CircuitBuilder{ batching_challenge_v, evaluation_challenge_x, op_queue, /*avm_mode=*/true };

    EXPECT_TRUE(TranslatorCircuitChecker::check(circuit_builder));
    bool verified = prove_and_verify(circuit_builder, evaluation_challenge_x, batching_challenge_v);
    EXPECT_TRUE(verified);
}

/**
 * @brief Ensure that the fixed VK from the default constructor agrees with those computed manually for an arbitrary
 * circuit
 * @note If this test fails, it may be because the constant CONST_TRANSLATOR_LOG_N has changed and the fixed VK
 * commitments in TranslatorFixedVKCommitments must be updated accordingly. Their values can be taken right from the
 * output of this test.
 *
 */
TEST_F(TranslatorTests, FixedVK)
{
    using Fq = fq;

    auto prover_transcript = std::make_shared<Transcript>();
    prover_transcript->send_to_verifier("init", Fq::random_element());
    prover_transcript->export_proof();
    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    // Generate the default fixed VK
    TranslatorFlavor::VerificationKey fixed_vk{};

    // Lambda for manually computing a verification key for a given circuit and comparing it to the fixed VK
    auto compare_computed_vk_against_fixed = [&](size_t circuit_size_parameter) {
        CircuitBuilder circuit_builder =
            generate_test_circuit(batching_challenge_v, evaluation_challenge_x, circuit_size_parameter);
        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        TranslatorProver prover{ proving_key, prover_transcript };
        TranslatorFlavor::VerificationKey computed_vk(proving_key->proving_key);
        auto labels = TranslatorFlavor::VerificationKey::get_labels();
        size_t index = 0;
        for (auto [vk_commitment, fixed_commitment] : zip_view(computed_vk.get_all(), fixed_vk.get_all())) {
            EXPECT_EQ(vk_commitment, fixed_commitment)
                << "Mismatch between computed vk_commitment and fixed_commitment at label: " << labels[index];
            ++index;
        }

        EXPECT_EQ(computed_vk, fixed_vk);
    };

    // Check consistency of the fixed VK with the computed VK for some different circuit sizes
    const size_t circuit_size_parameter_1 = 1 << 2;
    const size_t circuit_size_parameter_2 = 1 << 3;

    compare_computed_vk_against_fixed(circuit_size_parameter_1);
    compare_computed_vk_against_fixed(circuit_size_parameter_2);
}

/**
 * @brief Pin the Translator transcript manifest
 * @details Verifies that the verifier transcript matches the expected hardcoded structure.
 * Prover correctness follows by transitivity (prover/verifier must match for verification to succeed).
 */
TEST_F(TranslatorTests, TranscriptPinned)
{
    using Fq = fq;

    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    CircuitBuilder circuit_builder = generate_test_circuit(batching_challenge_v, evaluation_challenge_x);

    // Create proving key and prover
    auto prover_transcript = std::make_shared<Transcript>();
    auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
    TranslatorProver prover{ proving_key, prover_transcript };

    // Generate proof
    auto proof = prover.construct_proof();

    // Setup verifier transcript with manifest tracking
    auto verifier_transcript = std::make_shared<Transcript>(proof);
    verifier_transcript->enable_manifest();

    // Get accumulated_result from the prover
    uint256_t accumulated_result = prover.get_accumulated_result();

    // Commit to op queue wires
    std::array<TranslatorFlavor::Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
    op_queue_commitments[0] = proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.op);
    op_queue_commitments[1] =
        proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_lo_y_hi);
    op_queue_commitments[2] =
        proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_hi_z_1);
    op_queue_commitments[3] =
        proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.y_lo_z_2);

    // Create verifier with all required inputs
    TranslatorVerifier verifier(verifier_transcript,
                                proof,
                                evaluation_challenge_x,
                                batching_challenge_v,
                                accumulated_result,
                                op_queue_commitments);

    // Run verification - just reduce to pairing check to exercise the transcript
    [[maybe_unused]] auto result = verifier.reduce_to_pairing_check();

    // Compare verifier manifest against hardcoded expected structure
    auto expected_manifest = build_expected_translator_manifest();
    auto verifier_manifest = verifier_transcript->get_manifest();

    EXPECT_EQ(verifier_manifest, expected_manifest);
}
