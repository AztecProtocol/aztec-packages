#include "ultra_prover.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

/**
 * Create UltraProver_ from an instance.
 *
 * @param instance Instance whose proof we want to generate.
 *
 * @tparam a type of UltraFlavor
 * */
template <IsUltraFlavor Flavor>
UltraProver_<Flavor>::UltraProver_(const std::shared_ptr<Instance>& inst,
                                   const std::shared_ptr<CommitmentKey>& commitment_key,
                                   const std::shared_ptr<Transcript>& transcript)
    : instance(std::move(inst))
    , transcript(transcript)
    , commitment_key(commitment_key)
{
    instance->initialize_prover_polynomials();
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
template <IsUltraFlavor Flavor> void UltraProver_<Flavor>::execute_preamble_round()
{
    auto proving_key = instance->proving_key;
    const auto circuit_size = static_cast<uint32_t>(proving_key->circuit_size);
    const auto num_public_inputs = static_cast<uint32_t>(proving_key->num_public_inputs);

    transcript->send_to_verifier("circuit_size", circuit_size);
    transcript->send_to_verifier("public_input_size", num_public_inputs);
    transcript->send_to_verifier("pub_inputs_offset", static_cast<uint32_t>(instance->pub_inputs_offset));

    for (size_t i = 0; i < proving_key->num_public_inputs; ++i) {
        auto public_input_i = instance->public_inputs[i];
        transcript->send_to_verifier("public_input_" + std::to_string(i), public_input_i);
    }
}

/**
 * @brief Commit to the wire polynomials (part of the witness), with the exception of the fourth wire, which is
 * only commited to after adding memory records. In the Goblin Flavor, we also commit to the ECC OP wires and the
 * DataBus columns.
 */
template <IsUltraFlavor Flavor> void UltraProver_<Flavor>::execute_wire_commitments_round()
{
    auto& witness_commitments = instance->witness_commitments;
    auto& proving_key = instance->proving_key;

    // Commit to the first three wire polynomials
    // We only commit to the fourth wire polynomial after adding memory recordss
    witness_commitments.w_l = commitment_key->commit(proving_key->w_l);
    witness_commitments.w_r = commitment_key->commit(proving_key->w_r);
    witness_commitments.w_o = commitment_key->commit(proving_key->w_o);

    auto wire_comms = witness_commitments.get_wires();
    auto labels = commitment_labels.get_wires();
    for (size_t idx = 0; idx < 3; ++idx) {
        transcript->send_to_verifier(labels[idx], wire_comms[idx]);
    }

    if constexpr (IsGoblinFlavor<Flavor>) {
        // Commit to Goblin ECC op wires
        witness_commitments.ecc_op_wire_1 = commitment_key->commit(proving_key->ecc_op_wire_1);
        witness_commitments.ecc_op_wire_2 = commitment_key->commit(proving_key->ecc_op_wire_2);
        witness_commitments.ecc_op_wire_3 = commitment_key->commit(proving_key->ecc_op_wire_3);
        witness_commitments.ecc_op_wire_4 = commitment_key->commit(proving_key->ecc_op_wire_4);

        auto op_wire_comms = instance->witness_commitments.get_ecc_op_wires();
        auto labels = commitment_labels.get_ecc_op_wires();
        for (size_t idx = 0; idx < Flavor::NUM_WIRES; ++idx) {
            transcript->send_to_verifier(labels[idx], op_wire_comms[idx]);
        }

        // Commit to DataBus columns
        witness_commitments.calldata = commitment_key->commit(proving_key->calldata);
        witness_commitments.calldata_read_counts = commitment_key->commit(proving_key->calldata_read_counts);
        transcript->send_to_verifier(commitment_labels.calldata, instance->witness_commitments.calldata);
        transcript->send_to_verifier(commitment_labels.calldata_read_counts,
                                     instance->witness_commitments.calldata_read_counts);
    }
}

/**
 * @brief Compute sorted witness-table accumulator and commit to the resulting polynomials.
 *
 */
template <IsUltraFlavor Flavor> void UltraProver_<Flavor>::execute_sorted_list_accumulator_round()
{
    FF eta = transcript->template get_challenge<FF>("eta");

    instance->compute_sorted_accumulator_polynomials(eta);

    auto& witness_commitments = instance->witness_commitments;
    // Commit to the sorted witness-table accumulator and the finalized (i.e. with memory records) fourth wire
    // polynomial
    witness_commitments.sorted_accum = commitment_key->commit(instance->prover_polynomials.sorted_accum);
    witness_commitments.w_4 = commitment_key->commit(instance->prover_polynomials.w_4);

    transcript->send_to_verifier(commitment_labels.sorted_accum, instance->witness_commitments.sorted_accum);
    transcript->send_to_verifier(commitment_labels.w_4, instance->witness_commitments.w_4);
}

/**
 * @brief Compute log derivative inverse polynomial and its commitment, if required
 *
 */
template <IsUltraFlavor Flavor> void UltraProver_<Flavor>::execute_log_derivative_inverse_round()
{
    // Compute and store challenges beta and gamma
    auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    if constexpr (IsGoblinFlavor<Flavor>) {
        instance->compute_logderivative_inverse(beta, gamma);
        instance->witness_commitments.lookup_inverses =
            commitment_key->commit(instance->prover_polynomials.lookup_inverses);
        transcript->send_to_verifier(commitment_labels.lookup_inverses, instance->witness_commitments.lookup_inverses);
    }
}

/**
 * @brief Compute permutation and lookup grand product polynomials and their commitments
 *
 */
template <IsUltraFlavor Flavor> void UltraProver_<Flavor>::execute_grand_product_computation_round()
{

    instance->compute_grand_product_polynomials(relation_parameters.beta, relation_parameters.gamma);

    auto& witness_commitments = instance->witness_commitments;
    witness_commitments.z_perm = commitment_key->commit(instance->prover_polynomials.z_perm);
    witness_commitments.z_lookup = commitment_key->commit(instance->prover_polynomials.z_lookup);
    transcript->send_to_verifier(commitment_labels.z_perm, instance->witness_commitments.z_perm);
    transcript->send_to_verifier(commitment_labels.z_lookup, instance->witness_commitments.z_lookup);
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
template <IsUltraFlavor Flavor> void UltraProver_<Flavor>::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor>;
    auto circuit_size = instance->proving_key->circuit_size;
    auto sumcheck = Sumcheck(circuit_size, transcript);
    RelationSeparator alphas;
    for (size_t idx = 0; idx < alphas.size(); idx++) {
        alphas[idx] = transcript->template get_challenge<FF>("Sumcheck:alpha_" + std::to_string(idx));
    }
    instance->alphas = alphas;
    std::vector<FF> gate_challenges(numeric::get_msb(circuit_size));
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }
    instance->gate_challenges = gate_challenges;
    sumcheck_output = sumcheck.prove(instance);
}

/**
 * @brief Execute the ZeroMorph protocol to prove the multilinear evaluations produced by Sumcheck
 * @details See https://hackmd.io/dlf9xEwhTQyE3hiGbq4FsA?view for a complete description of the unrolled protocol.
 *
 * */
template <IsUltraFlavor Flavor> void UltraProver_<Flavor>::execute_zeromorph_rounds()
{
    ZeroMorph::prove(instance->prover_polynomials.get_unshifted(),
                     instance->prover_polynomials.get_to_be_shifted(),
                     sumcheck_output.claimed_evaluations.get_unshifted(),
                     sumcheck_output.claimed_evaluations.get_shifted(),
                     sumcheck_output.challenge,
                     commitment_key,
                     transcript);
}

template <IsUltraFlavor Flavor> HonkProof& UltraProver_<Flavor>::export_proof()
{
    proof = transcript->proof_data;
    return proof;
}

template <IsUltraFlavor Flavor> HonkProof& UltraProver_<Flavor>::construct_proof()
{
    // Add circuit size public input size and public inputs to transcript->
    execute_preamble_round();

    // Compute first three wire commitments
    execute_wire_commitments_round();

    // Compute sorted list accumulator and commitment
    execute_sorted_list_accumulator_round();

    // Fiat-Shamir: beta & gamma
    execute_log_derivative_inverse_round();

    // Compute grand product(s) and commitments.
    execute_grand_product_computation_round();

    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho, y, x, z
    // Execute Zeromorph multilinear PCS
    execute_zeromorph_rounds();

    return export_proof();
}

template class UltraProver_<UltraFlavor>;
template class UltraProver_<GoblinUltraFlavor>;

} // namespace bb
