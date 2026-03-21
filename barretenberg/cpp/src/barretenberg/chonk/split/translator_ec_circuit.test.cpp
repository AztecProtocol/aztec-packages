/**
 * @brief Tests for TranslatorECCircuit: KZG reduction MSM in a Grumpkin circuit.
 * @details Generates a Translator proof, runs field verification to get a BatchOpeningClaim,
 * then builds the EC circuit and verifies the pairing points match the native result.
 */
#include "translator_ec_circuit.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

#include <gtest/gtest.h>
using namespace bb;

class TranslatorECCircuitTests : public ::testing::Test {
  protected:
    using G1 = g1::affine_element;
    using Fr = fr;
    using Fq = fq;
    using Flavor = TranslatorFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using CircuitBuilder = Flavor::CircuitBuilder;
    using Transcript = Flavor::Transcript;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

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

    static CircuitBuilder generate_test_circuit(const Fq& batching_challenge_v,
                                                const Fq& evaluation_challenge_x,
                                                const size_t circuit_size_parameter = 500)
    {
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

    struct ProverOutput {
        HonkProof proof;
        std::vector<Fr> initial_transcript;
        std::array<Commitment, Flavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
        uint256_t accumulated_result;
    };

    static ProverOutput generate_proof(const CircuitBuilder& circuit_builder)
    {
        auto prover_transcript = std::make_shared<Transcript>();
        prover_transcript->send_to_verifier("init", Fq::random_element());
        auto initial_transcript = prover_transcript->export_proof();

        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        TranslatorProver prover{ proving_key, prover_transcript };
        auto proof = prover.construct_proof();

        std::array<Commitment, Flavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
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

    static TranslatorVerifier create_verifier(const ProverOutput& output,
                                              const Fq& evaluation_challenge_x,
                                              const Fq& batching_challenge_v)
    {
        auto verifier_transcript = std::make_shared<Transcript>(output.initial_transcript);
        verifier_transcript->template receive_from_prover<Fq>("init");

        return TranslatorVerifier(verifier_transcript,
                                  output.proof,
                                  evaluation_challenge_x,
                                  batching_challenge_v,
                                  output.accumulated_result,
                                  output.op_queue_commitments);
    }
};

/**
 * @brief Verify that the EC circuit produces the same pairing points as native KZG reduction.
 */
TEST_F(TranslatorECCircuitTests, ECCircuitMatchesNative)
{
    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    auto circuit_builder = generate_test_circuit(batching_challenge_v, evaluation_challenge_x);
    auto output = generate_proof(circuit_builder);

    // Run native monolithic verification for reference
    auto native_verifier = create_verifier(output, evaluation_challenge_x, batching_challenge_v);
    auto native_result = native_verifier.reduce_to_pairing_check();
    ASSERT_TRUE(native_result.reduction_succeeded) << "Native verification failed";
    ASSERT_TRUE(native_result.pairing_points.check()) << "Native pairing check failed";

    // Run split verification: field then EC
    auto split_verifier = create_verifier(output, evaluation_challenge_x, batching_challenge_v);
    auto field_result = split_verifier.compute_field_verification();
    ASSERT_TRUE(field_result.verified) << "Field verification failed";

    // Save a copy of the claim for the circuit (EC verification will consume it via move)
    auto claim_for_circuit = field_result.batch_opening_claim;

    // Run native EC verification to get reference pairing points and extract W
    auto ref_pairing_points = split_verifier.compute_ec_verification(std::move(field_result.batch_opening_claim));
    ASSERT_TRUE(ref_pairing_points.check()) << "Split pairing check failed";

    // Extract W from P_1 = -W, i.e., W = (P_1.x, -P_1.y)
    G1 W(ref_pairing_points.P1().x, -ref_pairing_points.P1().y);

    info("BatchOpeningClaim size: ", claim_for_circuit.commitments.size());
    info("Building TranslatorECCircuit...");

    // Build the Grumpkin circuit
    GrumpkinUltraCircuitBuilder grumpkin_builder;
    TranslatorECCircuit ec_circuit(grumpkin_builder, claim_for_circuit, W);
    ec_circuit.build_circuit();

    // Extract pairing points from the circuit
    auto circuit_pairing_points = ec_circuit.get_pairing_points();

    // Verify pairing points match the native result
    EXPECT_EQ(circuit_pairing_points.P0(), native_result.pairing_points.P0())
        << "P0 mismatch between circuit and native";
    EXPECT_EQ(circuit_pairing_points.P1(), native_result.pairing_points.P1())
        << "P1 mismatch between circuit and native";

    // Also verify the pairing check passes
    EXPECT_TRUE(circuit_pairing_points.check()) << "Circuit pairing check failed";

    info("TranslatorECCircuit gate count: ", grumpkin_builder.num_gates());
}
