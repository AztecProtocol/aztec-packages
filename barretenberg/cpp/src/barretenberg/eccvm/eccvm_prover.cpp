#include "eccvm_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/honk/proof_system/lookup_library.hpp"
#include "barretenberg/honk/proof_system/permutation_library.hpp"
#include "barretenberg/honk/proof_system/power_polynomial.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/proof_system/library/grand_product_library.hpp"
#include "barretenberg/relations/lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

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
    , commitment_key(commitment_key)
{

    // TODO(@zac-williamson) Future work; is there a cleaner way of doing this? #2213
    prover_polynomials.transcript_add = key->transcript_add;
    prover_polynomials.transcript_mul = key->transcript_mul;
    prover_polynomials.transcript_eq = key->transcript_eq;
    prover_polynomials.transcript_collision_check = key->transcript_collision_check;
    prover_polynomials.transcript_msm_transition = key->transcript_msm_transition;
    prover_polynomials.transcript_pc = key->transcript_pc;
    prover_polynomials.transcript_msm_count = key->transcript_msm_count;
    prover_polynomials.transcript_Px = key->transcript_Px;
    prover_polynomials.transcript_Py = key->transcript_Py;
    prover_polynomials.transcript_z1 = key->transcript_z1;
    prover_polynomials.transcript_z2 = key->transcript_z2;
    prover_polynomials.transcript_z1zero = key->transcript_z1zero;
    prover_polynomials.transcript_z2zero = key->transcript_z2zero;
    prover_polynomials.transcript_op = key->transcript_op;
    prover_polynomials.transcript_accumulator_x = key->transcript_accumulator_x;
    prover_polynomials.transcript_accumulator_y = key->transcript_accumulator_y;
    prover_polynomials.transcript_msm_x = key->transcript_msm_x;
    prover_polynomials.transcript_msm_y = key->transcript_msm_y;
    prover_polynomials.precompute_pc = key->precompute_pc;
    prover_polynomials.precompute_point_transition = key->precompute_point_transition;
    prover_polynomials.precompute_round = key->precompute_round;
    prover_polynomials.precompute_scalar_sum = key->precompute_scalar_sum;
    prover_polynomials.precompute_s1hi = key->precompute_s1hi;
    prover_polynomials.precompute_s1lo = key->precompute_s1lo;
    prover_polynomials.precompute_s2hi = key->precompute_s2hi;
    prover_polynomials.precompute_s2lo = key->precompute_s2lo;
    prover_polynomials.precompute_s3hi = key->precompute_s3hi;
    prover_polynomials.precompute_s3lo = key->precompute_s3lo;
    prover_polynomials.precompute_s4hi = key->precompute_s4hi;
    prover_polynomials.precompute_s4lo = key->precompute_s4lo;
    prover_polynomials.precompute_skew = key->precompute_skew;
    prover_polynomials.precompute_dx = key->precompute_dx;
    prover_polynomials.precompute_dy = key->precompute_dy;
    prover_polynomials.precompute_tx = key->precompute_tx;
    prover_polynomials.precompute_ty = key->precompute_ty;
    prover_polynomials.msm_transition = key->msm_transition;
    prover_polynomials.msm_add = key->msm_add;
    prover_polynomials.msm_double = key->msm_double;
    prover_polynomials.msm_skew = key->msm_skew;
    prover_polynomials.msm_accumulator_x = key->msm_accumulator_x;
    prover_polynomials.msm_accumulator_y = key->msm_accumulator_y;
    prover_polynomials.msm_pc = key->msm_pc;
    prover_polynomials.msm_size_of_msm = key->msm_size_of_msm;
    prover_polynomials.msm_count = key->msm_count;
    prover_polynomials.msm_round = key->msm_round;
    prover_polynomials.msm_add1 = key->msm_add1;
    prover_polynomials.msm_add2 = key->msm_add2;
    prover_polynomials.msm_add3 = key->msm_add3;
    prover_polynomials.msm_add4 = key->msm_add4;
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
    prover_polynomials.transcript_reset_accumulator = key->transcript_reset_accumulator;
    prover_polynomials.precompute_select = key->precompute_select;
    prover_polynomials.lookup_read_counts_0 = key->lookup_read_counts_0;
    prover_polynomials.lookup_read_counts_1 = key->lookup_read_counts_1;
    prover_polynomials.transcript_mul_shift = key->transcript_mul.shifted();
    prover_polynomials.transcript_msm_count_shift = key->transcript_msm_count.shifted();
    prover_polynomials.transcript_accumulator_x_shift = key->transcript_accumulator_x.shifted();
    prover_polynomials.transcript_accumulator_y_shift = key->transcript_accumulator_y.shifted();
    prover_polynomials.precompute_scalar_sum_shift = key->precompute_scalar_sum.shifted();
    prover_polynomials.precompute_s1hi_shift = key->precompute_s1hi.shifted();
    prover_polynomials.precompute_dx_shift = key->precompute_dx.shifted();
    prover_polynomials.precompute_dy_shift = key->precompute_dy.shifted();
    prover_polynomials.precompute_tx_shift = key->precompute_tx.shifted();
    prover_polynomials.precompute_ty_shift = key->precompute_ty.shifted();
    prover_polynomials.msm_transition_shift = key->msm_transition.shifted();
    prover_polynomials.msm_add_shift = key->msm_add.shifted();
    prover_polynomials.msm_double_shift = key->msm_double.shifted();
    prover_polynomials.msm_skew_shift = key->msm_skew.shifted();
    prover_polynomials.msm_accumulator_x_shift = key->msm_accumulator_x.shifted();
    prover_polynomials.msm_accumulator_y_shift = key->msm_accumulator_y.shifted();
    prover_polynomials.msm_count_shift = key->msm_count.shifted();
    prover_polynomials.msm_round_shift = key->msm_round.shifted();
    prover_polynomials.msm_add1_shift = key->msm_add1.shifted();
    prover_polynomials.msm_pc_shift = key->msm_pc.shifted();
    prover_polynomials.precompute_pc_shift = key->precompute_pc.shifted();
    prover_polynomials.transcript_pc_shift = key->transcript_pc.shifted();
    prover_polynomials.precompute_round_shift = key->precompute_round.shifted();
    prover_polynomials.transcript_accumulator_empty_shift = key->transcript_accumulator_empty.shifted();
    prover_polynomials.precompute_select_shift = key->precompute_select.shifted();
    prover_polynomials.lagrange_first = key->lagrange_first;
    prover_polynomials.lagrange_second = key->lagrange_second;
    prover_polynomials.lagrange_last = key->lagrange_last;

    prover_polynomials.lookup_inverses = key->lookup_inverses;
    key->z_perm = Polynomial(key->circuit_size);
    prover_polynomials.z_perm = key->z_perm;
    prover_polynomials.z_perm_shift = key->z_perm; // this will be initialized properly later
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
        transcript.send_to_verifier(labels[idx], commitment_key->commit(wire_polys[idx]));
    }
}

/**
 * @brief Compute sorted witness-table accumulator
 *
 */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_log_derivative_commitments_round()
{
    // Compute and add beta to relation parameters
    auto [beta, gamma] = transcript.get_challenges("beta", "gamma");
    // TODO(#583)(@zac-williamson): fix Transcript to be able to generate more than 2 challenges per round! oof.
    auto beta_sqr = beta * beta;
    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;
    relation_parameters.beta_sqr = beta_sqr;
    relation_parameters.beta_cube = beta_sqr * beta;
    relation_parameters.eccvm_set_permutation_delta =
        gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
    relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();
    // Compute inverse polynomial for our logarithmic-derivative lookup method
    lookup_library::compute_logderivative_inverse<Flavor, typename Flavor::LookupRelation>(
        prover_polynomials, relation_parameters, key->circuit_size);
    transcript.send_to_verifier(commitment_labels.lookup_inverses, commitment_key->commit(key->lookup_inverses));
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

    transcript.send_to_verifier(commitment_labels.z_perm, commitment_key->commit(key->z_perm));
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_relation_check_rounds()
{
    using Sumcheck = sumcheck::SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(key->circuit_size, transcript);
    auto alpha = transcript.get_challenge("alpha");
    sumcheck_output = sumcheck.prove(prover_polynomials, relation_parameters, alpha);
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
    std::vector<FF> rhos = pcs::gemini::powers_of_rho(rho, NUM_POLYNOMIALS);

    // Batch the unshifted polynomials and the to-be-shifted polynomials using ρ
    Polynomial batched_poly_unshifted(key->circuit_size); // batched unshifted polynomials
    size_t poly_idx = 0; // TODO(https://github.com/AztecProtocol/barretenberg/issues/391) zip
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
    gemini_polynomials = Gemini::compute_gemini_polynomials(
        sumcheck_output.challenge, std::move(batched_poly_unshifted), std::move(batched_poly_to_be_shifted));

    // Compute and add to trasnscript the commitments [Fold^(i)], i = 1, ..., d-1
    for (size_t l = 0; l < key->log_circuit_size - 1; ++l) {
        transcript.send_to_verifier("Gemini:FOLD_" + std::to_string(l + 1),
                                    commitment_key->commit(gemini_polynomials[l + 2]));
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
        sumcheck_output.challenge, std::move(gemini_polynomials), r_challenge);

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
    transcript.send_to_verifier("Shplonk:Q", commitment_key->commit(batched_quotient_Q));
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
    PCS::compute_opening_proof(commitment_key, shplonk_output.opening_pair, shplonk_output.witness, transcript);
}

/**
 * @brief Batch open the transcript polynomials as univariates for Translator consistency check
 * TODO(#768): Find a better way to do this. See issue for details.
 *
 * @tparam Flavor
 */
template <ECCVMFlavor Flavor> void ECCVMProver_<Flavor>::execute_transcript_consistency_univariate_opening_round()
{
    // Since IPA cannot currently handle polynomials for which the latter half of the coefficients are 0, we hackily
    // batch the constant polynomial 1 in with the 5 transcript polynomials. See issue #768 for more details.
    Polynomial hack(key->circuit_size);
    for (size_t idx = 0; idx < key->circuit_size; idx++) {
        hack[idx] = 1;
    }
    transcript.send_to_verifier("Translation:hack_commitment", commitment_key->commit(hack));

    // Get the challenge at which we evaluate the polynomials as univariates
    FF evaluation_challenge_x = transcript.get_challenge("Translation:evaluation_challenge_x");

    // Collect the polynomials and evaluations to be batched
    const size_t NUM_UNIVARIATES = 6; // 5 transcript polynomials plus the constant hack poly
    std::array<Polynomial, NUM_UNIVARIATES> univariate_polynomials = { key->transcript_op, key->transcript_Px,
                                                                       key->transcript_Py, key->transcript_z1,
                                                                       key->transcript_z2, hack };
    std::array<FF, NUM_UNIVARIATES> univariate_evaluations;
    for (auto [eval, polynomial] : zip_view(univariate_evaluations, univariate_polynomials)) {
        eval = polynomial.evaluate(evaluation_challenge_x);
    }

    // Add the univariate evaluations to the transcript
    transcript.send_to_verifier("Translation:op", univariate_evaluations[0]);
    transcript.send_to_verifier("Translation:Px", univariate_evaluations[1]);
    transcript.send_to_verifier("Translation:Py", univariate_evaluations[2]);
    transcript.send_to_verifier("Translation:z1", univariate_evaluations[3]);
    transcript.send_to_verifier("Translation:z2", univariate_evaluations[4]);
    transcript.send_to_verifier("Translation:hack_evaluation", univariate_evaluations[5]);

    // Get another challenge for batching the univariate claims
    FF batching_challenge = transcript.get_challenge("Translation:batching_challenge");

    // Constuct the batched polynomial and batched evaluation
    Polynomial batched_univariate{ key->circuit_size };
    FF batched_evaluation{ 0 };
    auto batching_scalar = FF(1);
    for (auto [eval, polynomial] : zip_view(univariate_evaluations, univariate_polynomials)) {
        batched_univariate.add_scaled(polynomial, batching_scalar);
        batched_evaluation += eval * batching_scalar;
        batching_scalar *= batching_challenge;
    }

    // Compute a proof for the batched univariate opening
    PCS::compute_opening_proof(
        commitment_key, { evaluation_challenge_x, batched_evaluation }, batched_univariate, transcript);
}

template <ECCVMFlavor Flavor> plonk::proof& ECCVMProver_<Flavor>::export_proof()
{
    proof.proof_data = transcript.proof_data;
    return proof;
}

template <ECCVMFlavor Flavor> plonk::proof& ECCVMProver_<Flavor>::construct_proof()
{
    execute_preamble_round();

    execute_wire_commitments_round();

    execute_log_derivative_commitments_round();

    execute_grand_product_computation_round();

    execute_relation_check_rounds();

    execute_univariatization_round();

    execute_pcs_evaluation_round();

    execute_shplonk_batched_quotient_round();

    execute_shplonk_partial_evaluation_round();

    execute_final_pcs_round();

    execute_transcript_consistency_univariate_opening_round();

    return export_proof();
}

template class ECCVMProver_<honk::flavor::ECCVM>;

} // namespace proof_system::honk
