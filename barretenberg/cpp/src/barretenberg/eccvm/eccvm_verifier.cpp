// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./eccvm_verifier.hpp"
#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb {

/**
 * @brief Verifies an ECCVM Honk proof for given program settings.
 * @details Works for both native verification and recursive (in-circuit) verification.
 */
template <typename Flavor>
typename ECCVMVerifier_<Flavor>::ReductionResult ECCVMVerifier_<Flavor>::reduce_to_triple_ipa_claim()
{
    BB_BENCH_NAME("ECCVMVerifier::reduce");
    RelationParameters<FF> relation_parameters;
    univariate_opening_claims.clear();

    // Load proof into transcript
    transcript->load_proof(proof);

    // Fiat-Shamir the vk hash (computed in constructor)
    transcript->add_to_hash_buffer("vk_hash", vk_hash);
    vinfo("ECCVM vk hash: ", vk_hash);

    VerifierCommitments commitments{ key };
    CommitmentLabels commitment_labels;

    // Receive Gemini masking polynomial commitment (for ZK-PCS)
    commitments.gemini_masking_poly = transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitment_labels.get_wires())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    // Get challenge for sorted list batching and wire four memory records
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });

    auto beta_sqr = beta * beta;
    auto beta_quartic = beta_sqr * beta_sqr;
    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;
    relation_parameters.beta_sqr = beta_sqr;
    relation_parameters.beta_cube = beta_sqr * beta;
    relation_parameters.beta_quartic = beta_quartic;
    auto first_term_tag = beta_quartic; // FIRST_TERM_TAG (= 1) * beta_quartic
    relation_parameters.eccvm_set_permutation_delta = (gamma + first_term_tag) * (gamma + beta_sqr + first_term_tag) *
                                                      (gamma + beta_sqr + beta_sqr + first_term_tag) *
                                                      (gamma + beta_sqr + beta_sqr + beta_sqr + first_term_tag);
    relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();

    // Get commitment to permutation and lookup grand products
    commitments.lookup_inverses =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_inverses);
    commitments.z_perm = transcript->template receive_from_prover<Commitment>(commitment_labels.z_perm);

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Execute Sumcheck Verifier
    SumcheckVerifier<Flavor> sumcheck(transcript, alpha, CONST_ECCVM_LOG_N);

    std::vector<FF> gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", CONST_ECCVM_LOG_N);

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS> libra_commitments = {};

    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    auto sumcheck_output = sumcheck.verify(relation_parameters, gate_challenges);

    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    const bool consistency_checked = append_libra_opening_claims(
        libra_commitments, sumcheck_output.challenge, sumcheck_output.claimed_libra_evaluation);

    std::vector<Commitment> translation_commitments = { commitments.transcript_op,
                                                        commitments.transcript_Px,
                                                        commitments.transcript_Py,
                                                        commitments.transcript_z1,
                                                        commitments.transcript_z2 };

    // Collect every univariate opening claim in transcript order; a single Shplonk reduction turns them into the
    // univariate input to the TripleIPA.
    append_translation_opening_claims(translation_commitments);
    append_sumcheck_round_opening_claims(sumcheck_output.round_univariate_commitments,
                                         sumcheck_output.round_univariate_evaluations,
                                         sumcheck_output.challenge);
    append_pow_masking_opening_claim();

    const OpeningClaim<Curve> univariate_opening_claim = reduce_univariate_opening_claims();
    ReductionResult result{ .triple_ipa_claim =
                                compute_triple_ipa_claim(commitments, sumcheck_output, univariate_opening_claim) };

    bool sumcheck_verified = sumcheck_output.verified;
    vinfo("ECCVM Verifier: sumcheck verified: ", sumcheck_verified);
    vinfo("ECCVM Verifier: consistency checked: ", consistency_checked);
    vinfo("ECCVM Verifier: translation masking consistency checked: ", translation_masking_consistency_checked);

    compute_accumulated_result();
    result.reduction_succeeded = sumcheck_verified && consistency_checked && translation_masking_consistency_checked;
    return result;
}

template <typename Flavor>
bool ECCVMVerifier_<Flavor>::append_libra_opening_claims(
    const std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS>& libra_commitments,
    const std::vector<FF>& multilinear_challenge,
    const FF& claimed_libra_evaluation)
{
    const FF libra_evaluation_challenge =
        transcript->template get_challenge<FF>("Libra:small_ipa_evaluation_challenge");
    const auto libra_opening_claims = make_small_ipa_verifier_opening_claims<Curve>(
        libra_commitments, libra_evaluation_challenge, "Libra:", transcript);

    std::array<FF, NUM_SMALL_IPA_OPENING_CLAIMS> libra_evaluations;
    for (size_t idx = 0; idx < NUM_SMALL_IPA_OPENING_CLAIMS; ++idx) {
        libra_evaluations[idx] = libra_opening_claims[idx].opening_pair.evaluation;
    }

    univariate_opening_claims.insert(
        univariate_opening_claims.end(), libra_opening_claims.begin(), libra_opening_claims.end());

    return SmallSubgroupIPAVerifier<Curve>::check_libra_evaluations_consistency(
        libra_evaluations, libra_evaluation_challenge, multilinear_challenge, claimed_libra_evaluation);
}

/**
 * @brief To link the ECCVM Transcript wires `op`, `Px`, `Py`, `z1`, and `z2` to the accumulator computed by the
 * translator, we verify their evaluations as univariates. For efficiency reasons, we batch these evaluations.
 *
 * @details For details, see the docs of \ref ECCVMProver::append_translation_opening_claims() method.
 *
 * @param translation_commitments Commitments to  `op`, `Px`, `Py`, `z1`, and `z2`
 * @return The translation univariate opening claims.
 */
template <typename Flavor>
void ECCVMVerifier_<Flavor>::append_translation_opening_claims(const std::vector<Commitment>& translation_commitments)
{
    // Used to capture the batched evaluation of unmasked `translation_polynomials` while preserving ZK
    using SmallIPA = SmallSubgroupIPAVerifier<Curve>;

    // Initialize SmallSubgroupIPA structures
    SmallSubgroupIPACommitments<Commitment> small_ipa_commitments;

    // Get a commitment to M + Z_H * R, where M is a concatenation of the masking terms of
    // `translation_polynomials`, Z_H = X^{|H|} - 1, and R is a random degree 2 polynomial
    small_ipa_commitments.concatenated =
        transcript->template receive_from_prover<Commitment>("Translation:concatenated_masking_term_commitment");

    // Get a challenge to evaluate `translation_polynomials` as univariates
    evaluation_challenge_x = transcript->template get_challenge<FF>("Translation:evaluation_challenge_x");

    // Populate the translation evaluations  {`op(x)`, `Px(x)`, `Py(x)`, `z1(x)`, `z2(x)`} to be batched
    for (auto [eval, label] : zip_view(translation_evaluations.get_all(), translation_evaluations.labels)) {
        eval = transcript->template receive_from_prover<FF>(label);
    }

    // Get the batching challenge for commitments and evaluations
    batching_challenge_v = transcript->template get_challenge<FF>("Translation:batching_challenge_v");

    // Get the value ∑ mᵢ(x) ⋅ vⁱ
    translation_masking_term_eval = transcript->template receive_from_prover<FF>("Translation:masking_term_eval");

    // Receive commitments to the SmallSubgroupIPA witnesses that are computed once x and v are available
    small_ipa_commitments.grand_sum =
        transcript->template receive_from_prover<Commitment>("Translation:grand_sum_commitment");
    small_ipa_commitments.quotient =
        transcript->template receive_from_prover<Commitment>("Translation:quotient_commitment");

    // Get a challenge for the evaluations of the concatenated masking term G, grand sum A, its shift, and grand sum
    // identity quotient Q
    const FF small_ipa_evaluation_challenge =
        transcript->template get_challenge<FF>("Translation:small_ipa_evaluation_challenge");

    // Build the five SmallSubgroupIPA verifier opening claims via the shared helper. The boundary slot pins A(1) = 0;
    // soundness comes from the Shplonk batched opening rejecting any committed [A] that does not evaluate to 0 there.
    const auto small_ipa_claims = make_small_ipa_verifier_opening_claims<Curve>(
        small_ipa_commitments.as_array(), small_ipa_evaluation_challenge, "Translation:", transcript);

    std::array<OpeningClaim<Curve>, ECCVMFlavor::NUM_TRANSLATION_OPENING_CLAIMS> translation_claims;
    std::ranges::copy(small_ipa_claims, translation_claims.begin());
    std::array<FF, NUM_SMALL_IPA_OPENING_CLAIMS> small_ipa_evaluations;
    for (size_t idx = 0; idx < NUM_SMALL_IPA_OPENING_CLAIMS; idx++) {
        small_ipa_evaluations[idx] = small_ipa_claims[idx].opening_pair.evaluation;
    }

    // Check Grand Sum Identity at r

    translation_masking_consistency_checked =
        SmallIPA::check_eccvm_evaluations_consistency(small_ipa_evaluations,
                                                      small_ipa_evaluation_challenge,
                                                      evaluation_challenge_x,
                                                      batching_challenge_v,
                                                      translation_masking_term_eval);

    // Compute the batched commitment and batched evaluation for the univariate opening claim
    const std::vector<FF> batching_challenges = batching_scalars(batching_challenge_v, NUM_TRANSLATION_EVALUATIONS);
    std::vector<FF> translation_evaluation_values;
    translation_evaluation_values.reserve(NUM_TRANSLATION_EVALUATIONS);
    for (const auto& eval : translation_evaluations.get_all()) {
        translation_evaluation_values.emplace_back(eval);
    }
    const FF batched_translation_evaluation = batch_evaluations<Curve>(
        std::span<const FF>(translation_evaluation_values), std::span<const FF>(batching_challenges));
    const Commitment batched_commitment = batch_commitments<Curve>(std::span<const Commitment>(translation_commitments),
                                                                   std::span<const FF>(batching_challenges));

    // Place the batched translation univariate claim after the SmallSubgroupIPA opening claims.
    translation_claims[NUM_SMALL_IPA_OPENING_CLAIMS] = { { evaluation_challenge_x, batched_translation_evaluation },
                                                         batched_commitment };
    univariate_opening_claims.insert(
        univariate_opening_claims.end(), translation_claims.begin(), translation_claims.end());
}

template <typename Flavor> void ECCVMVerifier_<Flavor>::append_pow_masking_opening_claim()
{
    const Commitment pow_mask_commitment =
        transcript->template receive_from_prover<Commitment>("TripleIPA:pow_mask_commitment");
    const FF pow_mask_challenge = transcript->template get_challenge<FF>("TripleIPA:pow_mask_challenge");
    const FF pow_mask_evaluation = transcript->template receive_from_prover<FF>("TripleIPA:pow_mask_evaluation");
    univariate_opening_claims.push_back({ { pow_mask_challenge, pow_mask_evaluation }, pow_mask_commitment });
}

template <typename Flavor>
OpeningClaim<typename Flavor::Curve> ECCVMVerifier_<Flavor>::reduce_univariate_opening_claims()
{
    using Shplonk = ShplonkVerifier_<Curve>;
    return Shplonk::reduce_verification(pcs_g1_identity, univariate_opening_claims, transcript);
}

template <typename Flavor>
typename ECCVMVerifier_<Flavor>::TripleIpaClaim ECCVMVerifier_<Flavor>::compute_triple_ipa_claim(
    VerifierCommitments& commitments,
    SumcheckOutput<Flavor>& sumcheck_output,
    const OpeningClaim<Curve>& univariate_opening_claim)
{
    const FF rho = transcript->template get_challenge<FF>("TripleIPA:rho");
    const auto triple_ipa_data =
        TripleIPA::TripleIpaClaimData::create(commitments.get_unshifted(),
                                              sumcheck_output.claimed_evaluations.get_unshifted(),
                                              commitments.get_to_be_shifted(),
                                              sumcheck_output.claimed_evaluations.get_to_be_shifted(),
                                              sumcheck_output.claimed_evaluations.get_shifted(),
                                              sumcheck_output.challenge,
                                              rho,
                                              univariate_opening_claim);
    return triple_ipa_data.batch();
}

// Compute the accumulated result from translation evaluations
// This is the value that Translator will use in its relations
// Formula: accumulated_result = (op + v*Px + v²*Py + v³*z1 + v⁴*z2 - masking_term) / x^5
// Translation poly data starts at coefficient TRACE_OFFSET,
// introducing an x^TRACE_OFFSET factor. The division by x^(1+TRACE_OFFSET) accounts for both the
// shiftable offset (x) and the trace offset.
template <typename Flavor> void ECCVMVerifier_<Flavor>::compute_accumulated_result()
{
    FF v = batching_challenge_v;
    FF v_squared = v * v;
    FF v_cubed = v_squared * v;
    FF v_fourth = v_cubed * v;

    // OriginTag false positive: translation_masking_term_eval is bound by the masking term
    // commitments (fixed before batching_challenge_v) and batching_challenge_v itself.
    if constexpr (IsRecursive) {
        translation_masking_term_eval.set_origin_tag(batching_challenge_v.get_origin_tag());
    }

    FF batched_eval_minus_masking = translation_evaluations.op + v * translation_evaluations.Px +
                                    v_squared * translation_evaluations.Py + v_cubed * translation_evaluations.z1 +
                                    v_fourth * translation_evaluations.z2 - translation_masking_term_eval;

    // x^(1 + TRACE_OFFSET) accounts for the shiftable offset (x) and trace data offset (x^TRACE_OFFSET)
    FF x_power = evaluation_challenge_x;
    for (size_t i = 0; i < Flavor::TRACE_OFFSET; i++) {
        x_power *= evaluation_challenge_x;
    }
    accumulated_result = batched_eval_minus_masking / x_power;
}

template <typename Flavor>
void ECCVMVerifier_<Flavor>::append_sumcheck_round_opening_claims(
    const std::vector<Commitment>& sumcheck_round_commitments,
    const std::vector<std::array<FF, 3>>& sumcheck_round_evaluations,
    const std::vector<FF>& multilinear_challenge)
{
    static constexpr size_t NUM_COMMITTED_SUMCHECK_CLAIMS_PER_ROUND = 3;
    univariate_opening_claims.reserve(univariate_opening_claims.size() +
                                      multilinear_challenge.size() * NUM_COMMITTED_SUMCHECK_CLAIMS_PER_ROUND);

    for (size_t idx = 0; idx < multilinear_challenge.size(); ++idx) {
        const std::array<FF, NUM_COMMITTED_SUMCHECK_CLAIMS_PER_ROUND> evaluation_points{ FF(0),
                                                                                         FF(1),
                                                                                         multilinear_challenge[idx] };
        for (size_t eval_idx = 0; eval_idx < NUM_COMMITTED_SUMCHECK_CLAIMS_PER_ROUND; ++eval_idx) {
            univariate_opening_claims.push_back(
                { { evaluation_points[eval_idx], sumcheck_round_evaluations[idx][eval_idx] },
                  sumcheck_round_commitments[idx] });
        }
    }
}

// Explicit template instantiations
template class ECCVMVerifier_<ECCVMFlavor>;
template class ECCVMVerifier_<ECCVMRecursiveFlavor>;

} // namespace bb
