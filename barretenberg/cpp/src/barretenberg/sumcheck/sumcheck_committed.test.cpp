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

TEST_F(ECCVMTests, BaseCase)
{
    using Flavor = ECCVMFlavor;
    using ProvingKey = ECCVMFlavor::ProvingKey;
    using SumcheckProver = SumcheckProver<ECCVMFlavor>;
    using FF = ECCVMFlavor::FF;
    using ZKData = ZKSumcheckData<Flavor>;
    bb::RelationParameters<FF> relation_parameters;

    ECCVMCircuitBuilder builder = generate_circuit(&engine);
    ECCVMProver prover(builder);
    auto key = std::make_shared<ProvingKey>(builder);

    // Compute and add beta to relation parameters
    const FF beta = FF::random_element();

    const FF gamma = FF::random_element();
    // TODO(#583)(@zac-williamson): fix Transcript to be able to generate more than 2 challenges per round! oof.
    const FF beta_sqr = beta * beta;
    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;
    relation_parameters.beta_sqr = beta_sqr;
    relation_parameters.beta_cube = beta_sqr * beta;
    relation_parameters.eccvm_set_permutation_delta =
        gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
    relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();
    // Compute inverse polynomial for our logarithmic-derivative lookup method
    compute_logderivative_inverse<Flavor, typename Flavor::LookupRelation>(
        key->polynomials, relation_parameters, key->circuit_size);

    auto sumcheck_prover = SumcheckProver(key->circuit_size, prover.transcript);
    const FF alpha = FF::random_element();

    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        gate_challenges[idx] = FF::random_element();
    }
    ZKData zk_sumcheck_data = ZKData(key->log_circuit_size, prover.transcript, key->commitment_key);

    auto prover_output = sumcheck_prover.prove(
        key->polynomials, relation_parameters, alpha, gate_challenges, zk_sumcheck_data, key->commitment_key);

    ECCVMVerifier verifier(prover.key);

    const auto circuit_size = verifier.transcript->template receive_from_prover<uint32_t>("circuit_size");

    // Execute Sumcheck Verifier
    const size_t log_circuit_size = numeric::get_msb(circuit_size);
    auto sumcheck_verifier = SumcheckVerifier<Flavor>(log_circuit_size, verifier.transcript);

    // Receive commitments to Libra masking polynomials

    auto sumcheck_output = sumcheck_verifier.verify(relation_parameters, alpha, gate_challenges);

    ASSERT_TRUE(sumcheck_output.verified);
}
