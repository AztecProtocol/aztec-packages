// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/honk/proving_key_inspector.hpp"
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
    if (!proving_key->proving_key.commitment_key.initialized()) {
        proving_key->proving_key.commitment_key = CommitmentKey(proving_key->proving_key.circuit_size);
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

    // #ifndef __wasm__
    // Free the commitment key
    proving_key->proving_key.commitment_key = CommitmentKey();
    // #endif
}

/**
 * @brief Export the Oink proof
 */

template <IsUltraOrMegaHonk Flavor> HonkProof OinkProver<Flavor>::export_proof()
{
    return transcript->export_proof();
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_preamble_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_preamble_round");
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1427): Add VK FS to solidity verifier.
    if constexpr (!IsAnyOf<Flavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
        std::vector<FF> vkey_fields = honk_vk->to_field_elements();
        for (const FF& vkey_field : vkey_fields) {
            transcript->add_to_hash_buffer(domain_separator + "vkey_field", vkey_field);
        }
        auto [vkey_hash] = transcript->template get_challenges<FF>(domain_separator + "vkey_hash");
        vinfo("vkey hash in Oink prover: ", vkey_hash);
    } else {
        const auto circuit_size = static_cast<uint32_t>(proving_key->proving_key.circuit_size);
        const auto num_public_inputs = static_cast<uint32_t>(proving_key->proving_key.num_public_inputs);
        const auto pub_inputs_offset = static_cast<uint32_t>(proving_key->proving_key.pub_inputs_offset);

        transcript->add_to_hash_buffer(domain_separator + "circuit_size", circuit_size);
        transcript->add_to_hash_buffer(domain_separator + "public_input_size", num_public_inputs);
        transcript->add_to_hash_buffer(domain_separator + "pub_inputs_offset", pub_inputs_offset);
    }
    BB_ASSERT_EQ(proving_key->proving_key.num_public_inputs, proving_key->proving_key.public_inputs.size());

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
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_wire_commitments_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_wire_commitments_round");
    // Commit to the first three wire polynomials
    // We only commit to the fourth wire polynomial after adding memory recordss
    {
        PROFILE_THIS_NAME("COMMIT::wires");
        auto commit_type = (proving_key->get_is_structured()) ? CommitmentKey::CommitType::Structured
                                                              : CommitmentKey::CommitType::Default;

        commit_to_witness_polynomial(proving_key->proving_key.polynomials.w_l, commitment_labels.w_l, commit_type);
        commit_to_witness_polynomial(proving_key->proving_key.polynomials.w_r, commitment_labels.w_r, commit_type);
        commit_to_witness_polynomial(proving_key->proving_key.polynomials.w_o, commitment_labels.w_o, commit_type);
    }

    if constexpr (IsMegaFlavor<Flavor>) {

        // Commit to Goblin ECC op wires.
        // To avoid possible issues with the current work on the merge protocol, they are not
        // masked in MegaZKFlavor
        for (auto [polynomial, label] :
             zip_view(proving_key->proving_key.polynomials.get_ecc_op_wires(), commitment_labels.get_ecc_op_wires())) {
            {
                PROFILE_THIS_NAME("COMMIT::ecc_op_wires");
                transcript->send_to_verifier(domain_separator + label,
                                             proving_key->proving_key.commitment_key.commit(polynomial));
            };
        }

        // Commit to DataBus related polynomials
        for (auto [polynomial, label] : zip_view(proving_key->proving_key.polynomials.get_databus_entities(),
                                                 commitment_labels.get_databus_entities())) {
            {
                PROFILE_THIS_NAME("COMMIT::databus");
                commit_to_witness_polynomial(polynomial, label);
            }
        }
    }
}

/**
 * @brief Compute sorted witness-table accumulator and commit to the resulting polynomials.
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_sorted_list_accumulator_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_sorted_list_accumulator_round");
    // Get eta challenges
    auto [eta, eta_two, eta_three] = transcript->template get_challenges<FF>(
        domain_separator + "eta", domain_separator + "eta_two", domain_separator + "eta_three");
    proving_key->relation_parameters.eta = eta;
    proving_key->relation_parameters.eta_two = eta_two;
    proving_key->relation_parameters.eta_three = eta_three;

    WitnessComputation<Flavor>::add_ram_rom_memory_records_to_wire_4(proving_key->proving_key, eta, eta_two, eta_three);

    // Commit to lookup argument polynomials and the finalized (i.e. with memory records) fourth wire polynomial
    {
        PROFILE_THIS_NAME("COMMIT::lookup_counts_tags");
        commit_to_witness_polynomial(proving_key->proving_key.polynomials.lookup_read_counts,
                                     commitment_labels.lookup_read_counts,
                                     CommitmentKey::CommitType::Sparse);

        commit_to_witness_polynomial(proving_key->proving_key.polynomials.lookup_read_tags,
                                     commitment_labels.lookup_read_tags,
                                     CommitmentKey::CommitType::Sparse);
    }
    {
        PROFILE_THIS_NAME("COMMIT::wires");
        auto commit_type = (proving_key->get_is_structured()) ? CommitmentKey::CommitType::Structured
                                                              : CommitmentKey::CommitType::Default;
        commit_to_witness_polynomial(
            proving_key->proving_key.polynomials.w_4, domain_separator + commitment_labels.w_4, commit_type);
    }
}

/**
 * @brief Compute log derivative inverse polynomial and its commitment, if required
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_log_derivative_inverse_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_log_derivative_inverse_round");
    auto [beta, gamma] = transcript->template get_challenges<FF>(domain_separator + "beta", domain_separator + "gamma");
    proving_key->relation_parameters.beta = beta;
    proving_key->relation_parameters.gamma = gamma;

    // Compute the inverses used in log-derivative lookup relations
    WitnessComputation<Flavor>::compute_logderivative_inverses(proving_key->proving_key,
                                                               proving_key->relation_parameters);

    {
        PROFILE_THIS_NAME("COMMIT::lookup_inverses");
        commit_to_witness_polynomial(proving_key->proving_key.polynomials.lookup_inverses,
                                     commitment_labels.lookup_inverses,
                                     CommitmentKey::CommitType::Sparse);
    }

    // If Mega, commit to the databus inverse polynomials and send
    if constexpr (IsMegaFlavor<Flavor>) {
        for (auto [polynomial, label] : zip_view(proving_key->proving_key.polynomials.get_databus_inverses(),
                                                 commitment_labels.get_databus_inverses())) {
            {
                PROFILE_THIS_NAME("COMMIT::databus_inverses");
                commit_to_witness_polynomial(polynomial, label, CommitmentKey::CommitType::Sparse);
            }
        };
    }
}

/**
 * @brief Compute permutation and lookup grand product polynomials and their commitments
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_grand_product_computation_round()
{
    PROFILE_THIS_NAME("OinkProver::execute_grand_product_computation_round");
    // Compute the permutation grand product polynomial

    WitnessComputation<Flavor>::compute_grand_product_polynomial(
        proving_key->proving_key, proving_key->relation_parameters, proving_key->final_active_wire_idx + 1);

    {
        PROFILE_THIS_NAME("COMMIT::z_perm");
        auto commit_type = (proving_key->get_is_structured()) ? CommitmentKey::CommitType::StructuredNonZeroComplement
                                                              : CommitmentKey::CommitType::Default;
        commit_to_witness_polynomial(
            proving_key->proving_key.polynomials.z_perm, commitment_labels.z_perm, commit_type);
    }
}

template <IsUltraOrMegaHonk Flavor> typename Flavor::RelationSeparator OinkProver<Flavor>::generate_alphas_round()
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
    // Mask the polynomial when proving in zero-knowledge
    if constexpr (Flavor::HasZK) {
        polynomial.mask();
    };

    typename Flavor::Commitment commitment;

    commitment = proving_key->proving_key.commitment_key.commit_with_type(
        polynomial, type, proving_key->proving_key.active_region_data.get_ranges());
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
