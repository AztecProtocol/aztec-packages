// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/ultra_honk/witness_computation.hpp"

namespace bb {

/**
 * @brief Oink Prover function that runs all the rounds of the verifier
 * @details Returns the witness commitments and relation_parameters
 * @tparam Flavor
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::prove()
{
    BB_BENCH_NAME("OinkProver::prove");
    if (!prover_instance->commitment_key.initialized()) {
        prover_instance->commitment_key = CommitmentKey(prover_instance->dyadic_size());
    }
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

    // Generate relation separators alphas for sumcheck/combiner computation
    prover_instance->alphas = generate_alphas_round();

    // #ifndef __wasm__
    // Free the commitment key
    prover_instance->commitment_key = CommitmentKey();
    // #endif

    prover_instance->is_complete = true;
}

/**
 * @brief Export the Oink proof
 */

template <IsUltraOrMegaHonk Flavor> typename OinkProver<Flavor>::Proof OinkProver<Flavor>::export_proof()
{
    return transcript->export_proof();
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_preamble_round()
{
    BB_BENCH_NAME("OinkProver::execute_preamble_round");
    fr vk_hash = honk_vk->hash_through_transcript(domain_separator, *transcript);
    transcript->add_to_hash_buffer(domain_separator + "vk_hash", vk_hash);
    vinfo("vk hash in Oink prover: ", vk_hash);

    for (size_t i = 0; i < prover_instance->num_public_inputs(); ++i) {
        auto public_input_i = prover_instance->public_inputs[i];
        transcript->send_to_verifier(domain_separator + "public_input_" + std::to_string(i), public_input_i);
    }
}

/**
 * @brief Commit to the wire polynomials (part of the witness), with the exception of the fourth wire, which is
 * only commited to after adding memory records. In the Goblin Flavor, we also commit to the ECC OP wires and the
 * DataBus columns.
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_wire_commitments_round()
{
    BB_BENCH_NAME("OinkProver::execute_wire_commitments_round");
    // Commit to the first three wire polynomials
    // We only commit to the fourth wire polynomial after adding memory recordss
    auto batch = prover_instance->commitment_key.start_batch();
    // Commit to the first three wire polynomials
    // We only commit to the fourth wire polynomial after adding memory records

    batch.add_to_batch(prover_instance->polynomials.w_l, commitment_labels.w_l, /*mask?*/ Flavor::HasZK);
    batch.add_to_batch(prover_instance->polynomials.w_r, commitment_labels.w_r, /*mask?*/ Flavor::HasZK);
    batch.add_to_batch(prover_instance->polynomials.w_o, commitment_labels.w_o, /*mask?*/ Flavor::HasZK);

    if constexpr (IsMegaFlavor<Flavor>) {

        // Commit to Goblin ECC op wires.
        // Note even with zk, we do not mask here. The masking for these is done differently.
        // It is necessary that "random" ops are added to the op_queue, which is then used to populate these ecc op
        // wires. This is more holistic and obviates the need to extend with random values.
        bool mask_ecc_op_polys = false; // Flavor::HasZK

        for (auto [polynomial, label] :
             zip_view(prover_instance->polynomials.get_ecc_op_wires(), commitment_labels.get_ecc_op_wires())) {
            {
                BB_BENCH_NAME("COMMIT::ecc_op_wires");
                batch.add_to_batch(polynomial, domain_separator + label, mask_ecc_op_polys);
            };
        }

        // Commit to DataBus related polynomials
        for (auto [polynomial, label] :
             zip_view(prover_instance->polynomials.get_databus_entities(), commitment_labels.get_databus_entities())) {
            {
                BB_BENCH_NAME("COMMIT::databus");
                batch.add_to_batch(polynomial, label, /*mask?*/ Flavor::HasZK);
            }
        }
    }
    batch.commit_and_send_to_verifier(transcript);
}

/**
 * @brief Compute sorted witness-table accumulator and commit to the resulting polynomials.
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_sorted_list_accumulator_round()
{
    BB_BENCH_NAME("OinkProver::execute_sorted_list_accumulator_round");
    // Get eta challenges
    auto [eta, eta_two, eta_three] = transcript->template get_challenges<FF>(
        domain_separator + "eta", domain_separator + "eta_two", domain_separator + "eta_three");
    prover_instance->relation_parameters.eta = eta;
    prover_instance->relation_parameters.eta_two = eta_two;
    prover_instance->relation_parameters.eta_three = eta_three;

    WitnessComputation<Flavor>::add_ram_rom_memory_records_to_wire_4(prover_instance->polynomials,
                                                                     prover_instance->memory_read_records,
                                                                     prover_instance->memory_write_records,
                                                                     eta,
                                                                     eta_two,
                                                                     eta_three);

    // Commit to lookup argument polynomials and the finalized (i.e. with memory records) fourth wire polynomial
    auto batch = prover_instance->commitment_key.start_batch();
    batch.add_to_batch(
        prover_instance->polynomials.lookup_read_counts, commitment_labels.lookup_read_counts, /*mask?*/ Flavor::HasZK);
    batch.add_to_batch(
        prover_instance->polynomials.lookup_read_tags, commitment_labels.lookup_read_tags, /*mask?*/ Flavor::HasZK);
    batch.add_to_batch(
        prover_instance->polynomials.w_4, domain_separator + commitment_labels.w_4, /*mask?*/ Flavor::HasZK);
    batch.commit_and_send_to_verifier(transcript);
}

/**
 * @brief Compute log derivative inverse polynomial and its commitment, if required
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_log_derivative_inverse_round()
{
    BB_BENCH_NAME("OinkProver::execute_log_derivative_inverse_round");
    auto [beta, gamma] = transcript->template get_challenges<FF>(domain_separator + "beta", domain_separator + "gamma");
    prover_instance->relation_parameters.beta = beta;
    prover_instance->relation_parameters.gamma = gamma;

    // Compute the inverses used in log-derivative lookup relations
    WitnessComputation<Flavor>::compute_logderivative_inverses(
        prover_instance->polynomials, prover_instance->dyadic_size(), prover_instance->relation_parameters);

    auto batch = prover_instance->commitment_key.start_batch();
    batch.add_to_batch(prover_instance->polynomials.lookup_inverses,
                       commitment_labels.lookup_inverses,
                       /*mask?*/ Flavor::HasZK);

    // If Mega, commit to the databus inverse polynomials and send
    if constexpr (IsMegaFlavor<Flavor>) {
        for (auto [polynomial, label] :
             zip_view(prover_instance->polynomials.get_databus_inverses(), commitment_labels.get_databus_inverses())) {
            batch.add_to_batch(polynomial, label, /*mask?*/ Flavor::HasZK);
        };
    }
    batch.commit_and_send_to_verifier(transcript);
}

/**
 * @brief Compute permutation and lookup grand product polynomials and their commitments
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_grand_product_computation_round()
{
    BB_BENCH_NAME("OinkProver::execute_grand_product_computation_round");
    // Compute the permutation grand product polynomial

    WitnessComputation<Flavor>::compute_grand_product_polynomial(prover_instance->polynomials,
                                                                 prover_instance->public_inputs,
                                                                 prover_instance->pub_inputs_offset(),
                                                                 prover_instance->active_region_data,
                                                                 prover_instance->relation_parameters,
                                                                 prover_instance->get_final_active_wire_idx() + 1);

    {
        BB_BENCH_NAME("COMMIT::z_perm");
        auto commit_type = (prover_instance->get_is_structured())
                               ? CommitmentKey::CommitType::StructuredNonZeroComplement
                               : CommitmentKey::CommitType::Default;
        commit_to_witness_polynomial(prover_instance->polynomials.z_perm, commitment_labels.z_perm, commit_type);
    }
}

template <IsUltraOrMegaHonk Flavor> typename Flavor::SubrelationSeparators OinkProver<Flavor>::generate_alphas_round()
{
    BB_BENCH_NAME("OinkProver::generate_alphas_round");

    // Get the relation separation challenges for sumcheck/combiner computation
    std::array<std::string, Flavor::NUM_SUBRELATIONS - 1> challenge_labels;

    for (size_t idx = 0; idx < Flavor::NUM_SUBRELATIONS - 1; ++idx) {
        challenge_labels[idx] = domain_separator + "alpha_" + std::to_string(idx);
    }
    // It is more efficient to generate an array of challenges than to generate them individually.
    SubrelationSeparators alphas = transcript->template get_challenges<FF>(challenge_labels);

    return alphas;
}

/**
 * @brief A uniform method to mask, commit, and send the corresponding commitment to the verifier.
 *
 * @param polynomial
 * @param label
 * @param type
 */
template <IsUltraOrMegaHonk Flavor>
void OinkProver<Flavor>::commit_to_witness_polynomial(Polynomial<FF>& polynomial,
                                                      const std::string& label,
                                                      const CommitmentKey::CommitType type)
{
    BB_BENCH_NAME("OinkProver::commit_to_witness_polynomial");
    // Mask the polynomial when proving in zero-knowledge
    if constexpr (Flavor::HasZK) {
        polynomial.mask();
    };

    typename Flavor::Commitment commitment;

    commitment = prover_instance->commitment_key.commit_with_type(
        polynomial, type, prover_instance->active_region_data.get_ranges());
    // Send the commitment to the verifier
    transcript->send_to_verifier(domain_separator + label, commitment);
}

template class OinkProver<UltraFlavor>;
template class OinkProver<UltraZKFlavor>;
template class OinkProver<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class OinkProver<UltraStarknetFlavor>;
template class OinkProver<UltraStarknetZKFlavor>;
#endif
template class OinkProver<UltraKeccakZKFlavor>;
template class OinkProver<UltraRollupFlavor>;
template class OinkProver<MegaFlavor>;
template class OinkProver<MegaZKFlavor>;

} // namespace bb
