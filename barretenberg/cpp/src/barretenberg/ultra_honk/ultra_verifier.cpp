#include "./ultra_verifier.hpp"
#include "barretenberg/commitment_schemes/zeromorph/zeromorph.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {
template <typename Flavor>
UltraVerifier_<Flavor>::UltraVerifier_(const std::shared_ptr<Transcript>& transcript,
                                       const std::shared_ptr<VerificationKey>& verifier_key)
    : key(verifier_key)
    , transcript(transcript)
    , instance(std::make_shared<Instance>(verifier_key))
{}

/**
 * @brief Construct an UltraVerifier directly from a verification key
 *
 * @tparam Flavor
 * @param verifier_key
 */
template <typename Flavor>
UltraVerifier_<Flavor>::UltraVerifier_(const std::shared_ptr<VerificationKey>& verifier_key)
    : key(verifier_key)
    , transcript(std::make_shared<Transcript>())
    , instance(std::make_shared<Instance>(verifier_key))
{}

template <typename Flavor>
UltraVerifier_<Flavor>::UltraVerifier_(UltraVerifier_&& other)
    : key(std::move(other.key))
{}

template <typename Flavor> UltraVerifier_<Flavor>& UltraVerifier_<Flavor>::operator=(UltraVerifier_&& other)
{
    key = other.key;
    return *this;
}

/**
 * @brief This function verifies an Ultra Honk proof for a given Flavor.
 *
 */
template <typename Flavor> bool UltraVerifier_<Flavor>::verify_proof(const HonkProof& proof)
{
    using FF = typename Flavor::FF;

    transcript = std::make_shared<Transcript>(proof);
    OinkVerifier<Flavor> oink_verifier{ key, transcript };
    auto [relation_parameters, witness_commitments, public_inputs, alphas] = oink_verifier.verify();
    instance->relation_parameters = std::move(relation_parameters);
    instance->witness_commitments = std::move(witness_commitments);
    instance->alphas = std::move(alphas);

    size_t log_circuit_size = numeric::get_msb(key->circuit_size);
    for (size_t idx = 0; idx < log_circuit_size; idx++) {
        instance->gate_challenges.emplace_back(
            transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx)));
    }

    DeciderVerifier decider_verifier{ instance, transcript };

    return decider_verifier.verify();
}

template class UltraVerifier_<UltraFlavor>;
template class UltraVerifier_<UltraKeccakFlavor>;
template class UltraVerifier_<MegaFlavor>;

} // namespace bb
