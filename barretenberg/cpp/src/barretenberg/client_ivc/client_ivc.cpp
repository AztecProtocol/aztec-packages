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

std::shared_ptr<ClientIVC::VerifierInstance> ClientIVC::get_verifier_instance()
{
    Composer composer;
    composer.compute_commitment_key(prover_instance->instance_size);
    auto verifier_instance = composer.create_verifier_instance(prover_instance);
    return verifier_instance;
}

ClientIVC::VerifierAccumulator ClientIVC::get_verifier_accumulator()
{
    Composer composer;
    auto prover_accumulator = prover_fold_output.accumulator;
    composer.compute_commitment_key(prover_accumulator->instance_size);
    auto verifier_accumulator = composer.create_verifier_instance(prover_accumulator);
    return verifier_accumulator;
}

} // namespace bb