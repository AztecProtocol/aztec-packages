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

    // Compute padding indicator array
    auto padding_indicator_array = compute_padding_indicator_array(log_n);
    verifier_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);

    // Construct the sumcheck verifier
    // Sumcheck still operates on the original polynomial evaluations
    SumcheckVerifier<Flavor> sumcheck(transcript, verifier_instance->alpha, log_n);

    // Run the sumcheck verifier (no ZK, so no Libra)
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    SumcheckOutput<Flavor> sumcheck_output = sumcheck.verify(
        verifier_instance->relation_parameters, verifier_instance->gate_challenges, padding_indicator_array);

    // For interleaved polynomials with k=2, we need to get 2 additional challenges
    // and prepend them to the sumcheck challenge for the PCS.
    // Get the k=2 interleaving challenges (same as prover)
    FF u0 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");

    // Get the batching challenge (prover uses this to batch polynomials before Shplemini)
    // Verifier uses this to batch the interleaved commitment evaluations
    FF batching_challenge = transcript->template get_challenge<FF>("batching_rho");

    // Compute Lagrange basis from the interleaving challenges
    auto lagrange_basis = compute_lagrange_basis(u0, u1);

    // Build the full challenge vector: prepend interleaving challenges to sumcheck challenges
    std::vector<FF> full_challenge;
    full_challenge.reserve(2 + sumcheck_output.challenge.size());
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    // Get interleaved commitments
    const auto& interleaved = verifier_instance->interleaved_commitments;

    // Get individual polynomial evaluations from sumcheck
    const auto& evals = sumcheck_output.claimed_evaluations;

    // Build batched evaluations for each interleaved commitment using Lagrange basis
    // W₁: [w_l, w_r, w_o, ZERO] - shiftable
    FF batched_eval_w1 = compute_batched_evaluation(lagrange_basis, { evals.w_l, evals.w_r, evals.w_o, FF::zero() });

    // W₂: [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4] - unshiftable
    FF batched_eval_w2 = compute_batched_evaluation(
        lagrange_basis, { evals.ecc_op_wire_1, evals.ecc_op_wire_2, evals.ecc_op_wire_3, evals.ecc_op_wire_4 });

    // W₃: [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata]
    FF batched_eval_w3 = compute_batched_evaluation(
        lagrange_basis,
        { evals.calldata, evals.calldata_read_counts, evals.calldata_read_tags, evals.secondary_calldata });

    // W₄: [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data, return_data_read_counts]
    FF batched_eval_w4 = compute_batched_evaluation(lagrange_basis,
                                                    { evals.secondary_calldata_read_counts,
                                                      evals.secondary_calldata_read_tags,
                                                      evals.return_data,
                                                      evals.return_data_read_counts });

    // W₅: [return_data_read_tags, ZERO, ZERO, ZERO]
    FF batched_eval_w5 =
        compute_batched_evaluation(lagrange_basis, { evals.return_data_read_tags, FF::zero(), FF::zero(), FF::zero() });

    // W₆: [w_4, ZERO, ZERO, ZERO] - shiftable
    FF batched_eval_w6 = compute_batched_evaluation(lagrange_basis, { evals.w_4, FF::zero(), FF::zero(), FF::zero() });

    // W₇: [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
    FF batched_eval_w7 = compute_batched_evaluation(
        lagrange_basis, { evals.lookup_read_counts, evals.lookup_read_tags, FF::zero(), FF::zero() });

    // W₈: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
    FF batched_eval_w8 = compute_batched_evaluation(lagrange_basis,
                                                    { evals.lookup_inverses,
                                                      evals.calldata_inverses,
                                                      evals.secondary_calldata_inverses,
                                                      evals.return_data_inverses });

    // W₉: [z_perm, ZERO, ZERO, ZERO] - shiftable
    FF batched_eval_w9 =
        compute_batched_evaluation(lagrange_basis, { evals.z_perm, FF::zero(), FF::zero(), FF::zero() });

    // For shifted polynomials, we need shifted evaluations
    // W₁_shift: [w_l_shift, w_r_shift, w_o_shift, ZERO]
    FF batched_eval_w1_shift =
        compute_batched_evaluation(lagrange_basis, { evals.w_l_shift, evals.w_r_shift, evals.w_o_shift, FF::zero() });

    // W₆_shift: [w_4_shift, ZERO, ZERO, ZERO]
    FF batched_eval_w6_shift =
        compute_batched_evaluation(lagrange_basis, { evals.w_4_shift, FF::zero(), FF::zero(), FF::zero() });

    // W₉_shift: [z_perm_shift, ZERO, ZERO, ZERO]
    FF batched_eval_w9_shift =
        compute_batched_evaluation(lagrange_basis, { evals.z_perm_shift, FF::zero(), FF::zero(), FF::zero() });

    // Build arrays for interleaved commitments and evaluations
    // Unshifted interleaved: W₁-W₉
    std::array<Commitment, 9> interleaved_comms_arr = {
        interleaved.interleaved_wires,     interleaved.interleaved_ecc_op_wires, interleaved.interleaved_databus_1,
        interleaved.interleaved_databus_2, interleaved.interleaved_databus_3,    interleaved.interleaved_w_4,
        interleaved.interleaved_lookup,    interleaved.interleaved_inverses,     interleaved.interleaved_z_perm
    };

    std::array<FF, 9> interleaved_evals_arr = { batched_eval_w1, batched_eval_w2, batched_eval_w3,
                                                batched_eval_w4, batched_eval_w5, batched_eval_w6,
                                                batched_eval_w7, batched_eval_w8, batched_eval_w9 };

    // Shiftable commitments and their shifted evaluations (W₁, W₆, W₉)
    std::array<Commitment, 3> shiftable_comms_arr = { interleaved.interleaved_wires,
                                                      interleaved.interleaved_w_4,
                                                      interleaved.interleaved_z_perm };
    std::array<FF, 3> shifted_evals_arr = { batched_eval_w1_shift, batched_eval_w6_shift, batched_eval_w9_shift };

    // Get interleaved precomputed commitments and compute batched evaluations from VK
    auto vk = verifier_instance->get_vk();
    const auto& evals_precomputed = sumcheck_output.claimed_evaluations;

    // Compute batched evaluations for each interleaved precomputed commitment
    // S₁: [q_m, q_c, q_l, q_r]
    FF batched_eval_s1 = compute_batched_evaluation(
        lagrange_basis, { evals_precomputed.q_m, evals_precomputed.q_c, evals_precomputed.q_l, evals_precomputed.q_r });

    // S₂: [q_o, q_4, q_busread, q_lookup]
    FF batched_eval_s2 = compute_batched_evaluation(
        lagrange_basis,
        { evals_precomputed.q_o, evals_precomputed.q_4, evals_precomputed.q_busread, evals_precomputed.q_lookup });

    // S₃: [q_arith, q_delta_range, q_elliptic, q_memory]
    FF batched_eval_s3 = compute_batched_evaluation(lagrange_basis,
                                                    { evals_precomputed.q_arith,
                                                      evals_precomputed.q_delta_range,
                                                      evals_precomputed.q_elliptic,
                                                      evals_precomputed.q_memory });

    // S₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, ZERO]
    FF batched_eval_s4 = compute_batched_evaluation(lagrange_basis,
                                                    { evals_precomputed.q_nnf,
                                                      evals_precomputed.q_poseidon2_external,
                                                      evals_precomputed.q_poseidon2_internal,
                                                      FF::zero() });

    // S₅: [sigma_1, sigma_2, sigma_3, sigma_4]
    FF batched_eval_s5 = compute_batched_evaluation(
        lagrange_basis,
        { evals_precomputed.sigma_1, evals_precomputed.sigma_2, evals_precomputed.sigma_3, evals_precomputed.sigma_4 });

    // S₆: [id_1, id_2, id_3, id_4]
    FF batched_eval_s6 = compute_batched_evaluation(
        lagrange_basis,
        { evals_precomputed.id_1, evals_precomputed.id_2, evals_precomputed.id_3, evals_precomputed.id_4 });

    // S₇: [table_1, table_2, table_3, table_4]
    FF batched_eval_s7 = compute_batched_evaluation(
        lagrange_basis,
        { evals_precomputed.table_1, evals_precomputed.table_2, evals_precomputed.table_3, evals_precomputed.table_4 });

    // S₈: [lagrange_first, lagrange_last, lagrange_ecc_op, databus_id]
    FF batched_eval_s8 = compute_batched_evaluation(lagrange_basis,
                                                    { evals_precomputed.lagrange_first,
                                                      evals_precomputed.lagrange_last,
                                                      evals_precomputed.lagrange_ecc_op,
                                                      evals_precomputed.databus_id });

    // Build arrays for interleaved precomputed commitments and evaluations
    std::array<Commitment, 8> precomputed_comms_arr = { vk->interleaved_selectors_1, vk->interleaved_selectors_2,
                                                        vk->interleaved_selectors_3, vk->interleaved_selectors_4,
                                                        vk->interleaved_sigmas,      vk->interleaved_ids,
                                                        vk->interleaved_tables,      vk->interleaved_lagrange };

    std::array<FF, 8> precomputed_evals_arr = { batched_eval_s1, batched_eval_s2, batched_eval_s3, batched_eval_s4,
                                                batched_eval_s5, batched_eval_s6, batched_eval_s7, batched_eval_s8 };

    // Compute powers of batching_challenge for sequential batching:
    // rho^0..rho^16 for 17 unshifted, then rho^17..rho^19 for 3 shifted
    constexpr size_t NUM_UNSHIFTED = Flavor::NUM_ALL_INTERLEAVED_COMMITMENTS;     // 17
    constexpr size_t NUM_SHIFTED = Flavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS; // 3
    constexpr size_t TOTAL_BATCHED = NUM_UNSHIFTED + NUM_SHIFTED;                 // 20

    std::array<FF, TOTAL_BATCHED> rho_powers;
    rho_powers[0] = FF::one();
    for (size_t i = 1; i < TOTAL_BATCHED; ++i) {
        rho_powers[i] = rho_powers[i - 1] * batching_challenge;
    }

    // All 17 unshifted commitments in order: S₁-S₈, W₁-W₉
    std::array<Commitment, NUM_UNSHIFTED> all_unshifted_comms;
    std::array<FF, NUM_UNSHIFTED> all_unshifted_evals;
    for (size_t i = 0; i < 8; ++i) {
        all_unshifted_comms[i] = precomputed_comms_arr[i];
        all_unshifted_evals[i] = precomputed_evals_arr[i];
    }
    for (size_t i = 0; i < 9; ++i) {
        all_unshifted_comms[8 + i] = interleaved_comms_arr[i];
        all_unshifted_evals[8 + i] = interleaved_evals_arr[i];
    }

    // Batch unshifted: batch_mul of 17 commitments with rho^0..rho^16
    std::span<const FF> unshifted_scalars(rho_powers.data(), NUM_UNSHIFTED);
    Commitment batched_unshifted_commitment = Commitment::batch_mul(all_unshifted_comms, unshifted_scalars);
    FF batched_unshifted_eval = FF::zero();
    for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
        batched_unshifted_eval += all_unshifted_evals[i] * rho_powers[i];
    }

    // Batch shifted: batch_mul of 3 shiftable commitments with rho^17..rho^19
    std::span<const FF> shifted_scalars(rho_powers.data() + NUM_UNSHIFTED, NUM_SHIFTED);
    Commitment batched_shifted_commitment = Commitment::batch_mul(shiftable_comms_arr, shifted_scalars);
    FF batched_shifted_eval = FF::zero();
    for (size_t i = 0; i < NUM_SHIFTED; ++i) {
        batched_shifted_eval += shifted_evals_arr[i] * rho_powers[NUM_UNSHIFTED + i];
    }

    // Create single batched claim for Shplemini
    std::array<Commitment, 1> batched_unshifted_comm_arr = { batched_unshifted_commitment };
    std::array<FF, 1> batched_unshifted_eval_arr = { batched_unshifted_eval };
    std::array<Commitment, 1> batched_shifted_comm_arr = { batched_shifted_commitment };
    std::array<FF, 1> batched_shifted_eval_arr = { batched_shifted_eval };

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ RefArray<Commitment, 1>(batched_unshifted_comm_arr),
                                                         RefArray<FF, 1>(batched_unshifted_eval_arr) },
                                .shifted = ClaimBatch{ RefArray<Commitment, 1>(batched_shifted_comm_arr),
                                                       RefArray<FF, 1>(batched_shifted_eval_arr) } };

    info("VERIFIER u0=", u0, " u1=", u1);
    info("VERIFIER batching_rho=", batching_challenge);
    info("VERIFIER batched_unshifted_eval=", batched_unshifted_eval);
    info("VERIFIER batched_shifted_eval=", batched_shifted_eval);

    const Commitment one_commitment = Commitment::one();

    // For interleaved polynomials, the shift is by INTERLEAVING_BATCH_SIZE (4) instead of 1
    constexpr size_t SHIFT_EXPONENT = Flavor::INTERLEAVING_BATCH_SIZE;

    auto shplemini_output = Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                                                   claim_batcher,
                                                                   full_challenge,
                                                                   one_commitment,
                                                                   transcript,
                                                                   Flavor::REPEATED_COMMITMENTS,
                                                                   libra_commitments,
                                                                   sumcheck_output.claimed_libra_evaluation,
                                                                   std::vector<Commitment>{},
                                                                   std::vector<std::array<FF, 3>>{},
                                                                   SHIFT_EXPONENT);

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
