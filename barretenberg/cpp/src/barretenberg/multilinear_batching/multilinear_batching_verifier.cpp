// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "multilinear_batching_verifier.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/polynomials/eq_polynomial.hpp"

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
    for (size_t idx = 0; idx < MAX_NUM_CLAIMS; ++idx) {
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
    non_shifted_commitments.reserve(MAX_NUM_CLAIMS);
    shifted_commitments.reserve(MAX_NUM_CLAIMS);
    for (size_t idx = 0; idx < MAX_NUM_CLAIMS; ++idx) {
        non_shifted_commitments.emplace_back(claims[idx].non_shifted_commitment);
        shifted_commitments.emplace_back(claims[idx].shifted_commitment);
    }

    Commitment non_shifted_commitment = Curve::Element::batch_mul(non_shifted_commitments, slot_scalars);
    Commitment shifted_commitment = Curve::Element::batch_mul(shifted_commitments, slot_scalars);

    // The sumcheck claimed evaluations are the evaluations of the already γ-scaled slot polynomials, so summing them
    // yields the evaluation of the batched polynomial P = Σ γ^i P_i at the sumcheck challenge point.
    FF non_shifted_evaluation(0);
    FF shifted_evaluation(0);
    for (size_t idx = 0; idx < MAX_NUM_CLAIMS; ++idx) {
        non_shifted_evaluation += sumcheck_result.claimed_evaluations.non_shifted(idx);
        shifted_evaluation += sumcheck_result.claimed_evaluations.shifted(idx);
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
    for (size_t idx = 0; idx < MAX_NUM_CLAIMS; ++idx) {
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
    BB_ASSERT_EQ(claims.size(), MAX_NUM_CLAIMS, "MultilinearBatchingVerifier: claim count must equal the width");

    // The batching sumcheck is read from the shared transcript, which already holds the group's instance sumchecks
    // followed by the loaded batching proof.
    const FF claim_batching_challenge = transcript->template get_challenge<FF>("claim_batching_challenge");
    std::vector<FF> slot_scalars(MAX_NUM_CLAIMS);
    slot_scalars[0] = FF(1);
    for (size_t idx = 1; idx < MAX_NUM_CLAIMS; ++idx) {
        slot_scalars[idx] = slot_scalars[idx - 1] * claim_batching_challenge;
    }
    if constexpr (IsRecursive) {
        const auto batching_challenge_tag = claim_batching_challenge.get_origin_tag();
        for (auto& scalar : slot_scalars) {
            scalar.set_origin_tag(batching_challenge_tag);
        }
    }

    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    FF target_sum = compute_target_sum(alpha, claims, slot_scalars);

    Sumcheck sumcheck(transcript, alpha, Flavor::VIRTUAL_LOG_N, target_sum);
    const auto sumcheck_result = sumcheck.verify({}, {});

    VerifierClaim verifier_claim = compute_new_claim(sumcheck_result, claims, slot_scalars);
    bool eq_consistent = check_eq_consistency(sumcheck_result, claims);
    bool verified = sumcheck_result.verified && eq_consistent;

    return { verified, verifier_claim };
}

// Explicit instantiations for each per-kernel batching width (2 .. CHONK_MAX_CLAIMS_PER_KERNEL), native and recursive.
template class MultilinearBatchingVerifierInternal<MultilinearBatchingFlavor_<2>>;
template class MultilinearBatchingVerifierInternal<MultilinearBatchingFlavor_<3>>;
template class MultilinearBatchingVerifierInternal<MultilinearBatchingFlavor_<4>>;
template class MultilinearBatchingVerifierInternal<MultilinearBatchingFlavor_<5>>;
template class MultilinearBatchingVerifierInternal<MultilinearBatchingRecursiveFlavor_<2>>;
template class MultilinearBatchingVerifierInternal<MultilinearBatchingRecursiveFlavor_<3>>;
template class MultilinearBatchingVerifierInternal<MultilinearBatchingRecursiveFlavor_<4>>;
template class MultilinearBatchingVerifierInternal<MultilinearBatchingRecursiveFlavor_<5>>;
static_assert(CHONK_MAX_CLAIMS_PER_KERNEL == 5,
              "Per-kernel batching verifier instantiations must cover every width up to CHONK_MAX_CLAIMS_PER_KERNEL");

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
    switch (claims.size()) {
    case 2:
        return verify_with_width<2>(claims);
    case 3:
        return verify_with_width<3>(claims);
    case 4:
        return verify_with_width<4>(claims);
    case 5:
        return verify_with_width<5>(claims);
    }
    static_assert(CHONK_MAX_CLAIMS_PER_KERNEL == 5,
                  "Per-kernel batching width dispatch must cover every width up to CHONK_MAX_CLAIMS_PER_KERNEL");
    throw_or_abort("MultilinearBatchingVerifier: unsupported batch width");
    return { false, VerifierClaim{} };
}

template class MultilinearBatchingVerifier<false>;
template class MultilinearBatchingVerifier<true>;

} // namespace bb
