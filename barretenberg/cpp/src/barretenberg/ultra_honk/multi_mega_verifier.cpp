// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/multi_mega_verifier.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/multi_mega_oink_verifier.hpp"

namespace bb {

size_t MultiMegaVerifier::compute_log_n() const
{
    if constexpr (Flavor::USE_PADDING) {
        return static_cast<size_t>(Flavor::VIRTUAL_LOG_N);
    } else {
        return static_cast<size_t>(verifier_instance->get_vk()->log_circuit_size);
    }
}

std::vector<typename MultiMegaVerifier::FF> MultiMegaVerifier::compute_padding_indicator_array(size_t log_n)
{
    // Non-ZK flavor: all 1s (no masking needed)
    std::vector<FF> padding_indicator_array(log_n, FF{ 1 });
    return padding_indicator_array;
}

/**
 * @brief Compute Lagrange basis evaluations for interleaving.
 * @details For batch_size=4 (k=2), computes:
 *   L₀(u₀,u₁) = (1-u₀)(1-u₁)
 *   L₁(u₀,u₁) = u₀(1-u₁)
 *   L₂(u₀,u₁) = (1-u₀)u₁
 *   L₃(u₀,u₁) = u₀·u₁
 */
std::array<typename MultiMegaVerifier::FF, 4> MultiMegaVerifier::compute_lagrange_basis(const FF& u0, const FF& u1)
{
    FF one_minus_u0 = FF::one() - u0;
    FF one_minus_u1 = FF::one() - u1;

    return { one_minus_u0 * one_minus_u1, // L₀
             u0 * one_minus_u1,           // L₁
             one_minus_u0 * u1,           // L₂
             u0 * u1 };                   // L₃
}

/**
 * @brief Combine individual polynomial evaluations into batched evaluation using Lagrange basis.
 * @details For interleaved polynomial F(X) = Σⱼ fⱼ(X^4) · X^j, the evaluation at u = (u₀, u₁, u₂, ..., u_{d+1})
 *          is F(u) = Σⱼ fⱼ(u₂,...,u_{d+1}) · Lⱼ(u₀,u₁)
 */
typename MultiMegaVerifier::FF MultiMegaVerifier::compute_batched_evaluation(const std::array<FF, 4>& lagrange_basis,
                                                                             const std::array<FF, 4>& individual_evals)
{
    FF result = FF::zero();
    for (size_t j = 0; j < 4; ++j) {
        result += individual_evals[j] * lagrange_basis[j];
    }
    return result;
}

MultiMegaVerifier::ReductionResult MultiMegaVerifier::reduce_to_pairing_check(const Proof& proof)
{
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;

    transcript->load_proof(proof);

    // Compute log_n first (needed for proof layout calculation)
    // Note: For interleaved polynomials, log_n includes the extra k=2 variables
    const size_t log_n = compute_log_n();

    // Derive num_public_inputs from proof size
    const size_t num_public_inputs = ProofLength::Honk<Flavor>::derive_num_public_inputs(proof.size(), log_n);

    // Use MultiMegaOinkVerifier to receive interleaved commitments only
    MultiMegaOinkVerifier oink_verifier{ verifier_instance, transcript, num_public_inputs };
    oink_verifier.verify();

    // Compute padding indicator array for sumcheck (size = log_n)
    auto sumcheck_padding_indicator_array = compute_padding_indicator_array(log_n);
    verifier_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);

    // Construct the sumcheck verifier
    // Sumcheck still operates on the original polynomial evaluations
    SumcheckVerifier<Flavor> sumcheck(transcript, verifier_instance->alpha, log_n);

    // Run the sumcheck verifier (no ZK, so no Libra)
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    SumcheckOutput<Flavor> sumcheck_output = sumcheck.verify(
        verifier_instance->relation_parameters, verifier_instance->gate_challenges, sumcheck_padding_indicator_array);

    // Get interleaving challenges (must match prover order)
    FF u0 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");

    // Compute Lagrange basis from the interleaving challenges
    auto lagrange_basis = compute_lagrange_basis(u0, u1);

    // Build the full challenge vector: prepend interleaving challenges to sumcheck challenges
    std::vector<FF> full_challenge;
    full_challenge.reserve(Flavor::INTERLEAVING_LOG_K + sumcheck_output.challenge.size());
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    // PCS padding indicator array must match full_challenge size (= log_n + INTERLEAVING_LOG_K)
    const size_t pcs_log_n = full_challenge.size();
    std::vector<FF> pcs_padding_indicator_array(pcs_log_n, FF{ 1 });

    auto& interleaved = verifier_instance->interleaved_commitments;
    auto& evals = sumcheck_output.claimed_evaluations;
    auto vk = verifier_instance->get_vk();

    constexpr size_t NUM_UNSHIFTED = Flavor::NUM_ALL_INTERLEAVED_COMMITMENTS;     // 17
    constexpr size_t NUM_SHIFTED = Flavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS; // 3
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    // Helper: dereference a pointer group into an eval array (nullptr → zero)
    auto deref_group = [](const auto& group) {
        std::array<FF, BATCH_SIZE> vals{};
        for (size_t j = 0; j < BATCH_SIZE; j++) {
            vals[j] = (j < group.size() && group[j]) ? *group[j] : FF::zero();
        }
        return vals;
    };

    // Commitments: P₁-P₈ (from VK) + W₁-W₉ (from transcript)
    auto unshifted_comms = concatenate(vk->get_all(), interleaved.get_all());
    auto shifted_comms = interleaved.get_shiftable();

    // Evaluations: reconstruct batched evals from individual evals via Lagrange basis
    auto unshifted_eval_groups = Flavor::get_unshifted_groups(evals);
    std::array<FF, NUM_UNSHIFTED> unshifted_evals;
    for (size_t i = 0; i < NUM_UNSHIFTED; i++) {
        unshifted_evals[i] = compute_batched_evaluation(lagrange_basis, deref_group(unshifted_eval_groups[i]));
    }

    auto shifted_eval_groups = Flavor::get_shifted_groups(evals);
    std::array<FF, NUM_SHIFTED> shifted_evals;
    for (size_t i = 0; i < NUM_SHIFTED; i++) {
        shifted_evals[i] = compute_batched_evaluation(lagrange_basis, deref_group(shifted_eval_groups[i]));
    }

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{ .unshifted =
                                    ClaimBatch{ unshifted_comms, RefArray<FF, NUM_UNSHIFTED>(unshifted_evals) },
                                .shifted = ClaimBatch{ shifted_comms, RefArray<FF, NUM_SHIFTED>(shifted_evals) },
                                .shift_exponent = BATCH_SIZE };

    const Commitment one_commitment = Commitment::one();

    auto shplemini_output = Shplemini::compute_batch_opening_claim(pcs_padding_indicator_array,
                                                                   claim_batcher,
                                                                   full_challenge,
                                                                   one_commitment,
                                                                   transcript,
                                                                   Flavor::REPEATED_COMMITMENTS,
                                                                   libra_commitments,
                                                                   sumcheck_output.claimed_libra_evaluation);
    // Build reduction result
    ReductionResult result;
    result.pairing_points = PCS::reduce_verify_batch_opening_claim(
        std::move(shplemini_output.batch_opening_claim), transcript, Flavor::FINAL_PCS_MSM_SIZE(log_n));

    vinfo("MultiMegaVerifier sumcheck_verified: ", sumcheck_output.verified ? "true" : "false");
    result.reduction_succeeded = sumcheck_output.verified;

    return result;
}

MultiMegaVerifier::Output MultiMegaVerifier::verify_proof(const Proof& proof)
{
    // Reduce to pairing check
    auto [pcs_pairing_points, reduction_succeeded] = reduce_to_pairing_check(proof);
    vinfo("MultiMegaVerifier: reduced to pairing check: ", reduction_succeeded ? "true" : "false");

    if (!reduction_succeeded) {
        vinfo("MultiMegaVerifier: verification failed at reduction step");
        return Output{};
    }

    // Process public inputs
    DefaultIO inputs;
    inputs.reconstruct_from_public(verifier_instance->public_inputs);

    // Aggregate pairing points
    PairingPoints pi_pairing_points = inputs.pairing_inputs;
    pi_pairing_points.aggregate(pcs_pairing_points);

    // Perform pairing check
    bool pairing_verified = pi_pairing_points.check();
    vinfo("MultiMegaVerifier: pairing check: ", pairing_verified ? "true" : "false");

    if (!pairing_verified) {
        vinfo("MultiMegaVerifier: verification failed at pairing check");
        return Output{};
    }

    Output output;
    output.result = true;
    return output;
}

} // namespace bb
