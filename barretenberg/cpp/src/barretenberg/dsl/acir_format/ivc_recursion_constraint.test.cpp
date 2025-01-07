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
     *
     */
    static Builder construct_mock_app_circuit(const std::shared_ptr<ClientIVC>& ivc)
    {
        Builder circuit{ ivc->goblin.op_queue };
        GoblinMockCircuits::add_some_ecc_op_gates(circuit);
        MockCircuits::add_arithmetic_gates(circuit);

        return circuit;
    }

    /**
     * @brief Create an ACIR RecursionConstraint given the corresponding verifier inputs
     * @brief In practice such constraints are created via a call to verify_proof(...) in noir
     *
     * @param input bberg style proof and verification key
     * @param witness Array of witnesses into which the above data is placed
     * @return RecursionConstraint
     */
    static RecursionConstraint create_recursion_constraint(const VerifierInputs& input, SlabVector<FF>& witness)
    {
        // Assemble simple vectors of witnesses for vkey and proof
        std::vector<FF> key_witnesses = input.honk_verification_key->to_field_elements();
        std::vector<FF> proof_witnesses = input.proof; // proof contains the public inputs at this stage

        // Construct witness indices for each component in the constraint; populate the witness array
        auto [key_indices, proof_indices, public_inputs_indices] = ProofSurgeon::populate_recursion_witness_data(
            witness, proof_witnesses, key_witnesses, /*num_public_inputs_to_extract=*/0);

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
    static AcirProgram construct_mock_kernel_program(const VerificationQueue& verification_queue)
    {
        AcirProgram program;

        // Construct recursion constraints based on the ivc verification queue; populate the witness along the way
        std::vector<RecursionConstraint> ivc_recursion_constraints;
        ivc_recursion_constraints.reserve(verification_queue.size());
        for (const auto& queue_entry : verification_queue) {
            ivc_recursion_constraints.push_back(create_recursion_constraint(queue_entry, program.witness));
        }

        // Construct a constraint system containing the business logic and ivc recursion constraints
        program.constraints.varnum = static_cast<uint32_t>(program.witness.size());
        program.constraints.num_acir_opcodes = static_cast<uint32_t>(ivc_recursion_constraints.size());
        program.constraints.ivc_recursion_constraints = ivc_recursion_constraints;
        program.constraints.original_opcode_indices = create_empty_original_opcode_indices();
        mock_opcode_indices(program.constraints);

        return program;
    }

    /**
     * @brief Construct a kernel circuit VK from an acir program with IVC recursion constraints
     *
     * @param program Acir program representing a kernel circuit
     * @param trace_settings needed for construction of the VK
     * @return std::shared_ptr<ClientIVC::MegaVerificationKey>
     */
    static std::shared_ptr<ClientIVC::MegaVerificationKey> construct_kernel_vk_from_acir_program(
        AcirProgram& program, const TraceSettings& trace_settings)
    {
        // Create a mock IVC instance from the IVC recursion constraints in the kernel program
        auto mock_ivc = create_mock_ivc_from_constraints(program.constraints.ivc_recursion_constraints, trace_settings);

        // Create kernel circuit from kernel program and the mocked IVC (empty witness mimics VK construction context)
        const ProgramMetadata metadata{ mock_ivc };
        Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
        // Note: adding pairing point normally happens in accumulate()
        kernel.add_pairing_point_accumulator(stdlib::recursion::init_default_agg_obj_indices<Builder>(kernel));

        // Manually construct the VK for the kernel circuit
        auto proving_key = std::make_shared<ClientIVC::DeciderProvingKey>(kernel, trace_settings);
        MegaProver prover(proving_key);

        return std::make_shared<ClientIVC::MegaVerificationKey>(prover.proving_key->proving_key);
    }

  protected:
    void SetUp() override
    {
        bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
    }
};

/**
 * @brief Test IVC accumulation of a one app and one kernel; The kernel includes a recursive oink verification for the
 * app, specified via an ACIR RecursionConstraint.
 */
TEST_F(IvcRecursionConstraintTest, AccumulateTwo)
{
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(trace_settings);

    // construct a mock app_circuit
    Builder app_circuit = construct_mock_app_circuit(ivc);

    // Complete instance and generate an oink proof
    ivc->accumulate(app_circuit);

    // Construct kernel consisting only of the kernel completion logic
    AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);

    const ProgramMetadata metadata{ ivc };
    Builder kernel = acir_format::create_circuit<Builder>(program, metadata);

    EXPECT_TRUE(CircuitChecker::check(kernel));
    ivc->accumulate(kernel);

    EXPECT_TRUE(ivc->prove_and_verify());
}

/**
 * @brief Test IVC accumulation of two apps and two kernels; The first kernel contains a recursive oink verification and
 * the second contains two recursive PG verifications, all specified via ACIR RecursionConstraints.
 */
TEST_F(IvcRecursionConstraintTest, AccumulateFour)
{
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(trace_settings);

    // construct a mock app_circuit
    Builder app_circuit_0 = construct_mock_app_circuit(ivc);
    ivc->accumulate(app_circuit_0);

    const ProgramMetadata metadata{ ivc };

    // Construct kernel_0; consists of a single oink recursive verification for app (plus databus/merge logic)
    AcirProgram program_0 = construct_mock_kernel_program(ivc->verification_queue);
    Builder kernel_0 = acir_format::create_circuit<Builder>(program_0, metadata);
    ivc->accumulate(kernel_0);

    // construct a mock app_circuit
    Builder app_circuit_1 = construct_mock_app_circuit(ivc);
    ivc->accumulate(app_circuit_1);

    // Construct kernel_1; consists of two PG recursive verifications for kernel_0 and app_1 (plus databus/merge logic)
    AcirProgram program_1 = construct_mock_kernel_program(ivc->verification_queue);
    Builder kernel_1 = acir_format::create_circuit<Builder>(program_1, metadata);

    EXPECT_TRUE(CircuitChecker::check(kernel_1));
    ivc->accumulate(kernel_1);

    EXPECT_TRUE(ivc->prove_and_verify());
}

// Test generation of "init" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateVK)
{
    const TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(trace_settings);

        // Construct and accumulate mock app_circuit
        Builder app_circuit = construct_mock_app_circuit(ivc);
        ivc->accumulate(app_circuit);

        // Construct and accumulate kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        const ProgramMetadata metadata{ ivc };
        Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
        ivc->accumulate(kernel);
        expected_kernel_vk = ivc->verification_queue.back().honk_verification_key;
    }

    // Now, construct the kernel VK by mocking the post app accumulation state of the IVC
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(trace_settings);

        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::OINK, /*is_kernel=*/false);

        // Construct kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        const ProgramMetadata metadata{ ivc };
        Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
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
TEST_F(IvcRecursionConstraintTest, GenerateInitKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(trace_settings);

        // Construct and accumulate mock app_circuit
        Builder app_circuit = construct_mock_app_circuit(ivc);
        ivc->accumulate(app_circuit);

        // Construct and accumulate kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        const ProgramMetadata metadata{ ivc };
        Builder kernel = acir_format::create_circuit<Builder>(program, metadata);

        ivc->accumulate(kernel);
        expected_kernel_vk = ivc->verification_queue.back().honk_verification_key;
    }

    // Now, construct the kernel VK by mocking the post app accumulation state of the IVC
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(trace_settings);

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::OINK, /*is_kernel=*/false);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);

        kernel_vk = construct_kernel_vk_from_acir_program(program, trace_settings);
    }

    // PCS verification keys will not match so set to null before comparing
    kernel_vk->pcs_verification_key = nullptr;
    expected_kernel_vk->pcs_verification_key = nullptr;

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}

// Test generation of "reset" or "tail" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateResetKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(trace_settings);

        const ProgramMetadata metadata{ ivc };

        // Construct and accumulate mock app_circuit
        Builder app_circuit = construct_mock_app_circuit(ivc);
        ivc->accumulate(app_circuit);

        { // Construct and accumulate a mock INIT kernel (oink recursion for app accumulation)
            AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
            Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
            ivc->accumulate(kernel);
        }

        { // Construct and accumulate a mock RESET kernel (PG recursion for kernel accumulation)
            EXPECT_TRUE(ivc->verification_queue.size() == 1);
            EXPECT_TRUE(ivc->verification_queue[0].type == bb::ClientIVC::QUEUE_TYPE::PG);
            AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
            Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
            ivc->accumulate(kernel);
        }

        expected_kernel_vk = ivc->verification_queue.back().honk_verification_key;
    }

    // Now, construct the kernel VK by mocking the IVC state prior to kernel construction
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(trace_settings);

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);

        kernel_vk = construct_kernel_vk_from_acir_program(program, trace_settings);
    }

    // PCS verification keys will not match so set to null before comparing
    kernel_vk->pcs_verification_key = nullptr;
    expected_kernel_vk->pcs_verification_key = nullptr;

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}

// Test generation of "inner" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateInnerKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(trace_settings);

        const ProgramMetadata metadata{ ivc };

        { // Construct and accumulate mock app_circuit
            Builder app_circuit = construct_mock_app_circuit(ivc);
            ivc->accumulate(app_circuit);
        }

        { // Construct and accumulate a mock INIT kernel (oink recursion for app accumulation)
            AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
            Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
            ivc->accumulate(kernel);
        }

        { // Construct and accumulate a second mock app_circuit
            Builder app_circuit = construct_mock_app_circuit(ivc);
            ivc->accumulate(app_circuit);
        }

        { // Construct and accumulate a mock RESET kernel (PG recursion for kernel accumulation)
            EXPECT_TRUE(ivc->verification_queue.size() == 2);
            EXPECT_TRUE(ivc->verification_queue[0].type == bb::ClientIVC::QUEUE_TYPE::PG);
            EXPECT_TRUE(ivc->verification_queue[1].type == bb::ClientIVC::QUEUE_TYPE::PG);
            AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
            Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
            ivc->accumulate(kernel);
        }

        expected_kernel_vk = ivc->verification_queue.back().honk_verification_key;
    }

    // Now, construct the kernel VK by mocking the IVC state prior to kernel construction
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(trace_settings);

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/false);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);

        kernel_vk = construct_kernel_vk_from_acir_program(program, trace_settings);
    }

    // PCS verification keys will not match so set to null before comparing
    kernel_vk->pcs_verification_key = nullptr;
    expected_kernel_vk->pcs_verification_key = nullptr;

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}