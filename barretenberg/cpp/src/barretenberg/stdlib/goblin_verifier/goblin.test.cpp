#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

class GoblinTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
    }

    using Builder = MegaCircuitBuilder;
    using ECCVMVerificationKey = bb::ECCVMFlavor::VerificationKey;
    using TranslatorVerificationKey = bb::TranslatorFlavor::VerificationKey;

    static Builder construct_mock_circuit(std::shared_ptr<ECCOpQueue> op_queue)
    {
        Builder circuit{ op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, /*target_log2_dyadic_size=*/8);
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }
};

/**
 * @brief A simple test demonstrating goblin proof construction / verification based on operations from a collection of
 * circuits
 *
 */
TEST_F(GoblinTests, MultipleCircuits)
{
    Goblin goblin;

    // Construct and accumulate multiple circuits
    size_t NUM_CIRCUITS = 3;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = construct_mock_circuit(goblin.op_queue);
        goblin.prove_merge();
    }

    // Construct a goblin proof which consists of a merge proof and ECCVM/Translator proofs
    GoblinProof proof = goblin.prove();

    // Verify the goblin proof (eccvm, translator, merge)
    bool verified = goblin.verify(proof);

    EXPECT_TRUE(verified);
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/787) Expand these tests.
