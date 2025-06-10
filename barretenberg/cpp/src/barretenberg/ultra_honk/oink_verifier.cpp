// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ext/starknet/stdlib_circuit_builders/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/stdlib_circuit_builders/ultra_starknet_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_zk_flavor.hpp"

namespace bb {

/**
 * @brief Oink Verifier function that runs all the rounds of the verifier
 * @details Returns the witness commitments and relation_parameters
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

    verification_key->witness_commitments = witness_comms;
    verification_key->relation_parameters = relation_parameters;
    verification_key->public_inputs = public_inputs;
    verification_key->alphas = generate_alphas_round();
}

/**
 * @brief Get circuit size, public input size, and public inputs from transcript
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkVerifier<Flavor>::execute_preamble_round()
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1427): We need to single out these flavors because the
    // solidity contract hasn't been modified yet to fiat shamir the full vk hash. This will be fixed in a followup PR.
    if constexpr (!IsAnyOf<Flavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
        std::vector<FF> vkey_fields = verification_key->verification_key->to_field_elements();
        for (const FF& vkey_field : vkey_fields) {
            transcript->add_to_hash_buffer(domain_separator + "vkey_field", vkey_field);
        }
        auto [vkey_hash] = transcript->template get_challenges<FF>(domain_separator + "vkey_hash");
        vinfo("vkey hash in Oink verifier: ", vkey_hash);
    } else {
        const uint64_t circuit_size = verification_key->verification_key->circuit_size;
        const uint64_t public_input_size = verification_key->verification_key->num_public_inputs;
        const uint64_t pub_inputs_offset = verification_key->verification_key->pub_inputs_offset;

        transcript->add_to_hash_buffer(domain_separator + "circuit_size", circuit_size);
        transcript->add_to_hash_buffer(domain_separator + "public_input_size", public_input_size);
        transcript->add_to_hash_buffer(domain_separator + "pub_inputs_offset", pub_inputs_offset);
    }
    for (size_t i = 0; i < verification_key->verification_key->num_public_inputs; ++i) {
        auto public_input_i =
            transcript->template receive_from_prover<FF>(domain_separator + "public_input_" + std::to_string(i));
        public_inputs.emplace_back(public_input_i);
    }
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
    const FF public_input_delta =
        compute_public_input_delta<Flavor>(public_inputs,
                                           relation_parameters.beta,
                                           relation_parameters.gamma,
                                           verification_key->verification_key->circuit_size,
                                           static_cast<size_t>(verification_key->verification_key->pub_inputs_offset));

    relation_parameters.public_input_delta = public_input_delta;

    // Get commitment to permutation and lookup grand products
    witness_comms.z_perm = transcript->template receive_from_prover<Commitment>(domain_separator + comm_labels.z_perm);
}

template <IsUltraOrMegaHonk Flavor> typename Flavor::RelationSeparator OinkVerifier<Flavor>::generate_alphas_round()
{
    // Get the relation separation challenges for sumcheck/combiner computation
    RelationSeparator alphas;
    std::array<std::string, Flavor::NUM_SUBRELATIONS - 1> args;
    for (size_t idx = 0; idx < alphas.size(); ++idx) {
        args[idx] = domain_separator + "alpha_" + std::to_string(idx);
    }
    return transcript->template get_challenges<FF>(args);
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
