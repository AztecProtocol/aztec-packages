// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "multilinear_batching_prover.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

template <size_t MaxNumClaims>
MultilinearBatchingFlavor_<MaxNumClaims>::ProvingKey::ProvingKey(std::vector<ProverClaim>&& claims)
{
    BB_BENCH();
    BB_ASSERT_GT(claims.size(), 0UL, "MultilinearBatchingProver: at least one claim is required");
    BB_ASSERT_LTE(
        claims.size(), MAX_NUM_CLAIMS, "MultilinearBatchingProver: more claims than the fixed batching width");

    num_claims = claims.size();
    for (const auto& claim : claims) {
        circuit_size = std::max(circuit_size, claim.dyadic_size);
    }
    const size_t virtual_circuit_size = 1 << MultilinearBatchingFlavor_<MaxNumClaims>::VIRTUAL_LOG_N;
    const size_t log_circuit_size = bb::numeric::get_msb(circuit_size);

    for (size_t idx = 0; idx < num_claims; ++idx) {
        auto& claim = claims[idx];
        active_slots[idx] = true;
        polynomials.active_slots[idx] = true;

        polynomials.non_shifted(idx) = std::move(claim.non_shifted_polynomial);
        preshifted_polynomials[idx] = std::move(claim.shifted_polynomial);
        polynomials.shifted(idx) = preshifted_polynomials[idx].shifted();

        polynomials.eq(idx) = ProverEqPolynomial<FF>::construct(claim.challenge, log_circuit_size);
        polynomials.claim_challenges[idx] = std::move(claim.challenge);

        non_shifted_evaluations[idx] = claim.non_shifted_evaluation;
        shifted_evaluations[idx] = claim.shifted_evaluation;
        non_shifted_commitments[idx] = claim.non_shifted_commitment;
        shifted_commitments[idx] = claim.shifted_commitment;
    }

    for (size_t idx = num_claims; idx < MAX_NUM_CLAIMS; ++idx) {
        non_shifted_evaluations[idx] = FF(0);
        shifted_evaluations[idx] = FF(0);
        non_shifted_commitments[idx] = Commitment::infinity();
        shifted_commitments[idx] = Commitment::infinity();
        polynomials.claim_challenges[idx] =
            std::vector<FF>(MultilinearBatchingFlavor_<MaxNumClaims>::VIRTUAL_LOG_N, FF(0));
        polynomials.non_shifted(idx) = Polynomial(1, virtual_circuit_size);
        polynomials.shifted(idx) = Polynomial(1, virtual_circuit_size);
        polynomials.eq(idx) = Polynomial(1, virtual_circuit_size);
    }

    polynomials.increase_polynomials_virtual_size(virtual_circuit_size);
}

template <size_t MaxNumClaims>
void MultilinearBatchingFlavor_<MaxNumClaims>::ProvingKey::apply_slot_batching_challenge(const FF& challenge)
{
    std::vector<FF> scalars(MAX_NUM_CLAIMS);
    scalars[0] = FF(1);
    for (size_t idx = 1; idx < MAX_NUM_CLAIMS; ++idx) {
        scalars[idx] = scalars[idx - 1] * challenge;
    }

    for (size_t idx = 0; idx < num_claims; ++idx) {
        polynomials.non_shifted(idx) *= scalars[idx];
        preshifted_polynomials[idx] *= scalars[idx];
        polynomials.shifted(idx) = preshifted_polynomials[idx].shifted();
    }
}

template <typename Flavor>
MultilinearBatchingProverInternal<Flavor>::MultilinearBatchingProverInternal(
    std::vector<MultilinearBatchingProverClaim>&& claims, std::shared_ptr<Transcript> transcript)
    : transcript(std::move(transcript))
    , key(std::move(claims))
{}

template <typename Flavor> void MultilinearBatchingProverInternal<Flavor>::execute_claims_round()
{
    BB_BENCH();

    // The claims being batched are not sent in the proof: the verifier holds them in memory (it produced them via
    // instance_to_accumulator). The batching challenge is derived from the shared transcript, whose state already
    // commits to those claims via the group's instance sumchecks, so it binds them without any explicit hashing.
    claim_batching_challenge = transcript->template get_challenge<FF>("claim_batching_challenge");
    key.apply_slot_batching_challenge(claim_batching_challenge);
}

template <typename Flavor> void MultilinearBatchingProverInternal<Flavor>::execute_relation_check_rounds()
{
    BB_BENCH();
    using Sumcheck = SumcheckProver<Flavor>;

    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    Sumcheck sumcheck(key.circuit_size, key.polynomials, transcript, alpha, Flavor::VIRTUAL_LOG_N, {}, {});
    sumcheck_output = sumcheck.prove();
}

template <typename Flavor> MultilinearBatchingProverClaim MultilinearBatchingProverInternal<Flavor>::compute_new_claim()
{
    BB_BENCH();

    std::vector<FF> scalars(Flavor::MAX_NUM_CLAIMS);
    scalars[0] = FF(1);
    for (size_t idx = 1; idx < Flavor::MAX_NUM_CLAIMS; ++idx) {
        scalars[idx] = scalars[idx - 1] * claim_batching_challenge;
    }

    bb::Polynomial<FF> new_non_shifted_polynomial;
    bb::Polynomial<FF> new_shifted_polynomial;
    FF new_non_shifted_evaluation(0);
    FF new_shifted_evaluation(0);

    size_t largest_non_shifted_idx = 0;
    size_t largest_shifted_idx = 0;
    for (size_t idx = 0; idx < key.num_claims; ++idx) {
        if (key.polynomials.non_shifted(idx).end_index() >
            key.polynomials.non_shifted(largest_non_shifted_idx).end_index()) {
            largest_non_shifted_idx = idx;
        }
        if (key.preshifted_polynomials[idx].end_index() > key.preshifted_polynomials[largest_shifted_idx].end_index()) {
            largest_shifted_idx = idx;
        }

        new_non_shifted_evaluation += sumcheck_output.claimed_evaluations.non_shifted(idx);
        new_shifted_evaluation += sumcheck_output.claimed_evaluations.shifted(idx);
    }

    new_non_shifted_polynomial = std::move(key.polynomials.non_shifted(largest_non_shifted_idx));
    for (size_t idx = 0; idx < key.num_claims; ++idx) {
        if (idx != largest_non_shifted_idx) {
            new_non_shifted_polynomial += key.polynomials.non_shifted(idx);
        }
    }

    new_shifted_polynomial = std::move(key.preshifted_polynomials[largest_shifted_idx]);
    for (size_t idx = 0; idx < key.num_claims; ++idx) {
        if (idx != largest_shifted_idx) {
            new_shifted_polynomial += key.preshifted_polynomials[idx];
        }
    }

    std::vector<Commitment> non_shifted_commitments;
    std::vector<Commitment> shifted_commitments;
    non_shifted_commitments.reserve(key.num_claims);
    shifted_commitments.reserve(key.num_claims);
    std::vector<FF> active_scalars;
    active_scalars.reserve(key.num_claims);
    for (size_t idx = 0; idx < key.num_claims; ++idx) {
        non_shifted_commitments.emplace_back(key.non_shifted_commitments[idx]);
        shifted_commitments.emplace_back(key.shifted_commitments[idx]);
        active_scalars.emplace_back(scalars[idx]);
    }

    auto new_non_shifted_commitment = Commitment::batch_mul(non_shifted_commitments, active_scalars);
    auto new_shifted_commitment = Commitment::batch_mul(shifted_commitments, active_scalars);

    return MultilinearBatchingProverClaim{ .challenge = std::move(sumcheck_output.challenge),
                                           .non_shifted_evaluation = new_non_shifted_evaluation,
                                           .shifted_evaluation = new_shifted_evaluation,
                                           .non_shifted_polynomial = std::move(new_non_shifted_polynomial),
                                           .shifted_polynomial = std::move(new_shifted_polynomial),
                                           .non_shifted_commitment = new_non_shifted_commitment,
                                           .shifted_commitment = new_shifted_commitment,
                                           .dyadic_size = key.circuit_size };
}

template <typename Flavor> HonkProof MultilinearBatchingProverInternal<Flavor>::export_proof()
{
    return transcript->export_proof();
}

template <typename Flavor> HonkProof MultilinearBatchingProverInternal<Flavor>::construct_proof()
{
    BB_BENCH_NAME("MultilinearBatchingProver::construct_proof");

    execute_claims_round();
    execute_relation_check_rounds();

    vinfo("MultilinearBatchingProver:: Computed batching proof");
    return export_proof();
}

// Explicit instantiations for each per-kernel batching width (2 .. CHONK_MAX_CLAIMS_PER_KERNEL).
template class MultilinearBatchingProverInternal<MultilinearBatchingFlavor_<2>>;
template class MultilinearBatchingProverInternal<MultilinearBatchingFlavor_<3>>;
template class MultilinearBatchingProverInternal<MultilinearBatchingFlavor_<4>>;
template class MultilinearBatchingProverInternal<MultilinearBatchingFlavor_<5>>;
static_assert(CHONK_MAX_CLAIMS_PER_KERNEL == 5,
              "Per-kernel batching prover instantiations must cover every width up to CHONK_MAX_CLAIMS_PER_KERNEL");

MultilinearBatchingProver::MultilinearBatchingProver(std::vector<ProverClaim>&& claims,
                                                     std::shared_ptr<Transcript> transcript)
    : claims(std::move(claims))
    , transcript(std::move(transcript))
{}

template <size_t NumClaims> HonkProof MultilinearBatchingProver::prove_with_width()
{
    MultilinearBatchingProverInternal<MultilinearBatchingFlavor_<NumClaims>> internal(std::move(claims), transcript);
    HonkProof proof = internal.construct_proof();
    new_claim = internal.compute_new_claim();
    return proof;
}

HonkProof MultilinearBatchingProver::construct_proof()
{
    switch (claims.size()) {
    case 2:
        return prove_with_width<2>();
    case 3:
        return prove_with_width<3>();
    case 4:
        return prove_with_width<4>();
    case 5:
        return prove_with_width<5>();
    }
    static_assert(CHONK_MAX_CLAIMS_PER_KERNEL == 5,
                  "Per-kernel batching width dispatch must cover every width up to CHONK_MAX_CLAIMS_PER_KERNEL");
    throw_or_abort("MultilinearBatchingProver: unsupported batch width");
    return {};
}

MultilinearBatchingProver::ProverClaim MultilinearBatchingProver::compute_new_claim()
{
    BB_ASSERT(new_claim.has_value(),
              "MultilinearBatchingProver: construct_proof must be called before compute_new_claim");
    return std::move(*new_claim);
}

} // namespace bb
