// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "eccvm_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
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
}

/**
 * @brief Fiat-Shamir the VK
 *
 */
void ECCVMProver::execute_preamble_round()
{
    using VerificationKey = Flavor::VerificationKey;

    // Fiat-Shamir the vk hash
    VerificationKey vk;
    typename Flavor::BF vkey_hash = vk.add_hash_to_transcript("", *transcript);
    vinfo("ECCVM vk hash in prover: ", vkey_hash);
}

/**
 * @brief Compute commitments to the first three wires
 *
 */
void ECCVMProver::execute_wire_commitments_round()
{
    // To commit to the masked wires when `real_size` < `circuit_size`, we use
    // `commit_structured` that ignores 0 coefficients between the real size and the last NUM_DISABLED_ROWS_IN_SUMCHECK
    // wire entries.
    const size_t circuit_size = key->circuit_size;
    unmasked_witness_size = circuit_size - NUM_DISABLED_ROWS_IN_SUMCHECK;

    CommitmentKey::CommitType commit_type =
        (circuit_size > key->real_size) ? CommitmentKey::CommitType::Structured : CommitmentKey::CommitType::Default;

    // Commit to wires whose length is bounded by the real size of the ECCVM
    for (const auto& [wire, label] : zip_view(key->polynomials.get_wires_without_accumulators(),
                                              commitment_labels.get_wires_without_accumulators())) {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1240) Structured Polynomials in
        // ECCVM/Translator/MegaZK
        const size_t start = circuit_size == wire.size() ? 0 : 1;
        std::vector<std::pair<size_t, size_t>> active_ranges{ { start, key->real_size + start },
                                                              { unmasked_witness_size, circuit_size } };
        commit_to_witness_polynomial(wire, label, commit_type, active_ranges);
    }

    // The accumulators are populated until the 2^{CONST_ECCVM_LOG_N}, therefore we commit to a full-sized polynomial
    for (const auto& [wire, label] :
         zip_view(key->polynomials.get_accumulators(), commitment_labels.get_accumulators())) {
        commit_to_witness_polynomial(wire, label);
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
        key->polynomials, relation_parameters, unmasked_witness_size);
    commit_to_witness_polynomial(key->polynomials.lookup_inverses, commitment_labels.lookup_inverses);
}

/**
 * @brief Compute permutation and lookup grand product polynomials and commitments
 *
 */
void ECCVMProver::execute_grand_product_computation_round()
{
    // Compute permutation grand product and their commitments
    compute_grand_products<Flavor>(key->polynomials, relation_parameters, unmasked_witness_size);
    commit_to_witness_polynomial(key->polynomials.z_perm, commitment_labels.z_perm);
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void ECCVMProver::execute_relation_check_rounds()
{

    using Sumcheck = SumcheckProver<Flavor, CONST_ECCVM_LOG_N>;

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    std::vector<FF> gate_challenges(CONST_ECCVM_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    Sumcheck sumcheck(key->circuit_size, key->polynomials, transcript, alpha, gate_challenges, relation_parameters);

    zk_sumcheck_data = ZKData(key->log_circuit_size, transcript, key->commitment_key);

    sumcheck_output = sumcheck.prove(zk_sumcheck_data);
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
    small_subgroup_ipa_prover.prove();

    // Execute the Shplemini (Gemini + Shplonk) protocol to produce a univariate opening claim for the multilinear
    // evaluations produced by Sumcheck
    PolynomialBatcher polynomial_batcher(key->circuit_size);
    polynomial_batcher.set_unshifted(key->polynomials.get_unshifted());
    polynomial_batcher.set_to_be_shifted_by_one(key->polynomials.get_to_be_shifted());

    OpeningClaim multivariate_to_univariate_opening_claim =
        Shplemini::prove(key->circuit_size,
                         polynomial_batcher,
                         sumcheck_output.challenge,
                         key->commitment_key,
                         transcript,
                         small_subgroup_ipa_prover.get_witness_polynomials(),
                         sumcheck_output.round_univariates,
                         sumcheck_output.round_univariate_evaluations);

    ECCVMProver::compute_translation_opening_claims();

    opening_claims.back() = std::move(multivariate_to_univariate_opening_claim);

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
 * @brief To link the ECCVM Transcript wires `op`, `Px`, `Py`, `z1`, and `z2` to the accumulator computed by the
 * translator, we verify their evaluations as univariates. For efficiency reasons, we batch these evaluations.
 *
 * @details As a sub-protocol of ECCVM, we are batch opening the `op`, `Px`, `Py`, `z1`, and `z2` wires as univariates
 * (as opposed to their openings as multilinears performed after Sumcheck). We often refer to these polynomials as
 * `translation_polynomials` \f$ T_i \f$ for \f$ i=0, \ldots, 4\f$.
 * Below, the `evaluation_challenge_x` is denoted by \f$ x \f$ and `batching_challenge_v` is denoted by \f$v\f$.
 *
 * The batched translation evaluation
 * \f{align}{
 * \sum_{i=0}^4 T_i(x) \cdot v^i
 * \f}
 * is used by the \ref TranslatorVerifier to bind the ECCOpQueues over BN254 and Grumpkin. Namely, we
 * check that the field element \f$ A = \text{accumulated_result} \f$ accumulated from the Ultra ECCOpQueue by
 * TranslatorProver satisfies
 * \f{align}{ x\cdot A = \sum_{i=0}^4 T_i(x) \cdot v^i, \f}
 * where \f$ x \f$ is an artifact of our implementation of shiftable polynomials.
 *
 * This check gets trickier when the witness wires in ECCVM are masked. Namely, we randomize the last \f$
 * \text{NUM_DISABLED_ROWS_IN_SUMCHECK} \f$ coefficients of \f$ T_i \f$. Let \f$ N = \text{circuit_size} -
 * \text{NUM_DISABLED_ROWS_IN_SUMCHECK}\f$. Denote
 * \f{align}{ \widetilde{T}_i(X) = T_i(X) + X^N \cdot m_i(X). \f}
 *
 * Informally speaking, to preserve ZK, the \ref ECCVMVerifier must never obtain the commitments to \f$ T_i \f$ or
 * the evaluations \f$ T_i(x) \f$ of the unmasked wires.
 *
 * With masking, the identity above becomes
 * \f{align}{ x\cdot A = \sum_i (\widetilde{T}_i - X^N \cdot m_i(X)) v^i =\sum_i \widetilde{T}_i v^i - X^N \cdot \sum_i
 * m_i(X) v^i \f}
 *
 * The prover could send the evals of \f$ \widetilde{T}_i \f$ without revealing witness information. Moreover, the
 * prover could prove the evaluation \f$ x^N \cdot \sum m_i(x) v^i \f$ using SmallSubgroupIPA argument. Namely, before
 * obtaining \f$ x \f$ and \f$ v \f$, the prover sends a commitment to the polynomial \f$ \widetilde{M} = M + Z_H \cdot
 * R\f$, where the coefficients of \f$ M \f$ are given by the concatenation \f{align}{ M = (m_0||m_1||m_2||m_3||m_4 ||
 * \vec{0}) \f} in the Lagrange basis over the small multiplicative subgroup \f$ H \f$, where \f$ Z_H \f$ is the
 * vanishing polynomial \f$ X^{|H|} -1 \f$ and \f$ R(X) \f$ is a random polynomial of degree \f$ 2 \f$. \ref
 * SmallSubgroupIPAProver allows us to prove the inner product of \f$ M \f$ against the `challenge_polynomial`
 * \f{align}{ ( 1, x , x^2 , x^3, v , v\cdot x ,\ldots, ... , v^4, v^4 x , v^4 x^2 , v^4 x^3, \vec{0} )\f}
 * without revealing any other witness information apart from the claimed inner product.
 *
 * @return Ppopulate `opening_claims`.
 *
 */
void ECCVMProver::compute_translation_opening_claims()
{
    // Used to capture the batched evaluation of unmasked `translation_polynomials` while preserving ZK
    using SmallIPA = SmallSubgroupIPAProver<ECCVMFlavor>;

    // Initialize SmallSubgroupIPA structures
    std::array<std::string, NUM_SMALL_IPA_EVALUATIONS> evaluation_labels;
    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> evaluation_points;

    // Collect the polynomials to be batched
    RefArray translation_polynomials{ key->polynomials.transcript_op,
                                      key->polynomials.transcript_Px,
                                      key->polynomials.transcript_Py,
                                      key->polynomials.transcript_z1,
                                      key->polynomials.transcript_z2 };

    // Extract the masking terms of `translation_polynomials`, concatenate them in the Lagrange basis over SmallSubgroup
    // H, mask the resulting polynomial, and commit to it
    TranslationData<Transcript> translation_data(translation_polynomials, transcript, key->commitment_key);

    // Get a challenge to evaluate the `translation_polynomials` as univariates
    evaluation_challenge_x = transcript->template get_challenge<FF>("Translation:evaluation_challenge_x");

    // Evaluate `translation_polynomial` as univariates and add their evaluations at x to the transcript
    for (auto [eval, poly, label] :
         zip_view(translation_evaluations.get_all(), translation_polynomials, translation_evaluations.labels)) {
        eval = poly.evaluate(evaluation_challenge_x);
        transcript->template send_to_verifier(label, eval);
    }

    // Get another challenge to batch the evaluations of the transcript polynomials
    batching_challenge_v = transcript->template get_challenge<FF>("Translation:batching_challenge_v");

    SmallIPA translation_masking_term_prover(
        translation_data, evaluation_challenge_x, batching_challenge_v, transcript, key->commitment_key);
    translation_masking_term_prover.prove();

    // Get the challenge to check evaluations of the SmallSubgroupIPA witness polynomials
    FF small_ipa_evaluation_challenge =
        transcript->template get_challenge<FF>("Translation:small_ipa_evaluation_challenge");

    // Populate SmallSubgroupIPA opening claims:
    // 1. Get the evaluation points and labels
    evaluation_points = translation_masking_term_prover.evaluation_points(small_ipa_evaluation_challenge);
    evaluation_labels = translation_masking_term_prover.evaluation_labels();
    // 2. Compute the evaluations of witness polynomials at corresponding points, send them to the verifier, and create
    // the opening claims
    for (size_t idx = 0; idx < NUM_SMALL_IPA_EVALUATIONS; idx++) {
        auto witness_poly = translation_masking_term_prover.get_witness_polynomials()[idx];
        const FF evaluation = witness_poly.evaluate(evaluation_points[idx]);
        transcript->send_to_verifier(evaluation_labels[idx], evaluation);
        opening_claims[idx] = { .polynomial = witness_poly, .opening_pair = { evaluation_points[idx], evaluation } };
    }

    // Compute the opening claim for the masked evaluations of `op`, `Px`, `Py`, `z1`, and `z2` at
    // `evaluation_challenge_x` batched by the powers of `batching_challenge_v`.
    Polynomial batched_translation_univariate{ key->circuit_size };
    FF batched_translation_evaluation{ 0 };
    FF batching_scalar = FF(1);
    for (auto [polynomial, eval] : zip_view(translation_polynomials, translation_evaluations.get_all())) {
        batched_translation_univariate.add_scaled(polynomial, batching_scalar);
        batched_translation_evaluation += eval * batching_scalar;
        batching_scalar *= batching_challenge_v;
    }

    // Add the batched claim to the array of SmallSubgroupIPA opening claims.
    opening_claims[NUM_SMALL_IPA_EVALUATIONS] = { batched_translation_univariate,
                                                  { evaluation_challenge_x, batched_translation_evaluation } };
}

/**
 * @brief Utility to mask and commit to a witness polynomial and send the commitment to verifier.
 *
 * @param polynomial
 * @param label
 */
void ECCVMProver::commit_to_witness_polynomial(Polynomial& polynomial,
                                               const std::string& label,
                                               CommitmentKey::CommitType commit_type,
                                               const std::vector<std::pair<size_t, size_t>>& active_ranges)
{
    // We add NUM_DISABLED_ROWS_IN_SUMCHECK-1 random values to the coefficients of each wire polynomial to not leak
    // information via the commitment and evaluations. -1 is caused by shifts.
    polynomial.mask();
    transcript->send_to_verifier(label, key->commitment_key.commit_with_type(polynomial, commit_type, active_ranges));
}
} // namespace bb
