#include "barretenberg/dsl/acir_format/pg_recursion_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
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
    using VerificationKey = MegaFlavor::VerificationKey;
    using FF = Flavor::FF;
    using VerifierInputs = ClientIVC::VerifierInputs;
    using QUEUE_TYPE = ClientIVC::QUEUE_TYPE;
    using VerificationQueue = ClientIVC::VerificationQueue;
    using ArithmeticConstraint = AcirFormat::PolyTripleConstraint;
    using PairingPoints = ClientIVC::PairingPoints;

    static constexpr size_t NUM_TRAILING_KERNELS = 3; // reset, tail, hiding

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

    static std::shared_ptr<VerificationKey> get_verification_key(Builder& builder_in,
                                                                 const TraceSettings& trace_settings)
    {
        // This is a workaround to ensure that the circuit is finalized before we create the verification key
        // In practice, this should not be needed as the circuit will be finalized when it is accumulated into the IVC
        // but this is a workaround for the test setup.
        // Create a copy of the input circuit
        MegaCircuitBuilder_<bb::fr> builder{ builder_in };

        // Deepcopy the opqueue to avoid modifying the original one
        builder.op_queue = std::make_shared<ECCOpQueue>(*builder.op_queue);
        std::shared_ptr<ClientIVC::ProverInstance> prover_instance =
            std::make_shared<ClientIVC::ProverInstance>(builder, trace_settings);
        std::shared_ptr<VerificationKey> vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        return vk;
    }

    static void construct_and_accumulate_trailing_kernels(const std::shared_ptr<ClientIVC>& ivc,
                                                          TraceSettings trace_settings)
    {

        // Reset kernel
        EXPECT_EQ(ivc->verification_queue.size(), 1);
        EXPECT_EQ(ivc->verification_queue[0].type, QUEUE_TYPE::PG);
        construct_and_accumulate_mock_kernel(ivc, trace_settings);

        // Tail kernel
        EXPECT_EQ(ivc->verification_queue.size(), 1);
        EXPECT_EQ(ivc->verification_queue[0].type, QUEUE_TYPE::PG_TAIL);
        construct_and_accumulate_mock_kernel(ivc, trace_settings);

        // Hiding kernel
        EXPECT_EQ(ivc->verification_queue.size(), 1);
        EXPECT_EQ(ivc->verification_queue[0].type, QUEUE_TYPE::PG_FINAL);
        construct_and_accumulate_mock_kernel(ivc, TraceSettings{});
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
            using StdlibProof = bb::stdlib::Proof<Builder>;
            using StdlibIO = bb::stdlib::recursion::honk::DefaultIO<Builder>;

            // Create an arbitrary inner circuit
            auto inner_circuit = create_inner_circuit();

            // Compute native verification key
            auto prover_instance = std::make_shared<ProverInstance_<UltraFlavor>>(inner_circuit);
            auto honk_vk = std::make_shared<UltraFlavor::VerificationKey>(prover_instance->get_precomputed());
            UltraProver prover(prover_instance, honk_vk); // A prerequisite for computing VK
            auto inner_proof = prover.construct_proof();

            if (tamper_vk) {
                honk_vk->q_l = g1::one;
                UltraVerifier_<UltraFlavor> verifier(honk_vk);
                EXPECT_FALSE(verifier.template verify_proof<DefaultIO>(inner_proof).result);
            }
            // Instantiate the recursive verifier using the native verification key
            auto stdlib_vk_and_hash = std::make_shared<RecursiveFlavor::VKAndHash>(circuit, honk_vk);
            stdlib::recursion::honk::UltraRecursiveVerifier_<RecursiveFlavor> verifier(&circuit, stdlib_vk_and_hash);

            StdlibProof stdlib_inner_proof(circuit, inner_proof);
            VerifierOutput output = verifier.template verify_proof<StdlibIO>(stdlib_inner_proof);

            // IO
            StdlibIO inputs;
            inputs.pairing_inputs = output.points_accumulator;
            inputs.set_public(); // propagate resulting pairing points on the public inputs
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
            ProofSurgeon<FF>::populate_recursion_witness_data(
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
        case QUEUE_TYPE::PG_TAIL:
            proof_type = PG_TAIL;
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
     * Construct an AcirProgram with a RecursionConstraint for each entry in the ivc verification queue. (In practice
     * these constraints would come directly from calls to verify_proof in noir).
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
        std::vector<RecursionConstraint> pg_recursion_constraints;
        pg_recursion_constraints.reserve(verification_queue.size());
        for (const auto& queue_entry : verification_queue) {
            pg_recursion_constraints.push_back(create_recursion_constraint(queue_entry, program.witness));
        }

        // Construct a constraint system containing the business logic and ivc recursion constraints
        program.constraints.varnum = static_cast<uint32_t>(program.witness.size());
        program.constraints.num_acir_opcodes = static_cast<uint32_t>(pg_recursion_constraints.size());
        program.constraints.pg_recursion_constraints = pg_recursion_constraints;
        program.constraints.original_opcode_indices = create_empty_original_opcode_indices();
        mock_opcode_indices(program.constraints);

        return program;
    }

    static void construct_and_accumulate_mock_kernel(std::shared_ptr<ClientIVC> ivc, TraceSettings trace_settings)
    {
        // construct a mock kernel program (acir) from the ivc verification queue
        const ProgramMetadata metadata{ ivc };
        AcirProgram mock_kernel_program = construct_mock_kernel_program(ivc->verification_queue);
        auto kernel = acir_format::create_circuit<Builder>(mock_kernel_program, metadata);
        auto kernel_vk = get_kernel_vk_from_circuit(kernel, trace_settings);
        ivc->accumulate(kernel, kernel_vk);
    }

    static void construct_and_accumulate_mock_app(std::shared_ptr<ClientIVC> ivc, TraceSettings trace_settings)
    {
        // construct a mock kernel program (acir) from the ivc verification queue
        auto app_circuit = construct_mock_app_circuit(ivc);
        ivc->accumulate(app_circuit, get_verification_key(app_circuit, trace_settings));
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
        auto prover_instance = std::make_shared<ClientIVC::ProverInstance>(kernel, trace_settings);
        auto verification_key = std::make_shared<ClientIVC::MegaVerificationKey>(prover_instance->get_precomputed());
        return verification_key;
    }

    static std::shared_ptr<ClientIVC::MegaVerificationKey> get_kernel_vk_from_circuit(Builder& kernel,
                                                                                      TraceSettings trace_settings)
    {
        auto prover_instance = std::make_shared<ClientIVC::ProverInstance>(kernel, trace_settings);
        auto verification_key = std::make_shared<ClientIVC::MegaVerificationKey>(prover_instance->get_precomputed());
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
 * @brief Test IVC accumulation of a one app and one kernel; The kernel includes a recursive oink verification for the
 * app, specified via an ACIR RecursionConstraint.
 */
TEST_F(IvcRecursionConstraintTest, AccumulateSingleApp)
{
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/5 /* app, kernel, reset, tail, hiding */, trace_settings);

    // construct a mock app_circuit
    construct_and_accumulate_mock_app(ivc, trace_settings);

    // Construct kernel consisting only of the kernel completion logic
    construct_and_accumulate_mock_kernel(ivc, trace_settings);

    // add the trailing kernels
    construct_and_accumulate_trailing_kernels(ivc, trace_settings);

    auto proof = ivc->prove();
    EXPECT_TRUE(ClientIVC::verify(proof, ivc->get_vk()));
}

/**
 * @brief Test IVC accumulation of two apps and two kernels; The first kernel contains a recursive oink verification and
 * the second contains two recursive PG verifications, all specified via ACIR RecursionConstraints.
 */
TEST_F(IvcRecursionConstraintTest, AccumulateTwoApps)
{
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    // 4 ciruits and the tail kernel
    auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/7, trace_settings);

    // construct a mock app_circuit
    construct_and_accumulate_mock_app(ivc, trace_settings);

    const ProgramMetadata metadata{ ivc };

    // Construct kernel_0; consists of a single oink recursive verification for app (plus databus/merge logic)
    construct_and_accumulate_mock_kernel(ivc, trace_settings);

    // construct a mock app_circuit
    construct_and_accumulate_mock_app(ivc, trace_settings);

    // Construct and accumulate another Kernel circuit
    construct_and_accumulate_mock_kernel(ivc, trace_settings);

    // Accumulate the trailing kernels
    construct_and_accumulate_trailing_kernels(ivc, trace_settings);

    auto proof = ivc->prove();
    EXPECT_TRUE(ClientIVC::verify(proof, ivc->get_vk()));
}

// Test generation of "init" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateInitKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/5, trace_settings);

        // Construct and accumulate mock app_circuit
        construct_and_accumulate_mock_app(ivc, trace_settings);

        // Construct and accumulate kernel consisting only of the kernel completion logic
        construct_and_accumulate_mock_kernel(ivc, trace_settings);
        expected_kernel_vk = ivc->verification_queue.back().honk_vk;
    }

    // Now, construct the kernel VK by mocking the post app accumulation state of the IVC
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/5, trace_settings);

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::OINK, /*is_kernel=*/false);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        program.witness = {}; // remove the witness to mimick VK construction context

        kernel_vk = construct_kernel_vk_from_acir_program(program, trace_settings);
    }

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}

// Test generation of "reset" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateResetKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/5, trace_settings);

        const ProgramMetadata metadata{ ivc };

        // Construct and accumulate mock app_circuit
        construct_and_accumulate_mock_app(ivc, trace_settings);

        // Construct and accumulate a mock INIT kernel (oink recursion for app accumulation)
        construct_and_accumulate_mock_kernel(ivc, trace_settings);
        EXPECT_TRUE(ivc->verification_queue.size() == 1);
        EXPECT_TRUE(ivc->verification_queue[0].type == bb::ClientIVC::QUEUE_TYPE::PG);

        // Construct and accumulate a mock RESET kernel (PG recursion for kernel accumulation)
        construct_and_accumulate_mock_kernel(ivc, trace_settings);
        expected_kernel_vk = ivc->verification_queue.back().honk_vk;
    }

    // Now, construct the kernel VK by mocking the IVC state prior to kernel construction
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/5, trace_settings);

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        program.witness = {}; // remove the witness to mimick VK construction context
        kernel_vk = construct_kernel_vk_from_acir_program(program, trace_settings);
    }

    // Compare the VK constructed via running the IVc with the one constructed via mocking
    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}

// Test generation of "tail" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateTailKernelVKFromConstraints)
{
    const TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    // First, construct the kernel VK by running the full IVC (accumulate one app and one kernel)
    std::shared_ptr<MegaFlavor::VerificationKey> expected_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/5, trace_settings);

        const ProgramMetadata metadata{ ivc };

        // Construct and accumulate mock app_circuit
        construct_and_accumulate_mock_app(ivc, trace_settings);

        // Construct and accumulate a mock INIT kernel (oink recursion for app accumulation)
        construct_and_accumulate_mock_kernel(ivc, trace_settings);

        // Construct and accumulate a mock RESET kernel (PG recursion for kernel accumulation)
        construct_and_accumulate_mock_kernel(ivc, trace_settings);

        // Construct and accumulate a mock TAIL kernel (PG recursion for kernel accumulation)
        EXPECT_TRUE(ivc->verification_queue.size() == 1);
        EXPECT_TRUE(ivc->verification_queue[0].type == bb::ClientIVC::QUEUE_TYPE::PG_TAIL);
        construct_and_accumulate_mock_kernel(ivc, trace_settings);

        expected_kernel_vk = ivc->verification_queue.back().honk_vk;
    }

    // Now, construct the kernel VK by mocking the IVC state prior to kernel construction
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/5, trace_settings);

        // Construct kernel consisting only of the kernel completion logic
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG_TAIL, /*is_kernel=*/true);
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
        // we have to set the number of circuits one more than the number of circuits we're accumulating as otherwise
        // the last circuit will be seen as a tail
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/6, trace_settings);

        const ProgramMetadata metadata{ ivc };

        { // Construct and accumulate mock app_circuit
            construct_and_accumulate_mock_app(ivc, trace_settings);
        }

        // Construct and accumulate a mock INIT kernel (oink recursion for app accumulation)
        construct_and_accumulate_mock_kernel(ivc, trace_settings);

        { // Construct and accumulate a second mock app_circuit
            construct_and_accumulate_mock_app(ivc, trace_settings);
        }

        { // Construct and accumulate a mock INNER kernel (PG recursion for kernel accumulation)
            EXPECT_TRUE(ivc->verification_queue.size() == 2);
            EXPECT_TRUE(ivc->verification_queue[1].type == bb::ClientIVC::QUEUE_TYPE::PG);
            construct_and_accumulate_mock_kernel(ivc, trace_settings);
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

    // First, construct the kernel VK by running the full IVC
    std::shared_ptr<MegaFlavor::VerificationKey> expected_hiding_kernel_vk;
    {
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/5, trace_settings);
        const ProgramMetadata metadata{ ivc };

        {
            // Construct and accumulate mock app_circuit
            construct_and_accumulate_mock_app(ivc, trace_settings);
        }

        {
            // Construct and accumulate a mock INIT kernel (oink recursion for app accumulation)
            construct_and_accumulate_mock_kernel(ivc, trace_settings);
        }

        construct_and_accumulate_trailing_kernels(ivc, trace_settings);

        // The single entry in the verification queue corresponds to the hiding kernel
        expected_hiding_kernel_vk = ivc->verification_queue[0].honk_vk;
    }

    // Now, construct the kernel VK by mocking the IVC state prior to kernel construction
    std::shared_ptr<MegaFlavor::VerificationKey> kernel_vk;
    {
        // mock IVC accumulation increases the num_circuits_accumualted, hence we need to assume the tail kernel has
        // been accumulated
        auto ivc = std::make_shared<ClientIVC>(/*num_circuits=*/5, TraceSettings());
        // construct a mock tail kernel
        acir_format::mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG_FINAL, /*is_kernel=*/true);
        AcirProgram program = construct_mock_kernel_program(ivc->verification_queue);
        program.witness = {}; // remove the witness to mimick VK construction context
        kernel_vk = construct_kernel_vk_from_acir_program(program, TraceSettings());
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
    auto ivc = std::make_shared<ClientIVC>(/*num_circuits*/ 5, trace_settings);

    // construct a mock app_circuit with an UH recursion call
    Builder app_circuit = construct_mock_UH_recursion_app_circuit(ivc, /*tamper_vk=*/false);

    // Complete instance and generate an oink proof
    ivc->accumulate(app_circuit, get_verification_key(app_circuit, trace_settings));

    // Construct kernel consisting only of the kernel completion logic
    construct_and_accumulate_mock_kernel(ivc, trace_settings);

    construct_and_accumulate_trailing_kernels(ivc, trace_settings);

    auto proof = ivc->prove();
    EXPECT_TRUE(ClientIVC::verify(proof, ivc->get_vk()));
}

/**
 * @brief Test IVC accumulation of a one app and one kernel. The app includes a UltraHonk Recursive Verifier that
 * verifies a failed proof. This test was copied from the AccumulateTwo test.
 */
TEST_F(IvcRecursionConstraintTest, BadRecursiveVerifierAppCircuitTest)
{
    BB_DISABLE_ASSERTS(); // Disable assert in PG prover

    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    auto ivc = std::make_shared<ClientIVC>(/*num_circuits*/ 5, trace_settings);

    // construct and accumulate mock app_circuit that has bad pairing point object
    Builder app_circuit = construct_mock_UH_recursion_app_circuit(ivc, /*tamper_vk=*/true);
    ivc->accumulate(app_circuit, get_verification_key(app_circuit, trace_settings));

    // Construct kernel consisting only of the kernel completion logic
    construct_and_accumulate_mock_kernel(ivc, trace_settings);

    // add the trailing kernels
    construct_and_accumulate_trailing_kernels(ivc, trace_settings);

    // We expect the CIVC proof to fail due to the app with a failed UH recursive verification
    auto proof = ivc->prove();
    EXPECT_FALSE(ClientIVC::verify(proof, ivc->get_vk()));
}
