#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

#include <gtest/gtest.h>
using namespace bb;

using CircuitBuilder = TranslatorFlavor::CircuitBuilder;
using Transcript = TranslatorFlavor::Transcript;
using OpQueue = ECCOpQueue;
static auto& engine = numeric::get_debug_randomness();

class TranslatorTests : public ::testing::Test {
    using G1 = g1::affine_element;
    using Fr = fr;
    using Fq = fq;

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Helper function to add no-ops
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

    // Construct a test circuit based on some random operations
    static CircuitBuilder generate_test_circuit(const Fq& batching_challenge_v,
                                                const Fq& evaluation_challenge_x,
                                                const size_t circuit_size_parameter = 500)
    {

        // Add the same operations to the ECC op queue; the native computation is performed under the hood.
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

    static bool prove_and_verify(const CircuitBuilder& circuit_builder,
                                 const Fq& evaluation_challenge_x,
                                 const Fq& batching_challenge_v)
    {
        // Setup prover transcript
        auto prover_transcript = std::make_shared<Transcript>();
        prover_transcript->send_to_verifier("init", Fq::random_element());
        auto initial_transcript = prover_transcript->export_proof();

        // Setup verifier transcript
        auto verifier_transcript = std::make_shared<Transcript>();
        verifier_transcript->load_proof(initial_transcript);
        verifier_transcript->template receive_from_prover<Fq>("init");

        // Create proving key and prover
        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        TranslatorProver prover{ proving_key, prover_transcript };

        // Generate proof
        auto proof = prover.construct_proof();

        // Create verifier
        auto verification_key = std::make_shared<TranslatorFlavor::VerificationKey>(proving_key->proving_key);
        TranslatorVerifier verifier(verification_key, verifier_transcript);

        // Verify proof and return result
        return verifier.verify_proof(proof, evaluation_challenge_x, batching_challenge_v);
    }
};

/**
 * @brief Check that size of a Translator proof matches the corresponding constant
 *@details If this test FAILS, then the following (non-exhaustive) list should probably be updated as well:
 * - Proof length formula in translator_flavor.hpp, etc...
 * - translator_transcript.test.cpp
 * - constants in yarn-project in: constants.nr, constants.gen.ts, ConstantsGen.sol
 */
TEST_F(TranslatorTests, ProofLengthCheck)
{
    using Fq = fq;

    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    // Generate a circuit and its verification key (computed at runtime from the proving key)
    CircuitBuilder circuit_builder = generate_test_circuit(batching_challenge_v, evaluation_challenge_x);

    // Setup prover transcript
    auto prover_transcript = std::make_shared<Transcript>();
    prover_transcript->send_to_verifier("init", Fq::random_element());
    prover_transcript->export_proof();
    auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
    TranslatorProver prover{ proving_key, prover_transcript };

    // Generate proof
    auto proof = prover.construct_proof();

    EXPECT_EQ(proof.size(), TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
}

/**
 * @brief Test simple circuit with public inputs
 *
 */
TEST_F(TranslatorTests, Basic)
{
    using Fq = fq;

    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    // Generate a circuit without no-ops
    CircuitBuilder circuit_builder = generate_test_circuit(batching_challenge_v, evaluation_challenge_x);

    EXPECT_TRUE(TranslatorCircuitChecker::check(circuit_builder));
    bool verified = prove_and_verify(circuit_builder, evaluation_challenge_x, batching_challenge_v);
    EXPECT_TRUE(verified);
}

/**
 * @brief Test Translator operates correctly for AVM i.e. when we only run Goblin on a single table of ecc ops and we
 * should not expect random ops to appear at the end of Translator trace.
 *
 */
TEST_F(TranslatorTests, BasicAvmMode)
{
    using Fq = fq;

    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    // Add the same operations to the ECC op queue; the native computation is performed under the hood.
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    op_queue->no_op_ultra_only();
    add_random_ops(op_queue, CircuitBuilder::NUM_RANDOM_OPS_START);
    add_mixed_ops(op_queue, 100);
    op_queue->merge();
    auto circuit_builder = CircuitBuilder{ batching_challenge_v, evaluation_challenge_x, op_queue, /*avm_mode=*/true };

    EXPECT_TRUE(TranslatorCircuitChecker::check(circuit_builder));
    bool verified = prove_and_verify(circuit_builder, evaluation_challenge_x, batching_challenge_v);
    EXPECT_TRUE(verified);
}

/**
 * @brief Ensure that the fixed VK from the default constructor agrees with those computed manually for an arbitrary
 * circuit
 * @note If this test fails, it may be because the constant CONST_TRANSLATOR_LOG_N has changed and the fixed VK
 * commitments in TranslatorFixedVKCommitments must be updated accordingly. Their values can be taken right from the
 * output of this test.
 *
 */
TEST_F(TranslatorTests, FixedVK)
{
    using Fq = fq;

    auto prover_transcript = std::make_shared<Transcript>();
    prover_transcript->send_to_verifier("init", Fq::random_element());
    prover_transcript->export_proof();
    Fq batching_challenge_v = Fq::random_element();
    Fq evaluation_challenge_x = Fq::random_element();

    // Generate the default fixed VK
    TranslatorFlavor::VerificationKey fixed_vk{};

    // Lambda for manually computing a verification key for a given circuit and comparing it to the fixed VK
    auto compare_computed_vk_against_fixed = [&](size_t circuit_size_parameter) {
        CircuitBuilder circuit_builder =
            generate_test_circuit(batching_challenge_v, evaluation_challenge_x, circuit_size_parameter);
        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        TranslatorProver prover{ proving_key, prover_transcript };
        TranslatorFlavor::VerificationKey computed_vk(proving_key->proving_key);
        auto labels = TranslatorFlavor::VerificationKey::get_labels();
        size_t index = 0;
        for (auto [vk_commitment, fixed_commitment] : zip_view(computed_vk.get_all(), fixed_vk.get_all())) {
            EXPECT_EQ(vk_commitment, fixed_commitment)
                << "Mismatch between computed vk_commitment and fixed_commitment at label: " << labels[index];
            ++index;
        }

        EXPECT_EQ(computed_vk, fixed_vk);
    };

    // Check consistency of the fixed VK with the computed VK for some different circuit sizes
    const size_t circuit_size_parameter_1 = 1 << 2;
    const size_t circuit_size_parameter_2 = 1 << 3;

    compare_computed_vk_against_fixed(circuit_size_parameter_1);
    compare_computed_vk_against_fixed(circuit_size_parameter_2);
}
