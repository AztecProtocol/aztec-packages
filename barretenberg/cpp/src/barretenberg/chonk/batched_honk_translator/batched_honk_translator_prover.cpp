#include "batched_honk_translator_prover.hpp"

#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/polynomials/row_disabling_polynomial.hpp"
#include "barretenberg/sumcheck/masking_tail_data.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

namespace bb {

template <typename MegaFlavor>
BatchedHonkTranslatorProver<MegaFlavor>::BatchedHonkTranslatorProver(std::shared_ptr<MegaProverInstance> mega_instance,
                                                                     std::shared_ptr<MegaVK> mega_vk,
                                                                     std::shared_ptr<Transcript> transcript)
    : mega_instance(std::move(mega_instance))
    , mega_vk(std::move(mega_vk))
    , transcript(std::move(transcript))
{}

/**
 * @brief Run the MegaZK circuit's Oink phase.
 * @details Commits to witnesses and permutation polys. Alpha is NOT drawn here: a single joint
 * alpha ("Sumcheck:alpha") is drawn in execute_joint_sumcheck_rounds() after all pre-sumcheck
 * commitments from both circuits are on the transcript.
 */
template <typename MegaFlavor> void BatchedHonkTranslatorProver<MegaFlavor>::execute_mega_zk_oink()
{
    OinkProver<MegaFlavor> oink_prover(mega_instance, mega_vk, transcript);
    oink_prover.prove(/*emit_alpha=*/false);
}

/**
 * @brief Run the translator's Oink phase on the shared transcript.
 * @details Delegates directly to TranslatorProver's public execute_*_round() methods,
 * which handle VK hashing, wire commitments, and permutation grand products. This ensures
 * the translator's commitment key is properly initialised and the proof transcript matches
 * exactly what the standalone TranslatorProver would produce.
 */
template <typename MegaFlavor> void BatchedHonkTranslatorProver<MegaFlavor>::execute_translator_oink()
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
 *   U_joint(x) = U_MZK(x) + α^{K_H} · U_translator(x) + L(x)
 * where L(x) is the joint Libra masking univariate.
 *
 * For rounds 0..mega_zk_log_n-1 ("real rounds"), the MegaZK contribution is computed via standard
 * compute_univariate minus compute_disabled_contribution (row-disabling for ZK).
 *
 * For rounds mega_zk_log_n..JOINT_LOG_N-1 ("virtual rounds"), the MegaZK polynomials are treated as
 * zero-padded to 2^JOINT_LOG_N. The contribution is computed via compute_virtual_contribution
 * (evaluating the relation at the only non-zero edge), scaled by the RDP factor from real rounds.
 * After each virtual round, the partially-evaluated MegaZK polynomials are updated by multiplying
 * by (1 - u_k), so the final claimed evaluations include the tau factor ∏(1 - u_k).
 */
template <typename MegaFlavor> void BatchedHonkTranslatorProver<MegaFlavor>::execute_joint_sumcheck_rounds()
{
    // Derive Mega circuit log_circuit_size from the proving instance.
    size_t mega_log_n = mega_instance->log_dyadic_size();
    BB_ASSERT(mega_log_n <= JOINT_LOG_N);

    const bool is_mega_smaller = mega_log_n <= TranslatorFlavor::CONST_TRANSLATOR_LOG_N;
    const size_t min_log_n = std::min(mega_log_n, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    // Draw joint alpha after all pre-sumcheck commitments from both circuits.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Draw joint gate challenges (17 total).
    std::vector<FF> gate_challenges(JOINT_LOG_N);
    for (size_t i = 0; i < JOINT_LOG_N; i++) {
        gate_challenges[i] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(i));
    }

    // Compute α^{K_H}: offset for translator subrelation separators.
    FF alpha_power_KH = alpha.pow(MegaFlavor::NUM_SUBRELATIONS);

    // Subrelation separator arrays (powers of alpha starting at alpha^1).
    const MegaSubrelationSeparators mega_alphas =
        initialize_relation_separator<FF, MegaFlavor::NUM_SUBRELATIONS - 1>(alpha);
    const TransSubrelationSeparators translator_alphas =
        initialize_relation_separator<FF, TranslatorFlavor::NUM_SUBRELATIONS - 1>(alpha);

    // Joint ZK data: single Libra masking for all 17 rounds.
    constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
    if constexpr (MegaFlavor::HasZK) {
        MegaCommitmentKey small_ck(1 << (log_subgroup_size + 1));
        zk_sumcheck_data = ZKData(JOINT_LOG_N, transcript, small_ck);
    }

    // Gate separator polynomials:
    //   MegaZK circuit uses gate_challenges[0..mega_zk_log_n-1] for beta_products (real rounds only).
    //   During virtual rounds, only betas[] and partial_evaluation_result are accessed.
    //   Translator uses all JOINT_LOG_N challenges.
    GateSeparatorPolynomial<FF> mega_gate_sep(gate_challenges, mega_log_n);
    GateSeparatorPolynomial<FF> translator_gate_sep(gate_challenges, TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    // Round helper objects.
    MegaProverRound mega_round(static_cast<size_t>(1) << mega_log_n);
    TransProverRound translator_round(static_cast<size_t>(1) << TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    // Row disabling polynomial for the Mega circuit.
    // (TranslatorFlavor does not use UseRowDisablingPolynomial.)
    RowDisablingPolynomial<FF> rdp;

    auto& mega_polys = mega_instance->polynomials;
    auto& mega_params = mega_instance->relation_parameters;
    auto& translator_polys = translator_key->proving_key->polynomials;

    // Allocate partially evaluated polynomial tables (populated by the first partially_evaluate call).
    MegaPartialEvals mega_partial(mega_polys, static_cast<size_t>(1) << mega_log_n);
    TransPartialEvals translator_partial(translator_polys,
                                         static_cast<size_t>(1) << TranslatorFlavor::CONST_TRANSLATOR_LOG_N);

    // Type aliases for static partial-evaluation helpers from SumcheckProver.
    using MegaSumcheck = SumcheckProver<MegaFlavor>;
    using TransSumcheck = SumcheckProver<TranslatorFlavor>;

    joint_challenge.reserve(JOINT_LOG_N);

    SumcheckRoundUnivariate U_joint;

    // Use committed sumcheck infrastructure: commits to round univariates and stores them for Shplemini.
    static constexpr bool UseCommittedSumcheck = true;
    RoundUnivariateHandler<MegaFlavor, UseCommittedSumcheck> handler(transcript);

    auto send_round = [&](size_t round_idx) -> FF {
        if constexpr (MegaFlavor::HasZK) {
            U_joint += MegaProverRound::compute_libra_univariate(zk_sumcheck_data, round_idx);
        }
        handler.process_round_univariate(round_idx, U_joint);
        FF u = transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
        joint_challenge.emplace_back(u);
        return u;
    };

    // Per-round helper: update ZK data, gate separators, translator round size, and optionally send
    // translator minicircuit evaluations.
    auto update_round_state = [&](size_t round_idx, const FF& u) {
        if (round_idx == TranslatorFlavor::LOG_MINI_CIRCUIT_SIZE - 1) {
            transcript->send_to_verifier("Sumcheck:minicircuit_evaluations",
                                         TranslatorFlavor::get_minicircuit_evaluations(translator_partial));
        }
        if constexpr (MegaFlavor::HasZK) {
            zk_sumcheck_data.update_zk_sumcheck_data(u, round_idx);
        }
        mega_gate_sep.partially_evaluate(u);
        translator_gate_sep.partially_evaluate(u);
        translator_round.round_size >>= 1;
    };

    auto& masking_tail = mega_instance->masking_tail_data;

    // Per-round helper: compute U_joint = U_MZK + α^{K_H}·U_translator from given polynomial
    // sources, add Libra masking, send to verifier, and return the round challenge.
    // hpolys/tpolys are the full tables on round 0, the partial-eval tables on subsequent rounds.
    auto do_round = [&](auto& hpolys, auto& tpolys, size_t round_idx) -> FF {
        U_joint = SumcheckRoundUnivariate::zero();

        auto U_H = mega_round.compute_univariate(hpolys, mega_params, mega_gate_sep, mega_alphas);
        if constexpr (MegaFlavor::HasZK) {
            U_H += mega_round.compute_disabled_contribution(
                hpolys, mega_params, mega_gate_sep, mega_alphas, rdp, masking_tail);
        }
        U_joint += U_H;

        auto U_T = translator_round.compute_univariate(
            tpolys, translator_relation_parameters, translator_gate_sep, translator_alphas);
        for (auto& eval : U_T.evaluations) {
            eval *= alpha_power_KH;
        }
        U_joint += U_T;

        return send_round(round_idx);
    };

    // ==================== Round 0: bootstraps mega_zk_partial and translator_partial ====================
    // PartiallyEvaluatedMultivariates only allocates output buffers; values are populated here.
    {
        const FF u = do_round(mega_polys, translator_polys, 0);
        MegaSumcheck::partially_evaluate(mega_polys, mega_partial, u);
        TransSumcheck::partially_evaluate(translator_polys, translator_partial, u);
        if constexpr (MegaFlavor::HasZK) {
            masking_tail.fold_masking_values(u, 0, mega_round.round_size, &mega_polys);
            rdp.update_evaluations(u, 0);
        }
        mega_round.round_size >>= 1;
        mega_round.excluded_tail_size = 2; // After round 0, disabled zone collapses to 1 edge pair
        update_round_state(0, u);
    }

    // ==================== Real rounds 1..mega_zk_log_n-1 ====================
    for (size_t round_idx = 1; round_idx < min_log_n; round_idx++) {
        const FF u = do_round(mega_partial, translator_partial, round_idx);
        // Fold masking values BEFORE partially_evaluate (rounds 2+ read PE at active positions)
        if constexpr (MegaFlavor::HasZK) {
            masking_tail.fold_masking_values(u, round_idx, mega_round.round_size, &mega_partial);
        }
        MegaSumcheck::partially_evaluate_in_place(mega_partial, u);
        TransSumcheck::partially_evaluate_in_place(translator_partial, u);
        if constexpr (MegaFlavor::HasZK) {
            rdp.update_evaluations(u, round_idx);
        }
        mega_round.round_size >>= 1;
        update_round_state(round_idx, u);
    }

    // Capture RDP scalar after all real rounds for use in virtual rounds (only used when MegaFlavor::HasZK).
    // rdp_scalar = RDP(u_0,...,u_{d-1}) = 1 - u_2*...*u_{d-1}.
    const FF rdp_scalar = FF(1) - rdp.eval_at_1;

    if (is_mega_smaller) {
        // Send MegaZK circuit evaluations immediately after the real rounds.
        // These are P_j(u_0,...,u_{d-1}) — the natural d-variable evaluations without the tau factor.
        // The verifier will extend them by zero (multiply by τ = ∏(1-u_k)) after drawing virtual-round challenges.
        // This eliminates any prover freedom in the zero-padded region: the extension is verifier-determined.
        for (auto [eval, poly] : zip_view(mega_claimed_evals.get_all(), mega_partial.get_all())) {
            eval = poly[0];
        }

        if constexpr (MegaFlavor::HasZK) {
            // Apply masking tail corrections: short witness polys have zeros at tail positions,
            // so claimed evals need Lagrange-basis corrections using the first mega_zk_log_n challenges.
            if (masking_tail.is_active()) {
                auto real_challenges = std::span<const FF>(joint_challenge.data(), mega_log_n);
                masking_tail.apply_claimed_eval_corrections(mega_claimed_evals, real_challenges);

                // Write corrected values back into mega_zk_partial so that compute_virtual_contribution
                // in virtual rounds uses the corrected evaluations.
                for (auto [eval, poly] : zip_view(mega_claimed_evals.get_all(), mega_partial.get_all())) {
                    if (poly.end_index() > 0) {
                        poly.at(0) = eval;
                    }
                }
            }
        }

        transcript->send_to_verifier("Sumcheck:evaluations_smaller_circuit", mega_claimed_evals.get_all());
    } else {
        // Send Translator circuit evaluations immediately after the real rounds.
        // These are P_j(u_0,...,u_{d-1}) — the natural d-variable evaluations without the tau factor.
        // The verifier will extend them by zero (multiply by τ = ∏(1-u_k)) after drawing virtual-round challenges.
        // This eliminates any prover freedom in the zero-padded region: the extension is verifier-determined.
        for (auto [eval, poly] : zip_view(trans_claimed_evals.get_all(), translator_partial.get_all())) {
            eval = poly[0];
        }
        transcript->send_to_verifier("Sumcheck:evaluations_smaller_circuit",
                                     TranslatorFlavor::get_full_circuit_evaluations(trans_claimed_evals));
    }

    // ==================== Virtual rounds mega_zk_log_n..JOINT_LOG_N-1 ====================
    // The MegaZK polynomials are zero-padded beyond 2^mega_zk_log_n. The virtual contribution
    // is compute_virtual_contribution * rdp_scalar. The polynomial values are updated by
    // (1-u_k) after each round for the virtual contribution computation.
    for (size_t round_idx = min_log_n; round_idx < JOINT_LOG_N; round_idx++) {
        U_joint = SumcheckRoundUnivariate::zero();

        if (is_mega_smaller) {
            auto U_H = mega_round.compute_virtual_contribution(mega_partial, mega_params, mega_gate_sep, mega_alphas);
            if constexpr (MegaFlavor::HasZK) {
                U_H *= rdp_scalar;
            }
            U_joint += U_H;

            auto U_T = translator_round.compute_univariate(
                translator_partial, translator_relation_parameters, translator_gate_sep, translator_alphas);
            for (auto& eval : U_T.evaluations) {
                eval *= alpha_power_KH;
            }
            U_joint += U_T;

            const FF u = send_round(round_idx);

            // Virtual: poly values *= (1 - u_k) for the next virtual contribution computation.
            for (auto& poly : mega_partial.get_all()) {
                if (poly.end_index() > 0) {
                    poly.at(0) *= (FF(1) - u);
                }
            }

            TransSumcheck::partially_evaluate_in_place(translator_partial, u);
            update_round_state(round_idx, u);
        } else {
            auto U_H = mega_round.compute_univariate(mega_partial, mega_params, mega_gate_sep, mega_alphas);
            if constexpr (MegaFlavor::HasZK) {
                U_H *= rdp_scalar;
            }
            U_joint += U_H;

            auto U_T = translator_round.compute_virtual_contribution(
                translator_partial, translator_relation_parameters, translator_gate_sep, translator_alphas);
            for (auto& eval : U_T.evaluations) {
                eval *= alpha_power_KH;
            }
            U_joint += U_T;

            const FF u = send_round(round_idx);

            // Virtual: poly values *= (1 - u_k) for the next virtual contribution computation.
            for (auto& poly : translator_partial.get_all()) {
                if (poly.end_index() > 0) {
                    poly.at(0) *= (FF(1) - u);
                }
            }

            MegaSumcheck::partially_evaluate_in_place(mega_partial, u);
            update_round_state(round_idx, u);
        }
    }

    // Finalize committed sumcheck: populate the last round's evaluation at the final challenge.
    handler.finalize_last_round(JOINT_LOG_N, U_joint, joint_challenge.back());
    round_univariates_list = std::move(handler.round_univariates);
    round_evaluations_list = std::move(handler.round_evaluations);

    if (is_mega_smaller) {
        // Extract and send translator evaluations after all rounds.
        for (auto [eval, poly] : zip_view(trans_claimed_evals.get_all(), translator_partial.get_all())) {
            eval = poly[0];
        }
        transcript->send_to_verifier("Sumcheck:evaluations_larger_circuit",
                                     TranslatorFlavor::get_full_circuit_evaluations(trans_claimed_evals));
    } else {
        // Extract and send mega evaluations after all rounds.
        for (auto [eval, poly] : zip_view(mega_claimed_evals.get_all(), mega_partial.get_all())) {
            eval = poly[0];
        }
        transcript->send_to_verifier("Sumcheck:evaluations_larger_circuit", mega_claimed_evals.get_all());
    }

    if constexpr (MegaFlavor::HasZK) {
        // Compute and send the claimed Libra evaluation.
        claimed_libra_evaluation = zk_sumcheck_data.constant_term;
        for (const auto& libra_eval : zk_sumcheck_data.libra_evaluations) {
            claimed_libra_evaluation += libra_eval;
        }
        transcript->send_to_verifier("Libra:claimed_evaluation", claimed_libra_evaluation);
    }
}

/**
 * @brief Execute the joint Shplemini / KZG PCS over both circuits' polynomials.
 *
 * @details All polynomials from both circuits are combined into a single PolynomialBatcher and
 * passed to ShpleminiProver_<Curve>::prove() at the joint sumcheck challenge (u_0,...,u_16).
 * The MegaZK circuit's 2^16-size polynomials are treated as 17-variable by constructing the
 * batcher with joint_circuit_size = 2^17; the upper half is implicitly zero.
 */
template <typename MegaFlavor> void BatchedHonkTranslatorProver<MegaFlavor>::execute_joint_pcs()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<MegaFlavor>;

    // Use the translator's commitment key (sized to 2^17 = joint_circuit_size) for all PCS work.
    // The translator key is initialised by TranslatorProver in execute_translator_oink().
    auto mega_ck = MegaCommitmentKey(1 << MegaFlavor::VIRTUAL_LOG_N);
    auto& ck = MegaFlavor::VIRTUAL_LOG_N < TranslatorFlavor::CONST_TRANSLATOR_LOG_N
                   ? translator_key->proving_key->commitment_key
                   : mega_ck;

    // Build joint PolynomialBatcher at joint_circuit_size = 2^17.
    // max_end_index covers hiding (2^16) and translator (2^17) polynomials; use the larger.
    const size_t joint_circuit_size = static_cast<size_t>(1) << JOINT_LOG_N;
    const size_t mega_max_end = mega_instance->polynomials.max_end_index();
    const size_t trans_max_end = translator_key->proving_key->circuit_size; // translator polys fill 2^17
    const size_t max_end_index = std::max(mega_max_end, trans_max_end);

    PolynomialBatcher polynomial_batcher(joint_circuit_size, max_end_index);

    // Combine unshifted polynomials: translator first (its masking poly at position 0 for Shplemini offset=2),
    // then MegaZK (no masking poly — translator provides the joint masking poly).
    auto trans_unshifted = translator_key->proving_key->polynomials.get_pcs_unshifted();
    auto mega_unshifted = mega_instance->polynomials.get_unshifted();
    auto joint_unshifted = concatenate(trans_unshifted, mega_unshifted);
    polynomial_batcher.set_unshifted(joint_unshifted);

    // Combine shifted polynomials: MegaZK first, then translator.
    auto mega_shifted = mega_instance->polynomials.get_to_be_shifted();
    auto trans_shifted = translator_key->proving_key->polynomials.get_pcs_to_be_shifted();
    auto joint_shifted = concatenate(mega_shifted, trans_shifted);
    polynomial_batcher.set_to_be_shifted_by_one(joint_shifted);

    OpeningClaim prover_opening_claim;
    if constexpr (MegaFlavor::HasZK) {
        // Prove the small-subgroup IPA opening for the joint Libra polynomial.
        SmallSubgroupIPA small_subgroup_ipa(
            zk_sumcheck_data, joint_challenge, claimed_libra_evaluation, transcript, ck);
        small_subgroup_ipa.prove();

        // Register MegaZK masking tails with the joint batcher
        if (mega_instance->masking_tail_data.is_active()) {
            mega_instance->masking_tail_data.add_tails_to_batcher(mega_instance->polynomials, polynomial_batcher);
        }

        prover_opening_claim = ShpleminiProver_<Curve>::prove(joint_circuit_size,
                                                              polynomial_batcher,
                                                              joint_challenge,
                                                              ck,
                                                              transcript,
                                                              small_subgroup_ipa.get_witness_polynomials(),
                                                              round_univariates_list,
                                                              round_evaluations_list);
    } else {
        prover_opening_claim = ShpleminiProver_<Curve>::prove(joint_circuit_size,
                                                              polynomial_batcher,
                                                              joint_challenge,
                                                              ck,
                                                              transcript,
                                                              {},
                                                              round_univariates_list,
                                                              round_evaluations_list);
    }

    MegaFlavor::PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
}

template <typename MegaFlavor> HonkProof BatchedHonkTranslatorProver<MegaFlavor>::prove_mega_zk_oink()
{
    execute_mega_zk_oink();
    return transcript->export_proof();
}

template <typename MegaFlavor>
HonkProof BatchedHonkTranslatorProver<MegaFlavor>::prove(std::shared_ptr<TranslatorProvingKey> translator_proving_key)
{
    translator_key = std::move(translator_proving_key);
    execute_translator_oink();
    execute_joint_sumcheck_rounds();
    execute_joint_pcs();
    return transcript->export_proof();
}

template class BatchedHonkTranslatorProver<MegaZKFlavor>;
using BatchedHidingKernelProver = BatchedHonkTranslatorProver<MegaZKFlavor>;

} // namespace bb
