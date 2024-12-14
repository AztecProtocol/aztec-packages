#include "translator_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/honk/proof_system/permutation_library.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

TranslatorProver::TranslatorProver(CircuitBuilder& circuit_builder,
                                   const std::shared_ptr<Transcript>& transcript,
                                   std::shared_ptr<CommitmentKey> commitment_key)
    : dyadic_circuit_size(Flavor::compute_dyadic_circuit_size(circuit_builder))
    , mini_circuit_dyadic_size(Flavor::compute_mini_circuit_dyadic_size(circuit_builder))
    , transcript(transcript)
    , key(std::make_shared<ProvingKey>(circuit_builder))
{
    PROFILE_THIS();

    key->commitment_key = commitment_key ? commitment_key : std::make_shared<CommitmentKey>(key->circuit_size);
    compute_witness(circuit_builder);
}

/**
 * @brief Compute witness polynomials
 *
 */
void TranslatorProver::compute_witness(CircuitBuilder& circuit_builder)
{
    if (computed_witness) {
        return;
    }

    // Populate the wire polynomials from the wire vectors in the circuit constructor. Note: In goblin translator wires
    // come as is, since they have to reflect the structure of polynomials in the first 4 wires, which we've commited to
    for (auto [wire_poly, wire] : zip_view(key->polynomials.get_wires(), circuit_builder.wires)) {
        parallel_for_range(circuit_builder.num_gates, [&](size_t start, size_t end) {
            for (size_t i = start; i < end; i++) {
                if (i >= wire_poly.start_index() && i < wire_poly.end_index()) {
                    wire_poly.at(i) = circuit_builder.get_variable(wire[i]);
                } else {
                    ASSERT(wire[i] == 0);
                }
            }
        });
    }

    // We construct concatenated versions of range constraint polynomials, where several polynomials are concatenated
    // into one. These polynomials are not commited to.
    bb::compute_concatenated_polynomials<Flavor>(key->polynomials);

    // We also contruct ordered polynomials, which have the same values as concatenated ones + enough values to bridge
    // the range from 0 to maximum range defined by the range constraint.
    bb::compute_translator_range_constraint_ordered_polynomials<Flavor>(key->polynomials, mini_circuit_dyadic_size);

    computed_witness = true;
}

void TranslatorProver::compute_commitment_key(size_t circuit_size)
{
    key->commitment_key = std::make_shared<CommitmentKey>(circuit_size);
}

/**
 * @brief Add circuit size and values used in the relations to the transcript
 *
 */
void TranslatorProver::execute_preamble_round()
{
    const auto circuit_size = static_cast<uint32_t>(key->circuit_size);
    const auto SHIFT = uint256_t(1) << Flavor::NUM_LIMB_BITS;
    const auto SHIFTx2 = uint256_t(1) << (Flavor::NUM_LIMB_BITS * 2);
    const auto SHIFTx3 = uint256_t(1) << (Flavor::NUM_LIMB_BITS * 3);
    const auto accumulated_result = BF(uint256_t(key->polynomials.accumulators_binary_limbs_0[1]) +
                                       uint256_t(key->polynomials.accumulators_binary_limbs_1[1]) * SHIFT +
                                       uint256_t(key->polynomials.accumulators_binary_limbs_2[1]) * SHIFTx2 +
                                       uint256_t(key->polynomials.accumulators_binary_limbs_3[1]) * SHIFTx3);
    transcript->send_to_verifier("circuit_size", circuit_size);
    transcript->send_to_verifier("evaluation_input_x", key->evaluation_input_x);
    transcript->send_to_verifier("accumulated_result", accumulated_result);
}

/**
 * @brief Compute commitments to the first three wires
 *
 */
void TranslatorProver::execute_wire_and_sorted_constraints_commitments_round()
{
    // Commit to all wire polynomials and ordered range constraint polynomials
    auto wire_polys = key->polynomials.get_wires_and_ordered_range_constraints();
    auto labels = commitment_labels.get_wires_and_ordered_range_constraints();
    for (size_t idx = 0; idx < wire_polys.size(); ++idx) {
        transcript->send_to_verifier(labels[idx], key->commitment_key->commit(wire_polys[idx]));
    }
}

/**
 * @brief Compute permutation product polynomial and commitments
 *
 */
void TranslatorProver::execute_grand_product_computation_round()
{
    // Compute and store parameters required by relations in Sumcheck
    FF gamma = transcript->template get_challenge<FF>("gamma");
    const size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
    relation_parameters.beta = 0;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = 0;
    relation_parameters.lookup_grand_product_delta = 0;
    auto uint_evaluation_input = uint256_t(key->evaluation_input_x);
    relation_parameters.evaluation_input_x = { uint_evaluation_input.slice(0, NUM_LIMB_BITS),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                               uint_evaluation_input };

    relation_parameters.accumulated_result = { key->polynomials.accumulators_binary_limbs_0[1],
                                               key->polynomials.accumulators_binary_limbs_1[1],
                                               key->polynomials.accumulators_binary_limbs_2[1],
                                               key->polynomials.accumulators_binary_limbs_3[1] };

    std::vector<uint256_t> uint_batching_challenge_powers;
    auto batching_challenge_v = key->batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(batching_challenge_v);
    auto running_power = batching_challenge_v * batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(running_power);
    running_power *= batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(running_power);
    running_power *= batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(running_power);

    for (size_t i = 0; i < 4; i++) {
        relation_parameters.batching_challenge_v[i] = {
            uint_batching_challenge_powers[i].slice(0, NUM_LIMB_BITS),
            uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
            uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
            uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
            uint_batching_challenge_powers[i]
        };
    }
    // Compute constraint permutation grand product
    compute_grand_products<Flavor>(key->polynomials, relation_parameters);

    transcript->send_to_verifier(commitment_labels.z_perm, key->commitment_key->commit(key->polynomials.z_perm));
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void TranslatorProver::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(key->circuit_size, transcript);
    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // // create masking polynomials for sumcheck round univariates and auxiliary data
    zk_sumcheck_data = ZKSumcheckData<Flavor>(key->log_circuit_size, transcript, key->commitment_key);

    sumcheck_output = sumcheck.prove(key->polynomials, relation_parameters, alpha, gate_challenges, zk_sumcheck_data);
}

/**
 * @brief Produce a univariate opening claim for the sumcheck multivariate evalutions and a batched univariate claim
 * for the transcript polynomials (for the Translator consistency check). Reduce the two opening claims to a single one
 * via Shplonk and produce an opening proof with the univariate PCS of choice (IPA when operating on Grumpkin).
 *
 */
void TranslatorProver::execute_pcs_rounds()
{
    using Curve = typename Flavor::Curve;

    using OpeningClaim = ProverOpeningClaim<Curve>;

    zk_sumcheck_data.setup_challenge_polynomial(sumcheck_output.challenge);
    zk_sumcheck_data.setup_big_sum_polynomial();
    transcript->template send_to_verifier("Libra:big_sum_commitment",
                                          key->commitment_key->commit(zk_sumcheck_data.big_sum_polynomial));
    zk_sumcheck_data.compute_batched_polynomial();
    zk_sumcheck_data.compute_batched_quotient();
    transcript->template send_to_verifier("Libra:quotient_commitment",
                                          key->commitment_key->commit(zk_sumcheck_data.batched_quotient));

    std::array<Polynomial, 3> libra_polynomials = { zk_sumcheck_data.libra_concatenated_monomial_form,
                                                    zk_sumcheck_data.big_sum_polynomial,
                                                    zk_sumcheck_data.batched_quotient };

    const OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(key->circuit_size,
                                       key->polynomials.get_unshifted_without_concatenated(),
                                       key->polynomials.get_to_be_shifted(),
                                       sumcheck_output.challenge,
                                       key->commitment_key,
                                       transcript,
                                       libra_polynomials,
                                       sumcheck_output.claimed_libra_evaluation,
                                       key->polynomials.get_concatenated(),
                                       key->polynomials.get_groups_to_be_concatenated());

    PCS::compute_opening_proof(key->commitment_key, prover_opening_claim, transcript);
}

HonkProof TranslatorProver::export_proof()
{
    proof = transcript->export_proof();
    return proof;
}

HonkProof TranslatorProver::construct_proof()
{
    PROFILE_THIS_NAME("TranslatorProver::construct_proof");

    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();

    // Compute first three wire commitments
    execute_wire_and_sorted_constraints_commitments_round();

    // Fiat-Shamir: gamma
    // Compute grand product(s) and commitments.
    execute_grand_product_computation_round();

    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho, y, x, z
    // Execute Shplemini PCS
    execute_pcs_rounds();
    vinfo("computed opening proof");

    return export_proof();
}

} // namespace bb
