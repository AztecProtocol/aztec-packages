#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

class DatabusLinkingTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Flavor = ClientIVC::Flavor;
    using FF = typename Flavor::FF;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = ClientIVC::ClientCircuit;
    using ProverInstance = ClientIVC::ProverInstance;
    using VerifierInstance = ClientIVC::VerifierInstance;
    using FoldProof = ClientIVC::FoldProof;
    using DeciderProver = ClientIVC::DeciderProver;
    using DeciderVerifier = ClientIVC::DeciderVerifier;
    using ProverInstances = ProverInstances_<Flavor>;
    using FoldingProver = ProtoGalaxyProver_<ProverInstances>;
    using VerifierInstances = VerifierInstances_<Flavor>;
    using FoldingVerifier = ProtoGalaxyVerifier_<VerifierInstances>;

    /**
     * @brief Prove and verify the IVC scheme
     * @details Constructs four proofs: merge, eccvm, translator, decider; Verifies these four plus the final folding
     * proof constructed on the last accumulation round
     *
     */
    static bool prove_and_verify(ClientIVC& ivc)
    {
        auto proof = ivc.prove();

        auto verifier_inst = std::make_shared<VerifierInstance>(ivc.instance_vk);
        return ivc.verify(proof, { ivc.verifier_accumulator, verifier_inst });
    }

    /**
     * @brief Construct mock circuit with arithmetic gates and goblin ops
     * @details Currently default sized to 2^16 to match kernel. (Note: dummy op gates added to avoid non-zero
     * polynomials will bump size to next power of 2)
     *
     */
    static Builder create_mock_circuit(ClientIVC& ivc, size_t log2_num_gates = 15)
    {
        Builder circuit{ ivc.goblin.op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): We require goblin ops to be added to the
        // function circuit because we cannot support zero commtiments. While the builder handles this at
        // finalisation stage via the add_gates_to_ensure_all_polys_are_non_zero function for other MegaHonk
        // circuits (where we don't explicitly need to add goblin ops), in ClientIVC merge proving happens prior to
        // folding where the absense of goblin ecc ops will result in zero commitments.
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }
};

/**
 * @brief A simple-as-possible test demonstrating IVC for two mock circuits
 *
 */
TEST_F(DatabusLinkingTests, Basic){

    // Construct two arbitrary circuits
    // WORKTODO: maybe try running folding prover/verifier with a single instance? (what is the work of the verifier if
    // only one instance?)
    // Builder app_circuit_0 = create_mock_circuit(ivc);
    // Builder app_circuit_1 = create_mock_circuit(ivc);

    // Create a folding proof to pass to rec verifier in next circuit

    // Kernel 0
    {
        // Recursively verify folding proof
        // Along the way save the witness indices for [R_0]
        // There is no [C_0] (well there is but its the point at inf.)
        // After verification, set the return data commitment indices to public
    }

    // Create folding proof of kernel into accumulator

    // Kernel 1
    {
        // Recursively verify folding proof
        // Along the way save the witness indices for [R_0] and [C_1]
        //  - R_0 is a private input extracted from the PI of pi_1
        //  - C_1 is a private input extracted directly from pi_1
        //  - Use these later on to assert equality between the two (can we do it on indices directly?)

        // ALSO need to save the witness indices for pi_1.[R_1}]
        // After verification, set pi_1.[R_1}] to public
        // Commitment check: [R_0] == [C_1].

        // NOTE: of course all of this coudl be done directly in the PG rec verifier without saving witness indices
        // which would be cleaner in some ways. I'm just not sure yet how much conditional logic all of this needs to
        // come with. If a lot, it may be cleaner to do it externally in ClientIvc. Otherwise lets just put it in PG.
    }
};

/**
 * @brief A simple-as-possible test demonstrating IVC for two mock circuits
 *
 */
TEST_F(DatabusLinkingTests, Example)
{
    ClientIVC ivc;

    // Initialize the IVC with an arbitrary circuit
    Builder circuit_0 = create_mock_circuit(ivc);
    ivc.accumulate(circuit_0);

    // Create another circuit and accumulate
    Builder circuit_1 = create_mock_circuit(ivc);
    ivc.accumulate(circuit_1);

    EXPECT_TRUE(prove_and_verify(ivc));
};