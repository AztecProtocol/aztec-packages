#include "ultra_prover.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"

namespace bb {

/**
 * Create UltraProver_ from an instance.
 *
 * @param instance Instance whose proof we want to generate.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraFlavor Flavor>
UltraProver_<Flavor>::UltraProver_(const std::shared_ptr<Instance>& inst, const std::shared_ptr<Transcript>& transcript)
    : instance(std::move(inst))
    , transcript(transcript)
    , commitment_key(instance->proving_key->commitment_key)
    , oink_prover(instance->proving_key, commitment_key, transcript, "")
{}

/**
 * Create UltraProver_ from a circuit.
 *
 * @param instance Circuit with witnesses whose validity we'd like to prove.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraFlavor Flavor>
UltraProver_<Flavor>::UltraProver_(Builder& circuit)
    : instance(std::make_shared<ProverInstance>(circuit))
    , transcript(std::make_shared<Transcript>())
    , commitment_key(instance->proving_key->commitment_key)
    , oink_prover(instance->proving_key, commitment_key, transcript, "")
{}

template <IsUltraFlavor Flavor> HonkProof UltraProver_<Flavor>::export_proof()
{
    proof = transcript->proof_data;
    return proof;
}
template <IsUltraFlavor Flavor> HonkProof UltraProver_<Flavor>::construct_proof()
{
    auto [relation_params, alphas] = oink_prover.prove();
    instance->relation_parameters = std::move(relation_params);
    instance->alphas = alphas;
    instance->prover_polynomials = ProverPolynomials(instance->proving_key);

    std::vector<FF> gate_challenges(numeric::get_msb(instance->proving_key->circuit_size));
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }
    instance->gate_challenges = gate_challenges;

    DeciderProver_<Flavor> decider_prover(instance, transcript);

    // // Fiat-Shamir: alpha
    // // Run sumcheck subprotocol.
    // execute_relation_check_rounds();

    // // Fiat-Shamir: rho, y, x, z
    // // Execute Zeromorph multilinear PCS
    // execute_zeromorph_rounds();

    return decider_prover.construct_proof();
}

template class UltraProver_<UltraFlavor>;
template class UltraProver_<GoblinUltraFlavor>;

} // namespace bb
