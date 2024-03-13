#include "./ultra_verifier.hpp"
#include "barretenberg/commitment_schemes/zeromorph/zeromorph.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/protogalaxy/presumcheck_verifier.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {
template <typename Flavor>
UltraVerifier_<Flavor>::UltraVerifier_(const std::shared_ptr<Transcript>& transcript,
                                       const std::shared_ptr<VerificationKey>& verifier_key)
    : key(verifier_key)
    , transcript(transcript)
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
    using Curve = typename Flavor::Curve;
    using ZeroMorph = ZeroMorphVerifier_<Curve>;

    transcript = std::make_shared<Transcript>(proof);
    PreSumcheckVerifier<Flavor> presumcheck_verifier{ key, transcript };
    auto [relation_parameters, commitments, circuit_size, presumcheck_verified] =
        presumcheck_verifier.execute_presumcheck_round();
    if (!presumcheck_verified) {
        return false;
    }

    // Execute Sumcheck Verifier
    const size_t log_circuit_size = numeric::get_msb(circuit_size);
    auto sumcheck = SumcheckVerifier<Flavor>(log_circuit_size, transcript);
    RelationSeparator alphas;
    for (size_t idx = 0; idx < alphas.size(); idx++) {
        alphas[idx] = transcript->template get_challenge<FF>("Sumcheck:alpha_" + std::to_string(idx));
    }

    auto gate_challenges = std::vector<FF>(log_circuit_size);
    for (size_t idx = 0; idx < log_circuit_size; idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }
    auto [multivariate_challenge, claimed_evaluations, sumcheck_verified] =
        sumcheck.verify(relation_parameters, alphas, gate_challenges);

    // If Sumcheck did not verify, return false
    if (sumcheck_verified.has_value() && !sumcheck_verified.value()) {
        return false;
    }

    // Execute ZeroMorph rounds. See https://hackmd.io/dlf9xEwhTQyE3hiGbq4FsA?view for a complete description of the
    // unrolled protocol.
    auto pairing_points = ZeroMorph::verify(commitments.get_unshifted(),
                                            commitments.get_to_be_shifted(),
                                            claimed_evaluations.get_unshifted(),
                                            claimed_evaluations.get_shifted(),
                                            multivariate_challenge,
                                            transcript);

    auto verified = key->pcs_verification_key->pairing_check(pairing_points[0], pairing_points[1]);

    return sumcheck_verified.value() && verified;
}

template class UltraVerifier_<UltraFlavor>;
template class UltraVerifier_<GoblinUltraFlavor>;

} // namespace bb
