// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/common/bb_bench.hpp"
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
    BB_BENCH_NAME("OinkProver::prove");
    if (!proving_key->commitment_key.initialized()) {
        proving_key->commitment_key = CommitmentKey(proving_key->dyadic_size());
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
    proving_key->alphas = generate_alphas_round();

    // #ifndef __wasm__
    // Free the commitment key
    proving_key->commitment_key = CommitmentKey();
    // #endif

    proving_key->is_complete = true;
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

    for (size_t i = 0; i < proving_key->num_public_inputs(); ++i) {
        auto public_input_i = proving_key->public_inputs[i];
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
    // Commit to the first three wire polynomials using batch commitment
    // We only commit to the fourth wire polynomial after adding memory recordss

    // Batch commit the first three wire polynomials
    auto commit_type = (proving_key->get_is_structured()) ? CommitmentKey::CommitType::StructuredNonZeroComplement
                                                          : CommitmentKey::CommitType::Default;
    commit_to_witness_polynomials(
        { proving_key->polynomials.w_l, proving_key->polynomials.w_r, proving_key->polynomials.w_o },
        { commitment_labels.w_l, commitment_labels.w_r, commitment_labels.w_o },
        commit_type);

    if constexpr (IsMegaFlavor<Flavor>) {

        // Commit to Goblin ECC op wires.
        // To avoid possible issues with the current work on the merge protocol, they are not
        // masked in MegaZKFlavor
        {
            BB_BENCH_NAME("COMMIT::ecc_op_wires");
            auto ecc_op_wires = proving_key->polynomials.get_ecc_op_wires();
            auto ecc_op_labels = commitment_labels.get_ecc_op_wires();
            RefVector<Polynomial<FF>> ecc_op_polys(ecc_op_wires);
            std::vector<std::string_view> labels;
            for (const auto& label : ecc_op_labels) {
                labels.push_back(label);
            }
            commit_to_witness_polynomials(ecc_op_polys, labels);
        }

        // Commit to DataBus related polynomials
        {
            BB_BENCH_NAME("COMMIT::databus");
            auto databus_entities = proving_key->polynomials.get_databus_entities();
            auto databus_labels = commitment_labels.get_databus_entities();
            RefVector<Polynomial<FF>> databus_polys(databus_entities);
            std::vector<std::string_view> labels;
            for (const auto& label : databus_labels) {
                labels.push_back(label);
            }
            commit_to_witness_polynomials(databus_polys, labels);
        }
    }
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
    proving_key->relation_parameters.eta = eta;
    proving_key->relation_parameters.eta_two = eta_two;
    proving_key->relation_parameters.eta_three = eta_three;

    WitnessComputation<Flavor>::add_ram_rom_memory_records_to_wire_4(proving_key->polynomials,
                                                                     proving_key->memory_read_records,
                                                                     proving_key->memory_write_records,
                                                                     eta,
                                                                     eta_two,
                                                                     eta_three);

    // Commit to lookup argument polynomials and the finalized (i.e. with memory records) fourth wire polynomial
    {
        BB_BENCH_NAME("COMMIT::lookup_counts_tags");
        commit_to_witness_polynomials(
            { proving_key->polynomials.lookup_read_counts, proving_key->polynomials.lookup_read_tags },
            { commitment_labels.lookup_read_counts, commitment_labels.lookup_read_tags });
    }
    {
        BB_BENCH_NAME("COMMIT::wires");
        commit_to_witness_polynomials({ proving_key->polynomials.w_4 }, { commitment_labels.w_4 });
    }
}

/**
 * @brief Compute log derivative inverse polynomial and its commitment, if required
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_log_derivative_inverse_round()
{
    BB_BENCH_NAME("OinkProver::execute_log_derivative_inverse_round");
    auto [beta, gamma] = transcript->template get_challenges<FF>(domain_separator + "beta", domain_separator + "gamma");
    proving_key->relation_parameters.beta = beta;
    proving_key->relation_parameters.gamma = gamma;

    // Compute the inverses used in log-derivative lookup relations
    WitnessComputation<Flavor>::compute_logderivative_inverses(
        proving_key->polynomials, proving_key->dyadic_size(), proving_key->relation_parameters);

    {
        BB_BENCH_NAME("COMMIT::lookup_inverses");
        commit_to_witness_polynomials({ proving_key->polynomials.lookup_inverses },
                                      { commitment_labels.lookup_inverses });
    }

    // If Mega, commit to the databus inverse polynomials and send
    if constexpr (IsMegaFlavor<Flavor>) {
        BB_BENCH_NAME("COMMIT::databus_inverses");
        auto databus_inverses = proving_key->polynomials.get_databus_inverses();
        auto databus_inverse_labels = commitment_labels.get_databus_inverses();
        RefVector<Polynomial<FF>> databus_inv_polys(databus_inverses);
        std::vector<std::string_view> labels;
        for (const auto& label : databus_inverse_labels) {
            labels.push_back(label);
        }
        commit_to_witness_polynomials(databus_inv_polys, labels);
    }
}

/**
 * @brief Compute permutation and lookup grand product polynomials and their commitments
 *
 */
template <IsUltraOrMegaHonk Flavor> void OinkProver<Flavor>::execute_grand_product_computation_round()
{
    BB_BENCH_NAME("OinkProver::execute_grand_product_computation_round");
    // Compute the permutation grand product polynomial

    WitnessComputation<Flavor>::compute_grand_product_polynomial(proving_key->polynomials,
                                                                 proving_key->public_inputs,
                                                                 proving_key->pub_inputs_offset(),
                                                                 proving_key->active_region_data,
                                                                 proving_key->relation_parameters,
                                                                 proving_key->get_final_active_wire_idx() + 1);

    {
        BB_BENCH_NAME("COMMIT::z_perm");
        auto commit_type = (proving_key->get_is_structured()) ? CommitmentKey::CommitType::StructuredNonZeroComplement
                                                              : CommitmentKey::CommitType::Default;
        commit_to_witness_polynomials({ proving_key->polynomials.z_perm }, { commitment_labels.z_perm }, commit_type);
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
 * @brief Batch method to mask, commit, and send multiple polynomial commitments to the verifier.
 *
 * @param polynomials
 * @param labels
 * @param type
 */
template <IsUltraOrMegaHonk Flavor>
void OinkProver<Flavor>::commit_to_witness_polynomials(const RefVector<Polynomial<FF>>& polynomials,
                                                       const std::vector<std::string_view>& labels,
                                                       const CommitmentKey::CommitType type)
{
    BB_BENCH_NAME("OinkProver::commit_to_witness_polynomials");
    BB_ASSERT_EQ(polynomials.size(), labels.size());

    // Mask the polynomials when proving in zero-knowledge
    if constexpr (Flavor::HasZK) {
        for (auto& polynomial : polynomials) {
            polynomial.mask();
        }
    }

    if (type == CommitmentKey::CommitType::Default) {
        // Use batch commitment for default type
        std::vector<PolynomialSpan<const FF>> poly_spans;
        poly_spans.reserve(polynomials.size());
        for (const auto& polynomial : polynomials) {
            poly_spans.emplace_back(polynomial); // Uses implicit conversion to PolynomialSpan
        }

        auto commitments = proving_key->commitment_key.batch_commit(poly_spans);

        // Send the commitments to the verifier
        for (size_t i = 0; i < commitments.size(); ++i) {
            transcript->send_to_verifier(domain_separator + std::string(labels[i]), commitments[i]);
        }
    } else {
        // For structured or other types, commit individually
        for (size_t i = 0; i < polynomials.size(); ++i) {
            auto commitment = proving_key->commitment_key.commit_with_type(
                polynomials[i], type, proving_key->active_region_data.get_ranges());
            transcript->send_to_verifier(domain_separator + std::string(labels[i]), commitment);
        }
    }
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
