#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/utils.hpp"
// Include relation implementations so they can be instantiated with field_ct
#include "barretenberg/relations/ecc_vm/ecc_bools_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_relation_impl.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief Lightweight adapter flavor for evaluating ECCVM relations with field_ct (stdlib::field_t<GrumpkinBuilder>).
 * @details Used by ECCVMFieldCircuit to instantiate RelationUtils with circuit field types.
 */
template <typename Builder> struct ECCVMFieldCtFlavor {
    using FF = stdlib::field_t<Builder>;
    using Relations = ECCVMFlavor::Relations_<FF>;
    using AllValues = ECCVMFlavor::AllEntities<FF>;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = ECCVMFlavor::NUM_SUBRELATIONS;
};

/**
 * @brief Grumpkin circuit that verifies ECCVM field work (Sumcheck + Shplemini scalars).
 *
 * @details Architecture:
 *   - Chonk_B (BN254 circuit) replays the ECCVM transcript and derives challenges.
 *   - Challenges and proof data flow to Chonk_G via polynomial equivalence.
 *   - THIS circuit (Chonk_G) verifies the Sumcheck round consistency and computes
 *     Shplemini scalars using native grumpkin::fr (= bb::fq) arithmetic via stdlib::field_t.
 *
 * All arithmetic uses stdlib::field_t<GrumpkinUltraCircuitBuilder>, which operates
 * natively on bb::fq = grumpkin::fr. This replaces the manual raw gate creation.
 */
class ECCVMFieldCircuit {
  public:
    using Builder = GrumpkinUltraCircuitBuilder;
    using NativeFF = Builder::FF; // grumpkin::fr = bn254::fq
    using field_ct = stdlib::field_t<Builder>;

    static constexpr size_t LOG_N = CONST_ECCVM_LOG_N;
    static constexpr size_t NUM_ECCVM_ENTITIES = ECCVMFlavor::NUM_ALL_ENTITIES;

    /**
     * @brief All data needed for ECCVM field verification.
     * @details Extracted from native ECCVM verification. Challenges come from Chonk_B's
     * transcript replay. Evaluations come from the proof.
     */
    struct InputData {
        // Sumcheck round data: evaluations at 0 and 1 per round
        std::array<NativeFF, LOG_N> round_eval_at_0;
        std::array<NativeFF, LOG_N> round_eval_at_1;
        // Evaluations at the round challenge u_i (from committed sumcheck opening)
        std::array<NativeFF, LOG_N> round_eval_at_challenge;
        // Round challenges u_0, ..., u_{log_n-1}
        std::array<NativeFF, LOG_N> round_challenges;

        // Initial target sum (eval_0[0] + eval_1[0])
        NativeFF initial_target_sum;

        // Claimed evaluations of all ECCVM polynomials at the multivariate challenge point
        std::array<NativeFF, NUM_ECCVM_ENTITIES> claimed_evaluations;

        // Relation evaluation data
        NativeFF alpha = NativeFF(0);                         // sumcheck batching challenge
        std::array<NativeFF, LOG_N> gate_challenges{};        // gate separator challenges
        NativeFF beta = NativeFF(0);                          // relation parameter
        NativeFF gamma = NativeFF(0);                         // relation parameter
        NativeFF beta_sqr = NativeFF(0);
        NativeFF beta_cube = NativeFF(0);
        NativeFF beta_quartic = NativeFF(0);
        NativeFF eccvm_set_permutation_delta = NativeFF(0);

        // Libra ZK correction data (for relation evaluation final check)
        NativeFF libra_evaluation = NativeFF(0);  // Claimed Libra evaluation at sumcheck challenge
        NativeFF libra_challenge = NativeFF(0);   // Libra challenge

        // SmallSubgroupIPA data
        NativeFF small_ipa_evaluation_challenge;
        std::array<NativeFF, NUM_SMALL_IPA_EVALUATIONS> small_ipa_evaluations;

        // Batched evaluation for Gemini fold computation
        NativeFF batched_evaluation;

        // Shplemini data (for scalar computation)
        NativeFF gemini_batching_challenge;     // ρ (multivariate batching challenge)
        NativeFF shplonk_evaluation_challenge;  // z
        NativeFF gemini_eval_challenge;         // r (Gemini evaluation challenge)
        NativeFF shplonk_batching_challenge;    // ν (Shplonk batching challenge)

        // Number of unshifted and shifted polynomials for claim_batcher
        size_t num_unshifted = 0;
        size_t num_shifted = 0;

        // Gemini fold evaluations: A_j(r^{2^j}) and A_j(-r^{2^j}) for each j
        std::vector<NativeFF> gemini_fold_pos_evaluations; // A_j(r^{2^j}) for j = 0, ..., d-1
        std::vector<NativeFF> gemini_fold_neg_evaluations; // A_j(-r^{2^j}) for j = 0, ..., d-1

        // Translation data
        NativeFF evaluation_challenge_x;
        NativeFF batching_challenge_v;
        std::array<NativeFF, 5> translation_evaluations; // op, Px, Py, z1, z2
        NativeFF translation_masking_term_eval;
    };

    ECCVMFieldCircuit(Builder& builder, const InputData& input)
        : builder_(builder)
        , input_(input)
    {}

    void build_circuit()
    {
        build_sumcheck_verification();
        build_relation_evaluation();
        build_shplemini_scalars();
        build_translation_accumulated_result();
    }

    NativeFF get_accumulated_result() const { return accumulated_result_; }
    bool get_sumcheck_verified() const { return sumcheck_verified_; }
    bool get_relation_verified() const { return relation_verified_; }
    const std::vector<NativeFF>& get_shplemini_scalars() const { return shplemini_scalars_; }
    const std::vector<NativeFF>& get_claim_batcher_scalars() const { return claim_batcher_scalars_; }

  private:
    /**
     * @brief Verify sumcheck round consistency using stdlib::field_t.
     * @details For each round: target_sum == eval_0 + eval_1, then target_sum = eval_at_u_i.
     */
    void build_sumcheck_verification()
    {
        auto target = field_ct::from_witness(&builder_, input_.initial_target_sum);

        for (size_t round = 0; round < LOG_N; round++) {
            auto eval_0 = field_ct::from_witness(&builder_, input_.round_eval_at_0[round]);
            auto eval_1 = field_ct::from_witness(&builder_, input_.round_eval_at_1[round]);
            auto eval_u = field_ct::from_witness(&builder_, input_.round_eval_at_challenge[round]);

            // Check: target == eval_0 + eval_1
            auto sum = eval_0 + eval_1;
            if (target.get_value() != sum.get_value()) {
                sumcheck_verified_ = false;
            }
            target.assert_equal(sum, "Sumcheck round " + std::to_string(round) + " consistency");

            // Update target for next round
            target = eval_u;
        }

        final_target_sum_ = target.get_value();
    }

    /**
     * @brief Evaluate all 7 ECCVM relations at the claimed evaluation point and check against target sum.
     * @details This is the critical sumcheck final check. Uses the existing ECCVM relation code
     * instantiated with field_ct (= stdlib::field_t<GrumpkinUltraCircuitBuilder>) for native grumpkin::fr arithmetic.
     */
    void build_relation_evaluation()
    {
        using AdapterFlavor = ECCVMFieldCtFlavor<Builder>;
        using Utils = bb::RelationUtils<AdapterFlavor>;
        using AllValues = typename AdapterFlavor::AllValues;

        // Skip if claimed_evaluations not populated
        if (input_.alpha == NativeFF(0)) {
            return;
        }

        // Populate AllValues with claimed evaluations as circuit witnesses
        AllValues purported_evaluations;
        {
            auto all_evals = purported_evaluations.get_all();
            BB_ASSERT(all_evals.size() == NUM_ECCVM_ENTITIES);
            for (size_t i = 0; i < NUM_ECCVM_ENTITIES; i++) {
                all_evals[i] = field_ct::from_witness(&builder_, input_.claimed_evaluations[i]);
            }
        }

        // Populate relation parameters as circuit witnesses
        RelationParameters<field_ct> relation_params;
        relation_params.beta = field_ct::from_witness(&builder_, input_.beta);
        relation_params.gamma = field_ct::from_witness(&builder_, input_.gamma);
        relation_params.beta_sqr = field_ct::from_witness(&builder_, input_.beta_sqr);
        relation_params.beta_cube = field_ct::from_witness(&builder_, input_.beta_cube);
        relation_params.beta_quartic = field_ct::from_witness(&builder_, input_.beta_quartic);
        relation_params.eccvm_set_permutation_delta =
            field_ct::from_witness(&builder_, input_.eccvm_set_permutation_delta);

        // Compute gate separator partial evaluation result
        // This is the product: Π_i ((1 - u_i) + u_i * gate_challenge_i)
        auto partial_eval = field_ct(1);
        for (size_t i = 0; i < LOG_N; i++) {
            auto u_i = field_ct::from_witness(&builder_, input_.round_challenges[i]);
            auto gc_i = field_ct::from_witness(&builder_, input_.gate_challenges[i]);
            partial_eval = partial_eval * ((field_ct(1) - u_i) + u_i * gc_i);
        }

        // Compute alpha powers for subrelation separators
        auto alpha = field_ct::from_witness(&builder_, input_.alpha);
        constexpr size_t NUM_SUBRELATIONS = ECCVMFlavor::NUM_SUBRELATIONS;
        std::array<field_ct, NUM_SUBRELATIONS - 1> alphas;
        alphas[0] = alpha;
        for (size_t i = 1; i < NUM_SUBRELATIONS - 1; i++) {
            alphas[i] = alphas[i - 1] * alpha;
        }

        // Accumulate relation evaluations
        typename Utils::RelationEvaluations relation_evaluations;
        Utils::zero_elements(relation_evaluations);

        Utils::template accumulate_relation_evaluations_without_skipping<>(
            purported_evaluations, relation_evaluations, relation_params, partial_eval);

        // Scale and batch to get full_honk_purported_value
        auto full_honk_purported_value = Utils::scale_and_batch_elements(relation_evaluations, alphas);

        // Apply ZK corrections (matches sumcheck verifier's apply_zk_corrections):
        // 1. Multiply by row disabling polynomial evaluation: 1 - Π_{i=2}^{LOG_N-1} u_i
        auto row_disabling_product = field_ct(1);
        for (size_t i = 2; i < LOG_N; i++) {
            auto u_i = field_ct::from_witness(&builder_, input_.round_challenges[i]);
            row_disabling_product = row_disabling_product * u_i;
        }
        auto row_disabling_eval = field_ct(1) - row_disabling_product;
        full_honk_purported_value = full_honk_purported_value * row_disabling_eval;

        // 2. Add Libra correction: + libra_evaluation * libra_challenge
        auto libra_eval = field_ct::from_witness(&builder_, input_.libra_evaluation);
        auto libra_chal = field_ct::from_witness(&builder_, input_.libra_challenge);
        full_honk_purported_value = full_honk_purported_value + libra_eval * libra_chal;

        // Check: corrected full_honk_purported_value == final_target_sum (from sumcheck rounds)
        auto target = field_ct::from_witness(&builder_, final_target_sum_);
        full_honk_purported_value.assert_equal(target, "ECCVM relation evaluation != sumcheck target sum");
        relation_verified_ = (full_honk_purported_value.get_value() == target.get_value());
    }

    /**
     * @brief Compute Shplemini scalars using stdlib::field_t.
     */
    void build_shplemini_scalars()
    {
        if (input_.gemini_fold_pos_evaluations.empty()) {
            return;
        }

        auto rho = field_ct::from_witness(&builder_, input_.gemini_batching_challenge);
        auto z = field_ct::from_witness(&builder_, input_.shplonk_evaluation_challenge);
        auto r = field_ct::from_witness(&builder_, input_.gemini_eval_challenge);
        auto nu = field_ct::from_witness(&builder_, input_.shplonk_batching_challenge);

        // Compute powers of r: [r, r^2, r^4, ..., r^{2^{d-1}}]
        std::vector<field_ct> r_powers;
        r_powers.reserve(LOG_N);
        auto r_pow = r;
        for (size_t i = 0; i < LOG_N; i++) {
            r_powers.push_back(r_pow);
            r_pow = r_pow * r_pow; // square
        }

        // Compute inverse vanishing evaluations: 1/(z ± r^{2^j})
        std::vector<field_ct> inv_vanishing;
        inv_vanishing.reserve(2 * LOG_N);
        for (size_t j = 0; j < LOG_N; j++) {
            auto denom_pos = z - r_powers[j];
            auto denom_neg = z + r_powers[j];
            inv_vanishing.push_back(field_ct(1) / denom_pos);
            inv_vanishing.push_back(field_ct(1) / denom_neg);
        }

        // Compute Shplonk batching challenge powers: [1, ν, ν², ...]
        size_t num_powers = 2 * LOG_N + 2; // Gemini claims
        num_powers += NUM_SMALL_IPA_EVALUATIONS; // Libra claims (ECCVM always has ZK)
        num_powers += 3 * LOG_N; // committed sumcheck claims

        std::vector<field_ct> nu_powers;
        nu_powers.reserve(num_powers);
        nu_powers.push_back(field_ct(1));
        for (size_t i = 1; i < num_powers; i++) {
            nu_powers.push_back(nu_powers.back() * nu);
        }

        // Compute Gemini fold scalars
        field_ct constant_term = field_ct(0);
        shplemini_scalars_.clear();

        for (size_t j = 1; j < LOG_N; j++) {
            size_t pos_idx = 2 * j;
            size_t neg_idx = 2 * j + 1;

            auto scaling_pos = nu_powers[pos_idx] * inv_vanishing[pos_idx];
            auto scaling_neg = nu_powers[neg_idx] * inv_vanishing[neg_idx];

            auto scalar = -(scaling_pos + scaling_neg);
            shplemini_scalars_.push_back(scalar.get_value());

            auto fold_pos = field_ct::from_witness(&builder_, input_.gemini_fold_pos_evaluations[j]);
            auto fold_neg = field_ct::from_witness(&builder_, input_.gemini_fold_neg_evaluations[j]);
            constant_term = constant_term + scaling_pos * fold_pos + scaling_neg * fold_neg;
        }

        // A_0 special handling
        auto fold_pos_0 = field_ct::from_witness(&builder_, input_.gemini_fold_pos_evaluations[0]);
        auto fold_neg_0 = field_ct::from_witness(&builder_, input_.gemini_fold_neg_evaluations[0]);
        constant_term = constant_term + fold_pos_0 * inv_vanishing[0] + fold_neg_0 * nu_powers[1] * inv_vanishing[1];

        // Compute sumcheck round scalars
        auto inv_z = field_ct(1) / z;
        auto inv_z_minus_1 = field_ct(1) / (z - field_ct(1));

        size_t power_offset = 2 * LOG_N + 2 + NUM_SMALL_IPA_EVALUATIONS;

        for (size_t i = 0; i < LOG_N; i++) {
            auto u_i = field_ct::from_witness(&builder_, input_.round_challenges[i]);
            auto inv_z_minus_ui = field_ct(1) / (z - u_i);

            size_t base_power = power_offset + 3 * i;
            auto scaling_0 = nu_powers[base_power] * inv_z;
            auto scaling_1 = nu_powers[base_power + 1] * inv_z_minus_1;
            auto scaling_ui = nu_powers[base_power + 2] * inv_z_minus_ui;

            auto round_scalar = -(scaling_0 + scaling_1 + scaling_ui);
            shplemini_scalars_.push_back(round_scalar.get_value());

            auto eval_0 = field_ct::from_witness(&builder_, input_.round_eval_at_0[i]);
            auto eval_1 = field_ct::from_witness(&builder_, input_.round_eval_at_1[i]);
            auto eval_u = field_ct::from_witness(&builder_, input_.round_eval_at_challenge[i]);
            constant_term = constant_term + scaling_0 * eval_0 + scaling_1 * eval_1 + scaling_ui * eval_u;
        }

        // ---- Claim_batcher ρ-batching: compute scalars for unshifted + shifted polynomials ----

        // Compute base scalars for unshifted and shifted batches
        // s_unshifted = 1/(z-r) + ν/(z+r) = inv_vanishing[0] + nu * inv_vanishing[1]
        // s_shifted = r⁻¹ × (1/(z-r) - ν/(z+r))
        auto s_unshifted = inv_vanishing[0] + nu * inv_vanishing[1];
        auto r_inv = field_ct(1) / r;
        auto s_shifted = r_inv * (inv_vanishing[0] - nu * inv_vanishing[1]);

        // Apply ρ powers to each polynomial's scalar
        // Order: unshifted polynomials first, then shifted
        auto rho_power = field_ct(1);

        // Compute all ρ powers up front
        std::vector<field_ct> rho_powers;
        rho_powers.reserve(input_.num_unshifted + input_.num_shifted);
        for (size_t i = 0; i < input_.num_unshifted + input_.num_shifted; i++) {
            rho_powers.push_back(rho_power);
            rho_power = rho_power * rho;
        }

        // Compute raw scalars (before repeated commitment merging)
        std::vector<field_ct> raw_unshifted_scalars;
        for (size_t i = 0; i < input_.num_unshifted; i++) {
            raw_unshifted_scalars.push_back(-(s_unshifted * rho_powers[i]));
        }
        std::vector<field_ct> raw_shifted_scalars;
        for (size_t i = 0; i < input_.num_shifted; i++) {
            raw_shifted_scalars.push_back(-(s_shifted * rho_powers[input_.num_unshifted + i]));
        }

        // Apply REPEATED_COMMITMENTS optimization: merge shifted scalars into their
        // corresponding unshifted entries, then remove shifted-only entries.
        // RepeatedCommitmentsData gives indices WITHOUT the Q/gemini_mask offset.
        // first_range_to_be_shifted_start: index of first unshifted poly that has a shifted counterpart
        // first_range_shifted_start: index where shifted polys start (= num_unshifted in our indexing)
        // first_range_size: number of shifted polys to merge
        constexpr auto repeated = ECCVMFlavor::REPEATED_COMMITMENTS;

        claim_batcher_scalars_.clear();
        claim_batcher_scalars_.reserve(input_.num_unshifted);

        // Native remove_repeated_commitments uses an offset of 2 for ZK (Q + gemini_mask in native vector).
        // Our circuit array doesn't include Q (offset 1 less). So the merge starts 1 position later
        // in our indexing compared to the flavor's first_range_to_be_shifted_start.
        constexpr size_t zk_merge_offset = ECCVMFlavor::HasZK ? 1 : 0;
        const size_t merge_start = repeated.first.original_start + zk_merge_offset;

        for (size_t i = 0; i < input_.num_unshifted; i++) {
            auto scalar = raw_unshifted_scalars[i];

            // Check if this unshifted polynomial has a shifted counterpart
            if (i >= merge_start && i < merge_start + repeated.first.count) {
                size_t shifted_idx = i - merge_start + zk_merge_offset;
                if (shifted_idx < raw_shifted_scalars.size()) {
                    scalar = scalar + raw_shifted_scalars[shifted_idx];
                }
            }

            claim_batcher_scalars_.push_back(scalar.get_value());
        }

        shplemini_constant_term_ = constant_term.get_value();
    }

    /**
     * @brief Compute the accumulated result for Translator binding using stdlib::field_t.
     * @details accumulated_result = (op + v*Px + v²*Py + v³*z1 + v⁴*z2 - masking_term) / x
     */
    void build_translation_accumulated_result()
    {
        auto x = field_ct::from_witness(&builder_, input_.evaluation_challenge_x);
        auto v = field_ct::from_witness(&builder_, input_.batching_challenge_v);
        auto op = field_ct::from_witness(&builder_, input_.translation_evaluations[0]);
        auto px = field_ct::from_witness(&builder_, input_.translation_evaluations[1]);
        auto py = field_ct::from_witness(&builder_, input_.translation_evaluations[2]);
        auto z1 = field_ct::from_witness(&builder_, input_.translation_evaluations[3]);
        auto z2 = field_ct::from_witness(&builder_, input_.translation_evaluations[4]);
        auto mask = field_ct::from_witness(&builder_, input_.translation_masking_term_eval);

        // Horner: batched = ((((z2 * v + z1) * v + py) * v + px) * v + op) - mask
        auto batched = (((z2 * v + z1) * v + py) * v + px) * v + op - mask;

        // accumulated_result = batched / x
        auto acc = batched / x;
        accumulated_result_ = acc.get_value();
    }

    Builder& builder_;
    InputData input_;

    bool sumcheck_verified_ = true;
    bool relation_verified_ = false;
    NativeFF final_target_sum_ = NativeFF(0);
    NativeFF accumulated_result_ = NativeFF(0);
    std::vector<NativeFF> shplemini_scalars_;
    std::vector<NativeFF> claim_batcher_scalars_;
    NativeFF shplemini_constant_term_ = NativeFF(0);
};

} // namespace bb
