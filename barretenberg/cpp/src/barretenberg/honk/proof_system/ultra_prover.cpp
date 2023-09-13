#include "ultra_prover.hpp"
#include "barretenberg/common/timer.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/honk/pcs/claim.hpp"
#include "barretenberg/honk/proof_system/grand_product_library.hpp"
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
 * Create UltraProver_ from proving key, witness and manifest.
 *
 * @param input_key Proving key.
 * @param input_manifest Input manifest
 *
 * @tparam settings Settings class.
 * */
template <UltraFlavor Flavor>
UltraProver_<Flavor>::UltraProver_(std::shared_ptr<typename Flavor::ProvingKey> input_key,
                                   std::shared_ptr<CommitmentKey> commitment_key)
    : key(input_key)
    , queue(commitment_key, transcript)
    , pcs_commitment_key(commitment_key)
{
    prover_polynomials.q_c = key->q_c;
    prover_polynomials.q_l = key->q_l;
    prover_polynomials.q_r = key->q_r;
    prover_polynomials.q_o = key->q_o;
    prover_polynomials.q_4 = key->q_4;
    prover_polynomials.q_m = key->q_m;
    prover_polynomials.q_arith = key->q_arith;
    prover_polynomials.q_sort = key->q_sort;
    prover_polynomials.q_elliptic = key->q_elliptic;
    prover_polynomials.q_aux = key->q_aux;
    prover_polynomials.q_lookup = key->q_lookup;
    prover_polynomials.sigma_1 = key->sigma_1;
    prover_polynomials.sigma_2 = key->sigma_2;
    prover_polynomials.sigma_3 = key->sigma_3;
    prover_polynomials.sigma_4 = key->sigma_4;
    prover_polynomials.id_1 = key->id_1;
    prover_polynomials.id_2 = key->id_2;
    prover_polynomials.id_3 = key->id_3;
    prover_polynomials.id_4 = key->id_4;
    prover_polynomials.table_1 = key->table_1;
    prover_polynomials.table_2 = key->table_2;
    prover_polynomials.table_3 = key->table_3;
    prover_polynomials.table_4 = key->table_4;
    prover_polynomials.table_1_shift = key->table_1.shifted();
    prover_polynomials.table_2_shift = key->table_2.shifted();
    prover_polynomials.table_3_shift = key->table_3.shifted();
    prover_polynomials.table_4_shift = key->table_4.shifted();
    prover_polynomials.lagrange_first = key->lagrange_first;
    prover_polynomials.lagrange_last = key->lagrange_last;
    prover_polynomials.w_l = key->w_l;
    prover_polynomials.w_r = key->w_r;
    prover_polynomials.w_o = key->w_o;
    prover_polynomials.w_l_shift = key->w_l.shifted();
    prover_polynomials.w_r_shift = key->w_r.shifted();
    prover_polynomials.w_o_shift = key->w_o.shifted();

    if constexpr (IsGoblinFlavor<Flavor>) {
        prover_polynomials.ecc_op_wire_1 = key->ecc_op_wire_1;
        prover_polynomials.ecc_op_wire_2 = key->ecc_op_wire_2;
        prover_polynomials.ecc_op_wire_3 = key->ecc_op_wire_3;
        prover_polynomials.ecc_op_wire_4 = key->ecc_op_wire_4;
        prover_polynomials.lagrange_ecc_op = key->lagrange_ecc_op;
    }

    // Add public inputs to transcript from the second wire polynomial; This requires determination of the offset at
    // which the PI have been written into the wires relative to the 0th index.
    std::span<FF> public_wires_source = prover_polynomials.w_r;
    pub_inputs_offset = Flavor::has_zero_row ? 1 : 0;
    if constexpr (IsGoblinFlavor<Flavor>) {
        pub_inputs_offset += key->num_ecc_op_gates;
    }

    for (size_t i = 0; i < key->num_public_inputs; ++i) {
        size_t idx = i + pub_inputs_offset;
        public_inputs.emplace_back(public_wires_source[idx]);
    }
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_preamble_round()
{
    const auto circuit_size = static_cast<uint32_t>(key->circuit_size);
    const auto num_public_inputs = static_cast<uint32_t>(key->num_public_inputs);

    transcript.send_to_verifier("circuit_size", circuit_size);
    transcript.send_to_verifier("public_input_size", num_public_inputs);
    transcript.send_to_verifier("pub_inputs_offset", static_cast<uint32_t>(pub_inputs_offset));

    for (size_t i = 0; i < key->num_public_inputs; ++i) {
        auto public_input_i = public_inputs[i];
        transcript.send_to_verifier("public_input_" + std::to_string(i), public_input_i);
    }
}

/**
 * @brief Compute commitments to the first three wires
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_wire_commitments_round()
{
    // Commit to the first three wire polynomials; the fourth is committed to after the addition of memory records.
    auto wire_polys = key->get_wires();
    auto labels = commitment_labels.get_wires();
    for (size_t idx = 0; idx < 3; ++idx) {
        queue.add_commitment(wire_polys[idx], labels[idx]);
    }

    // If Goblin, commit to the ECC op wire polynomials
    if constexpr (IsGoblinFlavor<Flavor>) {
        auto op_wire_polys = key->get_ecc_op_wires();
        auto labels = commitment_labels.get_ecc_op_wires();
        for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
            queue.add_commitment(op_wire_polys[idx], labels[idx]);
        }
    }
}

/**
 * @brief Compute sorted witness-table accumulator
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_sorted_list_accumulator_round()
{
    Timer sorted_list_get_chal_timer;
    // Compute and add eta to relation parameters
    auto eta = transcript.get_challenge("eta");
    relation_parameters.eta = eta;
    auto sorted_list_get_chal_time = sorted_list_get_chal_timer.nanoseconds() / 1000;

    Timer sorted_list_comp_acc_timer;
    // Compute sorted witness-table accumulator and its commitment
    key->sorted_accum = prover_library::compute_sorted_list_accumulator<Flavor>(key, eta);
    queue.add_commitment(key->sorted_accum, commitment_labels.sorted_accum);
    auto sorted_list_comp_acc_time = sorted_list_comp_acc_timer.nanoseconds() / 1000;

    Timer sorted_list_add_plookup_mem_timer;
    // Finalize fourth wire polynomial by adding lookup memory records, then commit
    prover_library::add_plookup_memory_records_to_wire_4<Flavor>(key, eta);
    queue.add_commitment(key->w_4, commitment_labels.w_4);
    auto sorted_list_add_plookup_mem_time = sorted_list_add_plookup_mem_timer.nanoseconds() / 1000;

    Timer sorted_list_end_ops_timer;
    prover_polynomials.sorted_accum_shift = key->sorted_accum.shifted();
    prover_polynomials.sorted_accum = key->sorted_accum;
    prover_polynomials.w_4 = key->w_4;
    prover_polynomials.w_4_shift = key->w_4.shifted();
    auto sorted_list_end_ops_time = sorted_list_end_ops_timer.nanoseconds() / 1000;

    info("");
    info("Sorted list get_challenge time: ", sorted_list_get_chal_time);
    info("Sorted list compute_sorted_list_accumulator time: ", sorted_list_comp_acc_time);
    info("Sorted list add_plookup_memory time: ", sorted_list_add_plookup_mem_time);
    info("Sorted list end ops time: ", sorted_list_end_ops_time);
    info("");
}

/**
 * @brief Compute permutation and lookup grand product polynomials and commitments
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_grand_product_computation_round()
{
    // Compute and store parameters required by relations in Sumcheck
    auto [beta, gamma] = transcript.get_challenges("beta", "gamma");

    auto public_input_delta =
        compute_public_input_delta<Flavor>(public_inputs, beta, gamma, key->circuit_size, pub_inputs_offset);
    auto lookup_grand_product_delta = compute_lookup_grand_product_delta(beta, gamma, key->circuit_size);

    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = public_input_delta;
    relation_parameters.lookup_grand_product_delta = lookup_grand_product_delta;

    // Compute permutation + lookup grand product and their commitments
    grand_product_library::compute_grand_products<Flavor>(key, prover_polynomials, relation_parameters);

    queue.add_commitment(key->z_perm, commitment_labels.z_perm);
    queue.add_commitment(key->z_lookup, commitment_labels.z_lookup);
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_relation_check_rounds()
{
    using Sumcheck = sumcheck::SumcheckProver<Flavor>;
    Timer sc_construction_timer;
    auto sumcheck = Sumcheck(key->circuit_size, transcript);
    auto sc_construction_time = sc_construction_timer.nanoseconds() / 1000;

    Timer sc_prove_timer;
    sumcheck_output = sumcheck.prove(prover_polynomials, relation_parameters);
    auto sc_prove_time = sc_prove_timer.nanoseconds() / 1000;

    info("");
    info("sumcheck construction time: ", sc_construction_time);
    info("sumcheck proving time: ", sc_prove_time);
    info("");
}

/**
 * - Get rho challenge
 * - Compute d+1 Fold polynomials and their evaluations.
 *
 * */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_univariatization_round()
{
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    Timer univar_setup_timer;
    // Generate batching challenge ρ and powers 1,ρ,…,ρᵐ⁻¹
    FF rho = transcript.get_challenge("rho");
    std::vector<FF> rhos = pcs::gemini::powers_of_rho(rho, NUM_POLYNOMIALS);
    auto univar_setup_time = univar_setup_timer.nanoseconds() / 1000;

    Timer univar_batch_unshifted_timer;
    // Batch the unshifted polynomials and the to-be-shifted polynomials using ρ
    Polynomial batched_poly_unshifted(key->circuit_size); // batched unshifted polynomials
    size_t poly_idx = 0;                                  // TODO(#391) zip
    for (auto& unshifted_poly : prover_polynomials.get_unshifted()) {
        batched_poly_unshifted.add_scaled(unshifted_poly, rhos[poly_idx]);
        ++poly_idx;
    }
    auto univar_batch_unshifted_time = univar_batch_unshifted_timer.nanoseconds() / 1000;

    Timer univar_batch_shifted_timer;
    Polynomial batched_poly_to_be_shifted(key->circuit_size); // batched to-be-shifted polynomials
    for (auto& to_be_shifted_poly : prover_polynomials.get_to_be_shifted()) {
        batched_poly_to_be_shifted.add_scaled(to_be_shifted_poly, rhos[poly_idx]);
        ++poly_idx;
    };
    auto univar_batch_shifted_time = univar_batch_shifted_timer.nanoseconds() / 1000;

    Timer univar_compute_fold_polys_timer;
    // Compute d-1 polynomials Fold^(i), i = 1, ..., d-1.
    fold_polynomials = Gemini::compute_fold_polynomials(
        sumcheck_output.challenge_point, std::move(batched_poly_unshifted), std::move(batched_poly_to_be_shifted));
    auto univar_compute_fold_polys_time = univar_compute_fold_polys_timer.nanoseconds() / 1000;

    Timer univar_add_queue_timer;
    // Compute and add to trasnscript the commitments [Fold^(i)], i = 1, ..., d-1
    for (size_t l = 0; l < key->log_circuit_size - 1; ++l) {
        queue.add_commitment(fold_polynomials[l + 2], "Gemini:FOLD_" + std::to_string(l + 1));
    }
    auto univar_add_queue_time = univar_add_queue_timer.nanoseconds() / 1000;

    info("");
    info("univar setup time: ", univar_setup_time);
    info("univar batch unshifted time: ", univar_batch_unshifted_time);
    info("univar batch shifted time: ", univar_batch_shifted_time);
    info("univar compute fold polys time: ", univar_compute_fold_polys_time);
    info("univar add queue time: ", univar_add_queue_time);
    info("");
}

/**
 * - Do Fiat-Shamir to get "r" challenge
 * - Compute remaining two partially evaluated Fold polynomials Fold_{r}^(0) and Fold_{-r}^(0).
 * - Compute and aggregate opening pairs (challenge, evaluation) for each of d Fold polynomials.
 * - Add d-many Fold evaluations a_i, i = 0, ..., d-1 to the transcript, excluding eval of Fold_{r}^(0)
 * */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_pcs_evaluation_round()
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
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_shplonk_batched_quotient_round()
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
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_shplonk_partial_evaluation_round()
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
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_final_pcs_round()
{
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_output.opening_pair, shplonk_output.witness, transcript);
    // queue.add_commitment(quotient_W, "KZG:W");
}

template <UltraFlavor Flavor> plonk::proof& UltraProver_<Flavor>::export_proof()
{
    proof.proof_data = transcript.proof_data;
    return proof;
}

template <UltraFlavor Flavor> plonk::proof& UltraProver_<Flavor>::construct_proof()
{
    Timer total_timer;
    Timer first_half_timer;

    Timer preamble_timer;
    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();
    auto preamble_time = preamble_timer.nanoseconds() / 1000;

    Timer wire_coms_timer;
    // Compute first three wire commitments
    execute_wire_commitments_round();
    queue.process_queue();

    auto wire_coms_time = wire_coms_timer.nanoseconds() / 1000;
    Timer sorted_list_timer;
    // Compute sorted list accumulator and commitment
    execute_sorted_list_accumulator_round();
    queue.process_queue();

    auto sorted_list_time = sorted_list_timer.nanoseconds() / 1000;
    Timer grand_prod_timer;
    // Fiat-Shamir: beta & gamma
    // Compute grand product(s) and commitments.
    execute_grand_product_computation_round();
    queue.process_queue();
    auto grand_prod_time = grand_prod_timer.nanoseconds() / 1000;
    Timer rel_check_timer;

    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();
    auto rel_check_time = rel_check_timer.nanoseconds() / 1000;
    auto first_half_time = first_half_timer.nanoseconds() / 1000;

    Timer second_half_timer;
    Timer univar_timer;
    // Fiat-Shamir: rho
    // Compute Fold polynomials and their commitments.
    execute_univariatization_round();
    auto univar_time = univar_timer.nanoseconds() / 1000;
    Timer univar_queue_timer;
    queue.process_queue();
    auto univar_queue_time = univar_queue_timer.nanoseconds() / 1000;

    Timer pcs_eval_timer;
    // Fiat-Shamir: r
    // Compute Fold evaluations
    execute_pcs_evaluation_round();
    auto pcs_eval_time = pcs_eval_timer.nanoseconds() / 1000;

    Timer shplonk_timer;
    // Fiat-Shamir: nu
    // Compute Shplonk batched quotient commitment Q
    execute_shplonk_batched_quotient_round();
    queue.process_queue();
    auto shplonk_time = shplonk_timer.nanoseconds() / 1000;

    Timer shplonk_eval_timer;
    // Fiat-Shamir: z
    // Compute partial evaluation Q_z
    execute_shplonk_partial_evaluation_round();
    auto shplonk_eval_time = shplonk_eval_timer.nanoseconds() / 1000;
    Timer final_pcs_timer;
    // Fiat-Shamir: z
    // Compute PCS opening proof (either KZG quotient commitment or IPA opening proof)
    execute_final_pcs_round();
    auto final_pcs_time = final_pcs_timer.nanoseconds() / 1000;
    plonk::proof& exported_proof = export_proof();
    auto second_half_time = second_half_timer.nanoseconds() / 1000;
    auto total_time = total_timer.nanoseconds() / 1000;
    info("");
    info("first half time: ", first_half_time);
    info("second half time: ", second_half_time);
    info("preamble time: ", preamble_time);
    info("wire coms time: ", wire_coms_time);
    info("sorted list time: ", sorted_list_time);
    info("grand prod time: ", grand_prod_time);
    info("rel check time: ", rel_check_time);
    info("univar time: ", univar_time);
    info("univar queue time: ", univar_queue_time);
    info("pcs eval time: ", pcs_eval_time);
    info("shplonk quotient time: ", shplonk_time);
    info("shplonk eval time: ", shplonk_eval_time);
    info("final pcs time: ", final_pcs_time);
    info("total time: ", total_time);
    info("");
    return exported_proof;
}

template class UltraProver_<honk::flavor::Ultra>;
template class UltraProver_<honk::flavor::UltraGrumpkin>;
template class UltraProver_<honk::flavor::GoblinUltra>;

} // namespace proof_system::honk
