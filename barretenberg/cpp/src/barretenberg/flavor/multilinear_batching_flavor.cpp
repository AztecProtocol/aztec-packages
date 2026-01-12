// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "multilinear_batching_flavor.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/polynomials/eq_polynomial.hpp"

namespace bb {

MultilinearBatchingFlavor::ProvingKey::ProvingKey(MultilinearBatchingProverClaim&& accumulator_claim,
                                                  MultilinearBatchingProverClaim&& instance_claim)
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

    // Construct `eq` polynomials from challenges
    polynomials.eq_accumulator =
        ProverEqPolynomial<FF>::construct(accumulator_claim.challenge, bb::numeric::get_msb(circuit_size));
    polynomials.eq_instance =
        ProverEqPolynomial<FF>::construct(instance_claim.challenge, bb::numeric::get_msb(circuit_size));
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

} // namespace bb
