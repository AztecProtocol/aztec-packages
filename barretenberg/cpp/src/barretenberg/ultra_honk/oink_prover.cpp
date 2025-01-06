#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/plonk_honk_shared/proving_key_inspector.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"

namespace bb {

/**
 * @brief Oink Prover function that runs all the rounds of the verifier
 * @details Returns the witness commitments and relation_parameters
 * @tparam Flavor
 * @return OinkProverOutput<Flavor>
 */
template <IsUltraFlavor Flavor> void OinkProver<Flavor>::prove()
{
    if (proving_key->proving_key.commitment_key == nullptr) {
        proving_key->proving_key.commitment_key =
            std::make_shared<CommitmentKey>(proving_key->proving_key.circuit_size);
    }
    {

        PROFILE_THIS_NAME("execute_preamble_round");

        // Add circuit size public input size and public inputs to transcript->
        execute_preamble_round();
    }
    {

        PROFILE_THIS_NAME("execute_wire_commitments_round");

        // Compute first three wire commitments
        execute_wire_commitments_round();
    }
    {

        PROFILE_THIS_NAME("execute_sorted_list_accumulator_round");

        // Compute sorted list accumulator and commitment
        execute_sorted_list_accumulator_round();
    }

    {

        PROFILE_THIS_NAME("execute_log_derivative_inverse_round");

        // Fiat-Shamir: beta & gamma
        execute_log_derivative_inverse_round();
    }

    {

        PROFILE_THIS_NAME("execute_grand_product_computation_round");

        // Compute grand product(s) and commitments.
        execute_grand_product_computation_round();
    }

    // Generate relation separators alphas for sumcheck/combiner computation
    proving_key->alphas = generate_alphas_round();

#ifndef __wasm__
    // Free the commitment key
    proving_key->proving_key.commitment_key = nullptr;
#endif
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
template <IsUltraFlavor Flavor> void OinkProver<Flavor>::execute_preamble_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_preamble_round");
    const auto circuit_size = static_cast<uint32_t>(proving_key->proving_key.circuit_size);
    const auto num_public_inputs = static_cast<uint32_t>(proving_key->proving_key.num_public_inputs);
    transcript->send_to_verifier(domain_separator + "circuit_size", circuit_size);
    transcript->send_to_verifier(domain_separator + "public_input_size", num_public_inputs);
    transcript->send_to_verifier(domain_separator + "pub_inputs_offset",
                                 static_cast<uint32_t>(proving_key->proving_key.pub_inputs_offset));

    ASSERT(proving_key->proving_key.num_public_inputs == proving_key->proving_key.public_inputs.size());

    for (size_t i = 0; i < proving_key->proving_key.num_public_inputs; ++i) {
        auto public_input_i = proving_key->proving_key.public_inputs[i];
        transcript->send_to_verifier(domain_separator + "public_input_" + std::to_string(i), public_input_i);
    }
}

/**
 * @brief Commit to the wire polynomials (part of the witness), with the exception of the fourth wire, which is
 * only commited to after adding memory records. In the Goblin Flavor, we also commit to the ECC OP wires and the
 * DataBus columns.
 */
template <IsUltraFlavor Flavor> void OinkProver<Flavor>::execute_wire_commitments_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_wire_commitments_round");
    // Commit to the first three wire polynomials
    // We only commit to the fourth wire polynomial after adding memory recordss
    {
        PROFILE_THIS_NAME("COMMIT::wires");
        if (IsMegaFlavor<Flavor> && proving_key->get_is_structured()) {
            witness_commitments.w_l = proving_key->proving_key.commitment_key->commit_structured(
                proving_key->proving_key.polynomials.w_l, proving_key->proving_key.active_region_data.ranges);
            witness_commitments.w_r = proving_key->proving_key.commitment_key->commit_structured(
                proving_key->proving_key.polynomials.w_r, proving_key->proving_key.active_region_data.ranges);
            witness_commitments.w_o = proving_key->proving_key.commitment_key->commit_structured(
                proving_key->proving_key.polynomials.w_o, proving_key->proving_key.active_region_data.ranges);
        } else {
            witness_commitments.w_l =
                proving_key->proving_key.commitment_key->commit(proving_key->proving_key.polynomials.w_l);
            witness_commitments.w_r =
                proving_key->proving_key.commitment_key->commit(proving_key->proving_key.polynomials.w_r);
            witness_commitments.w_o =
                proving_key->proving_key.commitment_key->commit(proving_key->proving_key.polynomials.w_o);
        }
    }

    auto wire_comms = witness_commitments.get_wires();
    auto wire_labels = commitment_labels.get_wires();
    for (size_t idx = 0; idx < 3; ++idx) {
        transcript->send_to_verifier(domain_separator + wire_labels[idx], wire_comms[idx]);
    }

    if constexpr (IsMegaFlavor<Flavor>) {

        // Commit to Goblin ECC op wires
        for (auto [commitment, polynomial, label] : zip_view(witness_commitments.get_ecc_op_wires(),
                                                             proving_key->proving_key.polynomials.get_ecc_op_wires(),
                                                             commitment_labels.get_ecc_op_wires())) {
            {
                PROFILE_THIS_NAME("COMMIT::ecc_op_wires");
                commitment = proving_key->proving_key.commitment_key->commit(polynomial);
            }
            transcript->send_to_verifier(domain_separator + label, commitment);
        }

        // Commit to DataBus related polynomials
        for (auto [commitment, polynomial, label] :
             zip_view(witness_commitments.get_databus_entities(),
                      proving_key->proving_key.polynomials.get_databus_entities(),
                      commitment_labels.get_databus_entities())) {
            {
                PROFILE_THIS_NAME("COMMIT::databus");
                commitment = proving_key->proving_key.commitment_key->commit(polynomial);
            }
            transcript->send_to_verifier(domain_separator + label, commitment);
        }
    }
}

/**
 * @brief Compute sorted witness-table accumulator and commit to the resulting polynomials.
 *
 */
template <IsUltraFlavor Flavor> void OinkProver<Flavor>::execute_sorted_list_accumulator_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_sorted_list_accumulator_round");
    // Get eta challenges
    auto [eta, eta_two, eta_three] = transcript->template get_challenges<FF>(
        domain_separator + "eta", domain_separator + "eta_two", domain_separator + "eta_three");
    proving_key->relation_parameters.eta = eta;
    proving_key->relation_parameters.eta_two = eta_two;
    proving_key->relation_parameters.eta_three = eta_three;

    proving_key->proving_key.add_ram_rom_memory_records_to_wire_4(eta, eta_two, eta_three);

    // Commit to lookup argument polynomials and the finalized (i.e. with memory records) fourth wire polynomial
    {
        PROFILE_THIS_NAME("COMMIT::lookup_counts_tags");
        witness_commitments.lookup_read_counts =
            proving_key->proving_key.commitment_key->commit(proving_key->proving_key.polynomials.lookup_read_counts);
        witness_commitments.lookup_read_tags =
            proving_key->proving_key.commitment_key->commit(proving_key->proving_key.polynomials.lookup_read_tags);
    }
    {
        PROFILE_THIS_NAME("COMMIT::wires");
        if (proving_key->get_is_structured()) {
            witness_commitments.w_4 = proving_key->proving_key.commitment_key->commit_structured(
                proving_key->proving_key.polynomials.w_4, proving_key->proving_key.active_region_data.ranges);
        } else {
            witness_commitments.w_4 =
                proving_key->proving_key.commitment_key->commit(proving_key->proving_key.polynomials.w_4);
        }
    }

    transcript->send_to_verifier(domain_separator + commitment_labels.lookup_read_counts,
                                 witness_commitments.lookup_read_counts);
    transcript->send_to_verifier(domain_separator + commitment_labels.lookup_read_tags,
                                 witness_commitments.lookup_read_tags);
    transcript->send_to_verifier(domain_separator + commitment_labels.w_4, witness_commitments.w_4);
}

/**
 * @brief Compute log derivative inverse polynomial and its commitment, if required
 *
 */
template <IsUltraFlavor Flavor> void OinkProver<Flavor>::execute_log_derivative_inverse_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_log_derivative_inverse_round");
    auto [beta, gamma] = transcript->template get_challenges<FF>(domain_separator + "beta", domain_separator + "gamma");
    proving_key->relation_parameters.beta = beta;
    proving_key->relation_parameters.gamma = gamma;

    // Compute the inverses used in log-derivative lookup relations
    proving_key->proving_key.compute_logderivative_inverses(proving_key->relation_parameters);

    {
        PROFILE_THIS_NAME("COMMIT::lookup_inverses");
        witness_commitments.lookup_inverses = proving_key->proving_key.commitment_key->commit_sparse(
            proving_key->proving_key.polynomials.lookup_inverses);
    }
    transcript->send_to_verifier(domain_separator + commitment_labels.lookup_inverses,
                                 witness_commitments.lookup_inverses);

    // If Mega, commit to the databus inverse polynomials and send
    if constexpr (IsMegaFlavor<Flavor>) {
        for (auto [commitment, polynomial, label] :
             zip_view(witness_commitments.get_databus_inverses(),
                      proving_key->proving_key.polynomials.get_databus_inverses(),
                      commitment_labels.get_databus_inverses())) {
            {
                PROFILE_THIS_NAME("COMMIT::databus_inverses");
                commitment = proving_key->proving_key.commitment_key->commit_sparse(polynomial);
            }
            transcript->send_to_verifier(domain_separator + label, commitment);
        }
    }
}

/**
 * @brief Compute permutation and lookup grand product polynomials and their commitments
 *
 */
template <IsUltraFlavor Flavor> void OinkProver<Flavor>::execute_grand_product_computation_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_grand_product_computation_round");
    // Compute the permutation grand product polynomial

    proving_key->proving_key.compute_grand_product_polynomial(proving_key->relation_parameters,
                                                              proving_key->final_active_wire_idx + 1);

    {
        PROFILE_THIS_NAME("COMMIT::z_perm");
        if (proving_key->get_is_structured()) {
            witness_commitments.z_perm =
                proving_key->proving_key.commitment_key->commit_structured_with_nonzero_complement(
                    proving_key->proving_key.polynomials.z_perm,
                    proving_key->proving_key.active_region_data.ranges,
                    proving_key->final_active_wire_idx + 1);
        } else {
            witness_commitments.z_perm =
                proving_key->proving_key.commitment_key->commit(proving_key->proving_key.polynomials.z_perm);
        }
    }
    transcript->send_to_verifier(domain_separator + commitment_labels.z_perm, witness_commitments.z_perm);
}

template <IsUltraFlavor Flavor> typename Flavor::RelationSeparator OinkProver<Flavor>::generate_alphas_round()
{
    PROFILE_THIS_NAME("OinkProver::generate_alphas_round");
    RelationSeparator alphas;
    std::array<std::string, Flavor::NUM_SUBRELATIONS - 1> args;
    for (size_t idx = 0; idx < alphas.size(); ++idx) {
        args[idx] = domain_separator + "alpha_" + std::to_string(idx);
    }
    alphas = transcript->template get_challenges<FF>(args);
    return alphas;
}

template class OinkProver<UltraFlavor>;
template class OinkProver<UltraKeccakFlavor>;
template class OinkProver<UltraRollupFlavor>;
template class OinkProver<MegaFlavor>;
template class OinkProver<MegaZKFlavor>;

} // namespace bb