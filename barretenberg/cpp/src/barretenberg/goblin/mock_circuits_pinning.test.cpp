#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Class for translator and ECCVM-related tests.
 */
class GoblinTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { srs::init_crs_factory("../srs_db/ignition"); }
};

/**
 * @brief Test simple circuit with public inputs and missing point at infinity.
 */
TEST_F(GoblinTests, TranslatorMissingPointAtInfinity)
{
    using G1 = g1::affine_element;
    using Fr = fr;
    using Fq = fq;

    auto P1 = G1::infinity();
    bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");

    // Add the same operations to the ECC op queue; the native computation is performed under the hood.
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    for (size_t i = 0; i < 1; i++) {
        op_queue->mul_accumulate(P1, Fr(0));
    }

    auto prover_transcript = std::make_shared<TranslatorFlavor::Transcript>();

    auto eccvm_builder = std::make_unique<ECCVMCircuitBuilder>(op_queue);

    auto eccvm_prover = std::make_unique<ECCVMProver>(*eccvm_builder);

    auto eccvm_proof = eccvm_prover->construct_proof();
    auto translation_evaluations = eccvm_prover->translation_evaluations;
    info(translation_evaluations.Px);

    prover_transcript->send_to_verifier("init", Fq::random_element());
    prover_transcript->export_proof();

    auto translator_circuit_builder = TranslatorFlavor::CircuitBuilder(
        eccvm_prover->translation_batching_challenge_v, eccvm_prover->evaluation_challenge_x, op_queue);
    EXPECT_TRUE(translator_circuit_builder.check_circuit());

    TranslatorProver prover{ translator_circuit_builder, prover_transcript };
    auto proof = prover.construct_proof();

    auto verifier_transcript = std::make_shared<TranslatorFlavor::Transcript>(prover_transcript->proof_data);
    verifier_transcript->template receive_from_prover<Fq>("init");
    TranslatorVerifier verifier(prover.key, verifier_transcript);

    info(verifier.relation_parameters.accumulated_result);

    bool verified = verifier.verify_proof(proof);
    EXPECT_TRUE(!verified);
}

/**
 * @brief For benchmarking, we want to be sure that our mocking functions create circuits of a known size. We control
 * this, to the degree that matters for proof construction time, using these "pinning tests" that fix values.
 *
 */
class MegaMockCircuitsPinning : public ::testing::Test {
  protected:
    using DeciderProvingKey = DeciderProvingKey_<MegaFlavor>;
    static void SetUpTestSuite() { srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(MegaMockCircuitsPinning, FunctionSizes)
{
    const auto run_test = [](bool large) {
        GoblinProver goblin;
        MegaCircuitBuilder app_circuit{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_function_circuit(app_circuit, large);
        auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit);
        if (large) {
            EXPECT_EQ(proving_key->proving_key.log_circuit_size, 19);
        } else {
            EXPECT_EQ(proving_key->proving_key.log_circuit_size, 17);
        };
    };
    run_test(true);
    run_test(false);
}

TEST_F(MegaMockCircuitsPinning, AppCircuitSizes)
{
    const auto run_test = [](bool large) {
        GoblinProver goblin;
        MegaCircuitBuilder app_circuit{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_app_circuit(app_circuit, large);
        auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit);
        if (large) {
            EXPECT_EQ(proving_key->proving_key.log_circuit_size, 19);
        } else {
            EXPECT_EQ(proving_key->proving_key.log_circuit_size, 17);
        };
    };
    run_test(true);
    run_test(false);
}

/**
 * @brief Regression test that the structured circuit size has not increased over a power of 2.
 */
TEST_F(MegaMockCircuitsPinning, SmallTestStructuredCircuitSize)
{
    GoblinProver goblin;
    MegaCircuitBuilder app_circuit{ goblin.op_queue };
    auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit, TraceStructure::SMALL_TEST);
    EXPECT_EQ(proving_key->proving_key.log_circuit_size, 18);
}

TEST_F(MegaMockCircuitsPinning, ClientIVCBenchStructuredCircuitSize)
{
    GoblinProver goblin;
    MegaCircuitBuilder app_circuit{ goblin.op_queue };
    auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit, TraceStructure::CLIENT_IVC_BENCH);
    EXPECT_EQ(proving_key->proving_key.log_circuit_size, 19);
}

TEST_F(MegaMockCircuitsPinning, E2EStructuredCircuitSize)
{
    GoblinProver goblin;
    MegaCircuitBuilder app_circuit{ goblin.op_queue };
    auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit, TraceStructure::E2E_FULL_TEST);
    EXPECT_EQ(proving_key->proving_key.log_circuit_size, 20);
}