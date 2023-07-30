#include "eccvm_prover.hpp"
#include "barretenberg/honk/pcs/claim.hpp"
#include "barretenberg/honk/pcs/commitment_key.hpp"
#include "barretenberg/honk/proof_system/lookup_library.hpp"
#include "barretenberg/honk/proof_system/permutation_library.hpp"
#include "barretenberg/honk/proof_system/prover_library.hpp"
#include "barretenberg/honk/sumcheck/polynomials/univariate.hpp" // will go away
#include "barretenberg/honk/sumcheck/relations/lookup_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/permutation_relation.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/honk/utils/power_polynomial.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript_wrappers.hpp"
#include <algorithm>
#include <array>
#include <cstddef>
#include <memory>
#include <span>
#include <string>
#include <utility>
#include <vector>

namespace proof_system::honk {

/**
 * Create ECCVMProver_ from proving key, witness and manifest.
 *
 * @param input_key Proving key.
 * @param input_manifest Input manifest
 *
 * @tparam settings Settings class.
 * */
template <ECCVMFlavor Flavor>
ECCVMProver_<Flavor>::ECCVMProver_(std::shared_ptr<typename Flavor::ProvingKey> input_key,
                                   std::shared_ptr<PCSCommitmentKey> commitment_key)
    : key(input_key)
    , queue(commitment_key, transcript)
    , pcs_commitment_key(commitment_key)
{

    // TODO(@zac-williamson) is there a cleaner way of doing this?
    prover_polynomials.q_transcript_add = key->q_transcript_add;
    prover_polynomials.q_transcript_mul = key->q_transcript_mul;
    prover_polynomials.q_transcript_eq = key->q_transcript_eq;
    prover_polynomials.q_transcript_accumulate = key->q_transcript_accumulate;
    prover_polynomials.q_transcript_msm_transition = key->q_transcript_msm_transition;
    prover_polynomials.transcript_pc = key->transcript_pc;
    prover_polynomials.transcript_msm_count = key->transcript_msm_count;
    prover_polynomials.transcript_x = key->transcript_x;
    prover_polynomials.transcript_y = key->transcript_y;
    prover_polynomials.transcript_z1 = key->transcript_z1;
    prover_polynomials.transcript_z2 = key->transcript_z2;
    prover_polynomials.transcript_z1zero = key->transcript_z1zero;
    prover_polynomials.transcript_z2zero = key->transcript_z2zero;
    prover_polynomials.transcript_op = key->transcript_op;
    prover_polynomials.transcript_accumulator_x = key->transcript_accumulator_x;
    prover_polynomials.transcript_accumulator_y = key->transcript_accumulator_y;
    prover_polynomials.transcript_msm_x = key->transcript_msm_x;
    prover_polynomials.transcript_msm_y = key->transcript_msm_y;
    prover_polynomials.table_pc = key->table_pc;
    prover_polynomials.table_point_transition = key->table_point_transition;
    prover_polynomials.table_round = key->table_round;
    prover_polynomials.table_scalar_sum = key->table_scalar_sum;
    prover_polynomials.table_s1 = key->table_s1;
    prover_polynomials.table_s2 = key->table_s2;
    prover_polynomials.table_s3 = key->table_s3;
    prover_polynomials.table_s4 = key->table_s4;
    prover_polynomials.table_s5 = key->table_s5;
    prover_polynomials.table_s6 = key->table_s6;
    prover_polynomials.table_s7 = key->table_s7;
    prover_polynomials.table_s8 = key->table_s8;
    prover_polynomials.table_skew = key->table_skew;
    prover_polynomials.table_dx = key->table_dx;
    prover_polynomials.table_dy = key->table_dy;
    prover_polynomials.table_tx = key->table_tx;
    prover_polynomials.table_ty = key->table_ty;
    prover_polynomials.q_msm_transition = key->q_msm_transition;
    prover_polynomials.msm_q_add = key->msm_q_add;
    prover_polynomials.msm_q_double = key->msm_q_double;
    prover_polynomials.msm_q_skew = key->msm_q_skew;
    prover_polynomials.msm_accumulator_x = key->msm_accumulator_x;
    prover_polynomials.msm_accumulator_y = key->msm_accumulator_y;
    prover_polynomials.msm_pc = key->msm_pc;
    prover_polynomials.msm_size_of_msm = key->msm_size_of_msm;
    prover_polynomials.msm_count = key->msm_count;
    prover_polynomials.msm_round = key->msm_round;
    prover_polynomials.msm_q_add1 = key->msm_q_add1;
    prover_polynomials.msm_q_add2 = key->msm_q_add2;
    prover_polynomials.msm_q_add3 = key->msm_q_add3;
    prover_polynomials.msm_q_add4 = key->msm_q_add4;
    prover_polynomials.msm_x1 = key->msm_x1;
    prover_polynomials.msm_y1 = key->msm_y1;
    prover_polynomials.msm_x2 = key->msm_x2;
    prover_polynomials.msm_y2 = key->msm_y2;
    prover_polynomials.msm_x3 = key->msm_x3;
    prover_polynomials.msm_y3 = key->msm_y3;
    prover_polynomials.msm_x4 = key->msm_x4;
    prover_polynomials.msm_y4 = key->msm_y4;
    prover_polynomials.msm_collision_x1 = key->msm_collision_x1;
    prover_polynomials.msm_collision_x2 = key->msm_collision_x2;
    prover_polynomials.msm_collision_x3 = key->msm_collision_x3;
    prover_polynomials.msm_collision_x4 = key->msm_collision_x4;
    prover_polynomials.msm_lambda1 = key->msm_lambda1;
    prover_polynomials.msm_lambda2 = key->msm_lambda2;
    prover_polynomials.msm_lambda3 = key->msm_lambda3;
    prover_polynomials.msm_lambda4 = key->msm_lambda4;
    prover_polynomials.msm_slice1 = key->msm_slice1;
    prover_polynomials.msm_slice2 = key->msm_slice2;
    prover_polynomials.msm_slice3 = key->msm_slice3;
    prover_polynomials.msm_slice4 = key->msm_slice4;
    prover_polynomials.transcript_accumulator_empty = key->transcript_accumulator_empty;
    prover_polynomials.transcript_q_reset_accumulator = key->transcript_q_reset_accumulator;
    prover_polynomials.q_wnaf = key->q_wnaf;
    prover_polynomials.lookup_read_counts_0 = key->lookup_read_counts_0;
    prover_polynomials.lookup_read_counts_1 = key->lookup_read_counts_1;
    prover_polynomials.q_transcript_mul_shift = key->q_transcript_mul.shifted();
    prover_polynomials.q_transcript_accumulate_shift = key->q_transcript_accumulate.shifted();
    prover_polynomials.transcript_msm_count_shift = key->transcript_msm_count.shifted();
    prover_polynomials.transcript_accumulator_x_shift = key->transcript_accumulator_x.shifted();
    prover_polynomials.transcript_accumulator_y_shift = key->transcript_accumulator_y.shifted();
    prover_polynomials.table_scalar_sum_shift = key->table_scalar_sum.shifted();
    prover_polynomials.table_dx_shift = key->table_dx.shifted();
    prover_polynomials.table_dy_shift = key->table_dy.shifted();
    prover_polynomials.table_tx_shift = key->table_tx.shifted();
    prover_polynomials.table_ty_shift = key->table_ty.shifted();
    prover_polynomials.q_msm_transition_shift = key->q_msm_transition.shifted();
    prover_polynomials.msm_q_add_shift = key->msm_q_add.shifted();
    prover_polynomials.msm_q_double_shift = key->msm_q_double.shifted();
    prover_polynomials.msm_q_skew_shift = key->msm_q_skew.shifted();
    prover_polynomials.msm_accumulator_x_shift = key->msm_accumulator_x.shifted();
    prover_polynomials.msm_accumulator_y_shift = key->msm_accumulator_y.shifted();
    prover_polynomials.msm_count_shift = key->msm_count.shifted();
    prover_polynomials.msm_round_shift = key->msm_round.shifted();
    prover_polynomials.msm_q_add1_shift = key->msm_q_add1.shifted();
    prover_polynomials.msm_pc_shift = key->msm_pc.shifted();
    prover_polynomials.table_pc_shift = key->table_pc.shifted();
    prover_polynomials.transcript_pc_shift = key->transcript_pc.shifted();
    prover_polynomials.table_round_shift = key->table_round.shifted();
    prover_polynomials.transcript_accumulator_empty_shift = key->transcript_accumulator_empty.shifted();
    prover_polynomials.q_wnaf_shift = key->q_wnaf.shifted();
    prover_polynomials.lagrange_first = key->lagrange_first;
    prover_polynomials.lagrange_second = key->lagrange_second;
    prover_polynomials.lagrange_last = key->lagrange_last;

    prover_polynomials.lookup_inverses = key->lookup_inverses;
    key->z_perm = Polynomial(key->circuit_size);
    prover_polynomials.z_perm = key->z_perm;
}

/**
 * @brief Commit to the first three wires only
 *
 */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::compute_wire_commitments()
{
    auto wire_polys = key->get_wires();
    auto labels = commitment_labels.get_wires();
    for (size_t idx = 0; idx < wire_polys.size(); ++idx) {
        queue.add_commitment(wire_polys[idx], labels[idx]);
    }
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_preamble_round()
{
    const auto circuit_size = static_cast<uint32_t>(key->circuit_size);

    transcript.send_to_verifier("circuit_size", circuit_size);
}

/**
 * @brief Compute commitments to the first three wires
 *
 */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_wire_commitments_round()
{
    auto wire_polys = key->get_wires();
    auto labels = commitment_labels.get_wires();
    for (size_t idx = 0; idx < wire_polys.size(); ++idx) {
        queue.add_commitment(wire_polys[idx], labels[idx]);
    }
}

/**
 * @brief Compute sorted witness-table accumulator
 *
 */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_log_derivative_commitments_round()
{
    // Compute and add eta to relation parameters
    auto [eta, gamma] = transcript.get_challenges("beta", "gamma");
    // TODO(#583)(@zac-williamson): fix Transcript to be able to generate more than 2 challenges per round! oof.
    auto eta_sqr = eta * eta;
    relation_parameters.gamma = gamma;
    relation_parameters.eta = eta;
    relation_parameters.eta_sqr = eta_sqr;
    relation_parameters.eta_cube = eta_sqr * eta;
    relation_parameters.permutation_offset =
        gamma * (gamma + eta_sqr) * (gamma + eta_sqr + eta_sqr) * (gamma + eta_sqr + eta_sqr + eta_sqr);
    relation_parameters.permutation_offset = relation_parameters.permutation_offset.invert();
    // Compute inverse polynomial for our logarithmic-derivative lookup method
    lookup_library::compute_logderivative_inverse<Flavor, typename Flavor::LookupRelation>(
        prover_polynomials, relation_parameters, key->circuit_size);
    queue.add_commitment(key->lookup_inverses, commitment_labels.lookup_inverses);
    prover_polynomials.lookup_inverses = key->lookup_inverses;
}

/**
 * @brief Compute permutation and lookup grand product polynomials and commitments
 *
 */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_grand_product_computation_round()
{
    // Compute permutation grand product and their commitments
    permutation_library::compute_permutation_grand_products<Flavor>(key, prover_polynomials, relation_parameters);

    queue.add_commitment(key->z_perm, commitment_labels.z_perm);
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_relation_check_rounds()
{
    using Sumcheck = sumcheck::Sumcheck<Flavor, ProverTranscript<FF>>;

    auto sumcheck = Sumcheck(key->circuit_size, transcript);

    sumcheck_output = sumcheck.execute_prover(prover_polynomials, relation_parameters);
}

/**
 * - Get rho challenge
 * - Compute d+1 Fold polynomials and their evaluations.
 *
 * */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_univariatization_round()
{
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    // Generate batching challenge ρ and powers 1,ρ,…,ρᵐ⁻¹
    FF rho = transcript.get_challenge("rho");
    std::vector<FF> rhos = Gemini::powers_of_rho(rho, NUM_POLYNOMIALS);

    // Batch the unshifted polynomials and the to-be-shifted polynomials using ρ
    Polynomial batched_poly_unshifted(key->circuit_size); // batched unshifted polynomials
    size_t poly_idx = 0;                                  // TODO(#391) zip
    for (auto& unshifted_poly : prover_polynomials.get_unshifted()) {
        batched_poly_unshifted.add_scaled(unshifted_poly, rhos[poly_idx]);
        ++poly_idx;
    }

    Polynomial batched_poly_to_be_shifted(key->circuit_size); // batched to-be-shifted polynomials
    for (auto& to_be_shifted_poly : prover_polynomials.get_to_be_shifted()) {
        batched_poly_to_be_shifted.add_scaled(to_be_shifted_poly, rhos[poly_idx]);
        ++poly_idx;
    };

    // Compute d-1 polynomials Fold^(i), i = 1, ..., d-1.
    fold_polynomials = Gemini::compute_fold_polynomials(
        sumcheck_output.challenge_point, std::move(batched_poly_unshifted), std::move(batched_poly_to_be_shifted));

    // Compute and add to trasnscript the commitments [Fold^(i)], i = 1, ..., d-1
    for (size_t l = 0; l < key->log_circuit_size - 1; ++l) {
        queue.add_commitment(fold_polynomials[l + 2], "Gemini:FOLD_" + std::to_string(l + 1));
    }
}

/**
 * - Do Fiat-Shamir to get "r" challenge
 * - Compute remaining two partially evaluated Fold polynomials Fold_{r}^(0) and Fold_{-r}^(0).
 * - Compute and aggregate opening pairs (challenge, evaluation) for each of d Fold polynomials.
 * - Add d-many Fold evaluations a_i, i = 0, ..., d-1 to the transcript, excluding eval of Fold_{r}^(0)
 * */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_pcs_evaluation_round()
{
    const FF r_challenge = transcript.get_challenge("Gemini:r");
    gemini_output = Gemini::compute_fold_polynomial_evaluations(
        sumcheck_output.challenge_point, std::move(fold_polynomials), r_challenge);

    for (size_t l = 0; l < key->log_circuit_size; ++l) {
        std::string label = "Gemini:a_" + std::to_string(l);
        const auto& evaluation = gemini_output.opening_pairs[l + 1].evaluation;
        transcript.send_to_verifier(label, evaluation);
    }
}

/**
 * - Do Fiat-Shamir to get "nu" challenge.
 * - Compute commitment [Q]_1
 * */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_shplonk_batched_quotient_round()
{
    nu_challenge = transcript.get_challenge("Shplonk:nu");

    batched_quotient_Q =
        Shplonk::compute_batched_quotient(gemini_output.opening_pairs, gemini_output.witnesses, nu_challenge);

    // commit to Q(X) and add [Q] to the transcript
    queue.add_commitment(batched_quotient_Q, "Shplonk:Q");
}

/**
 * - Do Fiat-Shamir to get "z" challenge.
 * - Compute polynomial Q(X) - Q_z(X)
 * */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_shplonk_partial_evaluation_round()
{
    const FF z_challenge = transcript.get_challenge("Shplonk:z");

    shplonk_output = Shplonk::compute_partially_evaluated_batched_quotient(
        gemini_output.opening_pairs, gemini_output.witnesses, std::move(batched_quotient_Q), nu_challenge, z_challenge);
}
/**
 * - Compute final PCS opening proof:
 * - For KZG, this is the quotient commitment [W]_1
 * - For IPA, the vectors L and R
 * */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_final_pcs_round()
{
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_output.opening_pair, shplonk_output.witness, transcript);
    // queue.add_commitment(quotient_W, "KZG:W");
}

template <ECCVMFlavor Flavor> plonk::proof& ECCVMProver_<Flavor>::export_proof()
{
    proof.proof_data = transcript.proof_data;
    return proof;
}

template <ECCVMFlavor Flavor> plonk::proof& ECCVMProver_<Flavor>::construct_proof()
{
    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();

    // Compute first three wire commitments
    execute_wire_commitments_round();
    queue.process_queue();

    // Compute sorted list accumulator and commitment
    execute_log_derivative_commitments_round();
    queue.process_queue();

    // Fiat-Shamir: beta & gamma
    // Compute grand product(s) and commitments.
    execute_grand_product_computation_round();
    queue.process_queue();

    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho
    // Compute Fold polynomials and their commitments.
    execute_univariatization_round();
    queue.process_queue();

    // Fiat-Shamir: r
    // Compute Fold evaluations
    execute_pcs_evaluation_round();

    // Fiat-Shamir: nu
    // Compute Shplonk batched quotient commitment Q
    execute_shplonk_batched_quotient_round();
    queue.process_queue();

    // Fiat-Shamir: z
    // Compute partial evaluation Q_z
    execute_shplonk_partial_evaluation_round();

    // Fiat-Shamir: z
    // Compute PCS opening proof (either KZG quotient commitment or IPA opening proof)
    execute_final_pcs_round();

    return export_proof();
}

template class ECCVMProver_<honk::flavor::ECCVM>;
template class ECCVMProver_<honk::flavor::ECCVMGrumpkin>;

} // namespace proof_system::honk
