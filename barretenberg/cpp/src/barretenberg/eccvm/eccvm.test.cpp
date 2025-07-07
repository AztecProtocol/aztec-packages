#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"

using namespace bb;
using FF = ECCVMFlavor::FF;
using PK = ECCVMFlavor::ProvingKey;
using Transcript = ECCVMFlavor::Transcript;
class ECCVMTests : public ::testing::Test {
  protected:
    void SetUp() override { srs::init_file_crs_factory(bb::srs::bb_crs_path()); };
};
namespace {
auto& engine = numeric::get_debug_randomness();
}

/**
 * @brief Adds operations in BN254 to the op_queue and then constructs and ECCVM circuit from the op_queue.
 *
 * @param engine
 * @return ECCVMCircuitBuilder
 */
ECCVMCircuitBuilder generate_circuit(numeric::RNG* engine = nullptr)
{
    using Curve = curve::BN254;
    using G1 = Curve::Element;
    using Fr = Curve::ScalarField;

    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
    G1 a = G1::random_element(engine);
    G1 b = G1::random_element(engine);
    G1 c = G1::random_element(engine);
    Fr x = Fr::random_element(engine);
    Fr y = Fr::random_element(engine);

    op_queue->add_accumulate(a);
    op_queue->mul_accumulate(a, x);
    op_queue->mul_accumulate(b, x);
    op_queue->mul_accumulate(b, y);
    op_queue->add_accumulate(a);
    op_queue->mul_accumulate(b, x);
    op_queue->eq_and_reset();
    op_queue->add_accumulate(c);
    op_queue->mul_accumulate(a, x);
    op_queue->mul_accumulate(b, x);
    op_queue->eq_and_reset();
    op_queue->mul_accumulate(a, x);
    op_queue->mul_accumulate(b, x);
    op_queue->mul_accumulate(c, x);
    ECCVMCircuitBuilder builder{ op_queue };
    return builder;
}
void complete_proving_key_for_test(bb::RelationParameters<FF>& relation_parameters,
                                   std::shared_ptr<PK>& pk,
                                   std::vector<FF>& gate_challenges)
{
    // Prepare the inputs for the sumcheck prover:
    // Compute and add beta to relation parameters
    const FF beta = FF::random_element();
    const FF gamma = FF::random_element();
    const FF beta_sqr = beta * beta;
    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;
    relation_parameters.beta_sqr = beta_sqr;
    relation_parameters.beta_cube = beta_sqr * beta;
    relation_parameters.eccvm_set_permutation_delta =
        gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
    relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();

    const size_t unmasked_witness_size = pk->circuit_size - NUM_DISABLED_ROWS_IN_SUMCHECK;
    // Compute z_perm and inverse polynomial for our logarithmic-derivative lookup method
    compute_logderivative_inverse<FF, ECCVMFlavor::LookupRelation>(
        pk->polynomials, relation_parameters, unmasked_witness_size);
    compute_grand_products<ECCVMFlavor>(pk->polynomials, relation_parameters, unmasked_witness_size);

    // Generate gate challenges
    for (size_t idx = 0; idx < CONST_ECCVM_LOG_N; idx++) {
        gate_challenges[idx] = FF::random_element();
    }
}

TEST_F(ECCVMTests, BaseCaseFixedSize)
{
    ECCVMCircuitBuilder builder = generate_circuit(&engine);

    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    ECCVMProof proof = prover.construct_proof();

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript);
    bool verified = verifier.verify_proof(proof);

    ASSERT_TRUE(verified);
}

TEST_F(ECCVMTests, EqFailsFixedSize)
{
    auto builder = generate_circuit(&engine);
    // Tamper with the eq op such that the expected value is incorect
    builder.op_queue->add_erroneous_equality_op_for_testing();

    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);

    ECCVMProof proof = prover.construct_proof();

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript);
    bool verified = verifier.verify_proof(proof);
    ASSERT_FALSE(verified);
}

TEST_F(ECCVMTests, CommittedSumcheck)
{
    using Flavor = ECCVMFlavor;
    using ProvingKey = ECCVMFlavor::ProvingKey;
    using FF = ECCVMFlavor::FF;
    using Transcript = Flavor::Transcript;
    using ZKData = ZKSumcheckData<Flavor>;

    bb::RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges(CONST_ECCVM_LOG_N);

    ECCVMCircuitBuilder builder = generate_circuit(&engine);
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto pk = std::make_shared<ProvingKey>(builder);

    // Prepare the inputs for the sumcheck prover:
    // Compute and add beta to relation parameters
    const FF alpha = FF::random_element();
    complete_proving_key_for_test(relation_parameters, pk, gate_challenges);

    // Clear the transcript
    prover_transcript = std::make_shared<Transcript>();

    // Run Sumcheck on the ECCVM Prover polynomials
    using SumcheckProver = SumcheckProver<ECCVMFlavor, CONST_ECCVM_LOG_N>;
    SumcheckProver sumcheck_prover(
        pk->circuit_size, pk->polynomials, prover_transcript, alpha, gate_challenges, relation_parameters);

    ZKData zk_sumcheck_data = ZKData(CONST_ECCVM_LOG_N, prover_transcript);

    auto prover_output = sumcheck_prover.prove(zk_sumcheck_data);

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    verifier_transcript->load_proof(prover_transcript->export_proof());

    // Execute Sumcheck Verifier
    SumcheckVerifier<Flavor, CONST_ECCVM_LOG_N> sumcheck_verifier(verifier_transcript, alpha);
    SumcheckOutput<ECCVMFlavor> verifier_output = sumcheck_verifier.verify(relation_parameters, gate_challenges);

    // Evaluate prover's round univariates at corresponding challenges and compare them with the claimed evaluations
    // computed by the verifier
    for (size_t idx = 0; idx < CONST_ECCVM_LOG_N; idx++) {
        FF true_eval_at_the_challenge = prover_output.round_univariates[idx].evaluate(prover_output.challenge[idx]);
        FF verifier_eval_at_the_challenge = verifier_output.round_univariate_evaluations[idx][2];
        EXPECT_TRUE(true_eval_at_the_challenge == verifier_eval_at_the_challenge);
    }

    // Check that the first sumcheck univariate is consistent with the claimed ZK Sumchek Sum
    FF prover_target_sum = zk_sumcheck_data.libra_challenge * zk_sumcheck_data.libra_total_sum;

    EXPECT_TRUE(prover_target_sum == verifier_output.round_univariate_evaluations[0][0] +
                                         verifier_output.round_univariate_evaluations[0][1]);

    EXPECT_TRUE(verifier_output.verified);
}

/**
 * @brief Test that the fixed VK from the default constructor agrees with the one computed for an arbitrary circuit.
 * @note If this test fails, it may be because the constant ECCVM_FIXED_SIZE has changed and the fixed VK commitments in
 * ECCVMFixedVKCommitments must be updated accordingly. Their values can be taken right from the output of this test.
 *
 */
TEST_F(ECCVMTests, FixedVK)
{
    // Generate a circuit and its verification key (computed at runtime from the proving key)
    ECCVMCircuitBuilder builder = generate_circuit(&engine);
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript);

    // Generate the default fixed VK
    ECCVMFlavor::VerificationKey fixed_vk{};
    // Generate a VK from PK
    ECCVMFlavor::VerificationKey vk_computed_by_prover(prover.key);

    // Set verifier PCS key to null in both the fixed VK and the generated VK
    fixed_vk.pcs_verification_key = VerifierCommitmentKey<curve::Grumpkin>();
    vk_computed_by_prover.pcs_verification_key = VerifierCommitmentKey<curve::Grumpkin>();

    auto labels = verifier.key->get_labels();
    size_t index = 0;
    for (auto [vk_commitment, fixed_commitment] : zip_view(vk_computed_by_prover.get_all(), fixed_vk.get_all())) {
        EXPECT_EQ(vk_commitment, fixed_commitment)
            << "Mismatch between vk_commitment and fixed_commitment at label: " << labels[index];
        ++index;
    }

    // Check that the fixed VK is equal to the generated VK
    EXPECT_EQ(fixed_vk, vk_computed_by_prover);
}
