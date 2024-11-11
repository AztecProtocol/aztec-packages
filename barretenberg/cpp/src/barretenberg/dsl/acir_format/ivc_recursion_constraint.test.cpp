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
    static Builder construct_mock_app_circuit(ClientIVC& ivc, bool random_pub_input = false)
    {
        Builder circuit{ ivc.goblin.op_queue };
        GoblinMockCircuits::construct_simple_circuit(circuit);

        // Add a random or fixed public input value
        FF pub_input = random_pub_input ? FF::random_element() : FF(5);
        circuit.add_public_variable(pub_input);

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

    static RecursionConstraint create_empty_recursion_constraint(PROOF_TYPE proof_type, const size_t num_public_inputs)
    {
        // Assemble simple vectors of witnesses for vkey and proof
        const size_t CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS = 143;
        std::vector<uint32_t> key_indices(CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS);
        std::vector<uint32_t> public_inputs_indices(num_public_inputs);

        return RecursionConstraint{
            .key = key_indices,
            .proof = {}, // the proof witness indices are not needed in an ivc recursion constraint
            .public_inputs = public_inputs_indices,
            .key_hash = 0, // not used
            .proof_type = proof_type,
        };
    }

    /**
     * @brief Create an arithmetic constraint fixing the first public input witness to it's present value
     * @details Meant to mimic the "business logic" of the aztec kernel. Used to facilitate failure testing since this
     * will lead to failure of the kernel circuit to verify if a different proof witness is used in the business logic
     * VS the recursive verification logic.
     *
     * @param public_inputs Witness indices of public inputs of some proof to be constrained
     * @param witness
     * @return ArithmeticConstraint
     */
    static ArithmeticConstraint create_public_input_value_constraint(const std::vector<uint32_t>& public_inputs,
                                                                     const SlabVector<FF>& witness)
    {
        const uint32_t pub_input_idx = public_inputs.back();
        const FF pub_input_val = witness[pub_input_idx];
        return {
            .a = pub_input_idx,
            .b = 0,
            .c = 0,
            .q_m = 0,
            .q_l = -1,
            .q_r = 0,
            .q_o = 0,
            .q_c = pub_input_val,
        };
    }

    /**
     * @brief Generate an acir program {constraints, witness} for a mock kernel
     * @details The IVC contains and internal verification queue that contains proofs to be recursively verified.
     * Construct an AcirProgram with a RecursionConstraint for each entry in the ivc verification queue. (In practice
     * these constraints would come directly from calls to verify_proof in noir). Also add mock "business logic" which
     * simply enforces some constraint on the public inputs of the proof.
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

        // // Add some mock kernel "business logic" which simply fixes one of the public inputs to a particular value
        // ArithmeticConstraint pub_input_constraint =
        //     create_public_input_value_constraint(ivc_recursion_constraints[0].public_inputs, program.witness);

        // Construct a constraint system containing the business logic and ivc recursion constraints
        program.constraints.varnum = static_cast<uint32_t>(program.witness.size());
        program.constraints.num_acir_opcodes = static_cast<uint32_t>(ivc_recursion_constraints.size());
        // program.constraints.poly_triple_constraints = { pub_input_constraint };
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
    ClientIVC ivc;
    ivc.trace_settings.structure = TraceStructure::SMALL_TEST;

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
    ClientIVC ivc;
    ivc.trace_settings.structure = TraceStructure::SMALL_TEST;

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

/**
 * @brief Demonstrate failure of the IVC if the proof witness differs between those encoded in the constraint system
 * (i.e. those used in the noir program) and those used in constructing the recursive verifiers internally
 * @brief The idea is to construct two valid but unique verification queue entries of the form {proof, vkey}. One is
 * used to construct the acir constraint system and the other is used to construct the recursive verification logic
 * internally in the IVC. Since the proof/vkey witnesses in the constraint system are asserted equal to those used to
 * construct the recursive verifiers, the use of different verification queue witnesses should result in failure as long
 * as they were used in some nontrivial way in the main logic of the kernel. (Specifically, failure results from a
 * failure of the "business logic" of the kernel which constrains one of the public inputs to a particular value).
 */
// TEST_F(IvcRecursionConstraintTest, AccumulateTwoFailure)
// {
//     // Accumulate a single app in order to construct a valid verification queue entry {proof, vkey} to be used later
//     on.
//     // Demonstrate that it is indeed valid by completing the IVC with a kernel (which recursively verifies the entry)
//     // then proving and verifying the full IVC.
//     VerifierInputs alternative_verification_queue_entry;
//     {
//         ClientIVC ivc;
//         ivc.trace_settings.structure = TraceStructure::SMALL_TEST;

//         // construct and accumulate a mock app circuit with a single unique public input
//         Builder app_circuit = construct_mock_app_circuit(ivc);
//         ivc.accumulate(app_circuit);

//         // Save the single entry in the verification queue at this point
//         alternative_verification_queue_entry = ivc.verification_queue[0];

//         // Construct and accumulate kernel_0
//         size_t num_pub_inputs_app = app_circuit.public_inputs.size();
//         AcirProgram program_0 = construct_mock_kernel_program(ivc.verification_queue, { num_pub_inputs_app });
//         Builder kernel_0 = acir_format::create_kernel_circuit(program_0.constraints, ivc, program_0.witness);
//         ivc.accumulate(kernel_0);

//         EXPECT_TRUE(ivc.prove_and_verify());
//     }

//     // Repeat a similar IVC but use the alternative queue entry just created to provide different (but independently
//     // valid) witnesses during constraint system construction VS recursive verifier construction.

//     ClientIVC ivc;
//     ivc.trace_settings.structure = TraceStructure::SMALL_TEST;

//     // construct and accumulate a mock app circuit with a single unique public input
//     Builder app_circuit = construct_mock_app_circuit(ivc, /*random_pub_input=*/true);
//     ivc.accumulate(app_circuit);

//     // Construct kernel_0
//     AcirProgram program_0 = construct_mock_kernel_program(ivc.verification_queue, { app_circuit.public_inputs.size()
//     });

//     // Replace the existing verification queue entry that was used to construct the acir constraint system for the
//     // kernel with a different (but valid, as shown above) set of inputs
//     ivc.verification_queue[0] = alternative_verification_queue_entry;
//     Builder kernel_0 = acir_format::create_kernel_circuit(program_0.constraints, ivc, program_0.witness);

//     // The witness should fail to check due to the business logic of the kernel failing
//     EXPECT_FALSE(CircuitChecker::check(kernel_0));
//     ivc.accumulate(kernel_0);

//     // The full IVC should of course also fail to verify since we've accumulated an invalid witness for the kernel
//     EXPECT_FALSE(ivc.prove_and_verify());
// }

// Test generation of "init" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateVK)
{
    const TraceSettings trace_settings{ TraceStructure::SMALL_TEST };

    std::shared_ptr<ClientIVC::VerificationKey> expected_kernel_vk;
    size_t num_app_public_inputs = 0;
    {
        ClientIVC ivc;
        ivc.trace_settings = trace_settings;

        // Construct and accumulate mock app_circuit
        Builder app_circuit = construct_mock_app_circuit(ivc);
        ivc.accumulate(app_circuit);
        num_app_public_inputs = app_circuit.public_inputs.size();

        // Construct and accumulate kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc.verification_queue, { num_app_public_inputs });
        Builder kernel = acir_format::create_kernel_circuit(program.constraints, ivc, program.witness);
        // info("POST:");
        // FF sum = 0;
        // FF idx = 1;
        // for (auto val : kernel.blocks.arithmetic.q_1()) {
        //     sum += val * idx;
        //     idx += 1;
        // }
        // info("HASH: ", sum);
        ivc.accumulate(kernel);
        expected_kernel_vk = ivc.verification_queue.back().honk_verification_key;

        // EXPECT_TRUE(ivc.prove_and_verify());
    }

    std::shared_ptr<ClientIVC::VerificationKey> kernel_vk;
    {
        ClientIVC ivc;
        ivc.trace_settings = trace_settings;

        ClientIVC::VerifierInputs oink_entry = acir_format::create_dummy_vkey_and_proof_oink(
            ivc.trace_settings, num_app_public_inputs - bb::PAIRING_POINT_ACCUMULATOR_SIZE);
        ivc.verification_queue.emplace_back(oink_entry);
        ivc.merge_verification_queue.emplace_back(acir_format::create_dummy_merge_proof());
        // ivc.initialized = true; // WORKTODO: prob needed if we do another round, i.e. PG?

        // Construct kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc.verification_queue, { num_app_public_inputs });
        Builder kernel = acir_format::create_kernel_circuit(program.constraints, ivc);
        // WORKTODO: this would normally happen in accumulate()
        kernel.add_pairing_point_accumulator(stdlib::recursion::init_default_agg_obj_indices<Builder>(kernel));

        auto proving_key = std::make_shared<DeciderProvingKey_<MegaFlavor>>(kernel, trace_settings);
        MegaProver prover(proving_key);
        kernel_vk = std::make_shared<ClientIVC::VerificationKey>(prover.proving_key->proving_key);
    }

    // PCS verification keys will not match so set to null before comparing
    kernel_vk->pcs_verification_key = nullptr;
    expected_kernel_vk->pcs_verification_key = nullptr;

    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}

// Test generation of "init" kernel VK via dummy IVC data
TEST_F(IvcRecursionConstraintTest, GenerateVKFromConstraints)
{
    const TraceSettings trace_settings{ TraceStructure::SMALL_TEST };

    std::shared_ptr<ClientIVC::VerificationKey> expected_kernel_vk;
    size_t num_app_public_inputs = 0;
    {
        ClientIVC ivc;
        ivc.trace_settings = trace_settings;

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

    std::shared_ptr<ClientIVC::VerificationKey> kernel_vk;
    {
        // WORKTODO: I was trying to just construct a mock program like this but it seems like for some reason varnum
        // must be known/correct? The witness does not have to be populated tho. I'm not sure whether varnum is set
        // correctly in the porgrams sent to write_ivc but plausibly since it is a member of "constraints".

        // // Construct kernel consisting only of the kernel completion logic
        // AcirProgram program;
        // program.constraints.varnum = 0;
        // program.constraints.recursive = false;
        // program.constraints.num_acir_opcodes = 1;
        // program.constraints.ivc_recursion_constraints.push_back(
        //     create_empty_recursion_constraint(PROOF_TYPE::OINK, num_app_public_inputs -
        //     bb::PAIRING_POINT_ACCUMULATOR_SIZE));
        // program.constraints.original_opcode_indices = create_empty_original_opcode_indices();

        ClientIVC ivc;
        ivc.trace_settings = trace_settings;

        ClientIVC::VerifierInputs oink_entry = acir_format::create_dummy_vkey_and_proof_oink(
            ivc.trace_settings, num_app_public_inputs - bb::PAIRING_POINT_ACCUMULATOR_SIZE);
        ivc.verification_queue.emplace_back(oink_entry);
        ivc.merge_verification_queue.emplace_back(acir_format::create_dummy_merge_proof());
        // ivc.initialized = true; // WORKTODO: prob needed if we do another round, i.e. PG?

        // Construct kernel consisting only of the kernel completion logic
        AcirProgram program = construct_mock_kernel_program(ivc.verification_queue, { num_app_public_inputs });
        // program.constraints.varnum = 0; // NOTE: this cannot be overwritten to zero
        program.witness = {};

        ClientIVC mock_ivc = create_mock_ivc_from_constraints(program.constraints.ivc_recursion_constraints);

        Builder kernel = acir_format::create_kernel_circuit(program.constraints, mock_ivc);
        // WORKTODO: this would normally happen in accumulate()
        kernel.add_pairing_point_accumulator(stdlib::recursion::init_default_agg_obj_indices<Builder>(kernel));

        auto proving_key = std::make_shared<DeciderProvingKey_<MegaFlavor>>(kernel, ivc.trace_settings);
        MegaProver prover(proving_key);
        kernel_vk = std::make_shared<ClientIVC::VerificationKey>(prover.proving_key->proving_key);
    }

    // PCS verification keys will not match so set to null before comparing
    kernel_vk->pcs_verification_key = nullptr;
    expected_kernel_vk->pcs_verification_key = nullptr;

    EXPECT_EQ(*kernel_vk.get(), *expected_kernel_vk.get());
}