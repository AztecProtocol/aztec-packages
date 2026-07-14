// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "multilinear_batching_flavor.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/polynomials/eq_polynomial.hpp"

namespace bb {

MultilinearBatchingFlavor::ProvingKey::ProvingKey(ProverClaim&& accumulator_claim, ProverClaim&& instance_claim)
{
    BB_BENCH();

    circuit_size = std::max(accumulator_claim.dyadic_size, instance_claim.dyadic_size);
    size_t virtual_circuit_size = 1 << MultilinearBatchingFlavor::VIRTUAL_LOG_N;

    // Move unshifted polynomials (the "P" in evaluation claims P(r) = v)
    polynomials.batched_unshifted_accumulator = std::move(accumulator_claim.non_shifted_polynomial);
    polynomials.batched_unshifted_instance = std::move(instance_claim.non_shifted_polynomial);

    // Initialize shiftable polynomials that are required to create the output claim's shifted polynomial
    preshifted_accumulator = std::move(accumulator_claim.shifted_polynomial);
    preshifted_instance = std::move(instance_claim.shifted_polynomial);

    // Create shifted views for sumcheck. These share the underlying memory buffer with preshifted_*
    polynomials.batched_shifted_accumulator = preshifted_accumulator.shifted();
    polynomials.batched_shifted_instance = preshifted_instance.shifted();

    // Construct eq polynomials with 2^m coefficients (m = log2(circuit_size)), not 2^VIRTUAL_LOG_N.
    // Virtual sumcheck rounds handle the remaining challenges without needing the full table.
    const size_t log_circuit_size = bb::numeric::get_msb(circuit_size);
    polynomials.eq_accumulator = ProverEqPolynomial<FF>::construct(accumulator_claim.challenge, log_circuit_size);
    polynomials.eq_instance = ProverEqPolynomial<FF>::construct(instance_claim.challenge, log_circuit_size);
    polynomials.increase_polynomials_virtual_size(virtual_circuit_size);

    // Move incoming challenges  and copy commitments with corresponding evaluations
    accumulator_challenge = std::move(accumulator_claim.challenge);
    instance_challenge = std::move(instance_claim.challenge);

    accumulator_evaluations = { accumulator_claim.non_shifted_evaluation, accumulator_claim.shifted_evaluation };
    instance_evaluations = { instance_claim.non_shifted_evaluation, instance_claim.shifted_evaluation };

    non_shifted_accumulator_commitment = accumulator_claim.non_shifted_commitment;
    shifted_accumulator_commitment = accumulator_claim.shifted_commitment;
    non_shifted_instance_commitment = instance_claim.non_shifted_commitment;
    shifted_instance_commitment = instance_claim.shifted_commitment;
}

MultilinearBatchingVerifierClaim<curve::BN254> MultilinearBatchingFlavor::ProverClaim::to_verifier_claim_for_testing()
    const
{
    MultilinearBatchingVerifierClaim<curve::BN254> verifier_claim;
    verifier_claim.challenge = challenge;
    verifier_claim.non_shifted_evaluation = non_shifted_evaluation;
    verifier_claim.shifted_evaluation = shifted_evaluation;
    verifier_claim.non_shifted_commitment = non_shifted_commitment;
    verifier_claim.shifted_commitment = shifted_commitment;
    return verifier_claim;
}

#ifndef NDEBUG
bool MultilinearBatchingFlavor::ProverClaim::compare_with_verifier_claim(
    const MultilinearBatchingVerifierClaim<curve::BN254>& verifier_claim)
{
    bool is_a_match = true;
    CommitmentKey bn254_commitment_key(dyadic_size);

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

    // Bump the virtual size to compute mle evaluations
    non_shifted_polynomial.increase_virtual_size(1 << challenge.size());
    shifted_polynomial.increase_virtual_size(1 << challenge.size());

    if (verifier_claim.non_shifted_evaluation != non_shifted_polynomial.evaluate_mle(verifier_claim.challenge)) {
        info("Non-shifted evaluation mismatch");
        is_a_match = false;
    }

    if (verifier_claim.shifted_evaluation != shifted_polynomial.evaluate_mle(verifier_claim.challenge, true)) {
        info("Shifted evaluation mismatch");
        is_a_match = false;
    }

    return is_a_match;
}
#endif

} // namespace bb
