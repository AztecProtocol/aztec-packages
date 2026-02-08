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

// Test helper: Create a VK by committing to proving key polynomials (for comparing with fixed VK)
TranslatorFlavor::VerificationKey create_vk_from_proving_key(
    const std::shared_ptr<TranslatorFlavor::ProvingKey>& proving_key)
{
    TranslatorFlavor::VerificationKey vk;
    // Overwrite fixed commitments with computed commitments from the proving key
    for (auto [polynomial, commitment] : zip_view(proving_key->polynomials.get_precomputed(), vk.get_all())) {
        commitment = proving_key->commitment_key.commit(polynomial);
    }
    return vk;
}

// Compute VK hash from fixed commitments (for test verification that vk_hash() is correct)
TranslatorFlavor::FF compute_translator_vk_hash()
{
    std::vector<TranslatorFlavor::FF> elements;
    // Serialize commitments using the Codec
    for (const auto& commitment : TranslatorHardcodedVKAndHash::get_all()) {
        auto frs = TranslatorFlavor::Codec::serialize_to_fields(commitment);
        for (const auto& fr : frs) {
            elements.push_back(fr);
        }
    }
    return TranslatorFlavor::HashFunction::hash(elements);
}

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
     * @details The manifest has 25 rounds total (0-24):
     * - Round 0: vk_hash, Gemini masking, 10 wire commitments -> beta, gamma challenges
     * - Round 1: Z_PERM -> Sumcheck:alpha + all gate challenges
     * - Round 2: Libra:concatenation_commitment + Sum -> Libra:Challenge
     * - Rounds 3-19: Sumcheck univariates (17 rounds)
     * - Round 20: Sumcheck evaluations + Libra commitments -> rho
     * - Round 21: Gemini fold commitments -> Gemini:r
     * - Round 22: Gemini evaluations + Libra evals -> Shplonk:nu
     * - Round 23: Shplonk:Q -> Shplonk:z
     * - Round 24: KZG:W -> KZG:masking_challenge
     */
    static TranscriptManifest build_expected_translator_manifest()
    {
        TranscriptManifest manifest;
        constexpr size_t frs_per_G = FrCodec::calc_num_fields<Flavor::Commitment>();
        constexpr size_t NUM_SUMCHECK_ROUNDS = Flavor::CONST_TRANSLATOR_LOG_N;

        // Round 0: vk_hash, Gemini masking, wire commitments
        manifest.add_entry(0, "vk_hash", 1);
        manifest.add_entry(0, "Gemini:masking_poly_comm", frs_per_G);

        // Wire commitments (10 total: 5 concatenated + 5 ordered)
        // clang-format off
        std::vector<std::string> wire_labels = {
            "CONCATENATED_RANGE_CONSTRAINTS_0", "CONCATENATED_RANGE_CONSTRAINTS_1",
            "CONCATENATED_RANGE_CONSTRAINTS_2", "CONCATENATED_RANGE_CONSTRAINTS_3",
            "CONCATENATED_NON_RANGE",
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

        // Sumcheck evaluations (12 computable precomputed excluded) + Libra commitments -> rho
        const size_t eval_round = 3 + NUM_SUMCHECK_ROUNDS;
        manifest.add_entry(eval_round, "Sumcheck:evaluations", Flavor::NUM_SENT_EVALUATIONS);
        manifest.add_entry(eval_round, "Libra:claimed_evaluation", 1);
        manifest.add_entry(eval_round, "Libra:grand_sum_commitment", frs_per_G);
        manifest.add_entry(eval_round, "Libra:quotient_commitment", frs_per_G);
        manifest.add_challenge(eval_round, "rho");

        // Gemini fold commitments -> Gemini:r
        const size_t gemini_fold_round = eval_round + 1;
        for (size_t i = 1; i < NUM_SUMCHECK_ROUNDS; ++i) {
            manifest.add_entry(gemini_fold_round, "Gemini:FOLD_" + std::to_string(i), frs_per_G);
        }
        manifest.add_challenge(gemini_fold_round, "Gemini:r");

        // Gemini evaluations + Libra evals -> Shplonk:nu
        const size_t gemini_eval_round = gemini_fold_round + 1;
        for (size_t i = 1; i <= NUM_SUMCHECK_ROUNDS; ++i) {
            manifest.add_entry(gemini_eval_round, "Gemini:a_" + std::to_string(i), 1);
        }
        // No more Gemini:P_pos / Gemini:P_neg (interleaving replaced by concatenation)
        manifest.add_entry(gemini_eval_round, "Libra:concatenation_eval", 1);
        manifest.add_entry(gemini_eval_round, "Libra:shifted_grand_sum_eval", 1);
        manifest.add_entry(gemini_eval_round, "Libra:grand_sum_eval", 1);
        manifest.add_entry(gemini_eval_round, "Libra:quotient_eval", 1);
        manifest.add_challenge(gemini_eval_round, "Shplonk:nu");

        // Shplonk:Q -> Shplonk:z
        const size_t shplonk_round = gemini_eval_round + 1;
        manifest.add_entry(shplonk_round, "Shplonk:Q", frs_per_G);
        manifest.add_challenge(shplonk_round, "Shplonk:z");

        // KZG:W -> KZG:masking_challenge
        const size_t kzg_round = shplonk_round + 1;
        manifest.add_entry(kzg_round, "KZG:W", frs_per_G);
        manifest.add_challenge(kzg_round, "KZG:masking_challenge");

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

    EXPECT_EQ(proof.size(), TranslatorFlavor::PROOF_LENGTH);
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
 * commitments in TranslatorHardcodedVKAndHash must be updated accordingly. Their values can be taken right from the
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
        TranslatorFlavor::VerificationKey computed_vk = create_vk_from_proving_key(proving_key->proving_key);
        auto labels = TranslatorFlavor::VerificationKey::get_labels();

        size_t index = 0;
        for (auto [vk_commitment, fixed_commitment] : zip_view(computed_vk.get_all(), fixed_vk.get_all())) {
            if (vk_commitment != fixed_commitment) {
                info("// ", labels[index]);
                info("Commitment(uint256_t(\"0x", vk_commitment.x, "\"),");
                info("           uint256_t(\"0x", vk_commitment.y, "\")),");
            }
            EXPECT_EQ(vk_commitment, fixed_commitment) << "Mismatch at label: " << labels[index];
            ++index;
        }

        EXPECT_EQ(computed_vk, fixed_vk);
    };

    // Check consistency of the fixed VK with the computed VK for some different circuit sizes
    const size_t circuit_size_parameter_1 = 1 << 2;
    const size_t circuit_size_parameter_2 = 1 << 3;

    compare_computed_vk_against_fixed(circuit_size_parameter_1);
    compare_computed_vk_against_fixed(circuit_size_parameter_2);

    // Verify that the hardcoded VK hash matches the computed hash
    auto computed_hash = compute_translator_vk_hash();
    auto hardcoded_hash = TranslatorHardcodedVKAndHash::vk_hash();
    if (computed_hash != hardcoded_hash) {
        info("VK hash mismatch! Update TranslatorHardcodedVKAndHash::vk_hash() with:");
        info("0x", computed_hash);
    }
    EXPECT_EQ(computed_hash, hardcoded_hash) << "Hardcoded VK hash does not match computed hash";
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

/**
 * @brief Unit test for concatenated polynomial construction and reconstruction
 * @details Tests that:
 * 1. Concatenated polynomials are correctly constructed from wire polynomials
 * 2. The verifier's reconstruction formula correctly recovers the concatenated evaluation
 */
TEST_F(TranslatorTests, ConcatenationReconstruction)
{
    using Flavor = TranslatorFlavor;
    using Polynomial = Flavor::Polynomial;
    using FF = Flavor::FF;

    const size_t MINI = Flavor::MINI_CIRCUIT_SIZE;
    const size_t circuit_size = 1UL << Flavor::CONST_TRANSLATOR_LOG_N;

    // Create 16 wire polynomials matching actual translator structure:
    // size=MINI-1, virtual_size=circuit_size, start_index=1
    // This means they have values in [1, MINI) but are embedded in full circuit space
    std::array<Polynomial, 16> wires;
    for (size_t j = 0; j < 16; j++) {
        wires[j] = Polynomial(MINI - 1, circuit_size, 1);
        // Fill positions [1, MINI) with random values
        for (size_t k = 1; k < MINI; k++) {
            wires[j].at(k) = FF::random_element(&engine);
        }
    }

    // Create concatenated polynomial (17-dimensional) by copying wire data into lanes
    Polynomial concat_poly(circuit_size - 1, circuit_size, 1);
    for (size_t j = 0; j < 16; j++) {
        for (size_t k = 1; k < MINI; k++) {
            concat_poly.at(j * MINI + k) = wires[j].at(k);
        }
    }

    // Generate a random challenge point
    std::vector<FF> challenge(Flavor::CONST_TRANSLATOR_LOG_N);
    for (auto& u : challenge) {
        u = FF::random_element(&engine);
    }

    // Evaluate concatenated polynomial at full challenge (17-dimensional)
    FF concat_eval_expected = concat_poly.evaluate_mle(challenge);

    // Evaluate individual wires at full challenge (17-dimensional)
    // Even though wires only have values in [1, MINI), they have virtual_size=circuit_size
    // so their MLE is evaluated in 17-dimensional space
    std::array<FF, 16> wire_evals;
    for (size_t j = 0; j < 16; j++) {
        wire_evals[j] = wires[j].evaluate_mle(challenge);
    }

    // Extract top 4 challenges
    std::array<FF, 4> u_top;
    const size_t num_top_bits = 4;
    const size_t log_n = Flavor::CONST_TRANSLATOR_LOG_N;
    for (size_t i = 0; i < num_top_bits; i++) {
        u_top[i] = challenge[log_n - num_top_bits + i];
    }

    // Compute L_0(u_top) = (1-u_13)(1-u_14)(1-u_15)(1-u_16)
    // This accounts for wires having values in [1,MINI) embedded in 17D space
    FF padding = FF(1);
    for (size_t i = 0; i < num_top_bits; i++) {
        padding *= (FF(1) - u_top[i]);
    }
    FF padding_inv = padding.invert();

    // Compute Lagrange basis L_j(u_top) for j = 0..15
    // Uses little-endian bit ordering to match compute_lagranges_for_multi_claim
    std::array<FF, 16> lagrange_basis;
    for (size_t j = 0; j < 16; j++) {
        lagrange_basis[j] = FF(1);
        for (size_t bit = 0; bit < num_top_bits; bit++) {
            // Little-endian: bit i of j corresponds to challenge u_top[i]
            bool bit_set = (j >> bit) & 1;
            lagrange_basis[j] *= bit_set ? u_top[bit] : (FF(1) - u_top[bit]);
        }
    }

    // Reconstruct: concat(u) = [1/L_0(u_top)] * Σ_j L_j(u_top) * wire_j(u_17d)
    FF concat_eval_reconstructed = FF(0);
    for (size_t j = 0; j < 16; j++) {
        concat_eval_reconstructed += lagrange_basis[j] * wire_evals[j];
    }
    concat_eval_reconstructed *= padding_inv;

    // Verify reconstruction matches direct evaluation
    info("Unshifted - Expected concat eval:      ", concat_eval_expected);
    info("Unshifted - Reconstructed concat eval: ", concat_eval_reconstructed);
    EXPECT_EQ(concat_eval_expected, concat_eval_reconstructed);

    // Test shifted case
    // Evaluate shifted concatenated polynomial at full challenge (17-dimensional)
    FF concat_shift_eval_expected = concat_poly.shifted().evaluate_mle(challenge);

    // Evaluate individual wire shifts at full challenge (17-dimensional)
    std::array<FF, 16> wire_shift_evals;
    for (size_t j = 0; j < 16; j++) {
        wire_shift_evals[j] = wires[j].shifted().evaluate_mle(challenge);
    }

    // Reconstruct shifted eval using same formula
    FF concat_shift_eval_reconstructed = FF(0);
    for (size_t j = 0; j < 16; j++) {
        concat_shift_eval_reconstructed += lagrange_basis[j] * wire_shift_evals[j];
    }
    concat_shift_eval_reconstructed *= padding_inv;

    // Verify shifted reconstruction
    info("Shifted - Expected concat eval:      ", concat_shift_eval_expected);
    info("Shifted - Reconstructed concat eval: ", concat_shift_eval_reconstructed);
    EXPECT_EQ(concat_shift_eval_expected, concat_shift_eval_reconstructed);
}
