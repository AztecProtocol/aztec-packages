#include "batched_honk_translator_prover.hpp"

#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/polynomials/row_disabling_polynomial.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

namespace bb {

BatchedHonkTranslatorProver::BatchedHonkTranslatorProver(std::shared_ptr<HidingProverInstance> hiding_prover_instance,
                                                         std::shared_ptr<HidingVK> hiding_vk,
                                                         std::shared_ptr<TranslatorProvingKey> translator_key,
                                                         std::shared_ptr<Transcript> transcript)
    : hiding_prover_inst(std::move(hiding_prover_instance))
    , hiding_vk(std::move(hiding_vk))
    , translator_key(std::move(translator_key))
    , transcript(std::move(transcript))
{}

/**
 * @brief Run the hiding kernel's Oink pre-sumcheck phase.
 * @details Commits to witnesses and permutation polys, drawing the intermediate "alpha" challenge
 * at the end. This alpha is NOT the joint sumcheck separator; that is "Sumcheck:alpha" drawn later.
 */
void BatchedHonkTranslatorProver::execute_hiding_kernel_oink()
{
    OinkProver<HidingFlavor> oink_prover(hiding_prover_inst, hiding_vk, transcript);
    oink_prover.prove();
}

/**
 * @brief Run the translator's pre-sumcheck (Oink-like) phase on the shared transcript.
 * @details Delegates directly to TranslatorProver's public execute_*_round() methods,
 * which handle VK hashing, wire commitments, and permutation grand products. This ensures
 * the translator's commitment key is properly initialised and the proof transcript matches
 * exactly what the standalone TranslatorProver would produce.
 */
void BatchedHonkTranslatorProver::execute_translator_pre_sumcheck()
{
    TranslatorProver trans_prover(translator_key, transcript);
    trans_prover.execute_preamble_round();
    trans_prover.execute_wire_and_sorted_constraints_commitments_round();
    trans_prover.execute_grand_product_computation_round();
    translator_relation_parameters = trans_prover.relation_parameters;
}

/**
 * @brief Execute the joint 17-round sumcheck.
 *
 * @details Draws "Sumcheck:alpha" — binding to all pre-sumcheck messages from both circuits — then
 * runs 17 rounds, sending
 *   U_joint(x) = U_hiding(x) + α^{K_H} · U_translator(x) + L(x)
 * where L(x) is the joint Libra masking univariate.
 *
 * For rounds 0..hiding_log_n-1 ("real rounds"), the hiding contribution is computed via standard
 * compute_univariate minus compute_disabled_contribution (row-disabling for ZK).
 *
 * For rounds hiding_log_n..JOINT_LOG_N-1 ("virtual rounds"), the hiding polynomials are treated as
 * zero-padded to 2^JOINT_LOG_N. The contribution is computed via compute_virtual_contribution
 * (evaluating the relation at the only non-zero edge), scaled by the RDP factor from real rounds.
 * After each virtual round, the partially-evaluated hiding polynomials are updated by multiplying
 * by (1 - u_k), so the final claimed evaluations include the tau factor ∏(1 - u_k).
 */
void BatchedHonkTranslatorProver::execute_joint_sumcheck_rounds()
{
    // Draw joint alpha after all pre-sumcheck commitments from both circuits.
    const HidingFF alpha = transcript->template get_challenge<HidingFF>("Sumcheck:alpha");

    // Draw joint gate challenges (17 total).
    std::vector<HidingFF> gate_challenges(JOINT_LOG_N);
    for (size_t i = 0; i < JOINT_LOG_N; i++) {
        gate_challenges[i] =
            transcript->template get_challenge<HidingFF>("Sumcheck:gate_challenge_" + std::to_string(i));
    }

    // Compute α^{K_H}: offset for translator subrelation separators.
    HidingFF alpha_power_KH = HidingFF(1);
    for (size_t i = 0; i < HidingFlavor::NUM_SUBRELATIONS; i++) {
        alpha_power_KH *= alpha;
    }

    // Subrelation separator arrays (powers of alpha starting at alpha^1).
    const HidingSubrelationSeparators hiding_alphas =
        initialize_relation_separator<HidingFF, HidingFlavor::NUM_SUBRELATIONS - 1>(alpha);
    const TransSubrelationSeparators translator_alphas =
        initialize_relation_separator<HidingFF, TranslatorFlavor::NUM_SUBRELATIONS - 1>(alpha);

    // Derive hiding kernel log_circuit_size from the proving instance.
    const size_t hiding_log_n = hiding_prover_inst->log_dyadic_size();
    BB_ASSERT(hiding_log_n <= JOINT_LOG_N);

    // Joint ZK data: single Libra masking for all 17 rounds.
    constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(HidingCurve::SUBGROUP_SIZE));
    HidingCommitmentKey small_ck(1 << (log_subgroup_size + 1));
    zk_sumcheck_data = ZKData(JOINT_LOG_N, transcript, small_ck);

    // Gate separator polynomials:
    //   Hiding kernel uses gate_challenges[0..hiding_log_n-1] for beta_products (real rounds only).
    //   During virtual rounds, only betas[] and partial_evaluation_result are accessed.
    //   Translator uses all JOINT_LOG_N challenges.
    GateSeparatorPolynomial<HidingFF> hiding_gate_sep(gate_challenges, hiding_log_n);
    GateSeparatorPolynomial<HidingFF> translator_gate_sep(gate_challenges, JOINT_LOG_N);

    // Round helper objects.
    HidingProverRound hiding_round(static_cast<size_t>(1) << hiding_log_n);
    TransProverRound translator_round(static_cast<size_t>(1) << JOINT_LOG_N);

    // Row disabling polynomial for the hiding kernel.
    // (TranslatorFlavor does not use UseRowDisablingPolynomial.)
    RowDisablingPolynomial<HidingFF> hiding_rdp;

    auto& hiding_polys = hiding_prover_inst->polynomials;
    auto& hiding_params = hiding_prover_inst->relation_parameters;
    auto& translator_polys = translator_key->proving_key->polynomials;

    // Allocate partially evaluated polynomial tables (populated by the first partially_evaluate call).
    HidingPartialEvals hiding_partial(hiding_polys, static_cast<size_t>(1) << hiding_log_n);
    TransPartialEvals translator_partial(translator_polys, static_cast<size_t>(1) << JOINT_LOG_N);

    // Type aliases for static partial-evaluation helpers from SumcheckProver.
    using HidingSumcheck = SumcheckProver<HidingFlavor>;
    using TransSumcheck = SumcheckProver<TranslatorFlavor>;

    joint_challenge.reserve(JOINT_LOG_N);

    SumcheckRoundUnivariate U_joint;

    // Per-round helper: add Libra masking, send the joint univariate, receive the round challenge.
    auto send_round = [&](size_t round_idx) -> HidingFF {
        U_joint += HidingProverRound::compute_libra_univariate(zk_sumcheck_data, round_idx);
        transcript->send_to_verifier("Sumcheck:univariate_" + std::to_string(round_idx), U_joint);
        HidingFF u = transcript->template get_challenge<HidingFF>("Sumcheck:u_" + std::to_string(round_idx));
        joint_challenge.emplace_back(u);
        return u;
    };

    // Per-round helper: update ZK data, gate separators, translator round size, and optionally send
    // translator minicircuit evaluations.
    auto update_round_state = [&](size_t round_idx, const HidingFF& u) {
        if (round_idx == TranslatorFlavor::LOG_MINI_CIRCUIT_SIZE - 1) {
            transcript->send_to_verifier("Sumcheck:minicircuit_evaluations",
                                         TranslatorFlavor::get_minicircuit_evaluations(translator_partial));
        }
        zk_sumcheck_data.update_zk_sumcheck_data(u, round_idx);
        hiding_gate_sep.partially_evaluate(u);
        translator_gate_sep.partially_evaluate(u);
        translator_round.round_size >>= 1;
    };

    // Per-round helper: compute U_joint = U_hiding + α^{K_H}·U_translator from given polynomial
    // sources, add Libra masking, send to verifier, and return the round challenge.
    // hpolys/tpolys are the full tables on round 0, the partial-eval tables on subsequent rounds.
    auto do_round = [&](auto& hpolys, auto& tpolys, size_t round_idx) -> HidingFF {
        U_joint = SumcheckRoundUnivariate::zero();

        auto U_H = hiding_round.compute_univariate(hpolys, hiding_params, hiding_gate_sep, hiding_alphas);
        U_H -= hiding_round.compute_disabled_contribution(
            hpolys, hiding_params, hiding_gate_sep, hiding_alphas, round_idx, hiding_rdp);
        U_joint += U_H;

        auto U_T = translator_round.compute_univariate(
            tpolys, translator_relation_parameters, translator_gate_sep, translator_alphas);
        for (auto& eval : U_T.evaluations) {
            eval *= alpha_power_KH;
        }
        U_joint += U_T;

        return send_round(round_idx);
    };

    // ==================== Round 0: bootstraps hiding_partial and translator_partial ====================
    // PartiallyEvaluatedMultivariates only allocates output buffers; values are populated here.
    {
        const HidingFF u = do_round(hiding_polys, translator_polys, 0);
        HidingSumcheck::partially_evaluate(hiding_polys, hiding_partial, u);
        TransSumcheck::partially_evaluate(translator_polys, translator_partial, u);
        hiding_rdp.update_evaluations(u, 0);
        hiding_round.round_size >>= 1;
        update_round_state(0, u);
    }

    // ==================== Real rounds 1..hiding_log_n-1 ====================
    for (size_t round_idx = 1; round_idx < hiding_log_n; round_idx++) {
        const HidingFF u = do_round(hiding_partial, translator_partial, round_idx);
        HidingSumcheck::partially_evaluate_in_place(hiding_partial, u);
        TransSumcheck::partially_evaluate_in_place(translator_partial, u);
        hiding_rdp.update_evaluations(u, round_idx);
        hiding_round.round_size >>= 1;
        update_round_state(round_idx, u);
    }

    // Capture RDP scalar after all real hiding rounds for use in virtual rounds.
    // rdp_scalar = RDP(u_0,...,u_{d-1}) = 1 - u_2*...*u_{d-1}.
    const HidingFF rdp_scalar = HidingFF(1) - hiding_rdp.eval_at_1;

    // Send hiding kernel evaluations immediately after the real rounds.
    // These are P_j(u_0,...,u_{d-1}) — the natural d-variable evaluations without the tau factor.
    // The verifier will extend them by zero (multiply by τ = ∏(1-u_k)) after drawing virtual-round challenges.
    // This eliminates any prover freedom in the zero-padded region: the extension is verifier-determined.
    for (auto [eval, poly] : zip_view(hiding_claimed_evals.get_all(), hiding_partial.get_all())) {
        eval = poly[0];
    }
    transcript->send_to_verifier("Sumcheck:evaluations", hiding_claimed_evals.get_all());

    // ==================== Virtual rounds hiding_log_n..JOINT_LOG_N-1 ====================
    // The hiding polynomials are zero-padded beyond 2^hiding_log_n. The virtual contribution
    // is compute_virtual_contribution * rdp_scalar. The polynomial values are updated by
    // (1-u_k) after each round for the virtual contribution computation.
    for (size_t round_idx = hiding_log_n; round_idx < JOINT_LOG_N; round_idx++) {
        U_joint = SumcheckRoundUnivariate::zero();

        auto U_H =
            hiding_round.compute_virtual_contribution(hiding_partial, hiding_params, hiding_gate_sep, hiding_alphas);
        U_H *= rdp_scalar;
        U_joint += U_H;

        auto U_T = translator_round.compute_univariate(
            translator_partial, translator_relation_parameters, translator_gate_sep, translator_alphas);
        for (auto& eval : U_T.evaluations) {
            eval *= alpha_power_KH;
        }
        U_joint += U_T;

        const HidingFF u = send_round(round_idx);

        // Virtual: poly values *= (1 - u_k) for the next virtual contribution computation.
        for (auto& poly : hiding_partial.get_all()) {
            if (poly.end_index() > 0) {
                poly.at(0) *= (HidingFF(1) - u);
            }
        }
        TransSumcheck::partially_evaluate_in_place(translator_partial, u);
        update_round_state(round_idx, u);
    }

    // Extract and send translator evaluations after all rounds.
    for (auto [eval, poly] : zip_view(trans_claimed_evals.get_all(), translator_partial.get_all())) {
        eval = poly[0];
    }
    transcript->send_to_verifier("Sumcheck:evaluations_translator",
                                 TranslatorFlavor::get_full_circuit_evaluations(trans_claimed_evals));

    // Compute and send the claimed Libra evaluation.
    claimed_libra_evaluation = zk_sumcheck_data.constant_term;
    for (const auto& libra_eval : zk_sumcheck_data.libra_evaluations) {
        claimed_libra_evaluation += libra_eval;
    }
    transcript->send_to_verifier("Libra:claimed_evaluation", claimed_libra_evaluation);
}

/**
 * @brief Execute the joint Shplemini / KZG PCS over both circuits' polynomials.
 *
 * @details All polynomials from both circuits are combined into a single PolynomialBatcher and
 * passed to ShpleminiProver_<Curve>::prove() at the joint sumcheck challenge (u_0,...,u_16).
 * The hiding kernel's 2^16-size polynomials are treated as 17-variable by constructing the
 * batcher with joint_circuit_size = 2^17; the upper half is implicitly zero.
 */
void BatchedHonkTranslatorProver::execute_joint_pcs()
{
    using Curve = HidingCurve;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<HidingFlavor>;

    // Use the translator's commitment key (sized to 2^17 = joint_circuit_size) for all PCS work.
    // The translator key is initialised by TranslatorProver in execute_translator_pre_sumcheck().
    auto& ck = translator_key->proving_key->commitment_key;

    // Prove the small-subgroup IPA opening for the joint Libra polynomial.
    SmallSubgroupIPA small_subgroup_ipa(zk_sumcheck_data, joint_challenge, claimed_libra_evaluation, transcript, ck);
    small_subgroup_ipa.prove();

    // Build joint PolynomialBatcher at joint_circuit_size = 2^17.
    // max_end_index covers hiding (2^16) and translator (2^17) polynomials; use the larger.
    const size_t joint_circuit_size = static_cast<size_t>(1) << JOINT_LOG_N;
    const size_t hiding_max_end = hiding_prover_inst->polynomials.max_end_index();
    const size_t trans_max_end = translator_key->proving_key->circuit_size; // translator polys fill 2^17
    const size_t max_end_index = std::max(hiding_max_end, trans_max_end);

    PolynomialBatcher polynomial_batcher(joint_circuit_size, max_end_index);

    // Combine unshifted polynomials from both circuits.
    auto hiding_unshifted = hiding_prover_inst->polynomials.get_unshifted();
    auto trans_unshifted = translator_key->proving_key->polynomials.get_pcs_unshifted();
    auto joint_unshifted = concatenate(hiding_unshifted, trans_unshifted);
    polynomial_batcher.set_unshifted(joint_unshifted);

    // Combine shifted polynomials from both circuits.
    auto hiding_shifted = hiding_prover_inst->polynomials.get_to_be_shifted();
    auto trans_shifted = translator_key->proving_key->polynomials.get_pcs_to_be_shifted();
    auto joint_shifted = concatenate(hiding_shifted, trans_shifted);
    polynomial_batcher.set_to_be_shifted_by_one(joint_shifted);

    const OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(joint_circuit_size,
                                       polynomial_batcher,
                                       joint_challenge,
                                       ck,
                                       transcript,
                                       small_subgroup_ipa.get_witness_polynomials());

    HidingFlavor::PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
}

BatchedHonkTranslatorProver::Proof BatchedHonkTranslatorProver::construct_proof()
{
    execute_hiding_kernel_oink();
    // Export the Oink-only proof for the hiding kernel before writing translator data.
    auto hiding_proof = transcript->export_proof();

    execute_translator_pre_sumcheck();
    execute_joint_sumcheck_rounds();
    execute_joint_pcs();
    // Export translator pre-sumcheck + joint sumcheck + PCS as a single segment.
    auto translator_and_joint_proof = transcript->export_proof();

    return { hiding_proof, translator_and_joint_proof };
}

} // namespace bb
