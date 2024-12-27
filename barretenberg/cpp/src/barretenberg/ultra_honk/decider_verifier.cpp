#include "decider_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_verification_key.hpp"

namespace bb {

template <typename Flavor>
DeciderVerifier_<Flavor>::DeciderVerifier_(const std::shared_ptr<DeciderVerificationKey>& accumulator,
                                           const std::shared_ptr<Transcript>& transcript)
    : accumulator(accumulator)
    , pcs_verification_key(accumulator->verification_key->pcs_verification_key)
    , transcript(transcript)
{}

template <typename Flavor>
DeciderVerifier_<Flavor>::DeciderVerifier_(const std::shared_ptr<DeciderVerificationKey>& accumulator)
    : accumulator(accumulator)
    , pcs_verification_key(accumulator->verification_key->pcs_verification_key)
{}

/**
 * @brief Verify a decider proof relative to a decider verification key (ϕ, \vec{β*}, e*).
 */
template <typename Flavor> bool DeciderVerifier_<Flavor>::verify_proof(const DeciderProof& proof)
{
    transcript = std::make_shared<Transcript>(proof);
    return verify();
}

/**
 * @brief Verify a decider proof that is assumed to be contained in the transcript
 *
 */
template <typename Flavor> bool DeciderVerifier_<Flavor>::verify()
{
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;

    VerifierCommitments commitments{ accumulator->verification_key, accumulator->witness_commitments };

    auto sumcheck = SumcheckVerifier<Flavor>(
        static_cast<size_t>(accumulator->verification_key->log_circuit_size), transcript, accumulator->target_sum);

    auto [multivariate_challenge, claimed_evaluations, sumcheck_verified] =
        sumcheck.verify(accumulator->relation_parameters, accumulator->alphas, accumulator->gate_challenges);

    // If Sumcheck did not verify, return false
    if (sumcheck_verified.has_value() && !sumcheck_verified.value()) {
        info("Sumcheck verification failed.");
        return false;
    }

    const auto opening_claim = Shplemini::compute_batch_opening_claim(accumulator->verification_key->circuit_size,
                                                                      commitments.get_unshifted(),
                                                                      commitments.get_to_be_shifted(),
                                                                      claimed_evaluations.get_unshifted(),
                                                                      claimed_evaluations.get_shifted(),
                                                                      multivariate_challenge,
                                                                      Commitment::one(),
                                                                      transcript);
    const auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);
    bool verified = pcs_verification_key->pairing_check(pairing_points[0], pairing_points[1]);

    return sumcheck_verified.value() && verified;
}

template class DeciderVerifier_<UltraFlavor>;
template class DeciderVerifier_<UltraKeccakFlavor>;
template class DeciderVerifier_<UltraStarknetFlavor>;
template class DeciderVerifier_<MegaFlavor>;

} // namespace bb
