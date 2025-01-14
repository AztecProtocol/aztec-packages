#include "ultra_prover.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
namespace bb {

/**
 * @brief Create UltraProver_ from a decider proving key.
 *
 * @param proving_key key whose proof we want to generate.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraFlavor Flavor>
UltraProver_<Flavor>::UltraProver_(const std::shared_ptr<DeciderPK>& proving_key,
                                   const std::shared_ptr<Transcript>& transcript)
    : proving_key(std::move(proving_key))
    , transcript(transcript)
    , commitment_key(proving_key->proving_key.commitment_key)
{}

/**
 * @brief Create UltraProver_ from a circuit.
 *
 * @param circuit Circuit with witnesses whose validity we'd like to prove.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraFlavor Flavor>
UltraProver_<Flavor>::UltraProver_(Builder& circuit)
    : proving_key(std::make_shared<DeciderProvingKey>(circuit))
    , transcript(std::make_shared<Transcript>())
    , commitment_key(proving_key->proving_key.commitment_key)
{}

template <IsUltraFlavor Flavor> HonkProof UltraProver_<Flavor>::export_proof()
{
    proof = transcript->proof_data;
    // Add the IPA proof
    if constexpr (HasIPAAccumulator<Flavor>) {
        // The extra calculation is for the IPA proof length.
        ASSERT(proving_key->proving_key.ipa_proof.size() == 1 + 4 * (CONST_ECCVM_LOG_N) + 2 + 2);
        proof.insert(proof.end(), proving_key->proving_key.ipa_proof.begin(), proving_key->proving_key.ipa_proof.end());
    }
    return proof;
}
template <IsUltraFlavor Flavor> void UltraProver_<Flavor>::generate_gate_challenges()
{
    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }
    proving_key->gate_challenges = gate_challenges;
}

template <IsUltraFlavor Flavor> HonkProof UltraProver_<Flavor>::construct_proof()
{
    OinkProver<Flavor> oink_prover(proving_key, transcript);
    vinfo("created oink prover");
    oink_prover.prove();
    vinfo("created oink proof");

    generate_gate_challenges();

    DeciderProver_<Flavor> decider_prover(proving_key, transcript);
    vinfo("created decider prover");
    decider_prover.construct_proof();
    return export_proof();
}

template class UltraProver_<UltraFlavor>;
template class UltraProver_<UltraKeccakFlavor>;
template class UltraProver_<UltraRollupFlavor>;
template class UltraProver_<MegaFlavor>;
template class UltraProver_<MegaZKFlavor>;

} // namespace bb
