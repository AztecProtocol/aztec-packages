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

    static Builder create_kernel(AztecIVC& ivc, const Builder& inner_circuit)
    {
        std::vector<FF> key_witnesses = ivc.verification_queue.back().instance_vk->to_field_elements();
        std::vector<FF> proof_witnesses = ivc.verification_queue.back().proof;
        const size_t num_public_inputs = inner_circuit.get_public_inputs().size();

        SlabVector<FF> witness;
        auto [key_indices, proof_indices, inner_public_inputs] =
            ProofSurgeon::populate_recursion_witness_data(witness, proof_witnesses, key_witnesses, num_public_inputs);

        RecursionConstraint ivc_recursion_constraint{
            .key = key_indices,
            .proof = proof_indices,
            .public_inputs = inner_public_inputs,
            .key_hash = 0, // not used
            .proof_type = OINK_RECURSION,
        };

        AcirFormat constraint_system{};
        constraint_system.varnum = static_cast<uint32_t>(witness.size());
        constraint_system.recursive = false;
        constraint_system.num_acir_opcodes = 1;
        constraint_system.ivc_recursion_constraints = { ivc_recursion_constraint };
        constraint_system.original_opcode_indices = create_empty_original_opcode_indices();

        mock_opcode_indices(constraint_system); // WORKTODO: tf is this ish
        auto outer_circuit = create_kernel_circuit(constraint_system, ivc, /*size_hint=*/0, witness);

        return Builder{};
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(IvcRecursionConstraintTest, Basic)
{
    AztecIVC ivc;
    ivc.trace_structure = TraceStructure::SMALL_TEST;

    // construct a mock app_circuit
    Builder app_circuit{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_simple_circuit(app_circuit);

    // Complete instance and generate an oink proof
    ivc.accumulate(app_circuit);

    // construct kernel_0
    //  - can consist solely of a recursive verification of type oink
    //  - generate a RecursionConstraint with type = OINK_RECURSION
    //  - use ProofSurgeon::populate_recursion_witness_data() with proof and vkey from ivc
    //  - Note: in a real noir program the proof will be dummy but the vkey will be real
    //  - Construct AcirFormat constraint_stystem with this single constraint
    //  - construct the circuit with some combination of create_circuit and ivc kernel completion methods
    //  - possibly implement create_kernel_circuit for this special case (takes ivc as input)

    Builder kernel_0 = create_kernel(ivc, app_circuit);

    EXPECT_TRUE(CircuitChecker::check(kernel_0));
    // ivc.accumulate(kernel_0)
    //  - completes the instance and generates a fold proof

    // construct kernel_1
    //  - consists solely of a folding recursive verifier (kernel_0 into app)
    //  - generate a RecursionConstraint with type = PG_RECURSION
    //  - should be able to use ProofSurgeon in the exact same way with fold proof and vkey from ivc
    //  - construct AcirFormat and bberg circuit using create_kernel_circuit and ivc.recursive_verify or w/e

    // ivc.accumulate(kernel_1)

    // ivc.prove_and_verify()

    /************************************************************** */

    // What is needed?
    //  - use MockCircuits to generate simple app (arithmetic only is fine)

    //  - Logic for creating stdlib inputs to perform_recursive_verification_and_databus_consistency_checks
    //      - combine constraint.proof_idxs/public_inputs_idxs (already in ProofSurgeon?) into constraint_proof_idxs
    //      - generate stdlib proof from ivc-owned proof
    //      - perform assert_equal between stdlib_proof witness indices and constraint_proof_idxs
    //      - Do something similar for vkey
    //          - slightly diff since constraint vkey witnesses are correct in practice, unlike for proof
    //          - Need to (a) constuct std_vkey as normal + method for asserting_equal indices from constraint.vkey
    //          - Or (b) construct a stdlib_vkey directly from the witness indices in constraint.vkey

    //  - Implement create_kernel_circuit
    //      - (probably contains the above stdlib object construction logic)
    //      - maybe calls out to the normal create_circuit for everything but ivc constraints
    //      - calls perform_recursive_verification_and_databus_consistency_checks(circuit, proof, vkey, type = OINK)
}
