#include "barretenberg/client_ivc/client_ivc.hpp"

namespace bb {

ClientIVC::ClientIVC()
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/723):
    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);
}

/**
 * @brief Initialize the IVC with a first circuit
 * @details Initializes the accumulator and performs the initial goblin merge
 *
 * @param circuit
 */
void ClientIVC::initialize(ClientCircuit& circuit)
{
    goblin.merge(circuit); // Construct new merge proof
    Composer composer;
    prover_fold_output.accumulator = composer.create_prover_instance(circuit);
}

/**
 * @brief Accumulate a circuit into the IVC scheme
 * @details Performs goblin merge, generates circuit instance, folds into accumulator and constructs a folding proof
 *
 * @param circuit Circuit to be accumulated/folded
 * @return FoldProof
 */
ClientIVC::FoldProof ClientIVC::accumulate(ClientCircuit& circuit)
{
    goblin.merge(circuit); // Add recursive merge verifier and construct new merge proof
    Composer composer;
    prover_instance = composer.create_prover_instance(circuit);
    auto folding_prover = composer.create_folding_prover({ prover_fold_output.accumulator, prover_instance });
    prover_fold_output = folding_prover.fold_instances();
    return prover_fold_output.folding_data;
}

/**
 * @brief Construct a proof for the IVC, which, if verified, fully establishes its correctness
 *
 * @return Proof
 */
ClientIVC::Proof ClientIVC::prove()
{
    return { prover_fold_output.folding_data, decider_prove(), goblin.prove() };
}

/**
 * @brief Verify a full proof of the IVC
 *
 * @param proof
 * @return bool
 */
bool ClientIVC::verify(Proof& proof, const std::vector<ClientIVC::VerifierAccumulator>& verifier_instances)
{
    // Goblin verification (merge, eccvm, translator)
    bool goblin_verified = goblin.verify(proof.goblin_proof);

    // Decider verification
    Composer composer;
    auto folding_verifier = composer.create_folding_verifier({ verifier_instances[0], verifier_instances[1] });
    auto verifier_accumulator = folding_verifier.verify_folding_proof(proof.fold_proof);
    // NOTE: Use of member accumulator here will go away with removal of vkey from ProverInstance
    auto decider_verifier = composer.create_decider_verifier(verifier_accumulator);
    bool decision = decider_verifier.verify_proof(proof.decider_proof);
    return goblin_verified && decision;
}

/**
 * @brief Internal method for constructing a decider proof
 *
 * @return HonkProof
 */
HonkProof ClientIVC::decider_prove() const
{
    Composer composer;
    auto decider_prover = composer.create_decider_prover(prover_fold_output.accumulator);
    return decider_prover.construct_proof();
}

/**
 * @brief Precompute the array of verification keys by simulating folding. There will be 4 different verification keys.
 *
 */
void ClientIVC::precompute_folding_verification_keys()
{
    Composer composer;

    // Accumulate three circuits to generate two folding proofs for input to folding kernel
    ClientCircuit circuit_1{ goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_1);

    initialize(circuit_1);

    composer.compute_commitment_key(prover_fold_output.accumulator->instance_size);

    vks[0] = composer.compute_verification_key(prover_fold_output.accumulator);
    auto verifier_acc = std::make_shared<VerifierInstance>();
    verifier_acc->verification_key = vks[0];

    ClientCircuit circuit_2{ goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_2);
    auto fold_proof_1 = accumulate(circuit_2);
    vks[1] = composer.compute_verification_key(prover_instance);

    FoldOutput kernel_accum;
    // Construct kernel circuit
    ClientCircuit kernel_circuit{ goblin.op_queue };
    auto new_acc =
        GoblinMockCircuits::construct_mock_folding_kernel(kernel_circuit, { fold_proof_1, vks[1] }, {}, verifier_acc);
    auto fold_proof_3 = accumulate(kernel_circuit);
    vks[2] = composer.compute_verification_key(prover_instance); // first iteration of a kernel is smaller

    ClientCircuit circuit_4{ goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_4);
    auto fold_proof_4 = accumulate(circuit_4);

    ClientCircuit new_kernel_circuit = GoblinUltraCircuitBuilder{ goblin.op_queue };
    auto new_new_acc = GoblinMockCircuits::construct_mock_folding_kernel(
        new_kernel_circuit, { fold_proof_4, vks[1] }, { fold_proof_3, vks[2] }, new_acc);

    auto fold_proof_5 = accumulate(new_kernel_circuit);

    vks[3] = composer.compute_verification_key(prover_instance);
    auto kernel_inst = std::make_shared<VerifierInstance>();
    kernel_inst->verification_key = vks[3];

    goblin.op_queue = std::make_shared<Goblin::OpQueue>();
    goblin.merge_proof_exists = false;
    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);
}

} // namespace bb