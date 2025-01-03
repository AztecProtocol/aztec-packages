#include "translator_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

TranslatorProver::TranslatorProver(const std::shared_ptr<TranslatorProvingKey>& key,
                                   const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
    , key(key)
{
    PROFILE_THIS();
    if (key->proving_key->commitment_key == nullptr) {
        key->proving_key->commitment_key = std::make_shared<CommitmentKey>(key->proving_key->circuit_size);
    }
}

/**
 * @brief Add circuit size and values used in the relations to the transcript
 *
 */
void TranslatorProver::execute_preamble_round()
{
    const auto circuit_size = static_cast<uint32_t>(key->proving_key->circuit_size);
    const auto SHIFT = uint256_t(1) << Flavor::NUM_LIMB_BITS;
    const auto SHIFTx2 = uint256_t(1) << (Flavor::NUM_LIMB_BITS * 2);
    const auto SHIFTx3 = uint256_t(1) << (Flavor::NUM_LIMB_BITS * 3);
    const auto accumulated_result =
        BF(uint256_t(key->proving_key->polynomials.accumulators_binary_limbs_0[1]) +
           uint256_t(key->proving_key->polynomials.accumulators_binary_limbs_1[1]) * SHIFT +
           uint256_t(key->proving_key->polynomials.accumulators_binary_limbs_2[1]) * SHIFTx2 +
           uint256_t(key->proving_key->polynomials.accumulators_binary_limbs_3[1]) * SHIFTx3);
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
    auto wire_polys = key->proving_key->polynomials.get_wires_and_ordered_range_constraints();
    auto labels = commitment_labels.get_wires_and_ordered_range_constraints();
    for (size_t idx = 0; idx < wire_polys.size(); ++idx) {
        transcript->send_to_verifier(labels[idx], key->proving_key->commitment_key->commit(wire_polys[idx]));
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

    relation_parameters.accumulated_result = { key->proving_key->polynomials.accumulators_binary_limbs_0[1],
                                               key->proving_key->polynomials.accumulators_binary_limbs_1[1],
                                               key->proving_key->polynomials.accumulators_binary_limbs_2[1],
                                               key->proving_key->polynomials.accumulators_binary_limbs_3[1] };

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
    compute_grand_products<Flavor>(key->proving_key->polynomials, relation_parameters);

    transcript->send_to_verifier(commitment_labels.z_perm,
                                 key->proving_key->commitment_key->commit(key->proving_key->polynomials.z_perm));
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void TranslatorProver::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(key->proving_key->circuit_size, transcript);
    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // // create masking polynomials for sumcheck round univariates and auxiliary data
    zk_sumcheck_data =
        std::make_shared<ZKData>(key->proving_key->log_circuit_size, transcript, key->proving_key->commitment_key);

    sumcheck_output =
        sumcheck.prove(key->proving_key->polynomials, relation_parameters, alpha, gate_challenges, zk_sumcheck_data);
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

    using SmallSubgroupIPA = SmallSubgroupIPAProver<Flavor>;

    SmallSubgroupIPA small_subgroup_ipa_prover(*zk_sumcheck_data,
                                               sumcheck_output.challenge,
                                               sumcheck_output.claimed_libra_evaluation,
                                               transcript,
                                               key->proving_key->commitment_key);

    const OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(key->proving_key->circuit_size,
                                       key->proving_key->polynomials.get_unshifted_without_concatenated(),
                                       key->proving_key->polynomials.get_to_be_shifted(),
                                       sumcheck_output.challenge,
                                       key->proving_key->commitment_key,
                                       transcript,
                                       small_subgroup_ipa_prover.get_witness_polynomials(),
                                       key->proving_key->polynomials.get_concatenated(),
                                       key->proving_key->polynomials.get_groups_to_be_concatenated());

    PCS::compute_opening_proof(key->proving_key->commitment_key, prover_opening_claim, transcript);
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
