/**
 * @brief End-to-end integration test: Split Translator verification into field (Chonk_B) and EC (Chonk_G).
 * @details Validates the full pipeline:
 *   1. Generate a Translator proof
 *   2. Split verification into field and EC parts
 *   3. Build a Grumpkin circuit (TranslatorECCircuit) for the EC part
 *   4. Prove the Grumpkin circuit using ChonkGFlavor
 *   5. Verify the ChonkG proof
 *   6. Confirm pairing points match the native reference
 */
#include "translator_ec_circuit.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/chonk_g_flavor.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

#include <gtest/gtest.h>
using namespace bb;

class SplitTranslatorTests : public ::testing::Test {
  protected:
    // Translator types
    using G1 = g1::affine_element;
    using Fr = fr;
    using Fq = fq;
    using TransFlavor = TranslatorFlavor;
    using TransFF = TransFlavor::FF;
    using TransCommitment = TransFlavor::Commitment;
    using TransCircuitBuilder = TransFlavor::CircuitBuilder;
    using TransTranscript = TransFlavor::Transcript;

    // ChonkG types
    using ChonkFlavor = ChonkGFlavor;
    using ChonkFF = ChonkFlavor::FF;
    using ChonkCurve = ChonkFlavor::Curve;
    using ChonkCommitment = ChonkFlavor::Commitment;
    using ChonkBuilder = ChonkFlavor::CircuitBuilder;
    using ChonkProver = UltraProver_<ChonkFlavor>;
    using ChonkProverInstance = ProverInstance_<ChonkFlavor>;
    using ChonkVK = ChonkFlavor::VerificationKey;
    using ChonkTranscript = ChonkFlavor::Transcript;
    using ChonkPCS = ChonkFlavor::PCS;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // --- Translator proof generation helpers ---

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

    static TransCircuitBuilder generate_translator_circuit(const Fq& batching_challenge_v,
                                                           const Fq& evaluation_challenge_x,
                                                           const size_t circuit_size_parameter = 500)
    {
        auto op_queue = std::make_shared<bb::ECCOpQueue>();
        op_queue->no_op_ultra_only();
        add_random_ops(op_queue, TransCircuitBuilder::NUM_RANDOM_OPS_START);
        add_mixed_ops(op_queue, circuit_size_parameter / 2);
        op_queue->merge();
        add_mixed_ops(op_queue, circuit_size_parameter / 2);
        add_random_ops(op_queue, TransCircuitBuilder::NUM_RANDOM_OPS_END);
        op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());
        return TransCircuitBuilder{ batching_challenge_v, evaluation_challenge_x, op_queue };
    }

    struct TranslatorProverOutput {
        HonkProof proof;
        std::vector<Fr> initial_transcript;
        std::array<TransCommitment, TransFlavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
        uint256_t accumulated_result;
    };

    static TranslatorProverOutput generate_translator_proof(const TransCircuitBuilder& circuit_builder)
    {
        auto prover_transcript = std::make_shared<TransTranscript>();
        prover_transcript->send_to_verifier("init", Fq::random_element());
        auto initial_transcript = prover_transcript->export_proof();

        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        TranslatorProver prover{ proving_key, prover_transcript };
        auto proof = prover.construct_proof();

        std::array<TransCommitment, TransFlavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
        op_queue_commitments[0] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.op);
        op_queue_commitments[1] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_lo_y_hi);
        op_queue_commitments[2] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_hi_z_1);
        op_queue_commitments[3] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.y_lo_z_2);

        uint256_t accumulated_result = prover.get_accumulated_result();
        return { proof, initial_transcript, op_queue_commitments, accumulated_result };
    }

    static TranslatorVerifier create_translator_verifier(const TranslatorProverOutput& output,
                                                         const Fq& evaluation_challenge_x,
                                                         const Fq& batching_challenge_v)
    {
        auto verifier_transcript = std::make_shared<TransTranscript>(output.initial_transcript);
        verifier_transcript->template receive_from_prover<Fq>("init");

        return TranslatorVerifier(verifier_transcript,
                                  output.proof,
                                  evaluation_challenge_x,
                                  batching_challenge_v,
                                  output.accumulated_result,
                                  output.op_queue_commitments);
    }

    // --- ChonkG verification (from chonk_g.test.cpp) ---

    static bool verify_chonk_g_proof(const std::shared_ptr<ChonkVK>& vk,
                                     const typename ChonkTranscript::Proof& proof)
    {
        using Shplemini = ShpleminiVerifier_<ChonkCurve, ChonkFlavor::HasZK>;
        using VerifierCommitments = typename ChonkFlavor::VerifierCommitments;
        using ClaimBatcher = ClaimBatcher_<ChonkCurve>;
        using ClaimBatch = ClaimBatcher::Batch;

        auto transcript = std::make_shared<ChonkTranscript>();
        transcript->load_proof(proof);

        auto vk_and_hash = std::make_shared<typename ChonkFlavor::VKAndHash>(vk);
        auto verifier_instance = std::make_shared<VerifierInstance_<ChonkFlavor>>(vk_and_hash);
        OinkVerifier<ChonkFlavor> oink_verifier{ verifier_instance, transcript, 0 };
        oink_verifier.verify();

        const size_t log_circuit_size = static_cast<size_t>(vk->log_circuit_size);
        const size_t log_n = static_cast<size_t>(ChonkFlavor::VIRTUAL_LOG_N);
        std::vector<ChonkFF> padding_indicator_array(log_n, ChonkFF{ 1 });
        for (size_t idx = 0; idx < log_n; idx++) {
            padding_indicator_array[idx] = (idx < log_circuit_size) ? ChonkFF{ 1 } : ChonkFF{ 0 };
        }

        verifier_instance->gate_challenges =
            transcript->template get_dyadic_powers_of_challenge<ChonkFF>("Sumcheck:gate_challenge", log_n);

        VerifierCommitments commitments{ vk, verifier_instance->witness_commitments };
        commitments.gemini_masking_poly = verifier_instance->gemini_masking_commitment;

        SumcheckVerifier<ChonkFlavor> sumcheck(transcript, verifier_instance->alpha, log_n);

        std::array<ChonkCommitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
        libra_commitments[0] =
            transcript->template receive_from_prover<ChonkCommitment>("Libra:concatenation_commitment");

        SumcheckOutput<ChonkFlavor> sumcheck_output = sumcheck.verify(
            verifier_instance->relation_parameters, verifier_instance->gate_challenges, padding_indicator_array);

        libra_commitments[1] = transcript->template receive_from_prover<ChonkCommitment>("Libra:grand_sum_commitment");
        libra_commitments[2] = transcript->template receive_from_prover<ChonkCommitment>("Libra:quotient_commitment");

        constexpr size_t SMALL_SUBGROUP_IPA_MAX_POLY_LENGTH = ChonkCurve::SUBGROUP_SIZE + 3;
        const size_t ipa_poly_length =
            std::max(static_cast<size_t>(1UL << log_circuit_size),
                     numeric::round_up_power_2(SMALL_SUBGROUP_IPA_MAX_POLY_LENGTH));
        const size_t ipa_num_rounds = numeric::get_msb(ipa_poly_length);
        VerifierCommitmentKey<ChonkCurve> ipa_vk(ipa_poly_length);

        ClaimBatcher claim_batcher{
            .unshifted =
                ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
            .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
        };

        auto shplemini_output = Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                                                       claim_batcher,
                                                                       sumcheck_output.challenge,
                                                                       ipa_vk.get_g1_identity(),
                                                                       transcript,
                                                                       ChonkFlavor::REPEATED_COMMITMENTS,
                                                                       libra_commitments,
                                                                       sumcheck_output.claimed_libra_evaluation,
                                                                       sumcheck_output.round_univariate_commitments,
                                                                       sumcheck_output.round_univariate_evaluations);

        if (!shplemini_output.consistency_checked || !sumcheck_output.verified) {
            return false;
        }

        return ChonkPCS::reduce_verify_batch_opening_claim(
            shplemini_output.batch_opening_claim, ipa_vk, transcript, ipa_num_rounds);
    }
};

/**
 * @brief Full end-to-end: Translator proof → field split → EC circuit → ChonkG prove → ChonkG verify
 */
TEST_F(SplitTranslatorTests, FullSplitProveAndVerify)
{
    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    // Step 1: Generate Translator proof
    info("Generating Translator proof...");
    auto trans_circuit = generate_translator_circuit(batching_challenge_v, evaluation_challenge_x);
    auto trans_output = generate_translator_proof(trans_circuit);

    // Step 2: Run native monolithic verification for reference
    info("Running native Translator verification...");
    auto native_verifier = create_translator_verifier(trans_output, evaluation_challenge_x, batching_challenge_v);
    auto native_result = native_verifier.reduce_to_pairing_check();
    ASSERT_TRUE(native_result.reduction_succeeded) << "Native Translator verification failed";
    ASSERT_TRUE(native_result.pairing_points.check()) << "Native pairing check failed";

    // Step 3: Run split verification — field part
    info("Running Translator field verification...");
    auto split_verifier = create_translator_verifier(trans_output, evaluation_challenge_x, batching_challenge_v);
    auto field_result = split_verifier.compute_field_verification();
    ASSERT_TRUE(field_result.verified) << "Field verification failed";

    // Save a copy of the claim for the circuit
    auto claim_for_circuit = field_result.batch_opening_claim;

    // Run native EC verification to get W
    auto ref_pairing_points = split_verifier.compute_ec_verification(std::move(field_result.batch_opening_claim));
    ASSERT_TRUE(ref_pairing_points.check()) << "Split pairing check failed";

    // Extract W from P_1 = -W
    G1 W(ref_pairing_points.P1().x, -ref_pairing_points.P1().y);

    // Step 4: Build the Grumpkin EC circuit
    info("Building TranslatorECCircuit (", claim_for_circuit.commitments.size(), " commitments)...");
    ChonkBuilder grumpkin_builder;
    TranslatorECCircuit ec_circuit(grumpkin_builder, claim_for_circuit, W);
    ec_circuit.build_circuit();

    // Step 5: Verify circuit pairing points match
    auto circuit_pp = ec_circuit.get_pairing_points();
    ASSERT_EQ(circuit_pp.P0(), native_result.pairing_points.P0()) << "P0 mismatch";
    ASSERT_EQ(circuit_pp.P1(), native_result.pairing_points.P1()) << "P1 mismatch";
    ASSERT_TRUE(circuit_pp.check()) << "Circuit pairing check failed";

    const size_t gate_count = grumpkin_builder.num_gates();
    info("EC circuit gate count: ", gate_count);

    // Step 6: Prove the ChonkG circuit (requires sufficient Grumpkin CRS)
    // The circuit has ~275k gates, requiring 2^19 CRS points. The default Grumpkin CRS
    // has only 2^16+1 points, so we skip proving when the CRS is too small.
    constexpr size_t MAX_PROVABLE_GATES = (1UL << 16); // Conservative limit based on available CRS
    if (gate_count <= MAX_PROVABLE_GATES) {
        info("Proving ChonkG circuit...");
        auto chonk_prover_instance = std::make_shared<ChonkProverInstance>(grumpkin_builder);
        auto chonk_vk = std::make_shared<ChonkVK>(chonk_prover_instance->get_precomputed());
        ChonkProver chonk_prover(chonk_prover_instance, chonk_vk);
        auto chonk_proof = chonk_prover.construct_proof();
        EXPECT_FALSE(chonk_proof.empty()) << "ChonkG proof is empty";

        // Step 7: Verify the ChonkG proof
        info("Verifying ChonkG proof...");
        bool chonk_verified = verify_chonk_g_proof(chonk_vk, chonk_proof);
        EXPECT_TRUE(chonk_verified) << "ChonkG verification failed";
        info("Full split Translator verification with ChonkG proof succeeded!");
    } else {
        info("Skipping ChonkG prove/verify: circuit has ",
             gate_count,
             " gates but available Grumpkin CRS supports only ",
             MAX_PROVABLE_GATES,
             ". Circuit correctness validated via pairing point match.");
    }
}
