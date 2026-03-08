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
 * where L(x) is the joint Libra masking univariate. The hiding kernel's contribution is zero for
 * round 16 because its PartiallyEvaluatedMultivariates contain zeros in rows >= 2^16.
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
    BB_ASSERT_EQ(hiding_log_n <= JOINT_LOG_N, true);

    // Joint ZK data: single Libra masking for all 17 rounds.
    constexpr size_t log_subgroup_size = static_cast<size_t>(numeric::get_msb(HidingCurve::SUBGROUP_SIZE));
    HidingCommitmentKey small_ck(1 << (log_subgroup_size + 1));
    zk_sumcheck_data = ZKData(JOINT_LOG_N, transcript, small_ck);

    // Gate separator polynomials:
    //   Hiding kernel uses gate_challenges[0..hiding_log_n-1].
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

    // Allocate partially evaluated polynomial tables.
    HidingPartialEvals hiding_partial(hiding_polys, static_cast<size_t>(1) << hiding_log_n);
    TransPartialEvals translator_partial(translator_polys, static_cast<size_t>(1) << JOINT_LOG_N);

    // Helper: partially evaluate from source into dest (first round: source != dest).
    auto partially_evaluate = [](const auto& source, auto& dest, const HidingFF& challenge) {
        auto src_view = source.get_all();
        auto dst_view = dest.get_all();
        bb::parallel_for(src_view.size(), [&](size_t j) {
            const auto& poly = src_view[j];
            const size_t limit = poly.end_index();
            for (size_t i = 0; i < limit; i += 2) {
                dst_view[j].at(i >> 1) = poly[i] + challenge * (poly[i + 1] - poly[i]);
            }
            dst_view[j].shrink_end_index((limit / 2) + (limit % 2));
        });
    };

    // Helper: partially evaluate a table in-place.
    auto partially_evaluate_inplace = [](auto& polys, const HidingFF& challenge) {
        auto view = polys.get_all();
        bb::parallel_for(view.size(), [&](size_t j) {
            auto& poly = view[j];
            const size_t limit = poly.end_index();
            for (size_t i = 0; i < limit; i += 2) {
                poly.at(i >> 1) = poly[i] + challenge * (poly[i + 1] - poly[i]);
            }
            poly.shrink_end_index((limit / 2) + (limit % 2));
        });
    };

    joint_challenge.reserve(JOINT_LOG_N);

    for (size_t round_idx = 0; round_idx < JOINT_LOG_N; round_idx++) {
        SumcheckRoundUnivariate U_joint = SumcheckRoundUnivariate::zero();

        // --- Hiding kernel contribution (rounds 0..15 only) ---
        if (round_idx < hiding_log_n) {
            SumcheckRoundUnivariate U_H;
            if (round_idx == 0) {
                U_H = hiding_round.compute_univariate(hiding_polys, hiding_params, hiding_gate_sep, hiding_alphas);
                U_H -= hiding_round.compute_disabled_contribution(
                    hiding_polys, hiding_params, hiding_gate_sep, hiding_alphas, round_idx, hiding_rdp);
            } else {
                U_H = hiding_round.compute_univariate(hiding_partial, hiding_params, hiding_gate_sep, hiding_alphas);
                U_H -= hiding_round.compute_disabled_contribution(
                    hiding_partial, hiding_params, hiding_gate_sep, hiding_alphas, round_idx, hiding_rdp);
            }
            U_joint += U_H;
        }

        // --- Translator contribution (all 17 rounds) ---
        {
            SumcheckRoundUnivariate U_T;
            if (round_idx == 0) {
                U_T = translator_round.compute_univariate(
                    translator_polys, translator_relation_parameters, translator_gate_sep, translator_alphas);
            } else {
                U_T = translator_round.compute_univariate(
                    translator_partial, translator_relation_parameters, translator_gate_sep, translator_alphas);
            }
            // Translator does not use row-disabling (UseRowDisablingPolynomial<TranslatorFlavor> = false).
            // Scale by α^{K_H} and accumulate.
            for (auto& eval : U_T.evaluations) {
                eval *= alpha_power_KH;
            }
            U_joint += U_T;
        }

        // --- Add joint Libra masking ---
        U_joint += HidingProverRound::compute_libra_univariate(zk_sumcheck_data, round_idx);

        // Send joint univariate and get round challenge.
        transcript->send_to_verifier("Sumcheck:univariate_" + std::to_string(round_idx), U_joint);
        const HidingFF round_challenge =
            transcript->template get_challenge<HidingFF>("Sumcheck:u_" + std::to_string(round_idx));
        joint_challenge.emplace_back(round_challenge);

        // Update partial evaluation tables.
        if (round_idx == 0) {
            partially_evaluate(hiding_polys, hiding_partial, round_challenge);
            partially_evaluate(translator_polys, translator_partial, round_challenge);
        } else {
            if (round_idx < hiding_log_n) {
                partially_evaluate_inplace(hiding_partial, round_challenge);
            }
            partially_evaluate_inplace(translator_partial, round_challenge);
        }

        // Translator: send minicircuit evaluations mid-sumcheck (binds later round challenges to them).
        if (round_idx == TranslatorFlavor::LOG_MINI_CIRCUIT_SIZE - 1) {
            transcript->send_to_verifier("Sumcheck:minicircuit_evaluations",
                                         TranslatorFlavor::get_minicircuit_evaluations(translator_partial));
        }

        // Update ZK data and gate separators for the next round.
        zk_sumcheck_data.update_zk_sumcheck_data(round_challenge, round_idx);
        hiding_rdp.update_evaluations(round_challenge, round_idx);
        hiding_gate_sep.partially_evaluate(round_challenge);
        translator_gate_sep.partially_evaluate(round_challenge);
        hiding_round.round_size >>= 1;
        translator_round.round_size >>= 1;
    }

    // Extract claimed evaluations from the final partially-evaluated tables.
    for (auto [eval, poly] : zip_view(hiding_claimed_evals.get_all(), hiding_partial.get_all())) {
        eval = poly[0];
    }
    for (auto [eval, poly] : zip_view(trans_claimed_evals.get_all(), translator_partial.get_all())) {
        eval = poly[0];
    }

    // Send hiding kernel evaluations (all polynomials, with ZK masking applied during the loop).
    transcript->send_to_verifier("Sumcheck:evaluations", hiding_claimed_evals.get_all());

    // Send translator evaluations (full-circuit subset only, as in standalone translator prover).
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
