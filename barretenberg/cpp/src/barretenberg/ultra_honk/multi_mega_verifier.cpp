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

    // Get interleaved commitments
    const auto& interleaved = verifier_instance->interleaved_commitments;
    const auto& evals = sumcheck_output.claimed_evaluations;
    auto vk = verifier_instance->get_vk();

    // Build batched evaluations for each interleaved commitment using Lagrange basis.
    // For interleaved polynomial F(X) = Σⱼ fⱼ(X^4)·X^j, evaluation at u is Σⱼ fⱼ(u₂,...) · Lⱼ(u₀,u₁).

    constexpr size_t NUM_UNSHIFTED = Flavor::NUM_ALL_INTERLEAVED_COMMITMENTS;     // 17
    constexpr size_t NUM_SHIFTED = Flavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS; // 3

    // All 17 unshifted commitments: P₁-P₈ (precomputed) + W₁-W₉ (witness)
    std::array<Commitment, NUM_UNSHIFTED> unshifted_comms = { // P₁-P₈: precomputed interleaved commitments from VK
                                                              vk->interleaved_precomputed_0,
                                                              vk->interleaved_precomputed_1,
                                                              vk->interleaved_precomputed_2,
                                                              vk->interleaved_precomputed_3,
                                                              vk->interleaved_precomputed_4,
                                                              vk->interleaved_precomputed_5,
                                                              vk->interleaved_precomputed_6,
                                                              vk->interleaved_precomputed_7,
                                                              // W₁-W₉: witness interleaved commitments
                                                              interleaved.interleaved_wires,
                                                              interleaved.interleaved_ecc_op_wires,
                                                              interleaved.interleaved_databus_1,
                                                              interleaved.interleaved_databus_2,
                                                              interleaved.interleaved_databus_3,
                                                              interleaved.interleaved_w_4,
                                                              interleaved.interleaved_lookup,
                                                              interleaved.interleaved_inverses,
                                                              interleaved.interleaved_z_perm
    };

    // DEBUG: print first and W₁ evaluations
    info("VERIFIER eval_P0=",
         compute_batched_evaluation(lagrange_basis, { evals.q_m, evals.q_c, evals.q_l, evals.q_r }));
    info("VERIFIER eval_W1=",
         compute_batched_evaluation(lagrange_basis, { evals.w_l, evals.w_r, evals.w_o, FF::zero() }));
    info("VERIFIER eval_W1_shift=",
         compute_batched_evaluation(lagrange_basis, { evals.w_l_shift, evals.w_r_shift, evals.w_o_shift, FF::zero() }));

    std::array<FF, NUM_UNSHIFTED> unshifted_evals = {
        // P₁-P₈: precomputed batched evaluations
        compute_batched_evaluation(lagrange_basis, { evals.q_m, evals.q_c, evals.q_l, evals.q_r }),
        compute_batched_evaluation(lagrange_basis, { evals.q_o, evals.q_4, evals.q_busread, evals.q_lookup }),
        compute_batched_evaluation(lagrange_basis,
                                   { evals.q_arith, evals.q_delta_range, evals.q_elliptic, evals.q_memory }),
        compute_batched_evaluation(
            lagrange_basis, { evals.q_nnf, evals.q_poseidon2_external, evals.q_poseidon2_internal, evals.sigma_1 }),
        compute_batched_evaluation(lagrange_basis, { evals.sigma_2, evals.sigma_3, evals.sigma_4, evals.id_1 }),
        compute_batched_evaluation(lagrange_basis, { evals.id_2, evals.id_3, evals.id_4, evals.table_1 }),
        compute_batched_evaluation(lagrange_basis,
                                   { evals.table_2, evals.table_3, evals.table_4, evals.lagrange_first }),
        compute_batched_evaluation(lagrange_basis,
                                   { evals.lagrange_last, evals.lagrange_ecc_op, evals.databus_id, FF::zero() }),
        // W₁-W₉: witness batched evaluations
        compute_batched_evaluation(lagrange_basis, { evals.w_l, evals.w_r, evals.w_o, FF::zero() }),
        compute_batched_evaluation(
            lagrange_basis, { evals.ecc_op_wire_1, evals.ecc_op_wire_2, evals.ecc_op_wire_3, evals.ecc_op_wire_4 }),
        compute_batched_evaluation(
            lagrange_basis,
            { evals.calldata, evals.calldata_read_counts, evals.calldata_read_tags, evals.secondary_calldata }),
        compute_batched_evaluation(lagrange_basis,
                                   { evals.secondary_calldata_read_counts,
                                     evals.secondary_calldata_read_tags,
                                     evals.return_data,
                                     evals.return_data_read_counts }),
        compute_batched_evaluation(lagrange_basis, { evals.return_data_read_tags, FF::zero(), FF::zero(), FF::zero() }),
        compute_batched_evaluation(lagrange_basis, { evals.w_4, FF::zero(), FF::zero(), FF::zero() }),
        compute_batched_evaluation(lagrange_basis,
                                   { evals.lookup_read_counts, evals.lookup_read_tags, FF::zero(), FF::zero() }),
        compute_batched_evaluation(lagrange_basis,
                                   { evals.lookup_inverses,
                                     evals.calldata_inverses,
                                     evals.secondary_calldata_inverses,
                                     evals.return_data_inverses }),
        compute_batched_evaluation(lagrange_basis, { evals.z_perm, FF::zero(), FF::zero(), FF::zero() }),
    };

    // 3 shifted commitments (W₁, W₆, W₉) and their shifted evaluations
    std::array<Commitment, NUM_SHIFTED> shifted_comms = { interleaved.interleaved_wires,
                                                          interleaved.interleaved_w_4,
                                                          interleaved.interleaved_z_perm };

    std::array<FF, NUM_SHIFTED> shifted_evals = {
        compute_batched_evaluation(lagrange_basis, { evals.w_l_shift, evals.w_r_shift, evals.w_o_shift, FF::zero() }),
        compute_batched_evaluation(lagrange_basis, { evals.w_4_shift, FF::zero(), FF::zero(), FF::zero() }),
        compute_batched_evaluation(lagrange_basis, { evals.z_perm_shift, FF::zero(), FF::zero(), FF::zero() }),
    };

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ RefArray<Commitment, NUM_UNSHIFTED>(unshifted_comms),
                                                         RefArray<FF, NUM_UNSHIFTED>(unshifted_evals) },
                                .shifted = ClaimBatch{ RefArray<Commitment, NUM_SHIFTED>(shifted_comms),
                                                       RefArray<FF, NUM_SHIFTED>(shifted_evals) },
                                .shift_exponent = Flavor::INTERLEAVING_BATCH_SIZE };

    const Commitment one_commitment = Commitment::one();

    auto shplemini_output = Shplemini::compute_batch_opening_claim(pcs_padding_indicator_array,
                                                                   claim_batcher,
                                                                   full_challenge,
                                                                   one_commitment,
                                                                   transcript,
                                                                   Flavor::REPEATED_COMMITMENTS,
                                                                   libra_commitments,
                                                                   sumcheck_output.claimed_libra_evaluation);

    const auto& boc = shplemini_output.batch_opening_claim;
    info("DEBUG VERIFIER batch_opening_claim: commitments=",
         boc.commitments.size(),
         " scalars=",
         boc.scalars.size(),
         " eval_point=",
         boc.evaluation_point);
    info("DEBUG VERIFIER expected MSM size=",
         Flavor::FINAL_PCS_MSM_SIZE(log_n),
         " log_n=",
         log_n,
         " pcs_log_n=",
         pcs_log_n);

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
        info("MultiMegaVerifier: verification failed at reduction step");
        return Output{};
    }

    // Process public inputs
    DefaultIO inputs;
    inputs.reconstruct_from_public(verifier_instance->public_inputs);

    // Aggregate pairing points
    PairingPoints pi_pairing_points = inputs.pairing_inputs;
    pi_pairing_points.aggregate(pcs_pairing_points);

    // DEBUG: Check PCS pairing alone (before public input aggregation)
    bool pcs_alone = pcs_pairing_points.check();
    info("DEBUG PCS pairing check alone: ", pcs_alone ? "true" : "false");

    // Perform pairing check
    bool pairing_verified = pi_pairing_points.check();
    vinfo("MultiMegaVerifier: pairing check: ", pairing_verified ? "true" : "false");

    if (!pairing_verified) {
        info("MultiMegaVerifier: verification failed at pairing check");
        return Output{};
    }

    Output output;
    output.result = true;
    return output;
}

} // namespace bb
