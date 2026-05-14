// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <algorithm>
#include <array>
#include <memory>
#include <string>
#include <string_view>

namespace bb {

/**
 * @brief Recipe for the evaluation point of a single SmallSubgroupIPA opening claim.
 *
 * The verifier samples a single challenge `r`; each claim picks one of three points derivable from `r` and the
 * subgroup generator `g`.
 */
enum class SmallIpaEvalPoint : uint8_t {
    Challenge,        // r
    ChallengeShifted, // g * r
    One,              // 1 (used for the A(1) = 0 boundary opening)
};

/**
 * @brief Static specification of one SmallSubgroupIPA opening claim.
 *
 * - `commitment_index` selects which of the three commitments [G], [A], [Q] backs this claim.
 * - `eval_point`       is the recipe for the evaluation point.
 * - `transmitted`      is false for fixed boundary openings (value hardcoded to 0, not in the transcript).
 * - `label_suffix`     is the wire-label suffix; the prefix ("Libra:" or "Translation:") is supplied at the call site.
 */
struct SmallIpaClaim {
    size_t commitment_index;
    SmallIpaEvalPoint eval_point;
    bool transmitted;
    std::string_view label_suffix;
};

/**
 * @brief The five SmallSubgroupIPA opening claims, in transcript order.
 *
 * Layout:
 *   index 0: G(r)        — [G]
 *   index 1: A(g*r)      — [A]
 *   index 2: A(r)        — [A]
 *   index 3: A(1) = 0    — [A], boundary opening (not transmitted)
 *   index 4: Q(r)        — [Q]
 */
inline constexpr auto SMALL_IPA_CLAIMS = std::to_array<SmallIpaClaim>({
    { 0, SmallIpaEvalPoint::Challenge, true, "concatenation_eval" },
    { 1, SmallIpaEvalPoint::ChallengeShifted, true, "shifted_grand_sum_eval" },
    { 1, SmallIpaEvalPoint::Challenge, true, "grand_sum_eval" },
    { 1, SmallIpaEvalPoint::One, false, "grand_sum_at_one_eval" },
    { 2, SmallIpaEvalPoint::Challenge, true, "quotient_eval" },
});

// Total number of opening claims
inline constexpr size_t NUM_SMALL_IPA_OPENING_CLAIMS = SMALL_IPA_CLAIMS.size();

// Number of small-IPA scalar evaluations transmitted on the wire (boundary openings excluded.
inline constexpr size_t NUM_SMALL_IPA_TRANSCRIPT_EVALS = [] {
    size_t n = 0;
    for (const auto& c : SMALL_IPA_CLAIMS) {
        if (c.transmitted) {
            ++n;
        }
    }
    return n;
}();

// Number of underlying SmallSubgroupIPA commitments (max commitment_index + 1).
inline constexpr size_t NUM_SMALL_IPA_COMMITMENTS = [] {
    size_t m = 0;
    for (const auto& c : SMALL_IPA_CLAIMS) {
        m = std::max(c.commitment_index + 1, m);
    }
    return m;
}();

/**
 * @brief Compute the evaluation points {r, g*r, r, 1, r} for the five opening claims by walking SMALL_IPA_CLAIMS.
 */
template <typename FF>
inline std::array<FF, NUM_SMALL_IPA_OPENING_CLAIMS> compute_evaluation_points(const FF& challenge,
                                                                              const FF& subgroup_generator)
{
    std::array<FF, NUM_SMALL_IPA_OPENING_CLAIMS> result;
    for (size_t i = 0; i < NUM_SMALL_IPA_OPENING_CLAIMS; ++i) {
        switch (SMALL_IPA_CLAIMS[i].eval_point) {
        case SmallIpaEvalPoint::Challenge:
            result[i] = challenge;
            break;
        case SmallIpaEvalPoint::ChallengeShifted:
            result[i] = challenge * subgroup_generator;
            break;
        case SmallIpaEvalPoint::One:
            result[i] = FF(1);
            break;
        }
    }
    return result;
}

/**
 * @brief Compute Shplonk denominators 1 / (z - x_i), where x_i are the SmallSubgroupIPA opening points.
 */
template <typename Curve>
inline std::array<typename Curve::ScalarField, NUM_SMALL_IPA_OPENING_CLAIMS> compute_shplonk_denominators_for_small_ipa(
    const typename Curve::ScalarField& shplonk_evaluation_challenge,
    const typename Curve::ScalarField& small_ipa_evaluation_challenge)
{
    using FF = typename Curve::ScalarField;
    const FF inv_z_minus_challenge = FF(1) / (shplonk_evaluation_challenge - small_ipa_evaluation_challenge);
    const FF inv_z_minus_shifted =
        FF(1) / (shplonk_evaluation_challenge - FF(Curve::subgroup_generator) * small_ipa_evaluation_challenge);
    const FF inv_z_minus_one = FF(1) / (shplonk_evaluation_challenge - FF(1));

    std::array<FF, NUM_SMALL_IPA_OPENING_CLAIMS> result;
    for (size_t i = 0; i < NUM_SMALL_IPA_OPENING_CLAIMS; ++i) {
        switch (SMALL_IPA_CLAIMS[i].eval_point) {
        case SmallIpaEvalPoint::Challenge:
            result[i] = inv_z_minus_challenge;
            break;
        case SmallIpaEvalPoint::ChallengeShifted:
            result[i] = inv_z_minus_shifted;
            break;
        case SmallIpaEvalPoint::One:
            result[i] = inv_z_minus_one;
            break;
        }
    }
    return result;
}

/**
 * @brief Build the wire labels {prefix + suffix} for the five opening claims. `prefix` is "Libra:" or "Translation:".
 */
inline std::array<std::string, NUM_SMALL_IPA_OPENING_CLAIMS> get_evaluation_labels(std::string_view prefix)
{
    std::array<std::string, NUM_SMALL_IPA_OPENING_CLAIMS> result;
    for (size_t i = 0; i < NUM_SMALL_IPA_OPENING_CLAIMS; ++i) {
        result[i] = std::string(prefix) + std::string(SMALL_IPA_CLAIMS[i].label_suffix);
    }
    return result;
}

/**
 * @brief Holds commitments to [G], [A], [Q]. Code that needs a per-claim commitment must index `as_array()` via
 * `SMALL_IPA_CLAIMS[i].commitment_index`.
 */
template <typename Commitment> struct SmallSubgroupIPACommitments {
    Commitment concatenated, grand_sum, quotient;
    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> as_array() const { return { concatenated, grand_sum, quotient }; }
};

/**
 * @brief Build the five SmallSubgroupIPA prover opening claims.
 *
 * Walks SMALL_IPA_CLAIMS to evaluate each polynomial at its assigned point, sends transmitted evaluations to the
 * transcript under the protocol-prefixed label, and fills boundary slots with 0.
 */
template <typename Curve, typename Transcript>
std::array<ProverOpeningClaim<Curve>, NUM_SMALL_IPA_OPENING_CLAIMS> make_small_ipa_prover_opening_claims(
    const std::array<bb::Polynomial<typename Curve::ScalarField>, NUM_SMALL_IPA_COMMITMENTS>& polynomials,
    const typename Curve::ScalarField& challenge,
    std::string_view label_prefix,
    const std::shared_ptr<Transcript>& transcript)
{
    using FF = typename Curve::ScalarField;
    const auto labels = get_evaluation_labels(label_prefix);
    const auto points = compute_evaluation_points(challenge, FF(Curve::subgroup_generator));

    std::array<ProverOpeningClaim<Curve>, NUM_SMALL_IPA_OPENING_CLAIMS> claims;
    for (size_t i = 0; i < NUM_SMALL_IPA_OPENING_CLAIMS; ++i) {
        const auto& poly = polynomials[SMALL_IPA_CLAIMS[i].commitment_index];
        FF evaluation = FF(0);
        if (SMALL_IPA_CLAIMS[i].transmitted) {
            evaluation = poly.evaluate(points[i]);
            transcript->send_to_verifier(labels[i], evaluation);
        }
        claims[i] = { poly, { points[i], evaluation } };
    }
    return claims;
}

/**
 * @brief Receive the five SmallSubgroupIPA evaluations on the verifier side.
 *
 * Reads transmitted slots from the transcript under the protocol-prefixed label; boundary slots come back as 0.
 *
 * For stdlib (recursive verifier) curves, the evaluations' round provenance is cleared here. This is sound because
 * the evaluations are PCS-bound: the Shplonk batched opening verifies that they are consistent with the committed
 * polynomials, so the algebraic identity that mixes them without absorbing a fresh challenge does not introduce a
 * Fiat-Shamir vulnerability.
 */
template <typename Curve, typename Transcript>
std::array<typename Curve::ScalarField, NUM_SMALL_IPA_OPENING_CLAIMS> receive_small_ipa_evaluations(
    std::string_view label_prefix, const std::shared_ptr<Transcript>& transcript)
{
    using FF = typename Curve::ScalarField;
    const auto labels = get_evaluation_labels(label_prefix);
    std::array<FF, NUM_SMALL_IPA_OPENING_CLAIMS> evaluations{};
    for (size_t i = 0; i < NUM_SMALL_IPA_OPENING_CLAIMS; ++i) {
        if (SMALL_IPA_CLAIMS[i].transmitted) {
            evaluations[i] = transcript->template receive_from_prover<FF>(labels[i]);
        }
    }
    if constexpr (Curve::is_stdlib_type) {
        for (auto& eval : evaluations) {
            eval.clear_round_provenance();
        }
    }
    return evaluations;
}

/**
 * @brief Build the five SmallSubgroupIPA verifier opening claims, pairing each evaluation with the commitment selected
 * by `SMALL_IPA_CLAIMS[i].commitment_index`.
 */
template <typename Curve, typename Transcript>
std::array<OpeningClaim<Curve>, NUM_SMALL_IPA_OPENING_CLAIMS> make_small_ipa_verifier_opening_claims(
    const std::array<typename Curve::AffineElement, NUM_SMALL_IPA_COMMITMENTS>& commitments,
    const typename Curve::ScalarField& challenge,
    std::string_view label_prefix,
    const std::shared_ptr<Transcript>& transcript)
{
    using FF = typename Curve::ScalarField;
    const auto evaluations = receive_small_ipa_evaluations<Curve>(label_prefix, transcript);
    const auto points = compute_evaluation_points(challenge, FF(Curve::subgroup_generator));

    std::array<OpeningClaim<Curve>, NUM_SMALL_IPA_OPENING_CLAIMS> claims;
    for (size_t i = 0; i < NUM_SMALL_IPA_OPENING_CLAIMS; ++i) {
        claims[i] = { { points[i], evaluations[i] }, commitments[SMALL_IPA_CLAIMS[i].commitment_index] };
    }
    return claims;
}
} // namespace bb
