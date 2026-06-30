// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/common/zip_view.hpp"

namespace bb {

#ifndef NDEBUG
bool MultilinearBatchingProverClaim::compare_with_verifier_claim(
    const MultilinearBatchingVerifierClaim<curve::BN254>& verifier_claim) const
{
    bool is_a_match = true;
    bb::CommitmentKey<curve::BN254> bn254_commitment_key(dyadic_size);

    for (size_t idx = 0; auto [prover_challenge, verifier_challenge] : zip_view(challenge, verifier_claim.challenge)) {
        if (prover_challenge != verifier_challenge) {
            info("Challenge mismatch at index ", idx);
            is_a_match = false;
        }
        idx++;
    }

    if (verifier_claim.non_shifted_commitment != bn254_commitment_key.commit(non_shifted_polynomial)) {
        info("Non-shifted commitment mismatch");
        is_a_match = false;
    }

    if (verifier_claim.shifted_commitment != bn254_commitment_key.commit(shifted_polynomial)) {
        info("Shifted commitment mismatch");
        is_a_match = false;
    }

    // Bump local virtual sizes to compute MLE evaluations without mutating the cached prover claim.
    Polynomial non_shifted_polynomial_for_evaluation = non_shifted_polynomial;
    Polynomial shifted_polynomial_for_evaluation = shifted_polynomial;
    non_shifted_polynomial_for_evaluation.increase_virtual_size(1 << challenge.size());
    shifted_polynomial_for_evaluation.increase_virtual_size(1 << challenge.size());

    if (verifier_claim.non_shifted_evaluation !=
        non_shifted_polynomial_for_evaluation.evaluate_mle(verifier_claim.challenge)) {
        info("Non-shifted evaluation mismatch");
        is_a_match = false;
    }

    if (verifier_claim.shifted_evaluation !=
        shifted_polynomial_for_evaluation.evaluate_mle(verifier_claim.challenge, true)) {
        info("Shifted evaluation mismatch");
        is_a_match = false;
    }

    return is_a_match;
}
#endif

} // namespace bb
