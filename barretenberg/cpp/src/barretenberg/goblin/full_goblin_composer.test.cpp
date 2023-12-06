#include "barretenberg/eccvm/eccvm_composer.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/goblin/utils.hpp"
#include "barretenberg/proof_system/circuit_builder/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/translator_vm/goblin_translator_composer.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

#include <gtest/gtest.h>

#pragma GCC diagnostic ignored "-Wunused-variable"

using namespace barretenberg;
using namespace proof_system::honk;

namespace test_full_goblin_composer {

class FullGoblinComposerTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        barretenberg::srs::init_crs_factory("../srs_db/ignition");
        barretenberg::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Fbase = Curve::BaseField;
    using Point = Curve::AffineElement;
    using CommitmentKey = pcs::CommitmentKey<Curve>;
    using OpQueue = proof_system::ECCOpQueue;
    using GoblinUltraBuilder = proof_system::GoblinUltraCircuitBuilder;
    using ECCVMFlavor = flavor::ECCVM;
    using ECCVMBuilder = proof_system::ECCVMCircuitBuilder<ECCVMFlavor>;
    using ECCVMComposer = ECCVMComposer_<ECCVMFlavor>;
    using TranslatorFlavor = flavor::GoblinTranslator;
    using TranslatorBuilder = proof_system::GoblinTranslatorCircuitBuilder;
    using TranslatorComposer = GoblinTranslatorComposer;
    using TranslatorConsistencyData = barretenberg::TranslationEvaluations;
    using Proof = proof_system::plonk::proof;
    using NativeVerificationKey = flavor::GoblinUltra::VerificationKey;

    using KernelInput = Goblin::AccumulationOutput;
    using GoblinProof = barretenberg::Goblin::GoblinProof;

    static constexpr size_t NUM_OP_QUEUE_COLUMNS = proof_system::honk::flavor::GoblinUltra::NUM_WIRES;
};

/**
 * @brief Test proof construction/verification for a circuit with ECC op gates, public inputs, and basic arithmetic
 * gates
 * @note We simulate op queue interactions with a previous circuit so the actual circuit under test utilizes an op queue
 * with non-empty 'previous' data. This avoids complications with zero-commitments etc.
 *
 */
TEST_F(FullGoblinComposerTests, SimpleCircuit)
{
    barretenberg::Goblin goblin;

    // Construct an initial circuit; its proof will be recursively verified by the first kernel
    info("Initial circuit.");
    GoblinUltraBuilder initial_circuit{ goblin.op_queue };
    GoblinTestingUtils::construct_simple_initial_circuit(initial_circuit);
    KernelInput kernel_input = goblin.accumulate(initial_circuit);

    // Construct a series of simple Goblin circuits; generate and verify their proofs
    size_t NUM_CIRCUITS = 2;
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {

        // Construct a circuit with logic resembling that of the "kernel circuit"
        info("\nKernel circuit ", circuit_idx);
        GoblinUltraBuilder circuit_builder{ goblin.op_queue };
        GoblinTestingUtils::construct_arithmetic_circuit(circuit_builder);

        // Construct proof of the current kernel circuit to be recursively verified by the next one
        kernel_input = goblin.accumulate(circuit_builder);
    }

    goblin.prove();
    bool verified = goblin.verify();
    EXPECT_TRUE(verified);
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/787) Expand these tests.
} // namespace test_full_goblin_composer
