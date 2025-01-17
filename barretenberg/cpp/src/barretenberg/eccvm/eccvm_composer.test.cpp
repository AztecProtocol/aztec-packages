#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"

using namespace bb;
using FF = ECCVMFlavor::FF;
using PK = ECCVMFlavor::ProvingKey;
class ECCVMTests : public ::testing::Test {
  protected:
    void SetUp() override { srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path()); };
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

    // Compute z_perm and inverse polynomial for our logarithmic-derivative lookup method
    compute_logderivative_inverse<ECCVMFlavor, ECCVMFlavor::LookupRelation>(
        pk->polynomials, relation_parameters, pk->circuit_size);
    compute_grand_products<ECCVMFlavor>(pk->polynomials, relation_parameters);

    // Generate gate challenges
    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        gate_challenges[idx] = FF::random_element();
    }
}

TEST_F(ECCVMTests, BaseCase)
{
    ECCVMCircuitBuilder builder = generate_circuit(&engine);
    ECCVMProver prover(builder);
    ECCVMProof proof = prover.construct_proof();
    ECCVMVerifier verifier(prover.key);
    bool verified = verifier.verify_proof(proof);

    ASSERT_TRUE(verified);
}

TEST_F(ECCVMTests, EqFails)
{
    auto builder = generate_circuit(&engine);
    // Tamper with the eq op such that the expected value is incorect
    builder.op_queue->add_erroneous_equality_op_for_testing();

    builder.op_queue->num_transcript_rows++;
    ECCVMProver prover(builder);

    ECCVMProof proof = prover.construct_proof();
    ECCVMVerifier verifier(prover.key);
    bool verified = verifier.verify_proof(proof);
    ASSERT_FALSE(verified);
}

TEST_F(ECCVMTests, CommitedSumcheck)
{
    using Flavor = ECCVMFlavor;
    using ProvingKey = ECCVMFlavor::ProvingKey;
    using SumcheckProver = SumcheckProver<ECCVMFlavor>;
    using FF = ECCVMFlavor::FF;
    using Transcript = Flavor::Transcript;
    using ZKData = ZKSumcheckData<Flavor>;

    bb::RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);

    ECCVMCircuitBuilder builder = generate_circuit(&engine);

    ECCVMProver prover(builder);
    auto pk = std::make_shared<ProvingKey>(builder);
    const size_t log_circuit_size = pk->log_circuit_size;

    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();

    // Prepare the inputs for the sumcheck prover:
    // Compute and add beta to relation parameters
    const FF alpha = FF::random_element();
    complete_proving_key_for_test(relation_parameters, pk, gate_challenges);

    auto sumcheck_prover = SumcheckProver(pk->circuit_size, prover_transcript);

    ZKData zk_sumcheck_data = ZKData(log_circuit_size, prover_transcript);

    auto prover_output = sumcheck_prover.prove(
        pk->polynomials, relation_parameters, alpha, gate_challenges, zk_sumcheck_data, pk->commitment_key);

    ECCVMVerifier verifier(prover.key);
    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>(prover_transcript->proof_data);

    // Execute Sumcheck Verifier
    SumcheckVerifier<Flavor> sumcheck_verifier = SumcheckVerifier<Flavor>(log_circuit_size, verifier_transcript);
    SumcheckOutput<ECCVMFlavor> verifier_output = sumcheck_verifier.verify(relation_parameters, alpha, gate_challenges);

    // Evaluate prover's round univariates at corresponding challenges and compare them with the claimed evaluations
    // computed by the verifier
    for (size_t idx = 0; idx < log_circuit_size; idx++) {
        FF true_eval_at_the_challenge = prover_output.round_univariates[idx].evaluate(prover_output.challenge[idx]);
        FF verifier_eval_at_the_challenge = verifier_output.round_univariate_evaluations[idx][2];
        EXPECT_TRUE(true_eval_at_the_challenge == verifier_eval_at_the_challenge);
    }

    // Check that the first sumcheck univariate is consistent with the claimed ZK Sumchek Sum
    FF prover_target_sum = zk_sumcheck_data.libra_challenge * zk_sumcheck_data.libra_total_sum;

    EXPECT_TRUE(prover_target_sum == verifier_output.round_univariate_evaluations[0][0] +
                                         verifier_output.round_univariate_evaluations[0][1]);

    EXPECT_TRUE(verifier_output.verified.value());
}
