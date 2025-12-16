// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_zk_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"

namespace bb {

/**
 * @brief Oink Verifier function that runs all the rounds of the verifier
 * @details Returns the witness commitments and relation_parameters. If used as a standalone function, the proof
 * returned by the OinkProver must be loaded into the transcript of the OinkVerifier before calling
 * OinkVerifier::verify()
 * @tparam Flavor
 * @return OinkOutput<Flavor>
 */
template <IsUltraOrMegaHonk Flavor> void OinkVerifier<Flavor>::verify()
{
    // Execute the Verifier rounds
    execute_preamble_round();
    execute_wire_commitments_round();
    execute_sorted_list_accumulator_round();
    execute_log_derivative_inverse_round();
    execute_grand_product_computation_round();

    verifier_instance->witness_commitments = witness_comms;
    verifier_instance->relation_parameters = relation_parameters;
    verifier_instance->alphas = generate_alphas_round();
    verifier_instance->is_complete = true; // instance has been completely populated
}

/**
 * @brief Get circuit size, public input size, and public inputs from transcript
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkVerifier<Flavor>::execute_preamble_round()
{
    FF vk_hash = verifier_instance->vk->hash_through_transcript(domain_separator, *transcript);
    transcript->add_to_hash_buffer(domain_separator + "vk_hash", vk_hash);
    vinfo("vk hash in Oink verifier: ", vk_hash);

    std::vector<FF> public_inputs;
    for (size_t i = 0; i < verifier_instance->vk->num_public_inputs; ++i) {
        auto public_input_i =
            transcript->template receive_from_prover<FF>(domain_separator + "public_input_" + std::to_string(i));
        public_inputs.emplace_back(public_input_i);
    }
    verifier_instance->public_inputs = std::move(public_inputs);
}

/**
 * @brief Get the wire polynomials (part of the witness), with the exception of the fourth wire, which is
 * only received after adding memory records. In the Goblin Flavor, we also receive the ECC OP wires and the
 * DataBus columns.
 */
template <IsUltraOrMegaHonk Flavor> void OinkVerifier<Flavor>::execute_wire_commitments_round()
{
    // Get commitments to first three wire polynomials
    witness_comms.w_l = transcript->template receive_from_prover<Commitment>(domain_separator + comm_labels.w_l);
    witness_comms.w_r = transcript->template receive_from_prover<Commitment>(domain_separator + comm_labels.w_r);
    witness_comms.w_o = transcript->template receive_from_prover<Commitment>(domain_separator + comm_labels.w_o);

    // If Goblin, get commitments to ECC op wire polynomials and DataBus columns
    if constexpr (IsMegaFlavor<Flavor>) {
        // Receive ECC op wire commitments
        for (auto [commitment, label] : zip_view(witness_comms.get_ecc_op_wires(), comm_labels.get_ecc_op_wires())) {
            commitment = transcript->template receive_from_prover<Commitment>(domain_separator + label);
        }

        // Receive DataBus related polynomial commitments
        for (auto [commitment, label] :
             zip_view(witness_comms.get_databus_entities(), comm_labels.get_databus_entities())) {
            commitment = transcript->template receive_from_prover<Commitment>(domain_separator + label);
        }
    }
}

/**
 * @brief Get sorted witness-table accumulator and fourth wire commitments
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkVerifier<Flavor>::execute_sorted_list_accumulator_round()
{
    // Get eta challenges
    auto [eta, eta_two, eta_three] = transcript->template get_challenges<FF>(
        domain_separator + "eta", domain_separator + "eta_two", domain_separator + "eta_three");
    relation_parameters.eta = eta;
    relation_parameters.eta_two = eta_two;
    relation_parameters.eta_three = eta_three;

    // Get commitments to lookup argument polynomials and fourth wire
    witness_comms.lookup_read_counts =
        transcript->template receive_from_prover<Commitment>(domain_separator + comm_labels.lookup_read_counts);
    witness_comms.lookup_read_tags =
        transcript->template receive_from_prover<Commitment>(domain_separator + comm_labels.lookup_read_tags);
    witness_comms.w_4 = transcript->template receive_from_prover<Commitment>(domain_separator + comm_labels.w_4);
}

/**
 * @brief Get log derivative inverse polynomial and its commitment, if MegaFlavor
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkVerifier<Flavor>::execute_log_derivative_inverse_round()
{
    // Get permutation challenges
    auto [beta, gamma] = transcript->template get_challenges<FF>(domain_separator + "beta", domain_separator + "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    witness_comms.lookup_inverses =
        transcript->template receive_from_prover<Commitment>(domain_separator + comm_labels.lookup_inverses);

    // If Goblin (i.e. using DataBus) receive commitments to log-deriv inverses polynomials
    if constexpr (IsMegaFlavor<Flavor>) {
        for (auto [commitment, label] :
             zip_view(witness_comms.get_databus_inverses(), comm_labels.get_databus_inverses())) {
            commitment = transcript->template receive_from_prover<Commitment>(domain_separator + label);
        }
    }
}

/**
 * @brief Compute lookup grand product delta and get permutation and lookup grand product commitments
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkVerifier<Flavor>::execute_grand_product_computation_round()
{
    const FF public_input_delta = compute_public_input_delta<Flavor>(verifier_instance->public_inputs,
                                                                     relation_parameters.beta,
                                                                     relation_parameters.gamma,
                                                                     verifier_instance->vk->pub_inputs_offset);

    relation_parameters.public_input_delta = public_input_delta;

    // Get commitment to permutation and lookup grand products
    witness_comms.z_perm = transcript->template receive_from_prover<Commitment>(domain_separator + comm_labels.z_perm);
}

template <IsUltraOrMegaHonk Flavor> typename Flavor::SubrelationSeparators OinkVerifier<Flavor>::generate_alphas_round()
{
    // Get the relation separation challenges for sumcheck/combiner computation
    std::array<std::string, Flavor::NUM_SUBRELATIONS - 1> challenge_labels;

    for (size_t idx = 0; idx < Flavor::NUM_SUBRELATIONS - 1; ++idx) {
        challenge_labels[idx] = domain_separator + "alpha_" + std::to_string(idx);
    }
    // It is more efficient to generate an array of challenges than to generate them individually.
    SubrelationSeparators alphas = transcript->template get_challenges<FF>(challenge_labels);

    return alphas;
}

template class OinkVerifier<UltraFlavor>;
template class OinkVerifier<UltraZKFlavor>;
template class OinkVerifier<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class OinkVerifier<UltraStarknetFlavor>;
template class OinkVerifier<UltraStarknetZKFlavor>;
#endif
template class OinkVerifier<UltraKeccakZKFlavor>;
template class OinkVerifier<UltraRollupFlavor>;
template class OinkVerifier<MegaFlavor>;
template class OinkVerifier<MegaZKFlavor>;

} // namespace bb
