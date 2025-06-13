// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "ultra_prover.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
namespace bb {

template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(const std::shared_ptr<DeciderPK>& proving_key, const CommitmentKey& commitment_key)
    : proving_key(std::move(proving_key))
    , transcript(std::make_shared<Transcript>())
    , commitment_key(commitment_key)
{}

/**
 * @brief Create UltraProver_ from a decider proving key.
 *
 * @param proving_key key whose proof we want to generate.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraOrMegaHonk Flavor>
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
template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(Builder& circuit, const std::shared_ptr<Transcript>& transcript)
    : proving_key(std::make_shared<DeciderProvingKey>(circuit))
    , transcript(transcript)
    , commitment_key(proving_key->proving_key.commitment_key)
{}

template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(Builder&& circuit)
    : proving_key(std::make_shared<DeciderProvingKey>(circuit))
    , transcript(std::make_shared<Transcript>())
    , commitment_key(proving_key->proving_key.commitment_key)
{}

template <IsUltraOrMegaHonk Flavor> HonkProof UltraProver_<Flavor>::export_proof()
{
    // Add the IPA proof
    if constexpr (HasIPAAccumulator<Flavor>) {
        proof = transcript->proof_data;
        // The extra calculation is for the IPA proof length.
        BB_ASSERT_EQ(proving_key->proving_key.ipa_proof.size(), static_cast<size_t>(IPA_PROOF_LENGTH));
        proof.insert(proof.end(), proving_key->proving_key.ipa_proof.begin(), proving_key->proving_key.ipa_proof.end());
    } else {
        proof = transcript->export_proof();
    }
    return proof;
}

template <IsUltraOrMegaHonk Flavor> void UltraProver_<Flavor>::generate_gate_challenges()
{
    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }
    proving_key->gate_challenges = gate_challenges;
}

template <IsUltraOrMegaHonk Flavor> HonkProof UltraProver_<Flavor>::construct_proof()
{
    OinkProver<Flavor> oink_prover(proving_key, transcript);
    oink_prover.prove();
    vinfo("created oink proof");

    generate_gate_challenges();

    DeciderProver_<Flavor> decider_prover(proving_key, transcript);
    decider_prover.construct_proof();
    return export_proof();
}

template class UltraProver_<UltraFlavor>;
template class UltraProver_<UltraZKFlavor>;
template class UltraProver_<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class UltraProver_<UltraStarknetFlavor>;
template class UltraProver_<UltraStarknetZKFlavor>;
#endif
template class UltraProver_<UltraKeccakZKFlavor>;
template class UltraProver_<UltraRollupFlavor>;
template class UltraProver_<MegaFlavor>;
template class UltraProver_<MegaZKFlavor>;

} // namespace bb
