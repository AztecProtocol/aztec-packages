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
UltraProver_<Flavor>::UltraProver_(const std::shared_ptr<ProverInstance>& prover_instance,
                                   const std::shared_ptr<HonkVK>& honk_vk,
                                   const CommitmentKey& commitment_key)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(commitment_key)
{}

/**
 * @brief Create UltraProver_ from a decider proving key.
 *
 * @param prover_instance key whose proof we want to generate.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(const std::shared_ptr<ProverInstance>& prover_instance,
                                   const std::shared_ptr<HonkVK>& honk_vk,
                                   const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::move(prover_instance))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

/**
 * @brief Create UltraProver_ from a circuit.
 *
 * @param circuit Circuit with witnesses whose validity we'd like to prove.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(Builder& circuit,
                                   const std::shared_ptr<HonkVK>& honk_vk,
                                   const std::shared_ptr<Transcript>& transcript)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(transcript)
    , commitment_key(prover_instance->commitment_key)
{}

template <IsUltraOrMegaHonk Flavor>
UltraProver_<Flavor>::UltraProver_(Builder&& circuit, const std::shared_ptr<HonkVK>& honk_vk)
    : prover_instance(std::make_shared<ProverInstance>(circuit))
    , honk_vk(honk_vk)
    , transcript(std::make_shared<Transcript>())
    , commitment_key(prover_instance->commitment_key)
{}

template <IsUltraOrMegaHonk Flavor> typename UltraProver_<Flavor>::Proof UltraProver_<Flavor>::export_proof()
{
    auto proof = transcript->export_proof();

    // Add the IPA proof
    if constexpr (HasIPAAccumulator<Flavor>) {
        // The extra calculation is for the IPA proof length.
        BB_ASSERT_EQ(prover_instance->ipa_proof.size(), static_cast<size_t>(IPA_PROOF_LENGTH));
        proof.insert(proof.end(), prover_instance->ipa_proof.begin(), prover_instance->ipa_proof.end());
    }

    return proof;
}

template <IsUltraOrMegaHonk Flavor> void UltraProver_<Flavor>::generate_gate_challenges()
{
    // Determine the number of rounds in the sumcheck based on whether or not padding is employed
    const size_t virtual_log_n =
        Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : static_cast<size_t>(prover_instance->log_dyadic_size());

    prover_instance->gate_challenges =
        transcript->template get_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);
}

template <IsUltraOrMegaHonk Flavor> typename UltraProver_<Flavor>::Proof UltraProver_<Flavor>::construct_proof()
{
    OinkProver<Flavor> oink_prover(prover_instance, honk_vk, transcript);
    oink_prover.prove();
    vinfo("created oink proof");

    generate_gate_challenges();

    DeciderProver_<Flavor> decider_prover(prover_instance, transcript);
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
