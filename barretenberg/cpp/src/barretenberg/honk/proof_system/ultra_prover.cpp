#include "ultra_prover.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/honk/utils/power_polynomial.hpp"

namespace proof_system::honk {

/**
 * Create UltraProver_ from an instance.
 *
 * @param instance Instance whose proof we want to generate.
 *
 * @tparam a type of UltraFlavor
 * */
template <UltraFlavor Flavor>
UltraProver_<Flavor>::UltraProver_(std::shared_ptr<Instance> inst)
    : queue(inst->commitment_key, transcript)
    , instance(std::move(inst))
    , pcs_commitment_key(instance->commitment_key)
{
    instance->initialise_prover_polynomials();
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_preamble_round()
{
    auto proving_key = instance->proving_key;
    const auto circuit_size = static_cast<uint32_t>(proving_key->circuit_size);
    const auto num_public_inputs = static_cast<uint32_t>(proving_key->num_public_inputs);

    transcript.send_to_verifier("circuit_size", circuit_size);
    transcript.send_to_verifier("public_input_size", num_public_inputs);
    transcript.send_to_verifier("pub_inputs_offset", static_cast<uint32_t>(instance->pub_inputs_offset));

    for (size_t i = 0; i < proving_key->num_public_inputs; ++i) {
        auto public_input_i = instance->public_inputs[i];
        transcript.send_to_verifier("public_input_" + std::to_string(i), public_input_i);
    }
}

/**
 * @brief Compute commitments to the first three wire polynomials (and ECC op wires if using Goblin).
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_wire_commitments_round()
{
    // Commit to the first three wire polynomials
    // We only commit to the fourth wire polynomial after adding memory records
    auto wire_polys = instance->proving_key->get_wires();
    auto labels = commitment_labels.get_wires();
    for (size_t idx = 0; idx < 3; ++idx) {
        queue.add_commitment(wire_polys[idx], labels[idx]);
    }

    if constexpr (IsGoblinFlavor<Flavor>) {
        auto op_wire_polys = instance->proving_key->get_ecc_op_wires();
        auto labels = commitment_labels.get_ecc_op_wires();
        for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
            queue.add_commitment(op_wire_polys[idx], labels[idx]);
        }
    }
}

/**
 * @brief Compute sorted witness-table accumulator and commit to the resulting polynomials.
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_sorted_list_accumulator_round()
{
    auto eta = transcript.get_challenge("eta");

    instance->compute_sorted_accumulator_polynomials(eta);

    // Commit to the sorted withness-table accumulator and the finalised (i.e. with memory records) fourth wire
    // polynomial
    queue.add_commitment(instance->proving_key->sorted_accum, commitment_labels.sorted_accum);
    queue.add_commitment(instance->proving_key->w_4, commitment_labels.w_4);
}

/**
 * @brief Compute permutation and lookup grand product polynomials and their commitments
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_grand_product_computation_round()
{
    // Compute and store parameters required by relations in Sumcheck
    auto [beta, gamma] = transcript.get_challenges("beta", "gamma");

    instance->compute_grand_product_polynomials(beta, gamma);

    queue.add_commitment(instance->proving_key->z_perm, commitment_labels.z_perm);
    queue.add_commitment(instance->proving_key->z_lookup, commitment_labels.z_lookup);
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_relation_check_rounds()
{
    using Sumcheck = sumcheck::SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(instance->proving_key->circuit_size, transcript);

    sumcheck_output = sumcheck.prove(instance->prover_polynomials, instance->relation_parameters);
}

/**
 * - Get rho challenge
 * - Compute d+1 Fold polynomials and their evaluations.
 *
 * */
template <UltraFlavor Flavor> void UltraProver_<Flavor>::execute_zeromorph_rounds()
{
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    const size_t circuit_size = instance->proving_key->circuit_size;

    // Generate batching challenge ρ and powers 1,ρ,…,ρᵐ⁻¹
    FF rho = transcript.get_challenge("rho");
    std::vector<FF> rhos = pcs::zeromorph::powers_of_challenge(rho, NUM_POLYNOMIALS);

    // Extract challenge u and claimed multilinear evaluations from Sumcheck output
    std::span<FF> u_challenge = sumcheck_output.challenge;
    std::span<FF> claimed_evaluations = sumcheck_output.claimed_evaluations;
    size_t log_N = u_challenge.size();

    // Compute batching of f_i and g_i polynomials: sum_{i=0}^{m-1}\alpha^i*f_i and
    // sum_{i=0}^{l-1}\alpha^{m+i}*h_i, and also batched evaluation v = sum_{i=0}^{m-1}\alpha^i*f_i(u) +
    // sum_{i=0}^{l-1}\alpha^{m+i}*h_i(u).
    auto batched_evaluation = FF(0);
    Polynomial f_batched(circuit_size); // batched unshifted polynomials
    size_t poly_idx = 0;                // TODO(#391) zip
    for (auto& f_polynomial : instance->prover_polynomials.get_unshifted()) {
        f_batched.add_scaled(f_polynomial, rhos[poly_idx]);
        batched_evaluation += rhos[poly_idx] * claimed_evaluations[poly_idx];
        ++poly_idx;
    }

    Polynomial g_batched(circuit_size); // batched to-be-shifted polynomials
    for (auto& g_polynomial : instance->prover_polynomials.get_to_be_shifted()) {
        g_batched.add_scaled(g_polynomial, rhos[poly_idx]);
        batched_evaluation += rhos[poly_idx] * claimed_evaluations[poly_idx];
        ++poly_idx;
    };

    // The new f is f_batched + g_batched.shifted() = f_batched + h_batched
    auto f_polynomial = f_batched;
    f_polynomial += g_batched.shifted();

    // Compute the multilinear quotients q_k = q_k(X_0, ..., X_{k-1})
    auto quotients = ZeroMorph::compute_multilinear_quotients(f_polynomial, u_challenge);

    // Compute and send commitments C_{q_k} = [q_k], k = 0,...,d-1
    std::vector<Commitment> q_k_commitments;
    q_k_commitments.reserve(log_N);
    for (size_t idx = 0; idx < log_N; ++idx) {
        q_k_commitments[idx] = pcs_commitment_key->commit(quotients[idx]);
        std::string label = "ZM:C_q_" + std::to_string(idx);
        transcript.send_to_verifier(label, q_k_commitments[idx]);
    }

    // Get challenge y
    auto y_challenge = transcript.get_challenge("ZM:y");

    // Compute the batched, lifted-degree quotient \hat{q}
    auto batched_quotient = ZeroMorph::compute_batched_lifted_degree_quotient(quotients, y_challenge, circuit_size);

    // Compute and send the commitment C_q = [\hat{q}]
    auto q_commitment = pcs_commitment_key->commit(batched_quotient);
    transcript.send_to_verifier("ZM:C_q", q_commitment);

    // Get challenges x and z
    auto [x_challenge, z_challenge] = transcript.get_challenges("ZM:x", "ZM:z");

    // Compute degree check polynomial \zeta partially evaluated at x
    auto zeta_x = ZeroMorph::compute_partially_evaluated_degree_check_polynomial(
        batched_quotient, quotients, y_challenge, x_challenge);

    // Compute ZeroMorph identity polynomial Z partially evaluated at x
    auto Z_x = ZeroMorph::compute_partially_evaluated_zeromorph_identity_polynomial(
        f_batched, g_batched, quotients, batched_evaluation, u_challenge, x_challenge);

    // Compute batched degree and ZM-identity quotient polynomial pi
    auto pi_polynomial =
        ZeroMorph::compute_batched_evaluation_and_degree_check_quotient(zeta_x, Z_x, x_challenge, z_challenge);

    // Compute and send proof commitment pi
    auto pi_commitment = pcs_commitment_key->commit(pi_polynomial);
    transcript.send_to_verifier("ZM:PI", pi_commitment);
}

template <UltraFlavor Flavor> plonk::proof& UltraProver_<Flavor>::export_proof()
{
    proof.proof_data = transcript.proof_data;
    return proof;
}

template <UltraFlavor Flavor> plonk::proof& UltraProver_<Flavor>::construct_proof()
{
    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();

    // Compute first three wire commitments
    execute_wire_commitments_round();
    queue.process_queue();

    // Compute sorted list accumulator and commitment
    execute_sorted_list_accumulator_round();
    queue.process_queue();

    // Fiat-Shamir: beta & gamma
    // Compute grand product(s) and commitments.
    execute_grand_product_computation_round();
    queue.process_queue();

    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho, y, x, z
    // Execute Zeromorph multilinear PCS
    execute_zeromorph_rounds();

    return export_proof();
}

template class UltraProver_<honk::flavor::Ultra>;
template class UltraProver_<honk::flavor::UltraGrumpkin>;
template class UltraProver_<honk::flavor::GoblinUltra>;

} // namespace proof_system::honk
