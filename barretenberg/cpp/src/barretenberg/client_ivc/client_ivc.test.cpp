#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>
using namespace bb;

class ClientIVCTests : public ::testing::Test {
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
    using ProverAccumulator = ClientIVC::ProverAccumulator;
    using VerifierAccumulator = ClientIVC::VerifierAccumulator;
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
        // finalisation stage via the add_gates_to_ensure_all_polys_are_non_zero function for other UGH
        // circuits (where we don't explicitly need to add goblin ops), in ClientIVC merge proving happens prior to
        // folding where the absense of goblin ecc ops will result in zero commitments.
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }

    /**
     * @brief Perform native fold verification and run decider prover/verifier
     *
     */
    // WORKTODO: is it useful to use this in my new tests?
    static VerifierAccumulator update_accumulator_and_decide_native(
        const ProverAccumulator& prover_accumulator,
        const FoldProof& fold_proof,
        const VerifierAccumulator& prev_verifier_accumulator,
        const std::shared_ptr<Flavor::VerificationKey>& verifier_inst_vk)
    {
        // Verify fold proof
        auto new_verifier_inst = std::make_shared<VerifierInstance>(verifier_inst_vk);
        FoldingVerifier folding_verifier({ prev_verifier_accumulator, new_verifier_inst });
        auto verifier_accumulator = folding_verifier.verify_folding_proof(fold_proof);

        // Run decider
        DeciderProver decider_prover(prover_accumulator);
        DeciderVerifier decider_verifier(verifier_accumulator);
        auto decider_proof = decider_prover.construct_proof();
        bool decision = decider_verifier.verify_proof(decider_proof);
        EXPECT_TRUE(decision);

        return verifier_accumulator;
    }
};

// WORKTODO: add a structured test!

/**
 * @brief A simple-as-possible test demonstrating IVC for a collection of toy circuits
 *
 */
TEST_F(ClientIVCTests, Basic)
{
    ClientIVC ivc;

    // Initialize IVC with function circuit
    Builder circuit_0 = create_mock_circuit(ivc);
    ivc.accumulate(circuit_0);

    // Create another circuit and accumulate
    Builder circuit_1 = create_mock_circuit(ivc);
    ivc.accumulate(circuit_1);

    // Create another circuit and accumulate
    Builder circuit_2 = create_mock_circuit(ivc);
    ivc.accumulate(circuit_2);

    EXPECT_TRUE(prove_and_verify(ivc));
};

/**
 * @brief A simple-as-possible test demonstrating IVC for a collection of toy circuits
 *
 */
TEST_F(ClientIVCTests, BasicLarge)
{
    ClientIVC ivc;

    // Construct a set of arbitrary circuits
    size_t NUM_CIRCUITS = 3;
    std::vector<Builder> circuits;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        circuits.emplace_back(create_mock_circuit(ivc));
    }

    // Accumulate each circuit
    for (auto& circuit : circuits) {
        ivc.accumulate(circuit);
    }

    EXPECT_TRUE(prove_and_verify(ivc));
};

/**
 * @brief Perform IVC with precomputed verification keys
 *
 */
TEST_F(ClientIVCTests, PrecomputedVerificationKeys)
{
    ClientIVC ivc;

    // Construct a set of arbitrary circuits
    size_t NUM_CIRCUITS = 3;
    std::vector<Builder> circuits;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        circuits.emplace_back(create_mock_circuit(ivc));
    }

    auto precomputed_vkeys = ivc.precompute_folding_verification_keys(circuits);

    // Accumulate each circuit
    for (auto [circuit, precomputed_vk] : zip_view(circuits, precomputed_vkeys)) {
        ivc.accumulate(circuit, precomputed_vk);
    }

    EXPECT_TRUE(prove_and_verify(ivc));
};