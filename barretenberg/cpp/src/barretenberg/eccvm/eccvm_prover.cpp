// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "eccvm_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/commitment_schemes/triple_ipa/triple_ipa.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

#include <iterator>

namespace bb {

ECCVMProver::ECCVMProver(CircuitBuilder& builder, const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{
    BB_BENCH_NAME("ECCVMProver(CircuitBuilder&)");

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/939): Remove redundancy between
    // ProvingKey/ProverPolynomials and update the model to reflect what's done in all other proving systems.

    // Construct the proving key; populates all polynomials except for witness polys
    key = std::make_shared<ProvingKey>(builder);

    key->commitment_key = CommitmentKey(key->circuit_size);

    VerificationKey vk;
    for (auto [commitment, vk_commitment] : zip_view(commitments.get_precomputed(), vk.get_all())) {
        commitment = vk_commitment;
    }
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
    typename Flavor::BF vk_hash = vk.get_hash();
    transcript->add_to_hash_buffer("vk_hash", vk_hash);
    vinfo("ECCVM vk hash in prover: ", vk_hash);
}

/**
 * @brief Compute commitments to the first three wires
 *
 */
void ECCVMProver::execute_wire_commitments_round()
{
    BB_BENCH_NAME("ECCVMProver::execute_wire_commitments_round");

    const size_t circuit_size = key->circuit_size;

    // Create and commit to Gemini masking polynomial (for ZK-PCS)
    key->polynomials.gemini_masking_poly = Polynomial::random(circuit_size);
    auto masking_commitment = key->commitment_key.commit(key->polynomials.gemini_masking_poly);
    commitments.gemini_masking_poly = masking_commitment;
    transcript->send_to_verifier("Gemini:masking_poly_comm", masking_commitment);

    auto batch = key->commitment_key.start_batch();
    for (const auto& [wire, label] : zip_view(key->polynomials.get_wires(), commitment_labels.get_wires())) {
        batch.add_to_batch(wire, label, Flavor::CommitmentLabels::wire_has_high_duplicate_density(label));
    }
    auto wire_commitments = batch.commit_and_send_to_verifier(transcript);
    for (auto [commitment, computed_commitment] : zip_view(commitments.get_wires(), wire_commitments)) {
        commitment = computed_commitment;
    }
}

/**
 * @brief Compute sorted witness-table accumulator
 *
 */
void ECCVMProver::execute_log_derivative_commitments_round()
{
    BB_BENCH_NAME("ECCVMProver::execute_log_derivative_commitments_round");

    // Compute and add beta to relation parameters
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });

    // TODO(#583)(@zac-williamson): fix Transcript to be able to generate more than 2 challenges per round! oof.
    auto beta_sqr = beta * beta;
    auto beta_quartic = beta_sqr * beta_sqr;
    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;
    relation_parameters.beta_sqr = beta_sqr;
    relation_parameters.beta_cube = beta_sqr * beta;
    relation_parameters.beta_quartic = beta_quartic;
    // `eccvm_set_permutation_delta` is used in the set membership gadget in eccvm/ecc_set_relation.hpp, specifically to
    // constrain (pc, round, wnaf_slice) to match between the MSM table and the Precomputed table. The number of rows we
    // add per short scalar `mul` is slightly less in the Precomputed table as in the MSM table, so to get the
    // permutation argument to work out, when `precompute_select == 0`, we must implicitly _remove_ (0, 0, 0) as a tuple
    // on the wNAF side. This corresponds to dividing by
    // (γ+t·β⁴)·(γ+β²+t·β⁴)·(γ+2β²+t·β⁴)·(γ+3β²+t·β⁴), where t = FIRST_TERM_TAG.
    auto first_term_tag = beta_quartic; // FIRST_TERM_TAG (= 1) * beta_quartic
    relation_parameters.eccvm_set_permutation_delta = (gamma + first_term_tag) * (gamma + beta_sqr + first_term_tag) *
                                                      (gamma + beta_sqr + beta_sqr + first_term_tag) *
                                                      (gamma + beta_sqr + beta_sqr + beta_sqr + first_term_tag);
    relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();
    // Compute inverse polynomial for our logarithmic-derivative lookup method
    // Skip the disabled head region to preserve masking values
    compute_logderivative_inverse<typename Flavor::FF,
                                  typename Flavor::LookupRelation,
                                  typename Flavor::ProverPolynomials,
                                  true>(key->polynomials, relation_parameters, Flavor::TRACE_OFFSET);
    auto& li = key->polynomials.lookup_inverses;
    commitments.lookup_inverses = key->commitment_key.commit(li);
    transcript->send_to_verifier(commitment_labels.lookup_inverses, commitments.lookup_inverses);
}

/**
 * @brief Compute permutation and lookup grand product polynomials and commitments
 *
 */
void ECCVMProver::execute_grand_product_computation_round()
{
    BB_BENCH_NAME("ECCVMProver::execute_grand_product_computation_round");
    // Compute permutation grand product (starts after disabled head region via gp_start)
    compute_grand_products<Flavor>(key->polynomials, relation_parameters);
    auto& zp = key->polynomials.z_perm;
    // set has_duplicates_hint for Z_PERM (empty row = duplicate Z value)
    commitments.z_perm = key->commitment_key.commit(zp, /*has_duplicates_hint=*/true);
    transcript->send_to_verifier(commitment_labels.z_perm, commitments.z_perm);
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void ECCVMProver::execute_relation_check_rounds()
{
    BB_BENCH_NAME("ECCVMProver::execute_relation_check_rounds");
    using Sumcheck = SumcheckProver<Flavor>;

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    std::vector<FF> gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", CONST_ECCVM_LOG_N);

    Sumcheck sumcheck(key->circuit_size,
                      key->polynomials,
                      transcript,
                      alpha,
                      gate_challenges,
                      relation_parameters,
                      CONST_ECCVM_LOG_N);

    zk_sumcheck_data = ZKData(key->log_circuit_size, transcript, key->commitment_key);

    sumcheck_output = sumcheck.prove(zk_sumcheck_data);
}

/**
 * @brief Add the Libra (sumcheck ZK masking) univariate opening claims, produced via the SmallSubgroupIPA prover.
 */
void ECCVMProver::append_libra_opening_claims()
{
    using Curve = typename Flavor::Curve;

    SmallSubgroupIPA small_subgroup_ipa_prover(zk_sumcheck_data,
                                               sumcheck_output.challenge,
                                               sumcheck_output.claimed_libra_evaluation,
                                               transcript,
                                               key->commitment_key);
    small_subgroup_ipa_prover.prove();

    const FF libra_evaluation_challenge =
        transcript->template get_challenge<FF>("Libra:small_ipa_evaluation_challenge");
    auto libra_opening_claims = make_small_ipa_prover_opening_claims<Curve>(
        small_subgroup_ipa_prover.get_witness_polynomials(), libra_evaluation_challenge, "Libra:", transcript);
    const auto libra_commitments = small_subgroup_ipa_prover.get_witness_commitments();

    for (size_t idx = 0; idx < libra_opening_claims.size(); ++idx) {
        univariate_claims.add(std::move(libra_opening_claims[idx]),
                              libra_commitments[SMALL_IPA_CLAIMS[idx].commitment_index]);
    }
}

/**
 * @brief Add the committed-sumcheck round univariate opening claims (3 per round: evaluations at 0, 1, and the round
 * challenge), pairing each prover polynomial with its round commitment.
 */
void ECCVMProver::append_sumcheck_round_opening_claims()
{
    using Shplemini = ShpleminiProver_<typename Flavor::Curve>;
    static constexpr size_t NUM_SUMCHECK_CLAIMS_PER_ROUND = 3;

    auto sumcheck_round_claims = Shplemini::compute_sumcheck_round_claims(key->circuit_size,
                                                                          sumcheck_output.challenge,
                                                                          sumcheck_output.round_univariates,
                                                                          sumcheck_output.round_univariate_evaluations);

    for (size_t idx = 0; idx < sumcheck_output.round_univariate_commitments.size(); ++idx) {
        for (size_t eval_idx = 0; eval_idx < NUM_SUMCHECK_CLAIMS_PER_ROUND; ++eval_idx) {
            const size_t claim_idx = idx * NUM_SUMCHECK_CLAIMS_PER_ROUND + eval_idx;
            univariate_claims.add(std::move(sumcheck_round_claims[claim_idx]),
                                  sumcheck_output.round_univariate_commitments[idx]);
        }
    }
}

/**
 * @brief Add a small random univariate opening claim that masks the TripleIPA pow tensor.
 * @details The batched quotient P (pow-tensor witness) is contracted against the eq and shift tensors in the TripleIPA
 * cross-sums c_{F,P}, c_{sh,P}. Folding one extra random claim into the Shplonk batch injects randomness into P's
 * low-degree coefficients, blinding those contractions, while P(z)=0 is preserved automatically by the Shplonk
 * identity. The multilinear opening is already masked by the dense PCS mask, so this mask is tiny.
 */
void ECCVMProver::append_pow_masking_opening_claim()
{
    static constexpr size_t POW_MASK_SIZE = 8;
    Polynomial mask = Polynomial::random(POW_MASK_SIZE, key->circuit_size, /*start_index=*/0);
    Commitment mask_commitment = key->commitment_key.commit(mask);
    transcript->send_to_verifier("TripleIPA:pow_mask_commitment", mask_commitment);
    const FF mask_challenge = transcript->template get_challenge<FF>("TripleIPA:pow_mask_challenge");
    const FF mask_evaluation = mask.evaluate(mask_challenge);
    transcript->send_to_verifier("TripleIPA:pow_mask_evaluation", mask_evaluation);
    univariate_claims.add({ std::move(mask), { mask_challenge, mask_evaluation } }, mask_commitment);
}

/**
 * @brief Open the sumcheck multilinears together with the single reduced univariate claim via the TripleIPA.
 */
void ECCVMProver::prove_triple_ipa(const OpeningClaim& prover_opening, const VerifierOpeningClaim& verifier_opening)
{
    using TripleIPA = bb::TripleIPA<Flavor::Curve, CONST_ECCVM_LOG_N>;
    typename TripleIPA::TripleIpaInput input;

    const FF rho = transcript->template get_challenge<FF>("TripleIPA:rho");
    input.claim_data = TripleIPA::TripleIpaClaimData::create(commitments.get_unshifted(),
                                                             sumcheck_output.claimed_evaluations.get_unshifted(),
                                                             commitments.get_to_be_shifted(),
                                                             sumcheck_output.claimed_evaluations.get_to_be_shifted(),
                                                             sumcheck_output.claimed_evaluations.get_shifted(),
                                                             sumcheck_output.challenge,
                                                             rho,
                                                             verifier_opening);

    // Prover-only: share the witness polynomials backing the opening — the unshifted set, the to-be-shifted sources
    // (for the shift claim's batched witness), and the reduced univariate.
    auto unshifted_polynomials = key->polynomials.get_unshifted();
    input.unshifted_polynomials.reserve(unshifted_polynomials.size());
    for (auto& polynomial : unshifted_polynomials) {
        input.unshifted_polynomials.emplace_back(polynomial.share());
    }
    auto shifted_polynomials = key->polynomials.get_to_be_shifted();
    input.shifted_polynomials.reserve(shifted_polynomials.size());
    for (auto& polynomial : shifted_polynomials) {
        input.shifted_polynomials.emplace_back(polynomial.share());
    }
    input.univariate_polynomial = prover_opening.polynomial.share();

    auto ipa_transcript = std::make_shared<Transcript>();
    TripleIPA::compute_opening_proof(key->commitment_key, input, ipa_transcript);
    ipa_proof = ipa_transcript->export_proof();
}

/**
 * @brief Reduce all univariate opening claims to a single opening claim via one Shplonk.
 * @details The batched opening claim becomes the univariate (pow-tensor) input to the TripleIPA. The prover
 * reconstructs the same batched commitment [P] the verifier derives, so the returned claim carries both the prover
 * witness polynomial and that commitment.
 */
std::pair<ECCVMProver::OpeningClaim, ECCVMProver::VerifierOpeningClaim> ECCVMProver::reduce_univariate_opening_claims()
{
    using ShplonkProver = ShplonkProver_<Flavor::Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Flavor::Curve>;

    const auto shplonk_output = ShplonkProver::compute_partially_evaluated_quotient(
        key->commitment_key, univariate_claims.prover_claims, transcript);
    const auto verifier_opening = ShplonkVerifier::compute_partially_evaluated_quotient_claim(
        key->commitment_key.get_monomial_points()[0],
        univariate_claims.verifier_claims,
        shplonk_output.quotient_commitment,
        shplonk_output.batching_challenge,
        shplonk_output.opening_claim.opening_pair.challenge);
    BB_ASSERT(verifier_opening.opening_pair == shplonk_output.opening_claim.opening_pair);

    return { shplonk_output.opening_claim, verifier_opening };
}

typename ECCVMProver::Proof ECCVMProver::export_proof()
{
    return { transcript->export_proof() };
}

typename ECCVMProver::Proof ECCVMProver::construct_proof()
{
    BB_BENCH_NAME("ECCVMProver::construct_proof");

    execute_preamble_round();
    execute_wire_commitments_round();
    execute_log_derivative_commitments_round();
    execute_grand_product_computation_round();
    execute_relation_check_rounds(); // sumcheck

    // Gather every univariate opening claim into `univariate_claims`. Libra (sumcheck ZK masking) is produced first
    // since its commitments enter the transcript before translation's; the committed sumcheck round claims follow.
    // A final random masking claim blinds the TripleIPA pow tensor (see append_pow_masking_opening_claim).
    append_libra_opening_claims();
    append_translation_opening_claims();
    append_sumcheck_round_opening_claims();
    append_pow_masking_opening_claim();

    // A single Shplonk reduces them to one opening; the TripleIPA opens the sumcheck multilinears with it.
    auto [prover_opening, verifier_opening] = reduce_univariate_opening_claims();
    prove_triple_ipa(prover_opening, verifier_opening);

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
 * The translation polynomials \f$ T_i \f$ contain random masking values in their first TRACE_OFFSET coefficients.
 * Commitments to the masked \f$ T_i \f$ are safe to reveal, but the evaluations \f$ T_i(x) \f$ include the masking
 * contribution. To preserve ZK, the prover uses SmallSubgroupIPA to prove the masking correction: the masking
 * terms from all five \f$ T_i \f$ are concatenated into a polynomial \f$ M \f$ over a small subgroup \f$ H \f$,
 * and the verifier recovers \f$ \sum_i m_i(x) \cdot v^i \f$ via an inner-product argument without learning
 * the individual masking values.
 *
 */
void ECCVMProver::append_translation_opening_claims()
{
    // Used to capture the batched evaluation of unmasked `translation_polynomials` while preserving ZK
    using SmallIPA = SmallSubgroupIPAProver<ECCVMFlavor>;
    using Curve = Flavor::Curve;

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
        transcript->send_to_verifier(label, eval);
    }

    // Get another challenge to batch the evaluations of the transcript polynomials
    batching_challenge_v = transcript->template get_challenge<FF>("Translation:batching_challenge_v");

    SmallIPA translation_masking_term_prover(
        translation_data, evaluation_challenge_x, batching_challenge_v, transcript, key->commitment_key);
    translation_masking_term_prover.prove();

    // Get the challenge to check evaluations of the SmallSubgroupIPA witness polynomials
    FF small_ipa_evaluation_challenge =
        transcript->template get_challenge<FF>("Translation:small_ipa_evaluation_challenge");

    // Populate the five SmallSubgroupIPA opening claims via the shared helper, which evaluates witness polynomials,
    // sends transmitted slots to the transcript, and fills boundary slots with 0.
    const auto small_ipa_claims =
        make_small_ipa_prover_opening_claims<Curve>(translation_masking_term_prover.get_witness_polynomials(),
                                                    small_ipa_evaluation_challenge,
                                                    "Translation:",
                                                    transcript);
    const auto small_ipa_commitments = translation_masking_term_prover.get_witness_commitments();

    for (size_t idx = 0; idx < NUM_SMALL_IPA_OPENING_CLAIMS; ++idx) {
        univariate_claims.add(small_ipa_claims[idx], small_ipa_commitments[SMALL_IPA_CLAIMS[idx].commitment_index]);
    }

    // Compute the opening claim for the masked evaluations of `op`, `Px`, `Py`, `z1`, and `z2` at
    // `evaluation_challenge_x` batched by the powers of `batching_challenge_v`.
    const std::vector<FF> batching_challenges = batching_scalars(batching_challenge_v, NUM_TRANSLATION_EVALUATIONS);
    std::vector<PolynomialSpan<const FF>> translation_spans;
    translation_spans.reserve(NUM_TRANSLATION_EVALUATIONS);
    for (const auto& polynomial : translation_polynomials) {
        translation_spans.push_back(static_cast<PolynomialSpan<const FF>>(polynomial));
    }
    Polynomial batched_translation_univariate{ key->circuit_size };
    add_scaled_batch(batched_translation_univariate,
                     std::span<const PolynomialSpan<const FF>>(translation_spans),
                     std::span<const FF>(batching_challenges));

    std::vector<FF> translation_evaluation_values;
    translation_evaluation_values.reserve(NUM_TRANSLATION_EVALUATIONS);
    for (const auto& eval : translation_evaluations.get_all()) {
        translation_evaluation_values.emplace_back(eval);
    }
    const FF batched_translation_evaluation = batch_evaluations<Curve>(
        std::span<const FF>(translation_evaluation_values), std::span<const FF>(batching_challenges));

    std::vector<Commitment> translation_commitments = { commitments.transcript_op,
                                                        commitments.transcript_Px,
                                                        commitments.transcript_Py,
                                                        commitments.transcript_z1,
                                                        commitments.transcript_z2 };

    // Add the batched translation univariate claim after the SmallSubgroupIPA opening claims.
    univariate_claims.add(
        { batched_translation_univariate, { evaluation_challenge_x, batched_translation_evaluation } },
        batch_commitments<Curve>(std::span<const Commitment>(translation_commitments),
                                 std::span<const FF>(batching_challenges)));
}

} // namespace bb
