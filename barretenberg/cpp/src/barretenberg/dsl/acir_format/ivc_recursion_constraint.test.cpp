#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
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
    using PairingPoints = ClientIVC::PairingPoints;

    /**
     * @brief Constuct a simple arbitrary circuit to represent a mock app circuit
     *
     */
    static Builder construct_mock_app_circuit(const std::shared_ptr<ClientIVC>& ivc)
    {
        Builder circuit{ ivc->goblin.op_queue };
        GoblinMockCircuits::add_some_ecc_op_gates(circuit);
        MockCircuits::add_arithmetic_gates(circuit);
        PairingPoints::add_default_to_public_inputs(circuit);
        return circuit;
    }

    static UltraCircuitBuilder create_inner_circuit(size_t log_num_gates = 10)
    {
        using InnerPairingPoints = bb::stdlib::recursion::PairingPoints<UltraCircuitBuilder>;

        UltraCircuitBuilder builder;

        // Create 2^log_n many add gates based on input log num gates
        const size_t num_gates = (1 << log_num_gates);
        for (size_t i = 0; i < num_gates; ++i) {
            fr a = fr::random_element();
            uint32_t a_idx = builder.add_variable(a);

            fr b = fr::random_element();
            fr c = fr::random_element();
            fr d = a + b + c;
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }

        InnerPairingPoints::add_default_to_public_inputs(builder);
        return builder;
    }

    /**
     * @brief Constuct a mock app circuit with a UH recursive verifier
     *
     */
    static Builder construct_mock_UH_recursion_app_circuit(const std::shared_ptr<ClientIVC>& ivc, const bool tamper_vk)
    {
        AcirProgram program;
        std::vector<RecursionConstraint> recursion_constraints;

        Builder circuit{ ivc->goblin.op_queue };
        GoblinMockCircuits::add_some_ecc_op_gates(circuit);
        MockCircuits::add_arithmetic_gates(circuit);

        {
            using RecursiveFlavor = UltraRecursiveFlavor_<Builder>;
            using VerifierOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<Builder>;

            // Create an arbitrary inner circuit
            auto inner_circuit = create_inner_circuit();

            // Compute native verification key
            auto proving_key = std::make_shared<DeciderProvingKey_<UltraFlavor>>(inner_circuit);
            auto honk_vk = std::make_shared<UltraFlavor::VerificationKey>(proving_key->get_precomputed());
            UltraProver prover(proving_key, honk_vk); // A prerequisite for computing VK
            auto inner_proof = prover.construct_proof();

            if (tamper_vk) {
                honk_vk->q_l = g1::one;
                UltraVerifier_<UltraFlavor> verifier(honk_vk);
                EXPECT_FALSE(verifier.verify_proof(inner_proof));
            }
            // Instantiate the recursive verifier using the native verification key
            auto stdlib_vk_and_hash = std::make_shared<RecursiveFlavor::VKAndHash>(circuit, honk_vk);
            stdlib::recursion::honk::UltraRecursiveVerifier_<RecursiveFlavor> verifier(&circuit, stdlib_vk_and_hash);

            VerifierOutput output = verifier.verify_proof(inner_proof);
            output.points_accumulator.set_public(); // propagate resulting pairing points on the public inputs
        }

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
        std::vector<FF> key_witnesses = input.honk_vk->to_field_elements();
        FF key_hash_witness = input.honk_vk->hash();
        std::vector<FF> proof_witnesses = input.proof; // proof contains the public inputs at this stage

        // Construct witness indices for each component in the constraint; populate the witness array
        auto [key_indices, key_hash_index, proof_indices, public_inputs_indices] =
            ProofSurgeon::populate_recursion_witness_data(
                witness, proof_witnesses, key_witnesses, key_hash_witness, /*num_public_inputs_to_extract=*/0);

        // The proof type can be either Oink or PG or PG_FINAL
        PROOF_TYPE proof_type;
        switch (input.type) {
        case QUEUE_TYPE::OINK:
            proof_type = OINK;
            break;
        case QUEUE_TYPE::PG:
            proof_type = PG;
            break;
        case QUEUE_TYPE::PG_FINAL:
            proof_type = PG_FINAL;
            break;
        default:
            throw std::runtime_error("Invalid proof type");
        }

        return RecursionConstraint{
            .key = key_indices,
            .proof = {}, // the proof witness indices are not needed in an ivc recursion constraint
            .public_inputs = public_inputs_indices,
            .key_hash = key_hash_index,
            .proof_type = proof_type,
        };
    }

    /**
     * @brief Generate an acir program {constraints, witness} for a mock kernel
     * @details The IVC contains and internal verification queue that contains proofs to be recursively verified.
     * Construct an AcirProgram with a RecursionConstraint for each entry in the ivc verification queue. (In
     * practice these constraints would come directly from calls to verify_proof in noir).
     * @note This method needs the number of public inputs in each proof-to-be-verified so they can be extracted and
     * provided separately as is required in the acir constraint system.
     *
     * @param ivc
     * @param inner_circuit_num_pub_inputs Num pub inputs for each circuit whose accumulation is recursively
     * verified
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
        // Create kernel circuit from the kernel program
        Builder kernel = acir_format::create_circuit<Builder>(program);

        // Manually construct the VK for the kernel circuit
        auto proving_key = std::make_shared<ClientIVC::DeciderProvingKey>(kernel, trace_settings);
        auto verification_key = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->get_precomputed());
        return verification_key;
    }

  protected:
    void SetUp() override { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief Check that the size of a mock merge proof matches expectation
 */
TEST_F(IvcRecursionConstraintTest, MockMergeProofSize)
{
    Goblin::MergeProof merge_proof = create_mock_merge_proof();
    EXPECT_EQ(merge_proof.size(), MERGE_PROOF_SIZE);
}

/**
 * @brief Test IVC accumulation of a one app and one kernel; The kernel includes a recursive oink verification for
 * the app, specified via an ACIR RecursionConstraint.
 */
TEST_F(IvcRecursionConstraintTest, AccumulateTwo)
{
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/2, trace_settings);

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
 * @brief Test IVC accumulation of two apps and two kernels; The first kernel contains a recursive oink verification
 * and the second contains two recursive PG verifications, all specified via ACIR RecursionConstraints.
 */
TEST_F(IvcRecursionConstraintTest, AccumulateFour)
{
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/4, trace_settings);

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

    // Construct kernel_1; consists of two PG recursive verifications for kernel_0 and app_1 (plus databus/merge
    // logic)
    AcirProgram program_1 = construct_mock_kernel_program(ivc->verification_queue);
    Builder kernel_1 = acir_format::create_circuit<Builder>(program_1, metadata);

    EXPECT_TRUE(CircuitChecker::check(kernel_1));
    ivc->accumulate(kernel_1);

    EXPECT_TRUE(ivc->prove_and_verify());
}

// Test generation of "init" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateInitKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/2, trace_settings);

        // Construct and accumulate mock app_circuit
        Builder app_circuit = construct_mock_app_circuit(ivc);
        ivc->accumulate(app_circuit);

        // Construct and accumulate kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        const ProgramMetadata metadata{ ivc };
        Builder kernel = acir_format::create_circuit<Builder>(program, metadata);

        ivc->accumulate(kernel);
        expected_kernel_vk = ivc->verification_queue.back().honk_vk;
    }

    // Now, construct the kernel VK by mocking the post app accumulation state of the IVC
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/2, trace_settings);

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::OINK, /*is_kernel=*/false);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        program.witness = {}; // remove the witness to mimick VK construction context

        kernel_vk = construct_kernel_vk_from_acir_program(program, trace_settings);
    }

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}

// Test generation of "reset" or "tail" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateResetKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/3, trace_settings);

        const ProgramMetadata metadata{ ivc };

        // Construct and accumulate mock app_circuit
        Builder app_circuit = construct_mock_app_circuit(ivc);
        ivc->accumulate(app_circuit);

        { // Construct and accumulate a mock INIT kernel (oink recursion for app accumulation)
            AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
            Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
            ivc->accumulate(kernel);
        }

        { // Construct and accumulate a mock RESET/TAIL kernel (PG recursion for kernel accumulation)
            EXPECT_TRUE(ivc->verification_queue.size() == 1);
            EXPECT_TRUE(ivc->verification_queue[0].type == bb::ClientIVC::QUEUE_TYPE::PG);
            AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
            Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
            ivc->accumulate(kernel);
        }

        expected_kernel_vk = ivc->verification_queue.back().honk_vk;
    }

    // Now, construct the kernel VK by mocking the IVC state prior to kernel construction
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/3, trace_settings);

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        program.witness = {}; // remove the witness to mimick VK construction context

        kernel_vk = construct_kernel_vk_from_acir_program(program, trace_settings);
    }

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}

// Test generation of "inner" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateInnerKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/4, trace_settings);

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

        { // Construct and accumulate a mock INNER kernel (PG recursion for kernel accumulation)
            EXPECT_TRUE(ivc->verification_queue.size() == 2);
            EXPECT_TRUE(ivc->verification_queue[0].type == bb::ClientIVC::QUEUE_TYPE::PG);
            EXPECT_TRUE(ivc->verification_queue[1].type == bb::ClientIVC::QUEUE_TYPE::PG);
            AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
            Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
            ivc->accumulate(kernel);
        }

        expected_kernel_vk = ivc->verification_queue.back().honk_vk;
    }

    // Now, construct the kernel VK by mocking the IVC state prior to kernel construction
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/4, trace_settings);

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/false);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        program.witness = {}; // remove the witness to mimick VK construction context

        kernel_vk = construct_kernel_vk_from_acir_program(program, trace_settings);
    }

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}

// Test generation of "hiding" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateHidingKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_hiding_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/3, trace_settings);
        const ProgramMetadata metadata{ ivc };

        {
            // Construct and accumulate mock app_circuit
            Builder app_circuit = construct_mock_app_circuit(ivc);
            ivc->accumulate(app_circuit);
        }

        {
            // Construct and accumulate a mock INIT kernel (oink recursion for app accumulation)
            AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
            Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
            ivc->accumulate(kernel);
        }

        { // Construct and accumulate a mock TAIL kernel (PG recursion for kernel accumulation)
            EXPECT_TRUE(ivc->verification_queue.size() == 1);
            EXPECT_TRUE(ivc->verification_queue[0].type == bb::ClientIVC::QUEUE_TYPE::PG);
            AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
            Builder kernel = acir_format::create_circuit<Builder>(program, metadata);
            ivc->accumulate(kernel, nullptr, false); // WORKTODO: should be PG_FINAL?
        }

        {
            // Check the verificaiton queue contains a single PG_FINAL entry
            EXPECT_TRUE(ivc->verification_queue.size() == 1);
            EXPECT_TRUE(ivc->verification_queue[0].type == bb::ClientIVC::QUEUE_TYPE::PG_FINAL);
        }
        ivc->construct_hiding_circuit_key();
        expected_hiding_kernel_vk = ivc->honk_vk;
    }
    // Now, construct the kernel VK by mocking the IVC state prior to kernel construction
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        // construct a mock init kernel
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/3, trace_settings);
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG_FINAL, /*is_kernel=*/true);

        program.witness = {}; // remove the witness to mimick VK construction context

        kernel_vk = construct_kernel_vk_from_acir_program(program, trace_settings);
    }

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_hiding_kernel_vk.get());
}

/**
 * @brief Test IVC accumulation of a one app and one kernel. The app includes a UltraHonk Recursive Verifier.
 * This test was copied from the AccumulateTwo test.
 */
TEST_F(IvcRecursionConstraintTest, RecursiveVerifierAppCircuitTest)
{
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(/*num_circuits*/ 2, trace_settings);

    // construct a mock app_circuit
    Builder app_circuit = construct_mock_UH_recursion_app_circuit(ivc, /*tamper_vk=*/false);

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
 * @brief Test IVC accumulation of a one app and one kernel. The app includes a UltraHonk Recursive Verifier that
 * verifies a failed proof. This test was copied from the AccumulateTwo test.
 */
TEST_F(IvcRecursionConstraintTest, BadRecursiveVerifierAppCircuitTest)
{
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(/*num_circuits*/ 2, trace_settings);

    // construct a mock app_circuit that has bad pairing point object
    Builder app_circuit = construct_mock_UH_recursion_app_circuit(ivc, /*tamper_vk=*/true);

    // Complete instance and generate an oink proof
    ivc->accumulate(app_circuit);

    // Construct kernel consisting only of the kernel completion logic
    AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);

    const ProgramMetadata metadata{ ivc };
    Builder kernel = acir_format::create_circuit<Builder>(program, metadata);

    EXPECT_TRUE(CircuitChecker::check(kernel));
    ivc->accumulate(kernel);

    // We expect the CIVC proof to fail due to the app with a failed UH recursive verification
    EXPECT_FALSE(ivc->prove_and_verify());
}
