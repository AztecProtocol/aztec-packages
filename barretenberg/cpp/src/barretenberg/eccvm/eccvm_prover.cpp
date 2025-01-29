#include "eccvm_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

ECCVMProver::ECCVMProver(CircuitBuilder& builder,
                         const std::shared_ptr<Transcript>& transcript,
                         const std::shared_ptr<Transcript>& ipa_transcript)
    : transcript(transcript)
    , ipa_transcript(ipa_transcript)
{
    PROFILE_THIS_NAME("ECCVMProver(CircuitBuilder&)");

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/939): Remove redundancy between
    // ProvingKey/ProverPolynomials and update the model to reflect what's done in all other proving systems.

    // Construct the proving key; populates all polynomials except for witness polys
    key = std::make_shared<ProvingKey>(builder);

    key->commitment_key = std::make_shared<CommitmentKey>(key->circuit_size);
}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
void ECCVMProver::execute_preamble_round()
{
    const auto circuit_size = static_cast<uint32_t>(key->circuit_size);
    transcript->send_to_verifier("circuit_size", circuit_size);
}

/**
 * @brief Compute commitments to the first three wires
 *
 */
void ECCVMProver::execute_wire_commitments_round()
{
    // 1. Record the start time
    auto start_time = std::chrono::high_resolution_clock::now();
    info("eccvm size?", key->real_eccvm_circuit_size);

    size_t counter = 0;
    for (const auto& [wire, label] : zip_view(key->polynomials.get_wires(), commitment_labels.get_wires())) {

        // Optionally store the real_size
        if ((counter == 62) || (counter == 63)) {

            transcript->send_to_verifier(label, key->commitment_key->commit(wire));
        } else {
            PolynomialSpan<FF> wire_span = wire;
            transcript->send_to_verifier(
                label, key->commitment_key->commit(wire_span.subspan(0, key->real_eccvm_circuit_size)));
        }
        counter++;
    }

    // 3. Record the end time
    auto end_time = std::chrono::high_resolution_clock::now();

    // 4. Compute the duration in milliseconds
    auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();

    // 5. Print/log the timing
    info("Time spent on wire polynomial commitments: " + std::to_string(duration_ms) + " ms");
}

/**
 * @brief Compute sorted witness-table accumulator
 *
 */
void ECCVMProver::execute_log_derivative_commitments_round()
{
    // 1. Record the start time
    auto start_time = std::chrono::high_resolution_clock::now();

    // Compute and add beta to relation parameters
    auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");

    // TODO(#583)(@zac-williamson): fix Transcript to be able to generate more than 2 challenges per round! oof.
    auto beta_sqr = beta * beta;
    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;
    relation_parameters.beta_sqr = beta_sqr;
    relation_parameters.beta_cube = beta_sqr * beta;
    relation_parameters.eccvm_set_permutation_delta =
        gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
    relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();
    // Compute inverse polynomial for our logarithmic-derivative lookup method
    compute_logderivative_inverse<Flavor, typename Flavor::LookupRelation>(
        key->polynomials, relation_parameters, key->circuit_size);
    transcript->send_to_verifier(commitment_labels.lookup_inverses,
                                 key->commitment_key->commit(key->polynomials.lookup_inverses));

    // 3. Record the end time
    auto end_time = std::chrono::high_resolution_clock::now();

    // 4. Compute the duration in milliseconds
    auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();

    // 5. Print/log the timing
    info("Time spent on log derivative: " + std::to_string(duration_ms) + " ms");
}

/**
 * @brief Compute permutation and lookup grand product polynomials and commitments
 *
 */
void ECCVMProver::execute_grand_product_computation_round()
{
    // 1. Record the start time
    auto start_time = std::chrono::high_resolution_clock::now();

    // Compute permutation grand product and their commitments
    compute_grand_products<Flavor>(key->polynomials, relation_parameters);

    transcript->send_to_verifier(commitment_labels.z_perm, key->commitment_key->commit(key->polynomials.z_perm));

    // 3. Record the end time
    auto end_time = std::chrono::high_resolution_clock::now();

    // 4. Compute the duration in milliseconds
    auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();

    // 5. Print/log the timing
    info("Time spent on log z perm: " + std::to_string(duration_ms) + " ms");
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void ECCVMProver::execute_relation_check_rounds()
{
    // 1. Record the start time
    auto start_time = std::chrono::high_resolution_clock::now();

    using Sumcheck = SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(key->circuit_size, transcript);
    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    zk_sumcheck_data = ZKData(key->log_circuit_size, transcript, key->commitment_key);

    sumcheck_output = sumcheck.prove(key->polynomials, relation_parameters, alpha, gate_challenges, zk_sumcheck_data);

    // 3. Record the end time
    auto end_time = std::chrono::high_resolution_clock::now();

    // 4. Compute the duration in milliseconds
    auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();

    // 5. Print/log the timing
    info("Time spent on sumcheck: " + std::to_string(duration_ms) + " ms");
}

/**
 * @brief Produce a univariate opening claim for the sumcheck multivariate evalutions and a batched univariate claim
 * for the transcript polynomials (for the Translator consistency check). Reduce the two opening claims to a single one
 * via Shplonk and produce an opening proof with the univariate PCS of choice (IPA when operating on Grumpkin).
 *
 */
void ECCVMProver::execute_pcs_rounds()
{ // 1. Record the start time
    auto start_time = std::chrono::high_resolution_clock::now();

    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiProver_<Curve>;
    using Shplonk = ShplonkProver_<Curve>;
    using OpeningClaim = ProverOpeningClaim<Curve>;

    SmallSubgroupIPA small_subgroup_ipa_prover(zk_sumcheck_data,
                                               sumcheck_output.challenge,
                                               sumcheck_output.claimed_libra_evaluation,
                                               transcript,
                                               key->commitment_key);
    // Execute the Shplemini (Gemini + Shplonk) protocol to produce a univariate opening claim for the multilinear
    // evaluations produced by Sumcheck
    const OpeningClaim multivariate_to_univariate_opening_claim =
        Shplemini::prove(key->circuit_size,
                         key->polynomials.get_unshifted(),
                         key->polynomials.get_to_be_shifted(),
                         sumcheck_output.challenge,
                         key->commitment_key,
                         transcript,
                         small_subgroup_ipa_prover.get_witness_polynomials(),
                         sumcheck_output.round_univariates,
                         sumcheck_output.round_univariate_evaluations);

    // 3. Record the end time
    auto end_time = std::chrono::high_resolution_clock::now();

    // 4. Compute the duration in milliseconds
    auto duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();

    // 5. Print/log the timing
    info("Time spent on Shplemini: " + std::to_string(duration_ms) + " ms");

    start_time = std::chrono::high_resolution_clock::now();
    // Get the challenge at which we evaluate all transcript polynomials as univariates
    evaluation_challenge_x = transcript->template get_challenge<FF>("Translation:evaluation_challenge_x");

    // Evaluate the transcript polynomials at the challenge
    translation_evaluations.op = key->polynomials.transcript_op.evaluate(evaluation_challenge_x);
    translation_evaluations.Px = key->polynomials.transcript_Px.evaluate(evaluation_challenge_x);
    translation_evaluations.Py = key->polynomials.transcript_Py.evaluate(evaluation_challenge_x);
    translation_evaluations.z1 = key->polynomials.transcript_z1.evaluate(evaluation_challenge_x);
    translation_evaluations.z2 = key->polynomials.transcript_z2.evaluate(evaluation_challenge_x);

    // Add the univariate evaluations to the transcript so the verifier can reconstruct the batched evaluation
    transcript->send_to_verifier("Translation:op", translation_evaluations.op);
    transcript->send_to_verifier("Translation:Px", translation_evaluations.Px);
    transcript->send_to_verifier("Translation:Py", translation_evaluations.Py);
    transcript->send_to_verifier("Translation:z1", translation_evaluations.z1);
    transcript->send_to_verifier("Translation:z2", translation_evaluations.z2);

    // Get another challenge for batching the univariates and evaluations
    FF ipa_batching_challenge = transcript->template get_challenge<FF>("Translation:ipa_batching_challenge");

    // Collect the polynomials and evaluations to be batched
    RefArray univariate_polynomials{ key->polynomials.transcript_op,
                                     key->polynomials.transcript_Px,
                                     key->polynomials.transcript_Py,
                                     key->polynomials.transcript_z1,
                                     key->polynomials.transcript_z2 };
    std::array<FF, univariate_polynomials.size()> univariate_evaluations{ translation_evaluations.op,
                                                                          translation_evaluations.Px,
                                                                          translation_evaluations.Py,
                                                                          translation_evaluations.z1,
                                                                          translation_evaluations.z2 };

    // Construct the batched polynomial and batched evaluation to produce the batched opening claim
    Polynomial batched_univariate{ key->circuit_size };
    FF batched_evaluation{ 0 };
    FF batching_scalar = FF(1);
    for (auto [polynomial, eval] : zip_view(univariate_polynomials, univariate_evaluations)) {
        batched_univariate.add_scaled(polynomial, batching_scalar);
        batched_evaluation += eval * batching_scalar;
        batching_scalar *= ipa_batching_challenge;
    }

    const OpeningClaim translation_opening_claim = { .polynomial = batched_univariate,
                                                     .opening_pair = { evaluation_challenge_x, batched_evaluation } };
    const std::array<OpeningClaim, 2> opening_claims = { multivariate_to_univariate_opening_claim,
                                                         translation_opening_claim };

    // Reduce the opening claims to a single opening claim via Shplonk
    const OpeningClaim batch_opening_claim = Shplonk::prove(key->commitment_key, opening_claims, transcript);

    // Compute the opening proof for the batched opening claim with the univariate PCS
    PCS::compute_opening_proof(key->commitment_key, batch_opening_claim, ipa_transcript);

    // 3. Record the end time
    end_time = std::chrono::high_resolution_clock::now();

    // 4. Compute the duration in milliseconds
    duration_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();

    // 5. Print/log the timing
    info("Time spent on Shplonk + IPA: " + std::to_string(duration_ms) + " ms");
    // Produce another challenge passed as input to the translator verifier
    translation_batching_challenge_v = transcript->template get_challenge<FF>("Translation:batching_challenge");

    vinfo("computed opening proof");
}

ECCVMProof ECCVMProver::export_proof()
{
    return { transcript->export_proof(), ipa_transcript->export_proof() };
}

ECCVMProof ECCVMProver::construct_proof()
{
    PROFILE_THIS_NAME("ECCVMProver::construct_proof");

    execute_preamble_round();

    execute_wire_commitments_round();

    execute_log_derivative_commitments_round();

    execute_grand_product_computation_round();

    execute_relation_check_rounds();

    execute_pcs_rounds();

    return export_proof();
}
} // namespace bb
