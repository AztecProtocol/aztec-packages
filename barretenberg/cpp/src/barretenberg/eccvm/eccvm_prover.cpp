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
                         const bool fixed_size,
                         const std::shared_ptr<Transcript>& transcript,
                         const std::shared_ptr<Transcript>& ipa_transcript)
    : transcript(transcript)
    , ipa_transcript(ipa_transcript)
    , fixed_size(fixed_size)
{
    PROFILE_THIS_NAME("ECCVMProver(CircuitBuilder&)");

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/939): Remove redundancy between
    // ProvingKey/ProverPolynomials and update the model to reflect what's done in all other proving systems.

    // Construct the proving key; populates all polynomials except for witness polys
    key = fixed_size ? std::make_shared<ProvingKey>(builder, fixed_size) : std::make_shared<ProvingKey>(builder);

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
    // Commit to wires whose length is bounded by the real size of the ECCVM
    for (const auto& [wire, label] : zip_view(key->polynomials.get_wires_without_accumulators(),
                                              commitment_labels.get_wires_without_accumulators())) {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1240) Structured Polynomials in
        // ECCVM/Translator/MegaZK
        PolynomialSpan<FF> wire_span = wire;
        transcript->send_to_verifier(label, key->commitment_key->commit(wire_span.subspan(0, key->real_size)));
    }

    // The accumulators are populated until the 2^{CONST_ECCVM_LOG_N}, therefore we commit to a full-sized polynomial
    for (const auto& [wire, label] :
         zip_view(key->polynomials.get_accumulators(), commitment_labels.get_accumulators())) {
        transcript->send_to_verifier(label, key->commitment_key->commit(wire));
    }
}

/**
 * @brief Compute sorted witness-table accumulator
 *
 */
void ECCVMProver::execute_log_derivative_commitments_round()
{

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
    compute_logderivative_inverse<typename Flavor::FF, typename Flavor::LookupRelation>(
        key->polynomials, relation_parameters, key->circuit_size);
    transcript->send_to_verifier(commitment_labels.lookup_inverses,
                                 key->commitment_key->commit(key->polynomials.lookup_inverses));
}

/**
 * @brief Compute permutation and lookup grand product polynomials and commitments
 *
 */
void ECCVMProver::execute_grand_product_computation_round()
{
    // Compute permutation grand product and their commitments
    compute_grand_products<Flavor>(key->polynomials, relation_parameters);

    transcript->send_to_verifier(commitment_labels.z_perm, key->commitment_key->commit(key->polynomials.z_perm));
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void ECCVMProver::execute_relation_check_rounds()
{

    using Sumcheck = SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(key->circuit_size, transcript);
    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    zk_sumcheck_data = ZKData(key->log_circuit_size, transcript, key->commitment_key);

    sumcheck_output = sumcheck.prove(key->polynomials, relation_parameters, alpha, gate_challenges, zk_sumcheck_data);
}

/**
 * @brief Produce a univariate opening claim for the sumcheck multivariate evalutions and a batched univariate claim
 * for the transcript polynomials (for the Translator consistency check). Reduce the two opening claims to a single one
 * via Shplonk and produce an opening proof with the univariate PCS of choice (IPA when operating on Grumpkin).
 *
 */
void ECCVMProver::execute_pcs_rounds()
{
    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiProver_<Curve>;
    using Shplonk = ShplonkProver_<Curve>;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    SmallSubgroupIPA small_subgroup_ipa_prover(zk_sumcheck_data,
                                               sumcheck_output.challenge,
                                               sumcheck_output.claimed_libra_evaluation,
                                               transcript,
                                               key->commitment_key);
    // Execute the Shplemini (Gemini + Shplonk) protocol to produce a univariate opening claim for the multilinear
    // evaluations produced by Sumcheck
    PolynomialBatcher polynomial_batcher(key->circuit_size);
    polynomial_batcher.set_unshifted(key->polynomials.get_unshifted());
    polynomial_batcher.set_to_be_shifted_by_one(key->polynomials.get_to_be_shifted());

    const OpeningClaim multivariate_to_univariate_opening_claim =
        Shplemini::prove(key->circuit_size,
                         polynomial_batcher,
                         sumcheck_output.challenge,
                         key->commitment_key,
                         transcript,
                         small_subgroup_ipa_prover.get_witness_polynomials(),
                         sumcheck_output.round_univariates,
                         sumcheck_output.round_univariate_evaluations);

    const OpeningClaim translation_opening_claim = ECCVMProver::reduce_translation_evaluations();

    const std::array<OpeningClaim, 2> opening_claims = { multivariate_to_univariate_opening_claim,
                                                         translation_opening_claim };

    // Reduce the opening claims to a single opening claim via Shplonk
    const OpeningClaim batch_opening_claim = Shplonk::prove(key->commitment_key, opening_claims, transcript);

    // Compute the opening proof for the batched opening claim with the univariate PCS
    PCS::compute_opening_proof(key->commitment_key, batch_opening_claim, ipa_transcript);
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

/**
 * @brief The evaluations of the wires `op`, `Px`, `Py`, `z_1`, and `z_2` as univariate polynomials have to proved as
 * they are used in the 'TranslatorVerifier::verify_translation' sub-protocol and its recursive counterpart. To increase
 * the efficiency, we produce an OpeningClaim that is fed to Shplonk along with the OpeningClaim produced by Shplemini.
 *
 * @return ProverOpeningClaim<typename ECCVMFlavor::Curve>
 */
ProverOpeningClaim<typename ECCVMFlavor::Curve> ECCVMProver::reduce_translation_evaluations()
{
    static constexpr FF subgroup_generator = ECCVMFlavor::Curve::subgroup_generator;
    // Collect the polynomials and evaluations to be batched
    RefArray translation_polynomials{ key->polynomials.transcript_op,
                                      key->polynomials.transcript_Px,
                                      key->polynomials.transcript_Py,
                                      key->polynomials.transcript_z1,
                                      key->polynomials.transcript_z2 };

    TranslationData translation_data(univariate_polynomials, transcript, key->commitment_key);

    // Get the challenge at which we evaluate all transcript polynomials as univariates
    evaluation_challenge_x = transcript->template get_challenge<FF>("Translation:evaluation_challenge_x");

    // Evaluate the transcript polynomials as univariates and add their evaluations at x to the transcript
    for (auto [eval, poly, label] :
         zip_view(translation_evaluations.get_all(), translation_polynomials, translation_labels)) {
        *eval = poly.evaluate(evaluation_challenge_x);
        transcript->template send_to_verifier(label, *eval);
    }

    // Get another challenge to batch the evaluations of the transcript polynomials
    translation_batching_challenge_v = transcript->template get_challenge<FF>("Translation:batching_challenge_v");

    FF claimed_masking_eval = SmallSubgroupIPAProver<ECCVMFlavor>::compute_claimed_inner_product(
        translation_data, evaluation_challenge_x, translation_batching_challenge_v, univariate_polynomials.size());

    transcript->send_to_verifier("Translation:masking_term_eval", claimed_masking_eval);

    SmallSubgroupIPAProver<ECCVMFlavor> translation_masking_term_prover(translation_data,
                                                                        univariate_polynomials.size(),
                                                                        evaluation_challenge_x,
                                                                        translation_batching_challenge_v,
                                                                        claimed_masking_eval,
                                                                        transcript,
                                                                        key->commitment_key);
    FF small_ipa_evaluation_challenge =
        transcript->template get_challenge<FF>("Translation:small_ipa_evaluation_challenge");
    std::vector<ProverOpeningClaim<typename ECCVMFlavor::Curve>> small_ipa_opening_claims;

    std::array<FF, NUM_LIBRA_EVALUATIONS> evaluation_points = { small_ipa_evaluation_challenge,
                                                                small_ipa_evaluation_challenge * subgroup_generator,
                                                                small_ipa_evaluation_challenge,
                                                                small_ipa_evaluation_challenge };
    const std::array<std::string, NUM_LIBRA_EVALUATIONS> labels = { "Translation:concatenation_eval",
                                                                    "Translation:big_sum_shift_eval",
                                                                    "Translation:big_sum_eval",
                                                                    "Translation:quotient_eval" };
    for (size_t idx = 0; idx < NUM_LIBRA_EVALUATIONS; idx++) {
        auto witness_poly = translation_masking_term_prover.get_witness_polynomials()[idx];
        const FF eval = witness_poly.evaluate(evaluation_points[idx]);
        transcript->send_to_verifier(labels[idx], eval);
        small_ipa_opening_claims.push_back(
            { .polynomial = witness_poly, .opening_pair = { evaluation_points[idx], eval } });
    }
    // Construct the batched polynomial and batched evaluation to produce the batched opening claim
    Polynomial batched_translation_univariate{ key->circuit_size };
    FF batched_translation_evaluation{ 0 };
    FF batching_scalar = FF(1);
    for (auto [polynomial, eval] : zip_view(translation_polynomials, translation_evaluations.get_all())) {
        batched_translation_univariate.add_scaled(polynomial, batching_scalar);
        batched_translation_evaluation += *eval * batching_scalar;
        batching_scalar *= translation_batching_challenge_v;
    }

    return { .polynomial = batched_translation_univariate,
             .opening_pair = { evaluation_challenge_x, batched_translation_evaluation } };
}
} // namespace bb
