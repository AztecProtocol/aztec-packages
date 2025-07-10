// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "translator_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

TranslatorProver::TranslatorProver(const std::shared_ptr<TranslatorProvingKey>& key,
                                   const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
    , key(key)
{
    PROFILE_THIS();
    if (!key->proving_key->commitment_key.initialized()) {
        key->proving_key->commitment_key = CommitmentKey(key->proving_key->circuit_size);
    }
}

/**
 * @brief Add circuit size and values used in the relations to the transcript
 *
 */
void TranslatorProver::execute_preamble_round()
{
    // Fiat-Shamir the vk hash
    Flavor::VerificationKey vk;
    typename Flavor::FF vkey_hash = vk.add_hash_to_transcript("", *transcript);
    vinfo("Translator vk hash in prover: ", vkey_hash);

    const auto SHIFT = uint256_t(1) << Flavor::NUM_LIMB_BITS;
    const auto SHIFTx2 = uint256_t(1) << (Flavor::NUM_LIMB_BITS * 2);
    const auto SHIFTx3 = uint256_t(1) << (Flavor::NUM_LIMB_BITS * 3);
    const size_t RESULT_ROW = Flavor::RESULT_ROW;
    const auto accumulated_result =
        BF(uint256_t(key->proving_key->polynomials.accumulators_binary_limbs_0[RESULT_ROW]) +
           uint256_t(key->proving_key->polynomials.accumulators_binary_limbs_1[RESULT_ROW]) * SHIFT +
           uint256_t(key->proving_key->polynomials.accumulators_binary_limbs_2[RESULT_ROW]) * SHIFTx2 +
           uint256_t(key->proving_key->polynomials.accumulators_binary_limbs_3[RESULT_ROW]) * SHIFTx3);

    relation_parameters.accumulated_result = { key->proving_key->polynomials.accumulators_binary_limbs_0[RESULT_ROW],
                                               key->proving_key->polynomials.accumulators_binary_limbs_1[RESULT_ROW],
                                               key->proving_key->polynomials.accumulators_binary_limbs_2[RESULT_ROW],
                                               key->proving_key->polynomials.accumulators_binary_limbs_3[RESULT_ROW] };

    transcript->send_to_verifier("accumulated_result", accumulated_result);
}

/**
 * @brief Utility to commit to witness polynomial and send the commitment to verifier.
 *
 * @param polynomial
 * @param label
 */
void TranslatorProver::commit_to_witness_polynomial(Polynomial& polynomial, const std::string& label)
{
    transcript->send_to_verifier(label, key->proving_key->commitment_key.commit(polynomial));
}

/**
 * @brief Compute commitments to wires and ordered range constraints.
 *
 */
void TranslatorProver::execute_wire_and_sorted_constraints_commitments_round()
{

    for (const auto& [wire, label] :
         zip_view(key->proving_key->polynomials.get_wires(), commitment_labels.get_wires())) {

        commit_to_witness_polynomial(wire, label);
    }

    // The ordered range constraints are of full circuit size.
    for (const auto& [ordered_range_constraint, label] :
         zip_view(key->proving_key->polynomials.get_ordered_range_constraints(),
                  commitment_labels.get_ordered_range_constraints())) {
        commit_to_witness_polynomial(ordered_range_constraint, label);
    }
}

/**
 * @brief Compute permutation product polynomial and commitments
 *
 */
void TranslatorProver::execute_grand_product_computation_round()
{
    // Compute and store parameters required by relations in Sumcheck
    FF beta = transcript->template get_challenge<FF>("beta");
    FF gamma = transcript->template get_challenge<FF>("gamma");
    const size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    auto uint_evaluation_input = uint256_t(key->evaluation_input_x);
    relation_parameters.evaluation_input_x = { uint_evaluation_input.slice(0, NUM_LIMB_BITS),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                               uint_evaluation_input };

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

    commit_to_witness_polynomial(key->proving_key->polynomials.z_perm, commitment_labels.z_perm);
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void TranslatorProver::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor, Flavor::CONST_TRANSLATOR_LOG_N>;

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    std::vector<FF> gate_challenges(Flavor::CONST_TRANSLATOR_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    const size_t circuit_size = key->proving_key->circuit_size;

    Sumcheck sumcheck(
        circuit_size, key->proving_key->polynomials, transcript, alpha, gate_challenges, relation_parameters);

    const size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Flavor::Curve::SUBGROUP_SIZE));
    // Create a temporary commitment key that is only used to initialise the ZKSumcheckData
    // If proving in WASM, the commitment key that is part of the Translator proving key remains deallocated
    // until we enter the PCS round
    CommitmentKey ck(1 << (log_subgroup_size + 1));

    zk_sumcheck_data = ZKData(key->proving_key->log_circuit_size, transcript, ck);

    sumcheck_output = sumcheck.prove(zk_sumcheck_data);
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
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    // Check whether the commitment key has been deallocated and reinitialise it if necessary
    auto& ck = key->proving_key->commitment_key;
    if (!ck.initialized()) {
        ck = CommitmentKey(key->proving_key->circuit_size);
    }

    SmallSubgroupIPA small_subgroup_ipa_prover(
        zk_sumcheck_data, sumcheck_output.challenge, sumcheck_output.claimed_libra_evaluation, transcript, ck);
    small_subgroup_ipa_prover.prove();

    PolynomialBatcher polynomial_batcher(key->proving_key->circuit_size);
    polynomial_batcher.set_unshifted(key->proving_key->polynomials.get_unshifted_without_interleaved());
    polynomial_batcher.set_to_be_shifted_by_one(key->proving_key->polynomials.get_to_be_shifted());
    polynomial_batcher.set_interleaved(key->proving_key->polynomials.get_interleaved(),
                                       key->proving_key->polynomials.get_groups_to_be_interleaved());

    const OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(key->proving_key->circuit_size,
                                       polynomial_batcher,
                                       sumcheck_output.challenge,
                                       ck,
                                       transcript,
                                       small_subgroup_ipa_prover.get_witness_polynomials());

    PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
}

HonkProof TranslatorProver::export_proof()
{
    return transcript->export_proof();
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

    // #ifndef __wasm__
    // Free the commitment key
    key->proving_key->commitment_key = CommitmentKey();
    // #endif

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
