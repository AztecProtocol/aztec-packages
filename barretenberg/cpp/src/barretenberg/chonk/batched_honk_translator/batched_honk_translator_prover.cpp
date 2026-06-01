#include "batched_honk_translator_prover.hpp"

#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/polynomials/row_disabling_polynomial.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

// Short-monomial translator relation definitions: the joint sumcheck round (TransProverRound) is templated on
// TranslatorShortMonomialFlavor, so this TU instantiates the short relations' prover-side accumulate. The short
// relations are otherwise header-only (no explicit instantiation into librelations), so include the _impl here.
#include "barretenberg/relations/translator_vm/translator_decomposition_short_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_short_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_short_relations_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_short_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_permutation_short_relation_impl.hpp"

namespace bb {

BatchedHonkTranslatorProver::BatchedHonkTranslatorProver(std::shared_ptr<MegaZKProverInstance> mega_zk_instance,
                                                         std::shared_ptr<MegaZKVK> mega_zk_vk,
                                                         std::shared_ptr<Transcript> transcript)
    : mega_zk_inst(std::move(mega_zk_instance))
    , mega_zk_vk(std::move(mega_zk_vk))
    , transcript(std::move(transcript))
{}

/**
 * @brief Run the MegaZK circuit's Oink phase.
 * @details Commits to witnesses and permutation polys. Alpha is NOT drawn here: a single joint
 * alpha ("Sumcheck:alpha") is drawn in execute_joint_sumcheck_rounds() after all pre-sumcheck
 * commitments from both circuits are on the transcript.
 */
void BatchedHonkTranslatorProver::execute_mega_zk_oink()
{
    BB_BENCH_NAME("BatchedHonkTranslatorProver::execute_mega_zk_oink");
    OinkProver<MegaZKFlavor> oink_prover(mega_zk_inst, mega_zk_vk, transcript);
    oink_prover.prove(/*emit_alpha=*/false);
}

/**
 * @brief Run the translator's Oink phase on the shared transcript.
 * @details Delegates directly to TranslatorProver's public execute_*_round() methods,
 * which handle VK hashing, wire commitments, and permutation grand products. This ensures
 * the translator's commitment key is properly initialised and the proof transcript matches
 * exactly what the standalone TranslatorProver would produce.
 */
void BatchedHonkTranslatorProver::execute_translator_oink()
{
    BB_BENCH_NAME("BatchedHonkTranslatorProver::execute_translator_oink");
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
 * (evaluating the relation at the only non-zero edge), multiplied by the per-round (1-L) factor
 * from the row-disabling polynomial. Libra masking covers all JOINT_LOG_N rounds uniformly.
 * After each virtual round, PE values are folded by (1-u_k) for zero-extension.
 */
void BatchedHonkTranslatorProver::execute_joint_sumcheck_rounds()
{
    BB_BENCH_NAME("BatchedHonkTranslatorProver::execute_joint_sumcheck_rounds");
    // Draw joint alpha after all pre-sumcheck commitments from both circuits.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Draw joint gate challenges (17 total).
    std::vector<FF> gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", JOINT_LOG_N);

    // Compute α^{K_H}: offset for translator subrelation separators.
    FF alpha_power_KH = FF(1);
    for (size_t i = 0; i < MegaZKFlavor::NUM_SUBRELATIONS; i++) {
        alpha_power_KH *= alpha;
    }

    // Subrelation separator arrays (powers of alpha starting at alpha^1).
    const MegaZKSubrelationSeparators mega_zk_alphas =
        initialize_relation_separator<FF, MegaZKFlavor::NUM_SUBRELATIONS - 1>(alpha);
    const TransSubrelationSeparators translator_alphas =
        initialize_relation_separator<FF, TranslatorFlavor::NUM_SUBRELATIONS - 1>(alpha);

    // Derive MegaZK circuit log_circuit_size from the proving instance.
    const size_t mega_zk_log_n = mega_zk_inst->log_dyadic_size();
    BB_ASSERT(mega_zk_log_n <= JOINT_LOG_N);

    // Joint ZK data: single Libra masking for all 17 rounds.
    constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(Curve::SUBGROUP_SIZE));
    MegaZKCommitmentKey small_ck(1 << (log_subgroup_size + 1));
    zk_sumcheck_data = ZKData(JOINT_LOG_N, transcript, small_ck);

    // Single gate separator for both circuits: beta_products has size 2^JOINT_LOG_N which covers
    // both the MegaZK real rounds (2^mega_zk_log_n) and translator rounds (2^JOINT_LOG_N).
    GateSeparatorPolynomial<FF> gate_sep(gate_challenges, JOINT_LOG_N);

    // Round helper objects.
    MegaZKProverRound mega_zk_round(static_cast<size_t>(1) << mega_zk_log_n);
    TransProverRound translator_round(static_cast<size_t>(1) << JOINT_LOG_N);

    // Row disabling polynomial for the MegaZK circuit.
    // (TranslatorFlavor does not use UseRowDisablingPolynomial.)
    RowDisablingPolynomial<FF> rdp;

    auto& mega_zk_polys = mega_zk_inst->polynomials;
    auto& mega_zk_params = mega_zk_inst->relation_parameters;
    auto& translator_polys = translator_key->proving_key->polynomials;

    // Allocate partially evaluated polynomial tables (populated by the first partially_evaluate call).
    MegaZKPartialEvals mega_zk_partial(mega_zk_polys, static_cast<size_t>(1) << mega_zk_log_n);
    TransPartialEvals translator_partial(translator_polys, static_cast<size_t>(1) << JOINT_LOG_N);

    // Type aliases for static partial-evaluation helpers from SumcheckProver.
    using MegaZKSumcheck = SumcheckProver<MegaZKFlavor>;
    using TransSumcheck = SumcheckProver<TranslatorFlavor>;

    joint_challenge.reserve(JOINT_LOG_N);

    SumcheckRoundUnivariate U_joint;

    // Use committed sumcheck infrastructure: commits to round univariates and stores them for Shplemini.
    static constexpr bool UseCommittedSumcheck = true;
    RoundUnivariateHandler<MegaZKFlavor, UseCommittedSumcheck> handler(transcript);

    auto send_round = [&](size_t round_idx) -> FF {
        U_joint += MegaZKProverRound::compute_libra_univariate(zk_sumcheck_data, round_idx);
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
        zk_sumcheck_data.update_zk_sumcheck_data(u, round_idx);
        gate_sep.partially_evaluate(u);
        translator_round.round_size >>= 1;
    };

    // Per-round helper: compute U_joint = U_MZK + α^{K_H}·U_translator from given polynomial
    // sources, add Libra masking, send to verifier, and return the round challenge.
    // hpolys/tpolys are the full tables on round 0, the partial-eval tables on subsequent rounds.
    auto do_round = [&](auto& hpolys, auto& tpolys, size_t round_idx) -> FF {
        U_joint = SumcheckRoundUnivariate::zero();

        {
            BB_BENCH_NAME("joint_sumcheck/hiding_kernel");
            SumcheckRoundUnivariate U_H;
            {
                BB_BENCH_NAME("joint_sumcheck/hiding_kernel/compute_univariate");
                U_H = mega_zk_round.compute_univariate(hpolys, mega_zk_params, gate_sep, mega_zk_alphas);
            }
            {
                BB_BENCH_NAME("joint_sumcheck/hiding_kernel/disabled_contribution");
                U_H +=
                    mega_zk_round.compute_disabled_contribution(hpolys, mega_zk_params, gate_sep, mega_zk_alphas, rdp);
            }
            U_joint += U_H;
        }

        {
            BB_BENCH_NAME("joint_sumcheck/translator");
            SumcheckRoundUnivariate U_T;
            {
                BB_BENCH_NAME("joint_sumcheck/translator/compute_univariate");
                U_T = translator_round.compute_univariate(
                    tpolys, translator_relation_parameters, gate_sep, translator_alphas);
            }
            for (auto& eval : U_T.evaluations) {
                eval *= alpha_power_KH;
            }
            U_joint += U_T;
        }

        return send_round(round_idx);
    };

    // ==================== Round 0: bootstraps mega_zk_partial and translator_partial ====================
    // PartiallyEvaluatedMultivariates only allocates output buffers; values are populated here.
    {
        const FF u = do_round(mega_zk_polys, translator_polys, 0);
        {
            BB_BENCH_NAME("joint_sumcheck/hiding_kernel");
            {
                BB_BENCH_NAME("joint_sumcheck/hiding_kernel/partially_evaluate");
                MegaZKSumcheck::partially_evaluate(mega_zk_polys, mega_zk_partial, u);
            }
        }
        {
            BB_BENCH_NAME("joint_sumcheck/translator");
            {
                BB_BENCH_NAME("joint_sumcheck/translator/partially_evaluate");
                TransSumcheck::partially_evaluate(translator_polys, translator_partial, u);
            }
        }
        rdp.update_evaluations(u, 0);
        mega_zk_round.round_size >>= 1;
        mega_zk_round.excluded_head_size = 2; // After round 0, disabled zone collapses to 1 edge pair
        update_round_state(0, u);
    }

    // ==================== Real rounds 1..mega_zk_log_n-1 ====================
    for (size_t round_idx = 1; round_idx < mega_zk_log_n; round_idx++) {
        const FF u = do_round(mega_zk_partial, translator_partial, round_idx);
        {
            BB_BENCH_NAME("joint_sumcheck/hiding_kernel");
            {
                BB_BENCH_NAME("joint_sumcheck/hiding_kernel/partially_evaluate_in_place");
                MegaZKSumcheck::partially_evaluate_in_place(mega_zk_partial, u);
            }
        }
        {
            BB_BENCH_NAME("joint_sumcheck/translator");
            {
                BB_BENCH_NAME("joint_sumcheck/translator/partially_evaluate_in_place");
                TransSumcheck::partially_evaluate_in_place(translator_partial, u);
            }
        }
        rdp.update_evaluations(u, round_idx);
        mega_zk_round.round_size >>= 1;
        update_round_state(round_idx, u);
    }

    // ==================== Virtual rounds mega_zk_log_n..JOINT_LOG_N-1 ====================
    // MegaZK contributes a virtual (zero-extended) univariate with RDP factor; translator contributes a real round.
    for (size_t round_idx = mega_zk_log_n; round_idx < JOINT_LOG_N; round_idx++) {
        U_joint = SumcheckRoundUnivariate::zero();

        {
            BB_BENCH_NAME("joint_sumcheck/hiding_kernel");
            {
                BB_BENCH_NAME("joint_sumcheck/hiding_kernel/virtual_univariate");
                U_joint += MegaZKSumcheck::compute_virtual_round_univariate(
                    mega_zk_round, mega_zk_partial, mega_zk_params, gate_sep, mega_zk_alphas, rdp);
            }
        }

        {
            BB_BENCH_NAME("joint_sumcheck/translator");
            SumcheckRoundUnivariate U_T;
            {
                BB_BENCH_NAME("joint_sumcheck/translator/compute_univariate");
                U_T = translator_round.compute_univariate(
                    translator_partial, translator_relation_parameters, gate_sep, translator_alphas);
            }
            for (auto& eval : U_T.evaluations) {
                eval *= alpha_power_KH;
            }
            U_joint += U_T;
        }

        // send_round adds libra masking, sends univariate, and returns the challenge
        const FF u = send_round(round_idx);

        {
            BB_BENCH_NAME("joint_sumcheck/hiding_kernel");
            {
                BB_BENCH_NAME("joint_sumcheck/hiding_kernel/fold_for_zero_extension");
                MegaZKSumcheck::fold_for_zero_extension(mega_zk_partial, u);
            }
        }
        {
            BB_BENCH_NAME("joint_sumcheck/translator");
            {
                BB_BENCH_NAME("joint_sumcheck/translator/partially_evaluate_in_place");
                TransSumcheck::partially_evaluate_in_place(translator_partial, u);
            }
        }
        rdp.update_evaluations(u, round_idx);
        update_round_state(round_idx, u);
    }

    handler.finalize_last_round(JOINT_LOG_N, U_joint, joint_challenge.back());
    round_univariates_list = std::move(handler.round_univariates);
    round_evaluations_list = std::move(handler.round_evaluations);

    // Extract and send MegaZK evaluations after all rounds — full N-variable evaluations.
    for (auto [eval, poly] : zip_view(mega_zk_claimed_evals.get_all(), mega_zk_partial.get_all())) {
        eval = poly[0];
    }
    transcript->send_to_verifier("Sumcheck:evaluations", mega_zk_claimed_evals.get_all());

    // Extract and send translator evaluations after all rounds.
    for (auto [eval, poly] : zip_view(trans_claimed_evals.get_all(), translator_partial.get_all())) {
        eval = poly[0];
    }
    transcript->send_to_verifier("Sumcheck:evaluations_translator",
                                 TranslatorFlavor::get_full_circuit_evaluations(trans_claimed_evals));

    // Compute and send the claimed Libra evaluation (covers all JOINT_LOG_N rounds).
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
 * The MegaZK circuit's 2^16-size polynomials are treated as 17-variable by constructing the
 * batcher with joint_circuit_size = 2^17; the upper half is implicitly zero.
 */
void BatchedHonkTranslatorProver::execute_joint_pcs()
{
    BB_BENCH_NAME("BatchedHonkTranslatorProver::execute_joint_pcs");
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<MegaZKFlavor>;

    // Use the translator's commitment key (sized to 2^17 = joint_circuit_size) for all PCS work.
    // The translator key is initialised by TranslatorProver in execute_translator_oink().
    auto& ck = translator_key->proving_key->commitment_key;

    // Prove the small-subgroup IPA opening for the joint Libra polynomial.
    SmallSubgroupIPA small_subgroup_ipa(zk_sumcheck_data, joint_challenge, claimed_libra_evaluation, transcript, ck);
    small_subgroup_ipa.prove();

    // Build joint PolynomialBatcher at joint_circuit_size = 2^17.
    // max_end_index covers hiding (2^16) and translator (2^17) polynomials; use the larger.
    const size_t joint_circuit_size = static_cast<size_t>(1) << JOINT_LOG_N;
    const size_t mega_zk_max_end = mega_zk_inst->polynomials.max_end_index();
    const size_t trans_max_end = translator_key->proving_key->circuit_size; // translator polys fill 2^17
    const size_t max_end_index = std::max(mega_zk_max_end, trans_max_end);

    PolynomialBatcher polynomial_batcher(joint_circuit_size, max_end_index);

    // Combine unshifted polynomials: translator first (its masking poly at position 0 for Shplemini offset=2),
    // then MegaZK (no masking poly — translator provides the joint masking poly).
    auto trans_unshifted = translator_key->proving_key->polynomials.get_pcs_unshifted();
    auto mega_zk_unshifted = mega_zk_inst->polynomials.get_unshifted();
    auto joint_unshifted = concatenate(trans_unshifted, mega_zk_unshifted);
    polynomial_batcher.set_unshifted(joint_unshifted);

    // Combine shifted polynomials: MegaZK first, then translator.
    auto mega_zk_shifted = mega_zk_inst->polynomials.get_to_be_shifted();
    auto trans_shifted = translator_key->proving_key->polynomials.get_pcs_to_be_shifted();
    auto joint_shifted = concatenate(mega_zk_shifted, trans_shifted);
    polynomial_batcher.set_to_be_shifted_by_one(joint_shifted);

    const OpeningClaim prover_opening_claim =
        ShpleminiProver_<Curve>::prove(joint_circuit_size,
                                       polynomial_batcher,
                                       joint_challenge,
                                       ck,
                                       transcript,
                                       small_subgroup_ipa.get_witness_polynomials(),
                                       round_univariates_list,
                                       round_evaluations_list);

    MegaZKFlavor::PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
}

HonkProof BatchedHonkTranslatorProver::prove_mega_zk_oink()
{
    BB_BENCH_NAME("BatchedHonkTranslatorProver::prove_mega_zk_oink");
    execute_mega_zk_oink();
    return transcript->export_proof();
}

HonkProof BatchedHonkTranslatorProver::prove(std::shared_ptr<TranslatorProvingKey> translator_proving_key)
{
    BB_BENCH_NAME("BatchedHonkTranslatorProver::prove");
    translator_key = std::move(translator_proving_key);
    execute_translator_oink();
    execute_joint_sumcheck_rounds();
    execute_joint_pcs();
    return transcript->export_proof();
}

} // namespace bb
