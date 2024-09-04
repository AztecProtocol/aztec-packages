#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/aztec_ivc/aztec_ivc.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"
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
    using ProverInstance = ProverInstance_<Flavor>;
    using Prover = bb::UltraProver_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;
    using Verifier = bb::UltraVerifier_<Flavor>;
    using RecursiveVerifierInputs = AztecIVC::RecursiveVerifierInputs;
    using QUEUE_TYPE = AztecIVC::QUEUE_TYPE;

    /**
     * @brief Create an ACIR RecursionConstraint given the corresponding verifier inputs
     * @brief In practice such constraints are created via a call to verify_proof(...) in noir
     *
     * @param input bberg style proof and verification key
     * @param witness Array of witnesses into which the above data is placed
     * @param num_public_inputs Number of public inputs to be extracted from the proof
     * @return RecursionConstraint
     */
    static RecursionConstraint create_recursion_constraint(RecursiveVerifierInputs& input,
                                                           SlabVector<FF>& witness,
                                                           size_t num_public_inputs)
    {
        // Assemble simple vectors of witnesses for vkey and proof
        std::vector<FF> key_witnesses = input.instance_vk->to_field_elements();
        std::vector<FF> proof_witnesses = input.proof;

        // Construct witness indices for each component in the constraint; populate the witness array
        auto [key_indices, proof_indices, public_inputs_indices] =
            ProofSurgeon::populate_recursion_witness_data(witness, proof_witnesses, key_witnesses, num_public_inputs);

        // The proof type can be either Oink or PG
        PROOF_TYPE proof_type = input.type == QUEUE_TYPE::OINK ? OINK : PG;

        return RecursionConstraint{
            .key = key_indices,
            .proof = proof_indices,
            .public_inputs = public_inputs_indices,
            .key_hash = 0, // not used
            .proof_type = proof_type,
        };
    }

    /**
     * @brief Generate constraint system based on the verification queue and construct the corresponding kernel circuit
     * @details The IVC contains and internal verification queue that contains proofs to be recursively verified.
     * Construct an AcirFormat constraint system with a RecursionConstraint for each entry in the queue then construct a
     * bberg style "kernel" circuit from that. (In practice these constraints would come directly from calls to
     * verify_proof in noir).
     * @note This method needs the number of public inputs in each proof-to-be-verified since the acir constraint
     * requires that the public inputs be provided separately from the 'main' proof.
     *
     * @param ivc
     * @param inner_circuit_num_pub_inputs Num pub inputs for each circuit whose accumulation is recursively verified
     * @return Builder
     */
    static Builder construct_mock_kernel_from_constraint_system(AztecIVC& ivc,
                                                                const std::vector<size_t>& inner_circuit_num_pub_inputs)
    {
        const size_t num_recursive_verifications = ivc.verification_queue.size();
        ASSERT(num_recursive_verifications == inner_circuit_num_pub_inputs.size());

        SlabVector<FF> witness;

        // Construct recursion constraints based on the ivc verification queue; populate the witness along the way
        std::vector<RecursionConstraint> ivc_recursion_constraints;
        ivc_recursion_constraints.reserve(num_recursive_verifications);
        for (size_t idx = 0; idx < num_recursive_verifications; ++idx) {
            ivc_recursion_constraints.push_back(
                create_recursion_constraint(ivc.verification_queue[idx], witness, inner_circuit_num_pub_inputs[idx]));
        }

        // Construct a constraint system containing only ivc recursion constraints
        AcirFormat constraint_system{};
        constraint_system.varnum = static_cast<uint32_t>(witness.size());
        constraint_system.recursive = false;
        constraint_system.num_acir_opcodes = static_cast<uint32_t>(ivc_recursion_constraints.size());
        constraint_system.ivc_recursion_constraints = ivc_recursion_constraints;
        constraint_system.original_opcode_indices = create_empty_original_opcode_indices();

        mock_opcode_indices(constraint_system); // WORKTODO: wtf is this

        return acir_format::create_kernel_circuit(constraint_system, ivc, /*size_hint=*/0, witness);
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
    AztecIVC ivc;
    ivc.trace_structure = TraceStructure::SMALL_TEST;

    // construct a mock app_circuit
    Builder app_circuit{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_simple_circuit(app_circuit);

    // Complete instance and generate an oink proof
    ivc.accumulate(app_circuit);

    // Construct kernel_0 consisting only of the kernel completion logic
    Builder kernel_0 = construct_mock_kernel_from_constraint_system(ivc, { app_circuit.public_inputs.size() });

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
    AztecIVC ivc;
    ivc.trace_structure = TraceStructure::SMALL_TEST;

    // construct a mock app_circuit
    Builder app_circuit_0{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_simple_circuit(app_circuit_0);
    ivc.accumulate(app_circuit_0);

    // Construct kernel_0; consists of a single oink recursive verification for app (plus databus/merge logic)
    Builder kernel_0 = construct_mock_kernel_from_constraint_system(ivc, { app_circuit_0.public_inputs.size() });
    ivc.accumulate(kernel_0);

    // construct a mock app_circuit
    Builder app_circuit_1{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_simple_circuit(app_circuit_1);
    ivc.accumulate(app_circuit_1);

    // Construct kernel_1; consists of two PG recursive verifications for kernel_0 and app_1 (plus databus/merge logic)
    Builder kernel_1 = construct_mock_kernel_from_constraint_system(
        ivc, { kernel_0.public_inputs.size(), app_circuit_1.public_inputs.size() });

    EXPECT_TRUE(CircuitChecker::check(kernel_1));
    ivc.accumulate(kernel_1);

    EXPECT_TRUE(ivc.prove_and_verify());
}
