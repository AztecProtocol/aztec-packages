// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "multilinear_batching_verifier.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/polynomials/eq_polynomial.hpp"

#include <optional>

namespace bb {

template <typename Flavor_>
MultilinearBatchingVerifierInternal<Flavor_>::MultilinearBatchingVerifierInternal(
    const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{}

template <typename Flavor_>
typename MultilinearBatchingVerifierInternal<Flavor_>::FF MultilinearBatchingVerifierInternal<
    Flavor_>::compute_target_sum(const FF& alpha,
                                 const std::vector<VerifierClaim>& claims,
                                 const std::vector<FF>& slot_scalars) const
{
    FF non_shifted_target(0);
    FF shifted_target(0);
    for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
        non_shifted_target += claims[idx].non_shifted_evaluation * slot_scalars[idx];
        shifted_target += claims[idx].shifted_evaluation * slot_scalars[idx];
    }
    return non_shifted_target + shifted_target * alpha;
}

template <typename Flavor_>
typename MultilinearBatchingVerifierInternal<Flavor_>::VerifierClaim MultilinearBatchingVerifierInternal<
    Flavor_>::compute_new_claim(const SumcheckOutput<Flavor>& sumcheck_result,
                                const std::vector<VerifierClaim>& claims,
                                std::vector<FF> slot_scalars)
{
    std::vector<Commitment> non_shifted_commitments;
    std::vector<Commitment> shifted_commitments;
    non_shifted_commitments.reserve(NUM_CLAIMS);
    shifted_commitments.reserve(NUM_CLAIMS);
    for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
        non_shifted_commitments.emplace_back(claims[idx].non_shifted_commitment);
        shifted_commitments.emplace_back(claims[idx].shifted_commitment);
    }

    Commitment non_shifted_commitment = Curve::Element::batch_mul(non_shifted_commitments, slot_scalars);
    Commitment shifted_commitment = Curve::Element::batch_mul(shifted_commitments, slot_scalars);

    // The sumcheck claimed evaluations are the evaluations of the original slot polynomials, so the batched
    // evaluation is their ρ-weighted sum — matching the ρ-weighted commitment P = Σ ρ^i P_i at the sumcheck challenge
    // point. ρ is fresh (drawn after the evaluations were bound), so the single decider opening binds each P_i(r).
    FF non_shifted_evaluation(0);
    FF shifted_evaluation(0);
    for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
        non_shifted_evaluation += slot_scalars[idx] * sumcheck_result.claimed_evaluations.non_shifted(idx);
        shifted_evaluation += slot_scalars[idx] * sumcheck_result.claimed_evaluations.shifted(idx);
    }

    return VerifierClaim{ .challenge = sumcheck_result.challenge,
                          .non_shifted_evaluation = non_shifted_evaluation,
                          .shifted_evaluation = shifted_evaluation,
                          .non_shifted_commitment = non_shifted_commitment,
                          .shifted_commitment = shifted_commitment };
}

template <typename Flavor_>
bool MultilinearBatchingVerifierInternal<Flavor_>::check_eq_consistency(const SumcheckOutput<Flavor>& sumcheck_result,
                                                                        const std::vector<VerifierClaim>& claims)
{
    bool verified = true;
    for (size_t idx = 0; idx < NUM_CLAIMS; ++idx) {
        auto eq_diff = sumcheck_result.claimed_evaluations.eq(idx) -
                       VerifierEqPolynomial<FF>::eval(claims[idx].challenge, sumcheck_result.challenge);
        if constexpr (IsRecursive) {
            verified &= eq_diff.get_value() == 0;
            eq_diff.assert_equal(FF(0), "MultilinearBatchingVerifier: eq polynomial mismatch");
        } else {
            verified &= eq_diff == FF(0);
        }
    }
    return verified;
}

template <typename Flavor_>
std::pair<bool, typename MultilinearBatchingVerifierInternal<Flavor_>::VerifierClaim>
MultilinearBatchingVerifierInternal<Flavor_>::verify_proof(const std::vector<VerifierClaim>& claims)
{
    BB_BENCH_NAME("MultilinearBatchingVerifier::verify_proof");
    BB_ASSERT_EQ(claims.size(), NUM_CLAIMS, "MultilinearBatchingVerifier: claim count must equal the width");

    // The batching sumcheck is read from the shared transcript, which already holds the group's instance sumchecks
    // followed by the loaded batching proof.
    //
    // γ separates the input claims: it weights the target sum (slot i by γ^i) and is fed to the relation as a public
    // per-slot coefficient. It is NOT used to merge the output claims — that is done with the fresh ρ below.
    const FF claim_batching_challenge = transcript->template get_challenge<FF>("claim_batching_challenge");
    std::vector<FF> batching_scalars(NUM_CLAIMS);
    batching_scalars[0] = FF(1);
    for (size_t idx = 1; idx < NUM_CLAIMS; ++idx) {
        batching_scalars[idx] = batching_scalars[idx - 1] * claim_batching_challenge;
    }

    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    FF target_sum = compute_target_sum(alpha, claims, batching_scalars);

    RelationParameters<FF> relation_parameters;
    relation_parameters.gamma = claim_batching_challenge;
    Sumcheck sumcheck(transcript, alpha, Flavor::VIRTUAL_LOG_N, target_sum);
    const auto sumcheck_result = sumcheck.verify(relation_parameters, {});

    bool eq_consistent = check_eq_consistency(sumcheck_result, claims);

    // Draw the merge challenge only now, after the sumcheck's claimed evaluations are bound to the transcript, so that
    // the single opening of the combined accumulator commitment binds each P_i(r) individually.
    const FF claim_merge_challenge = transcript->template get_challenge<FF>("claim_merge_challenge");
    std::vector<FF> merge_scalars(NUM_CLAIMS);
    merge_scalars[0] = FF(1);
    for (size_t idx = 1; idx < NUM_CLAIMS; ++idx) {
        merge_scalars[idx] = merge_scalars[idx - 1] * claim_merge_challenge;
    }

    VerifierClaim verifier_claim = compute_new_claim(sumcheck_result, claims, merge_scalars);
    bool verified = sumcheck_result.verified && eq_consistent;

    return { verified, verifier_claim };
}

template <bool IsRecursive_>
MultilinearBatchingVerifier<IsRecursive_>::MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{}

template <bool IsRecursive_>
template <size_t NumClaims>
std::pair<bool, typename MultilinearBatchingVerifier<IsRecursive_>::VerifierClaim> MultilinearBatchingVerifier<
    IsRecursive_>::verify_with_width(const std::vector<VerifierClaim>& claims)
{
    using FlavorW = std::conditional_t<IsRecursive_,
                                       MultilinearBatchingRecursiveFlavor_<NumClaims>,
                                       MultilinearBatchingFlavor_<NumClaims>>;
    MultilinearBatchingVerifierInternal<FlavorW> internal(transcript);
    return internal.verify_proof(claims);
}

template <bool IsRecursive_>
std::pair<bool, typename MultilinearBatchingVerifier<IsRecursive_>::VerifierClaim> MultilinearBatchingVerifier<
    IsRecursive_>::verify_proof(const std::vector<VerifierClaim>& claims)
{
    // Dispatch the runtime claim count to the matching compile-time width. The range is derived from
    // CHONK_MAX_CLAIMS_PER_KERNEL, so every supported width is instantiated automatically and bumping the constant
    // cannot leave a width unhandled.
    std::optional<std::pair<bool, VerifierClaim>> result;
    constexpr_for<2, CHONK_MAX_CLAIMS_PER_KERNEL + 1, 1>([&]<size_t Width>() {
        if (claims.size() == Width) {
            result = this->template verify_with_width<Width>(claims);
        }
    });
    if (!result.has_value()) {
        throw_or_abort("MultilinearBatchingVerifier: unsupported batch width");
    }
    return std::move(*result);
}

template class MultilinearBatchingVerifier<false>;
template class MultilinearBatchingVerifier<true>;

} // namespace bb
