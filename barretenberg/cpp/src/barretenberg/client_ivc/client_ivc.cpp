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
bool ClientIVC::verify(Proof& proof, const std::vector<VerifierAccumulator>& verifier_instances)
{
    // Goblin verification (merge, eccvm, translator)
    bool goblin_verified = goblin.verify(proof.goblin_proof);

    // Decider verification
    Composer composer;
    auto folding_verifier = composer.create_folding_verifier({ verifier_instances[0], verifier_instances[1] });
    auto verifier_accumulator = folding_verifier.verify_folding_proof(proof.fold_proof);

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
 * @brief Precompute the array of verification keys by simulating folding. There will be 4 different verification keys:
 * initial function verification key (without recursive merge verifier), subsequent function verification key (with
 * recursive merge verifier), initial kernel verification key (with recursive merge verifier appended, no previous
 * kernel to fold), "full" kernel verification key( two recursive folding verifiers and merge verifier).
 *
 */
void ClientIVC::precompute_folding_verification_keys()
{
    using VerifierInstance = VerifierInstance_<GoblinUltraFlavor>;

    Composer composer;
    std::vector<ClientCircuit> client_circuits(3);
    // Run 3 circuits in parallel
    parallel_for(3, [&](size_t i) {
        client_circuits[i] = ClientCircuit();
        GoblinMockCircuits::construct_mock_function_circuit(client_circuits[i]);
    });

    // Initialise both the first prover and verifier accumulator from the inital function circuit
    client_circuits[0].op_queue->prepend_previous_queue(*goblin.op_queue);
    initialize(client_circuits[0]);
    client_circuits[0].op_queue.swap(goblin.op_queue);
    composer.compute_commitment_key(prover_fold_output.accumulator->instance_size);
    vks.first_func_vk = composer.compute_verification_key(prover_fold_output.accumulator);
    auto initial_verifier_acc = std::make_shared<VerifierInstance>();
    initial_verifier_acc->verification_key = vks.first_func_vk;

    // Accumulate the next function circuit
    client_circuits[1].op_queue->prepend_previous_queue(*goblin.op_queue);
    auto function_fold_proof = accumulate(client_circuits[1]);
    client_circuits[1].op_queue.swap(goblin.op_queue);

    // Create its verification key (we have called accumulate so it includes the recursive merge verifier)
    vks.func_vk = composer.compute_verification_key(prover_instance);

    // Create the initial kernel iteration and precompute its verification key
    ClientCircuit kernel_circuit{ goblin.op_queue };
    auto kernel_acc = GoblinMockCircuits::construct_mock_folding_kernel(
        kernel_circuit, { function_fold_proof, vks.func_vk }, {}, initial_verifier_acc);
    auto kernel_fold_proof = accumulate(kernel_circuit);
    vks.first_kernel_vk = composer.compute_verification_key(prover_instance);

    // Create another mock function circuit to run the full kernel
    client_circuits[2].op_queue->prepend_previous_queue(*goblin.op_queue);
    function_fold_proof = accumulate(client_circuits[2]);
    client_circuits[2].op_queue.swap(goblin.op_queue);

    // Create the full kernel circuit and compute verification key
    kernel_circuit = GoblinUltraCircuitBuilder{ goblin.op_queue };
    kernel_acc = GoblinMockCircuits::construct_mock_folding_kernel(
        kernel_circuit, { function_fold_proof, vks.func_vk }, { kernel_fold_proof, vks.first_kernel_vk }, kernel_acc);
    kernel_fold_proof = accumulate(kernel_circuit);

    vks.kernel_vk = composer.compute_verification_key(prover_instance);

    // Clean the ivc state
    goblin.op_queue = std::make_shared<Goblin::OpQueue>();
    goblin.merge_proof_exists = false;
    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);
}

} // namespace bb