/**
 * @brief Tests for the split of Translator verification into field and EC parts.
 * @details Validates that compute_field_verification() + compute_ec_verification() produces
 * the same result as the monolithic reduce_to_pairing_check().
 */
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

#include <gtest/gtest.h>
using namespace bb;

class TranslatorSplitTests : public ::testing::Test {
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

    /**
     * @brief Helper struct to hold all data needed to construct a verifier
     */
    struct ProverOutput {
        HonkProof proof;
        std::vector<Fr> initial_transcript;
        std::array<Commitment, Flavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
        uint256_t accumulated_result;
    };

    /**
     * @brief Generate a proof and extract all data needed for verification
     */
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

    /**
     * @brief Create a TranslatorVerifier from prover output
     */
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
 * @brief Verify that the split produces identical pairing points to the monolithic verifier
 */
TEST_F(TranslatorSplitTests, SplitMatchesMonolithic)
{
    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    auto circuit_builder = generate_test_circuit(batching_challenge_v, evaluation_challenge_x);
    auto output = generate_proof(circuit_builder);

    // Run monolithic verification
    auto monolithic_verifier = create_verifier(output, evaluation_challenge_x, batching_challenge_v);
    auto monolithic_result = monolithic_verifier.reduce_to_pairing_check();
    ASSERT_TRUE(monolithic_result.reduction_succeeded) << "Monolithic verification failed";
    ASSERT_TRUE(monolithic_result.pairing_points.check()) << "Monolithic pairing check failed";

    // Run split verification
    auto split_verifier = create_verifier(output, evaluation_challenge_x, batching_challenge_v);
    auto field_result = split_verifier.compute_field_verification();
    ASSERT_TRUE(field_result.verified) << "Field verification failed";

    auto split_pairing_points = split_verifier.compute_ec_verification(std::move(field_result.batch_opening_claim));
    ASSERT_TRUE(split_pairing_points.check()) << "Split pairing check failed";

    // Verify pairing points match exactly
    EXPECT_EQ(monolithic_result.pairing_points.P0, split_pairing_points.P0);
    EXPECT_EQ(monolithic_result.pairing_points.P1, split_pairing_points.P1);
}

/**
 * @brief Verify that the split field verification correctly reports the BatchOpeningClaim contents
 */
TEST_F(TranslatorSplitTests, FieldVerificationProducesClaim)
{
    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    auto circuit_builder = generate_test_circuit(batching_challenge_v, evaluation_challenge_x);
    auto output = generate_proof(circuit_builder);

    auto verifier = create_verifier(output, evaluation_challenge_x, batching_challenge_v);
    auto field_result = verifier.compute_field_verification();

    EXPECT_TRUE(field_result.verified);

    // The batch opening claim should have matching-length commitments and scalars
    EXPECT_EQ(field_result.batch_opening_claim.commitments.size(),
              field_result.batch_opening_claim.scalars.size());
    EXPECT_GT(field_result.batch_opening_claim.commitments.size(), 0);

    // evaluation_point should be non-zero (it's the Shplonk z challenge)
    EXPECT_NE(field_result.batch_opening_claim.evaluation_point, TranslatorFlavor::FF::zero());

    info("BatchOpeningClaim size: ", field_result.batch_opening_claim.commitments.size());
}

