// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "multilinear_batching_prover.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

template <size_t NumClaims>
MultilinearBatchingFlavor_<NumClaims>::ProvingKey::ProvingKey(std::vector<ProverClaim>&& claims)
{
    BB_BENCH();
    BB_ASSERT_EQ(claims.size(), NUM_CLAIMS, "MultilinearBatchingProver: claim count must equal the batching width");

    for (const auto& claim : claims) {
        circuit_size = std::max(circuit_size, claim.dyadic_size);
    }
    const size_t virtual_circuit_size = 1 << MultilinearBatchingFlavor_<NumClaims>::VIRTUAL_LOG_N;
    const size_t log_circuit_size = bb::numeric::get_msb(circuit_size);

    for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
        auto& claim = claims[idx];

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

    polynomials.increase_polynomials_virtual_size(virtual_circuit_size);
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
    //
    // γ is not baked into the polynomials: it is fed to the relation as a public per-polynomials coefficient (the i-th
    // polynomial is weighted by γ^i)
    claim_batching_challenge = transcript->template get_challenge<FF>("claim_batching_challenge");
}

template <typename Flavor> void MultilinearBatchingProverInternal<Flavor>::execute_relation_check_rounds()
{
    BB_BENCH();
    using Sumcheck = SumcheckProver<Flavor>;

    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    RelationParameters<FF> relation_parameters;
    relation_parameters.compute_multilinear_batching_challenges(claim_batching_challenge, Flavor::NUM_CLAIMS);
    Sumcheck sumcheck(key.circuit_size,
                      key.polynomials,
                      transcript,
                      alpha,
                      /*gate_challenges=*/{}, // No need for gate challenges, all the relations are linearly dependent
                      relation_parameters,
                      Flavor::VIRTUAL_LOG_N);
    sumcheck_output = sumcheck.prove();

    // Draw the merge challenge after the sumcheck's claimed evaluations are bound to the transcript, so that
    // the single opening of the combined accumulator commitment binds each P_i(r) individually.
    claim_merge_challenge = transcript->template get_challenge<FF>("claim_merge_challenge");
}

template <typename Flavor> MultilinearBatchingProverClaim MultilinearBatchingProverInternal<Flavor>::compute_new_claim()
{
    BB_BENCH();

    // Merge the output claims using the fresh challenge ρ. ρ is drawn after the claimed evaluations are bound, so the
    // single decider opening binds each P_i(r) individually
    std::vector<FF> scalars(Flavor::NUM_CLAIMS);
    scalars[0] = FF(1);
    for (size_t idx = 1; idx < Flavor::NUM_CLAIMS; ++idx) {
        scalars[idx] = scalars[idx - 1] * claim_merge_challenge;
    }

    bb::Polynomial<FF> new_non_shifted_polynomial;
    bb::Polynomial<FF> new_shifted_polynomial;
    FF new_non_shifted_evaluation(0);
    FF new_shifted_evaluation(0);

    size_t largest_non_shifted_idx = 0;
    size_t largest_shifted_idx = 0;
    for (size_t idx = 0; idx < Flavor::NUM_CLAIMS; ++idx) {
        if (key.polynomials.non_shifted(idx).end_index() >
            key.polynomials.non_shifted(largest_non_shifted_idx).end_index()) {
            largest_non_shifted_idx = idx;
        }
        if (key.preshifted_polynomials[idx].end_index() > key.preshifted_polynomials[largest_shifted_idx].end_index()) {
            largest_shifted_idx = idx;
        }

        new_non_shifted_evaluation += scalars[idx] * sumcheck_output.claimed_evaluations.non_shifted(idx);
        new_shifted_evaluation += scalars[idx] * sumcheck_output.claimed_evaluations.shifted(idx);
    }

    new_non_shifted_polynomial = std::move(key.polynomials.non_shifted(largest_non_shifted_idx));
    new_non_shifted_polynomial *= scalars[largest_non_shifted_idx];
    for (size_t idx = 0; idx < Flavor::NUM_CLAIMS; ++idx) {
        if (idx != largest_non_shifted_idx) {
            new_non_shifted_polynomial.add_scaled(key.polynomials.non_shifted(idx), scalars[idx]);
        }
    }

    new_shifted_polynomial = std::move(key.preshifted_polynomials[largest_shifted_idx]);
    new_shifted_polynomial *= scalars[largest_shifted_idx];
    for (size_t idx = 0; idx < Flavor::NUM_CLAIMS; ++idx) {
        if (idx != largest_shifted_idx) {
            new_shifted_polynomial.add_scaled(key.preshifted_polynomials[idx], scalars[idx]);
        }
    }

    std::vector<Commitment> non_shifted_commitments;
    std::vector<Commitment> shifted_commitments;
    non_shifted_commitments.reserve(Flavor::NUM_CLAIMS);
    shifted_commitments.reserve(Flavor::NUM_CLAIMS);
    for (size_t idx = 0; idx < Flavor::NUM_CLAIMS; ++idx) {
        non_shifted_commitments.emplace_back(key.non_shifted_commitments[idx]);
        shifted_commitments.emplace_back(key.shifted_commitments[idx]);
    }

    auto new_non_shifted_commitment = Commitment::batch_mul(non_shifted_commitments, scalars);
    auto new_shifted_commitment = Commitment::batch_mul(shifted_commitments, scalars);

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
    // Dispatch the runtime claim count to the matching compile-time width. The range is derived from
    // CHONK_MAX_CLAIMS_PER_KERNEL so every supported width is instantiated automatically and bumping the constant
    // cannot leave a width unhandled.
    std::optional<HonkProof> proof;
    constexpr_for<2, CHONK_MAX_CLAIMS_PER_KERNEL + 1, 1>([&]<size_t Width>() {
        if (claims.size() == Width) {
            proof = prove_with_width<Width>();
        }
    });
    if (!proof.has_value()) {
        throw_or_abort("MultilinearBatchingProver: incorrect number of claims supplied.");
    }
    return std::move(*proof);
}

MultilinearBatchingProver::ProverClaim MultilinearBatchingProver::compute_new_claim()
{
    BB_ASSERT(new_claim.has_value(),
              "MultilinearBatchingProver: construct_proof must be called before compute_new_claim");
    return std::move(*new_claim);
}

} // namespace bb
