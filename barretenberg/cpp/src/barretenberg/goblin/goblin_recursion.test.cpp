#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

class GoblinRecursionTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using KernelInput = Goblin::AccumulationOutput;
    using ProverInstance = ProverInstance_<GoblinUltraFlavor>;
    using VerifierInstance = VerifierInstance_<GoblinUltraFlavor>;

    static Goblin::AccumulationOutput construct_accumulator(GoblinUltraCircuitBuilder& builder)
    {
        auto prover_instance = std::make_shared<ProverInstance>(builder);
        auto verification_key = std::make_shared<GoblinUltraFlavor::VerificationKey>(prover_instance->proving_key);
        auto verifier_instance = std::make_shared<VerifierInstance>(verification_key);
        GoblinUltraProver prover(prover_instance);
        auto ultra_proof = prover.construct_proof();
        return { ultra_proof, verifier_instance->verification_key };
    }
};

/**
 * @brief A full Goblin test that mimicks the basic aztec client architecture
 * @details
 */
TEST_F(GoblinRecursionTests, Vanilla)
{
    Goblin goblin;

    Goblin::AccumulationOutput accumulator;

    size_t NUM_CIRCUITS = 2;
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {

        // Construct and accumulate a mock function circuit
        GoblinUltraCircuitBuilder circuit{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_function_circuit(circuit);
        goblin.merge(circuit);
        accumulator = construct_accumulator(circuit);
    }

    Goblin::Proof proof = goblin.prove();
    // Verify the final ultra proof
    GoblinUltraVerifier ultra_verifier{ accumulator.verification_key };
    bool ultra_verified = ultra_verifier.verify_proof(accumulator.proof);
    // Verify the goblin proof (eccvm, translator, merge)
    bool verified = goblin.verify(proof);
    EXPECT_TRUE(ultra_verified && verified);
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/787) Expand these tests.
