#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "honk_recursion_constraint.hpp"
#include "proof_surgeon.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;
using namespace bb;

class IvcRecursionConstraintTest : public ::testing::Test {

  public:
    using Builder = MegaCircuitBuilder;
    using Flavor = MegaFlavor;
    using FF = Flavor::FF;
    using VerifierInputs = ClientIVC::VerifierInputs;
    using QUEUE_TYPE = ClientIVC::QUEUE_TYPE;
    using VerificationQueue = ClientIVC::VerificationQueue;
    using ArithmeticConstraint = AcirFormat::PolyTripleConstraint;

    /**
     * @brief Constuct a simple arbitrary circuit to represent a mock app circuit
     * @details Includes a single unique public input for robustness and to distinguish the public inputs of one "app"
     * from another in testing.
     *
     */
    static Builder construct_mock_app_circuit(ClientIVC& ivc)
    {
        Builder circuit{ ivc.goblin.op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);

        // add a random (unique) public input
        circuit.add_public_variable(FF::random_element());

        return circuit;
    }

    /**
     * @brief Create an ACIR RecursionConstraint given the corresponding verifier inputs
     * @brief In practice such constraints are created via a call to verify_proof(...) in noir
     *
     * @param input bberg style proof and verification key
     * @param witness Array of witnesses into which the above data is placed
     * @param num_public_inputs Number of public inputs to be extracted from the proof
     * @return RecursionConstraint
     */
    static RecursionConstraint create_recursion_constraint(const VerifierInputs& input,
                                                           SlabVector<FF>& witness,
                                                           const size_t num_public_inputs)
    {
        // Assemble simple vectors of witnesses for vkey and proof
        std::vector<FF> key_witnesses = input.honk_verification_key->to_field_elements();
        std::vector<FF> proof_witnesses = input.proof; // proof contains the public inputs at this stage

        // Construct witness indices for each component in the constraint; populate the witness array
        auto [key_indices, proof_indices, public_inputs_indices] =
            ProofSurgeon::populate_recursion_witness_data(witness, proof_witnesses, key_witnesses, num_public_inputs);

        // The proof type can be either Oink or PG
        PROOF_TYPE proof_type = input.type == QUEUE_TYPE::OINK ? OINK : PG;

        return RecursionConstraint{
            .key = key_indices,
            .proof = {}, // the proof witness indices are not needed in an ivc recursion constraint
            .public_inputs = public_inputs_indices,
            .key_hash = 0, // not used
            .proof_type = proof_type,
        };
    }

    /**
     * @brief Generate an acir program {constraints, witness} for a mock kernel
     * @details The IVC contains and internal verification queue that contains proofs to be recursively verified.
     * Construct an AcirProgram with a RecursionConstraint for each entry in the ivc verification queue. (In practice
     * these constraints would come directly from calls to verify_proof in noir).
     * @note This method needs the number of public inputs in each proof-to-be-verified so they can be extracted and
     * provided separately as is required in the acir constraint system.
     *
     * @param ivc
     * @param inner_circuit_num_pub_inputs Num pub inputs for each circuit whose accumulation is recursively verified
     * @return Builder
     */
    static AcirProgram construct_mock_kernel_program(const VerificationQueue& verification_queue,
                                                     const std::vector<size_t>& inner_circuit_num_pub_inputs)
    {
        ASSERT(verification_queue.size() == inner_circuit_num_pub_inputs.size());

        AcirProgram program;

        // Construct recursion constraints based on the ivc verification queue; populate the witness along the way
        std::vector<RecursionConstraint> ivc_recursion_constraints;
        ivc_recursion_constraints.reserve(verification_queue.size());
        for (size_t idx = 0; idx < verification_queue.size(); ++idx) {
            ivc_recursion_constraints.push_back(create_recursion_constraint(
                verification_queue[idx], program.witness, inner_circuit_num_pub_inputs[idx]));
        }

        // Construct a constraint system containing the business logic and ivc recursion constraints
        program.constraints.varnum = static_cast<uint32_t>(program.witness.size());
        program.constraints.num_acir_opcodes = static_cast<uint32_t>(ivc_recursion_constraints.size());
        program.constraints.ivc_recursion_constraints = ivc_recursion_constraints;
        program.constraints.original_opcode_indices = create_empty_original_opcode_indices();
        mock_opcode_indices(program.constraints);

        return program;
    }

  protected:
    void SetUp() override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }
};

/**
 * @brief Test IVC accumulation of a one app and one kernel; The kernel includes a recursive oink verification for the
 * app, specified via an ACIR RecursionConstraint.
 */
TEST_F(IvcRecursionConstraintTest, AccumulateTwo)
{
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

    // construct a mock app_circuit
    Builder app_circuit = construct_mock_app_circuit(ivc);

    // Complete instance and generate an oink proof
    ivc.accumulate(app_circuit);

    // Construct kernel_0 consisting only of the kernel completion logic
    AcirProgram program_0 = construct_mock_kernel_program(ivc.verification_queue, { app_circuit.public_inputs.size() });
    Builder kernel_0 = acir_format::create_kernel_circuit(program_0.constraints, ivc, program_0.witness);

    EXPECT_TRUE(CircuitChecker::check(kernel_0));
    ivc.accumulate(kernel_0);

    EXPECT_TRUE(ivc.prove_and_verify());
}

/**
 * @brief Test IVC accumulation of two apps and two kernels; The first kernel contains a recursive oink verification and
 * the second contains two recursive PG verifications, all specified via ACIR RecursionConstraints.
 */
TEST_F(IvcRecursionConstraintTest, AccumulateFour)
{
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

    // construct a mock app_circuit
    Builder app_circuit_0 = construct_mock_app_circuit(ivc);
    ivc.accumulate(app_circuit_0);

    // Construct kernel_0; consists of a single oink recursive verification for app (plus databus/merge logic)
    size_t num_pub_inputs_app_0 = app_circuit_0.public_inputs.size();
    AcirProgram program_0 = construct_mock_kernel_program(ivc.verification_queue, { num_pub_inputs_app_0 });
    Builder kernel_0 = acir_format::create_kernel_circuit(program_0.constraints, ivc, program_0.witness);
    ivc.accumulate(kernel_0);

    // construct a mock app_circuit
    Builder app_circuit_1 = construct_mock_app_circuit(ivc);
    ivc.accumulate(app_circuit_1);

    // Construct kernel_1; consists of two PG recursive verifications for kernel_0 and app_1 (plus databus/merge logic)
    size_t num_pub_inputs_kernel_0 = kernel_0.public_inputs.size();
    size_t num_pub_inputs_app_1 = app_circuit_0.public_inputs.size();
    AcirProgram program_1 =
        construct_mock_kernel_program(ivc.verification_queue, { num_pub_inputs_kernel_0, num_pub_inputs_app_1 });
    Builder kernel_1 = acir_format::create_kernel_circuit(program_1.constraints, ivc, program_1.witness);

    EXPECT_TRUE(CircuitChecker::check(kernel_1));
    ivc.accumulate(kernel_1);

    EXPECT_TRUE(ivc.prove_and_verify());
}

// Test generation of "init" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateVK)
{
    const TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    size_t num_app_public_inputs = 0;
    {
        ClientIVC ivc{ trace_settings };

        // Construct and accumulate mock app_circuit
        Builder app_circuit = construct_mock_app_circuit(ivc);
        ivc.accumulate(app_circuit);
        num_app_public_inputs = app_circuit.public_inputs.size();

        // Construct and accumulate kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc.verification_queue, { num_app_public_inputs });
        Builder kernel = acir_format::create_kernel_circuit(program.constraints, ivc, program.witness);
        ivc.accumulate(kernel);
        expected_kernel_vk = ivc.verification_queue.back().honk_verification_key;
    }

    // Now, construct the kernel VK by mocking the post app accumulation state of the IVC
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        ClientIVC ivc{ trace_settings };

        acir_format::mock_ivc_oink_accumulation(ivc, num_app_public_inputs - bb::PAIRING_POINT_ACCUMULATOR_SIZE);

        // Construct kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc.verification_queue, { num_app_public_inputs });
        Builder kernel = acir_format::create_kernel_circuit(program.constraints, ivc);
        // Note that this would normally happen in accumulate()
        kernel.add_pairing_point_accumulator(stdlib::recursion::init_default_agg_obj_indices<Builder>(kernel));

        auto proving_key = std::make_shared<DeciderProvingKey_<MegaFlavor>>(kernel, trace_settings);
        MegaProver prover(proving_key);
        kernel_vk = std::make_shared<MegaFlavor::VerificationKey>(prover.proving_key->proving_key);
    }

    // PCS verification keys will not match so set to null before comparing
    kernel_vk->pcs_verification_key = nullptr;
    expected_kernel_vk->pcs_verification_key = nullptr;

    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}

// Test generation of "init" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateVKFromConstraints)
{
    const TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    size_t num_app_public_inputs = 0;
    {
        ClientIVC ivc{ trace_settings };

        // Construct and accumulate mock app_circuit
        Builder app_circuit = construct_mock_app_circuit(ivc);
        ivc.accumulate(app_circuit);
        num_app_public_inputs = app_circuit.public_inputs.size();

        // Construct and accumulate kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc.verification_queue, { num_app_public_inputs });
        Builder kernel = acir_format::create_kernel_circuit(program.constraints, ivc, program.witness);

        ivc.accumulate(kernel);
        expected_kernel_vk = ivc.verification_queue.back().honk_verification_key;
    }

    // Now, construct the kernel VK by mocking the post app accumulation state of the IVC
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        ClientIVC ivc{ trace_settings };

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_oink_accumulation(ivc, num_app_public_inputs - bb::PAIRING_POINT_ACCUMULATOR_SIZE);
        AcirProgram program = construct_mock_kernel_program(ivc.verification_queue, { num_app_public_inputs });
        program.witness = {}; // erase witness to mimic VK construction context

        // Create a mock IVC instance from the IVC recursion constraints in the kernel program
        ClientIVC mock_ivc = create_mock_ivc_from_constraints(program.constraints.ivc_recursion_constraints);

        // Create a kernel circuit from the kernel program and the mocked IVC
        Builder kernel = acir_format::create_kernel_circuit(program.constraints, mock_ivc);
        // Note: adding pairing point normally happens in accumulate()
        kernel.add_pairing_point_accumulator(stdlib::recursion::init_default_agg_obj_indices<Builder>(kernel));

        // Manually construct the VK for the kernel circuit
        auto proving_key = std::make_shared<DeciderProvingKey_<MegaFlavor>>(kernel, ivc.trace_settings);
        MegaProver prover(proving_key);
        kernel_vk = std::make_shared<MegaFlavor::VerificationKey>(prover.proving_key->proving_key);
    }

    // PCS verification keys will not match so set to null before comparing
    kernel_vk->pcs_verification_key = nullptr;
    expected_kernel_vk->pcs_verification_key = nullptr;

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}