// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/relations/databus_lookup_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"

namespace bb {

/**
 * @brief Commit to witnesses, compute relation parameters, and prepare for Sumcheck.
 */
template <typename Flavor> void OinkProver<Flavor>::prove(bool emit_alpha)
{
    BB_BENCH_NAME("OinkProver::prove");
    if (!commitment_key.initialized()) {
        // For ZK, we need SRS points up to dyadic_size for tail masking commitments
        const size_t ck_size =
            Flavor::HasZK ? prover_instance->dyadic_size() : prover_instance->polynomials.max_end_index();
        commitment_key = CommitmentKey(ck_size * BATCH_SIZE);
    }

    // Register all masked polys (generates random tail values and builds group-level tails)
    if constexpr (Flavor::HasZK) {
        prover_instance->masking_tail_data.register_all_masked_polys();
    }

    send_vk_hash_and_public_inputs();
    commit_to_masking_poly();
    commit_to_wires();
    commit_to_lookup_counts_and_w4();
    commit_to_logderiv_inverses();
    commit_to_z_perm();
    if (emit_alpha) {
        prover_instance->alpha = transcript->template get_challenge<FF>("alpha");
    }
}

/**
 * @brief Export the Oink proof
 */
template <typename Flavor> typename OinkProver<Flavor>::Proof OinkProver<Flavor>::export_proof()
{
    return transcript->export_proof();
}

/**
 * @brief Hash the verification key and send public inputs to the transcript.
 */
template <typename Flavor> void OinkProver<Flavor>::send_vk_hash_and_public_inputs()
{
    BB_BENCH_NAME("OinkProver::send_vk_hash_and_public_inputs");
    fr vk_hash = honk_vk->hash_with_origin_tagging(*transcript);
    transcript->add_to_hash_buffer("vk_hash", vk_hash);
    vinfo("vk hash in Oink prover: ", vk_hash);

    for (size_t i = 0; i < prover_instance->num_public_inputs(); ++i) {
        auto public_input_i = prover_instance->public_inputs[i];
        transcript->send_to_verifier("public_input_" + std::to_string(i), public_input_i);
    }
}

/**
 * @brief Commit to the wire polynomials (part of the witness), with the exception of the fourth wire, which is
 * only committed to after adding memory records. For Mega, we also commit to the ECC op wires and DataBus columns.
 *
 * For interleaved flavors (BATCH_SIZE > 1), commits directly to the interleaved group buffers.
 */
template <typename Flavor> void OinkProver<Flavor>::commit_to_wires()
{
    BB_BENCH_NAME("OinkProver::commit_to_wires");
    auto& p = prover_instance->polynomials;
    auto& t = prover_instance->masking_tail_data.tails;
    auto& c = prover_instance->commitments;
    commit_round_groups(Flavor::OinkRounds::wires(p), Flavor::OinkRounds::wires(t), Flavor::OinkRounds::wires(c));
}

template <typename Flavor> void OinkProver<Flavor>::commit_to_lookup_counts_and_w4()
{
    BB_BENCH_NAME("OinkProver::commit_to_lookup_counts_and_w4");
    prover_instance->relation_parameters.compute_eta_powers(transcript->template get_challenge<FF>("eta"));
    add_ram_rom_memory_records_to_wire_4(*prover_instance);
    auto& p = prover_instance->polynomials;
    auto& t = prover_instance->masking_tail_data.tails;
    auto& c = prover_instance->commitments;
    commit_round_groups(Flavor::OinkRounds::lookup_and_w4(p),
                        Flavor::OinkRounds::lookup_and_w4(t),
                        Flavor::OinkRounds::lookup_and_w4(c));
}

template <typename Flavor> void OinkProver<Flavor>::commit_to_logderiv_inverses()
{
    BB_BENCH_NAME("OinkProver::commit_to_logderiv_inverses");
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    prover_instance->relation_parameters.compute_beta_powers(beta);
    prover_instance->relation_parameters.gamma = gamma;
    compute_logderivative_inverses(*prover_instance);
    auto& p = prover_instance->polynomials;
    auto& t = prover_instance->masking_tail_data.tails;
    auto& c = prover_instance->commitments;
    commit_round_groups(
        Flavor::OinkRounds::inverses(p), Flavor::OinkRounds::inverses(t), Flavor::OinkRounds::inverses(c));
}

template <typename Flavor> void OinkProver<Flavor>::commit_to_z_perm()
{
    BB_BENCH_NAME("OinkProver::commit_to_z_perm");
    compute_grand_product_polynomial(*prover_instance);
    auto& p = prover_instance->polynomials;
    auto& t = prover_instance->masking_tail_data.tails;
    auto& c = prover_instance->commitments;
    commit_round_groups(Flavor::OinkRounds::z_perm(p), Flavor::OinkRounds::z_perm(t), Flavor::OinkRounds::z_perm(c));
}

template <typename Flavor> void OinkProver<Flavor>::commit_to_masking_poly()
{
    if constexpr (flavor_has_gemini_masking<Flavor>()) {
        const size_t polynomial_size = prover_instance->dyadic_size();
        prover_instance->polynomials.gemini_masking_poly = Polynomial::random(polynomial_size);

        auto masking_commitment = commitment_key.commit(prover_instance->polynomials.gemini_masking_poly);
        transcript->send_to_verifier("Gemini:masking_poly_comm", masking_commitment);
    }
};

/**
 * @brief Commit a list of witness groups for one oink round and send to verifier.
 * @details For each group: builds PolynomialSpans from entity pointers, calls commit_interleaved<BS>,
 *          adds ZK tail if applicable, sends to transcript.
 *          Uniform for all BS (commit_interleaved<1> degenerates to commit).
 */
template <typename Flavor>
template <typename PolyDescs, typename CommDescs>
void OinkProver<Flavor>::commit_round_groups(const PolyDescs& poly_groups,
                                             const PolyDescs& tail_groups,
                                             const CommDescs& comm_groups)
{
    using FF_ = typename Flavor::FF;
    const size_t pcs_vsize = prover_instance->dyadic_size() * BATCH_SIZE;

    for (size_t i = 0; i < poly_groups.size(); i++) {
        const auto& group = poly_groups[i];

        // Build spans from entity pointers (skip nullptrs)
        std::vector<PolynomialSpan<const FF_>> spans;
        for (const auto* ptr : group.entities) {
            if (ptr != nullptr) {
                spans.push_back(*ptr);
            }
        }
        Commitment commitment = commitment_key.template commit_interleaved<BATCH_SIZE>(spans);

        // ZK: commit the interleaved tail for this group and add to commitment
        if constexpr (Flavor::HasZK) {
            if (prover_instance->masking_tail_data.is_active()) {
                auto tail =
                    prover_instance->masking_tail_data.interleave_tail_group(tail_groups[i].entities, pcs_vsize);
                if (!tail.is_empty()) {
                    commitment = commitment + commitment_key.commit(tail);
                }
            }
        }

        transcript->send_to_verifier(group.label, commitment);

        // Store in prover commitments (first non-null pointer in the commitment group)
        for (auto* ptr : comm_groups[i].entities) {
            if (ptr != nullptr) {
                *ptr = commitment;
                break;
            }
        }
    }
}

/**
 * @brief Add RAM/ROM memory records to the fourth wire polynomial
 *
 * @details This operation must be performed after the first three wires have been
 * committed to, hence the dependence on the `eta` challenge.
 *
 * @tparam Flavor
 * @param instance prover instance whose polynomials, memory records, and eta powers are used
 */
template <typename Flavor> void OinkProver<Flavor>::add_ram_rom_memory_records_to_wire_4(ProverInstance& instance)
{
    // The memory record values are computed at the indicated indices as
    // w4 = w3 * eta^3 + w2 * eta^2 + w1 * eta + read_write_flag;
    // (See the Memory relation for details)
    auto wires = instance.polynomials.get_wires();
    const auto& eta = instance.relation_parameters.eta;
    const auto& eta_two = instance.relation_parameters.eta_two;
    const auto& eta_three = instance.relation_parameters.eta_three;

    // Compute read record values
    for (const auto& gate_idx : instance.memory_read_records) {
        wires[3].at(gate_idx) = wires[2][gate_idx] * eta_three;
        wires[3].at(gate_idx) += wires[1][gate_idx] * eta_two;
        wires[3].at(gate_idx) += wires[0][gate_idx] * eta;
    }

    // Compute write record values
    for (const auto& gate_idx : instance.memory_write_records) {
        wires[3].at(gate_idx) = wires[2][gate_idx] * eta_three;
        wires[3].at(gate_idx) += wires[1][gate_idx] * eta_two;
        wires[3].at(gate_idx) += wires[0][gate_idx] * eta;
        wires[3].at(gate_idx) += 1;
    }
}

/**
 * @brief Compute the inverse polynomials used in the log derivative lookup relations
 *
 * @tparam Flavor
 * @param instance prover instance whose polynomials and relation parameters are used
 */
template <typename Flavor> void OinkProver<Flavor>::compute_logderivative_inverses(ProverInstance& instance)
{
    BB_BENCH_NAME("compute_logderivative_inverses");

    auto& polynomials = instance.polynomials;
    auto& relation_parameters = instance.relation_parameters;
    const size_t circuit_size = instance.dyadic_size();

    // Compute inverses for conventional lookups
    LogDerivLookupRelation<FF>::compute_logderivative_inverse(polynomials, relation_parameters, circuit_size);

    if constexpr (HasDataBus<Flavor>) {
        // Compute inverses for calldata reads
        DatabusLookupRelation<FF>::template compute_logderivative_inverse</*bus_idx=*/0>(
            polynomials, relation_parameters, circuit_size);

        // Compute inverses for secondary_calldata reads
        DatabusLookupRelation<FF>::template compute_logderivative_inverse</*bus_idx=*/1>(
            polynomials, relation_parameters, circuit_size);

        // Compute inverses for return data reads
        DatabusLookupRelation<FF>::template compute_logderivative_inverse</*bus_idx=*/2>(
            polynomials, relation_parameters, circuit_size);
    }
}

/**
 * @brief Computes public_input_delta and the permutation grand product polynomial
 *
 * @param instance prover instance whose polynomials, public inputs, and relation parameters are used
 */
template <typename Flavor> void OinkProver<Flavor>::compute_grand_product_polynomial(ProverInstance& instance)
{
    auto& relation_parameters = instance.relation_parameters;
    relation_parameters.public_input_delta = compute_public_input_delta<Flavor>(
        instance.public_inputs, relation_parameters.beta, relation_parameters.gamma, instance.pub_inputs_offset());

    // Compute permutation grand product polynomial
    compute_grand_product<Flavor, UltraPermutationRelation<FF>>(
        instance.polynomials, relation_parameters, instance.get_final_active_wire_idx() + 1);
}

template class OinkProver<UltraFlavor>;
template class OinkProver<UltraZKFlavor>;
template class OinkProver<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class OinkProver<UltraStarknetFlavor>;
template class OinkProver<UltraStarknetZKFlavor>;
#endif
template class OinkProver<UltraKeccakZKFlavor>;
template class OinkProver<MegaFlavor>;
template class OinkProver<MegaZKFlavor>;
template class OinkProver<MegaAvmFlavor>;
template class OinkProver<DualMegaFlavor>;
template class OinkProver<DualMegaZKFlavor>;
template class OinkProver<MultiMegaFlavor>;
template class OinkProver<MultiMegaZKFlavor>;

} // namespace bb
