// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/container.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/utils.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"

namespace bb {

/**
 * @brief A purely static class (never add state to this!) consisting of functions used by the Protogalaxy prover.
 *
 * @tparam DeciderProvingKeys_
 */
template <class DeciderProvingKeys_> class ProtogalaxyProverInternal {
  public:
    using DeciderPKs = DeciderProvingKeys_;
    using Flavor = typename DeciderPKs::Flavor;
    using FF = typename Flavor::FF;
    using DeciderPK = typename DeciderPKs::DeciderPK;
    using RelationUtils = bb::RelationUtils<Flavor>;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Relations = typename Flavor::Relations;
    using AllValues = typename Flavor::AllValues;
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;
    static constexpr size_t NUM_KEYS = DeciderProvingKeys_::NUM;
    using UnivariateRelationParametersNoOptimisticSkipping =
        bb::RelationParameters<Univariate<FF, DeciderProvingKeys_::EXTENDED_LENGTH>>;
    using UnivariateRelationParameters =
        bb::RelationParameters<Univariate<FF, DeciderProvingKeys_::EXTENDED_LENGTH, 0, /*skip_count=*/NUM_KEYS - 1>>;
    using UnivariateSubrelationSeparators =
        std::array<Univariate<FF, DeciderPKs::BATCHED_EXTENDED_LENGTH>, Flavor::NUM_SUBRELATIONS - 1>;

    // The length of ExtendedUnivariate is the largest length (==max_relation_degree + 1) of a univariate polynomial
    // obtained by composing a relation with Lagrange polynomial-linear combination of NUM-many decider pks, with
    // relation parameters regarded as variables.
    using ExtendedUnivariate = Univariate<FF, (Flavor::MAX_TOTAL_RELATION_LENGTH - 1) * (DeciderPKs::NUM - 1) + 1>;
    // Represents the total length of the combiner univariate, obtained by combining the already folded relations with
    // the folded relation batching challenge.
    using ExtendedUnivariateWithRandomization =
        Univariate<FF, (Flavor::MAX_TOTAL_RELATION_LENGTH - 1 + DeciderPKs::NUM - 1) * (DeciderPKs::NUM - 1) + 1>;

    /**
     * @brief ShortUnivariates is an optimisation to improve the evaluation of Flavor relations when the output is a
     * low-degree monomial
     * @details Each Flavor relation is computed as a degree-Flavor::MAX_TOTAL_RELATION_LENGTH Univariate monomial in
     * the Lagrange basis, however it is more efficient if the *input* monomials into the relation are not in this form,
     * but are instead left as a degree-1 monomial using the *coefficient basis* (i.e. P(X) = a0 + a1.X)
     *
     * When computing relation algebra, it is typically more efficient to use the coefficient basis up to
     * degree-2. If the degree must be extended beyond 2, then the monomials are converted into their higher-degree
     * representation in the Lagrange basis.
     *
     * Not only is the relation algebra more efficient, but we do not have to perform a basis extension on all
     * the Flavor polynomials each time the Flavor relation algebra is evaluated.
     * Given the sparse representation of our circuits, many relations are skipped each row which means many polynomials
     * can go unused. By skipping the basis extension entirely we avoid this unneccessary work.
     *
     * Tests indicates that utilizing ShortUnivariates speeds up the `benchmark_client_ivc.sh` benchmark by 10%
     * @note This only works if DeciderPKs::NUM == 2. The whole protogalaxy class would require substantial revision to
     * support more PKs so this should be adequate for now
     */
    using ShortUnivariates = typename Flavor::template ProverUnivariates<DeciderPKs::NUM>;

    using ExtendedUnivariates =
        typename Flavor::template ProverUnivariatesWithOptimisticSkipping<ExtendedUnivariate::LENGTH,
                                                                          /* SKIP_COUNT= */ DeciderPKs::NUM - 1>;

    using ExtendedUnivariatesType =
        std::conditional_t<Flavor::USE_SHORT_MONOMIALS, ShortUnivariates, ExtendedUnivariates>;

    using TupleOfTuplesOfUnivariates = typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariates<DeciderPKs::NUM>;
    using TupleOfTuplesOfUnivariatesNoOptimisticSkipping =
        typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariatesNoOptimisticSkipping<DeciderPKs::NUM>;

    using RelationEvaluations = typename Flavor::TupleOfArraysOfValues;

    static constexpr size_t NUM_SUBRELATIONS = DeciderPKs::NUM_SUBRELATIONS;

    ExecutionTraceUsageTracker trace_usage_tracker;

    ProtogalaxyProverInternal(ExecutionTraceUsageTracker trace_usage_tracker = ExecutionTraceUsageTracker{})
        : trace_usage_tracker(std::move(trace_usage_tracker))
    {}

    /**
     * @brief A scale subrelations evaluations by challenges ('alphas') and part of the linearly dependent relation
     * evaluation(s).
     *
     * @details Note that a linearly dependent subrelation is not computed on a specific row but rather on the entire
     * execution trace.
     *
     * @param evals The evaluations of all subrelations on some row
     * @param challenges The 'alpha' challenges used to batch the subrelations
     * @param linearly_dependent_contribution An accumulator for values of  the linearly-dependent (i.e., 'whole-trace')
     * subrelations
     * @return FF The evaluation of the linearly-independent (i.e., 'per-row') subrelations
     */
    inline static FF process_subrelation_evaluations(const RelationEvaluations& evals,
                                                     const SubrelationSeparators& challenges,
                                                     FF& linearly_dependent_contribution)
    {
        // Initialize result with the contribution from the first subrelation
        FF linearly_independent_contribution = std::get<0>(evals)[0];
        size_t idx = 0;

        auto scale_by_challenge_and_accumulate =
            [&]<size_t relation_idx, size_t subrelation_idx, typename Element>(Element& element) {
                if constexpr (!(relation_idx == 0 && subrelation_idx == 0)) {
                    using Relation = typename std::tuple_element_t<relation_idx, Relations>;
                    // Accumulate scaled subrelation contribution
                    const Element contribution = element * challenges[idx++];
                    if constexpr (subrelation_is_linearly_independent<Relation, subrelation_idx>()) {
                        linearly_independent_contribution += contribution;
                    } else {
                        linearly_dependent_contribution += contribution;
                    }
                }
            };
        RelationUtils::apply_to_tuple_of_arrays_elements(scale_by_challenge_and_accumulate, evals);
        return linearly_independent_contribution;
    }

    /**
     * @brief Compute the values of the aggregated relation evaluations at each row in the execution trace, representing
     * f_i(ω) in the Protogalaxy paper, given the evaluations of all the prover polynomials and \vec{α} (the batching
     * challenges that help establishing each subrelation is independently valid in Honk - from the Plonk paper, DO NOT
     * confuse with α in Protogalaxy).
     *
     * @details When folding Mega decider proving keys, one of the relations is linearly dependent. We define such
     * relations as acting on the entire execution trace and hence requiring to be accumulated separately as we iterate
     * over each row. At the end of the function, the linearly dependent contribution is accumulated at index 0
     * representing the sum f_0(ω) + α_j*g(ω) where f_0 represents the full honk evaluation at row 0, g(ω) is the
     * linearly dependent subrelation and α_j is its corresponding batching challenge.
     */
    Polynomial<FF> compute_row_evaluations(const ProverPolynomials& polynomials,
                                           const SubrelationSeparators& alphas,
                                           const RelationParameters<FF>& relation_parameters)

    {

        PROFILE_THIS_NAME("ProtogalaxyProver_::compute_row_evaluations");

        const size_t polynomial_size = polynomials.get_polynomial_size();
        Polynomial<FF> aggregated_relation_evaluations(polynomial_size);

        // Determine the number of threads over which to distribute the work
        const size_t num_threads = compute_num_threads(polynomial_size);

        std::vector<FF> linearly_dependent_contribution_accumulators(num_threads);

        // Distribute the execution trace rows across threads so that each handles an equal number of active rows
        trace_usage_tracker.construct_thread_ranges(
            num_threads, polynomial_size, /*use_prev_accumulator_tracker=*/true);

        parallel_for(num_threads, [&](size_t thread_idx) {
            for (const ExecutionTraceUsageTracker::Range& range : trace_usage_tracker.thread_ranges[thread_idx]) {
                for (size_t idx = range.first; idx < range.second; idx++) {
                    const AllValues row = polynomials.get_row(idx);
                    // Evaluate all subrelations on given row. Separator is 1 since we are not summing across rows here.
                    const RelationEvaluations evals =
                        RelationUtils::accumulate_relation_evaluations(row, relation_parameters, FF(1));

                    // Sum against challenges alpha
                    aggregated_relation_evaluations.at(idx) = process_subrelation_evaluations(
                        evals, alphas, linearly_dependent_contribution_accumulators[thread_idx]);
                }
            }
        });

        aggregated_relation_evaluations.at(0) += sum(linearly_dependent_contribution_accumulators);

        return aggregated_relation_evaluations;
    }
    /**
     * @brief  Recursively compute the parent nodes of each level in the tree, starting from the leaves. Note that at
     * each level, the resulting parent nodes will be polynomials of degree (level+1) because we multiply by an
     * additional factor of X.
     */
    static std::vector<FF> construct_coefficients_tree(std::span<const FF> betas,
                                                       std::span<const FF> deltas,
                                                       const std::vector<std::vector<FF>>& prev_level_coeffs,
                                                       size_t level = 1)
    {
        if (level == betas.size()) {
            return prev_level_coeffs[0];
        }

        auto degree = level + 1;
        auto prev_level_width = prev_level_coeffs.size();
        std::vector<std::vector<FF>> level_coeffs(prev_level_width / 2, std::vector<FF>(degree + 1, 0));
        parallel_for_heuristic(
            prev_level_width / 2,
            [&](size_t parent) {
                size_t node = parent * 2;
                std::copy(prev_level_coeffs[node].begin(), prev_level_coeffs[node].end(), level_coeffs[parent].begin());
                for (size_t d = 0; d < degree; d++) {
                    level_coeffs[parent][d] += prev_level_coeffs[node + 1][d] * betas[level];
                    level_coeffs[parent][d + 1] += prev_level_coeffs[node + 1][d] * deltas[level];
                }
            },
            /* overestimate */ thread_heuristics::FF_MULTIPLICATION_COST * degree * 3);
        return construct_coefficients_tree(betas, deltas, level_coeffs, level + 1);
    }

    /**
     * @brief We construct the coefficients of the perturbator polynomial in O(n) time following the technique in
     * Claim 4.4. Consider a binary tree whose leaves are the evaluations of the full Honk relation at each row in the
     * execution trace. The subsequent levels in the tree are constructed using the following technique: At level i in
     * the tree, label the branch connecting the left node n_l to its parent by 1 and for the right node n_r by β_i +
     * δ_i X. The value of the parent node n will be constructed as n = n_l + n_r * (β_i + δ_i X). Recurse over each
     * layer until the root is reached which will correspond to the perturbator polynomial F(X).
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/745): make computation of perturbator more memory
     * efficient, operate in-place and use std::resize; add multithreading
     */
    static std::vector<FF> construct_perturbator_coefficients(std::span<const FF> betas,
                                                              std::span<const FF> deltas,
                                                              const Polynomial<FF>& full_honk_evaluations)
    {
        auto width = full_honk_evaluations.size();
        std::vector<std::vector<FF>> first_level_coeffs(width / 2, std::vector<FF>(2, 0));
        parallel_for_heuristic(
            width / 2,
            [&](size_t parent) {
                size_t node = parent * 2;
                first_level_coeffs[parent][0] =
                    full_honk_evaluations[node] + full_honk_evaluations[node + 1] * betas[0];
                first_level_coeffs[parent][1] = full_honk_evaluations[node + 1] * deltas[0];
            },
            /* overestimate */ thread_heuristics::FF_MULTIPLICATION_COST * 3);
        return construct_coefficients_tree(betas, deltas, first_level_coeffs);
    }

    /**
     * @brief Construct the power perturbator polynomial F(X) in coefficient form from the accumulator
     */
    Polynomial<FF> compute_perturbator(const std::shared_ptr<const DeciderPK>& accumulator,
                                       const std::vector<FF>& deltas)
    {
        PROFILE_THIS();
        auto full_honk_evaluations =
            compute_row_evaluations(accumulator->polynomials, accumulator->alphas, accumulator->relation_parameters);
        const auto betas = accumulator->gate_challenges;
        BB_ASSERT_EQ(betas.size(), deltas.size());
        const size_t log_circuit_size = accumulator->log_dyadic_size();

        // Compute the perturbator using only the first log_circuit_size-many betas/deltas
        std::vector<FF> perturbator = construct_perturbator_coefficients(std::span{ betas.data(), log_circuit_size },
                                                                         std::span{ deltas.data(), log_circuit_size },
                                                                         full_honk_evaluations);

        // Populate the remaining coefficients with zeros to reach the required constant size
        for (size_t idx = log_circuit_size; idx < CONST_PG_LOG_N; ++idx) {
            perturbator.emplace_back(FF(0));
        }
        return Polynomial<FF>{ perturbator };
    }

    /**
     * @brief Prepare a univariate polynomial for relation execution in one step of the combiner construction.
     * @details For a fixed prover polynomial index, extract that polynomial from each key in DeciderProvingKeys. From
     * each polynomial, extract the value at row_idx. Use these values to create a univariate polynomial, and then
     * extend (i.e., compute additional evaluations at adjacent domain values) as needed.
     * @todo TODO(https://github.com/AztecProtocol/barretenberg/issues/751) Optimize memory
     */

    template <size_t skip_count = 0>
    BB_INLINE static void extend_univariates(ExtendedUnivariatesType& extended_univariates,
                                             const DeciderPKs& keys,
                                             const size_t row_idx)
    {
        PROFILE_THIS_NAME("PG::extend_univariates");

        if constexpr (Flavor::USE_SHORT_MONOMIALS) {
            extended_univariates = std::move(keys.row_to_short_univariates(row_idx));
        } else {
            auto incoming_univariates =
                keys.template row_to_univariates<ExtendedUnivariate::LENGTH, skip_count>(row_idx);
            for (auto [extended_univariate, incoming_univariate] :
                 zip_view(extended_univariates.get_all(), incoming_univariates)) {
                incoming_univariate.template self_extend_from<NUM_KEYS>();
                extended_univariate = std::move(incoming_univariate);
            }
        }
    }

    /**
     * @brief Add the value of each relation over univariates to an appropriate accumulator
     *
     * @tparam TupleOfTuplesOfUnivariates_ A tuple of univariate accumulators, where the univariates may be optimized to
     * avoid computation on some indices.
     * @tparam ExtendedUnivariates_ T
     * @tparam Parameters relation parameters type
     * @tparam relation_idx The index of the relation
     * @param univariate_accumulators
     * @param extended_univariates
     * @param relation_parameters
     * @param scaling_factor
     */
    template <size_t relation_idx = 0>
    BB_INLINE static void accumulate_relation_univariates(TupleOfTuplesOfUnivariates& univariate_accumulators,
                                                          const ExtendedUnivariatesType& extended_univariates,
                                                          const UnivariateRelationParameters& relation_parameters,
                                                          const FF& scaling_factor)
    {
        using Relation = std::tuple_element_t<relation_idx, Relations>;

        //  Check if the relation is skippable to speed up accumulation
        if constexpr (!isSkippable<Relation, decltype(extended_univariates)>) {
            // If not, accumulate normally
            Relation::accumulate(std::get<relation_idx>(univariate_accumulators),
                                 extended_univariates,
                                 relation_parameters,
                                 scaling_factor);
        } else {
            // If so, only compute the contribution if the relation is active
            if (!Relation::skip(extended_univariates)) {
                Relation::accumulate(std::get<relation_idx>(univariate_accumulators),
                                     extended_univariates,
                                     relation_parameters,
                                     scaling_factor);
            }
        }

        // Repeat for the next relation.
        if constexpr (relation_idx + 1 < Flavor::NUM_RELATIONS) {
            accumulate_relation_univariates<relation_idx + 1>(
                univariate_accumulators, extended_univariates, relation_parameters, scaling_factor);
        }
    }

    /**
     * @brief Compute the combiner polynomial $G$ in the Protogalaxy paper
     * @details We have implemented an optimization that (eg in the case where we fold one instance-witness pair at a
     * time) assumes the value G(1) is 0, which is true in the case where the witness to be folded is valid.
     * @todo (https://github.com/AztecProtocol/barretenberg/issues/968) Make combiner tests better
     *
     * @tparam skip_zero_computations whether to use the optimization that skips computing zero.
     * @param
     * @param gate_separators
     * @return ExtendedUnivariateWithRandomization
     */
    ExtendedUnivariateWithRandomization compute_combiner(const DeciderPKs& keys,
                                                         const GateSeparatorPolynomial<FF>& gate_separators,
                                                         const UnivariateRelationParameters& relation_parameters,
                                                         const UnivariateSubrelationSeparators& alphas,
                                                         TupleOfTuplesOfUnivariates& univariate_accumulators)
    {
        PROFILE_THIS();

        // Determine the number of threads over which to distribute the work
        // The polynomial size is given by the virtual size since the computation includes
        // the incoming key which could have nontrivial values on the larger domain in case of overflow.
        const size_t common_polynomial_size = keys[0]->polynomials.w_l.virtual_size();
        const size_t num_threads = compute_num_threads(common_polynomial_size);

        // Univariates are optimised for usual PG, but we need the unoptimised version for tests (it's a version that
        // doesn't skip computation), so we need to define types depending on the template instantiation
        using ThreadAccumulators = TupleOfTuplesOfUnivariates;

        // Construct univariate accumulator containers; one per thread
        std::vector<ThreadAccumulators> thread_univariate_accumulators(num_threads);

        // Distribute the execution trace rows across threads so that each handles an equal number of active rows
        trace_usage_tracker.construct_thread_ranges(num_threads, common_polynomial_size);

        // Accumulate the contribution from each sub-relation
        parallel_for(num_threads, [&](size_t thread_idx) {
            // Initialize the thread accumulator to 0
            RelationUtils::zero_univariates(thread_univariate_accumulators[thread_idx]);
            // Construct extended univariates containers; one per thread
            ExtendedUnivariatesType extended_univariates;

            for (const ExecutionTraceUsageTracker::Range& range : trace_usage_tracker.thread_ranges[thread_idx]) {
                for (size_t idx = range.first; idx < range.second; idx++) {
                    // Instantiate univariates, possibly with skipping toto ignore computation in those indices
                    // (they are still available for skipping relations, but all derived univariate will ignore
                    // those evaluations) No need to initialise extended_univariates to 0, as it's assigned to.
                    constexpr size_t skip_count = DeciderPKs::NUM - 1;
                    extend_univariates<skip_count>(extended_univariates, keys, idx);

                    const FF pow_challenge = gate_separators[idx];

                    // Accumulate the i-th row's univariate contribution. Note that the relation parameters passed
                    // to this function have already been folded. Moreover, linear-dependent relations that act over
                    // the entire execution trace rather than on rows, will not be multiplied by the pow challenge.
                    accumulate_relation_univariates(thread_univariate_accumulators[thread_idx],
                                                    extended_univariates,
                                                    relation_parameters, // these parameters have already been folded
                                                    pow_challenge);
                }
            }
        });

        RelationUtils::zero_univariates(univariate_accumulators);
        // Accumulate the per-thread univariate accumulators into a single set of accumulators
        for (auto& accumulators : thread_univariate_accumulators) {
            RelationUtils::add_nested_tuples(univariate_accumulators, accumulators);
        }
        // This does nothing if TupleOfTuples is TupleOfTuplesOfUnivariates
        TupleOfTuplesOfUnivariatesNoOptimisticSkipping deoptimized_univariates =
            deoptimise_univariates(univariate_accumulators);
        //  Batch the univariate contributions from each sub-relation to obtain the round univariate
        return batch_over_relations(deoptimized_univariates, alphas);
    }

    ExtendedUnivariateWithRandomization compute_combiner(const DeciderPKs& keys,
                                                         const GateSeparatorPolynomial<FF>& gate_separators,
                                                         const UnivariateRelationParameters& relation_parameters,
                                                         const UnivariateSubrelationSeparators& alphas)
    {
        TupleOfTuplesOfUnivariates accumulators;
        return compute_combiner(keys, gate_separators, relation_parameters, alphas, accumulators);
    }

    /**
     * @brief Convert univariates from optimised form to regular
     * @details We need to convert before we batch relations, since optimised versions don't have enough information to
     * extend the univariates to maximum length
     */
    template <typename TupleOfTuplesOfUnivariatePossiblyOptimistic>
    static TupleOfTuplesOfUnivariatesNoOptimisticSkipping deoptimise_univariates(
        const TupleOfTuplesOfUnivariatePossiblyOptimistic& tup)
    {
        // If input does not have optimized operators, return the input
        if constexpr (std::same_as<TupleOfTuplesOfUnivariatePossiblyOptimistic,
                                   TupleOfTuplesOfUnivariatesNoOptimisticSkipping>) {
            return tup;
        }

        const auto deoptimise = [&]<size_t outer_idx, size_t inner_idx>(auto& element) {
            auto& element_with_skipping = std::get<inner_idx>(std::get<outer_idx>(tup));
            element = element_with_skipping.convert();
        };

        TupleOfTuplesOfUnivariatesNoOptimisticSkipping result;
        RelationUtils::template apply_to_tuple_of_tuples(result, deoptimise);
        return result;
    }

    static ExtendedUnivariateWithRandomization batch_over_relations(
        TupleOfTuplesOfUnivariatesNoOptimisticSkipping& univariate_accumulators,
        const UnivariateSubrelationSeparators& alphas)
    {
        auto result =
            std::get<0>(std::get<0>(univariate_accumulators)).template extend_to<DeciderPKs::BATCHED_EXTENDED_LENGTH>();

        size_t idx = 0;
        const auto scale_and_sum = [&]<size_t outer_idx, size_t inner_idx>(auto& element) {
            if constexpr (outer_idx == 0 && inner_idx == 0) {
                return;
            }

            auto extended = element.template extend_to<DeciderPKs::BATCHED_EXTENDED_LENGTH>();
            extended *= alphas[idx];
            result += extended;
            idx++;
        };

        RelationUtils::template apply_to_tuple_of_tuples(univariate_accumulators, scale_and_sum);
        RelationUtils::zero_univariates(univariate_accumulators);

        return result;
    }

    static std::pair<typename DeciderPKs::FF, std::array<typename DeciderPKs::FF, DeciderPKs::NUM>>
    compute_vanishing_polynomial_and_lagranges(const FF& challenge)
    {
        FF vanishing_polynomial_at_challenge;
        std::array<FF, DeciderPKs::NUM> lagranges;
        constexpr FF inverse_two = FF(2).invert();

        if constexpr (DeciderPKs::NUM == 2) {
            vanishing_polynomial_at_challenge = challenge * (challenge - FF(1));
            lagranges = { FF(1) - challenge, challenge };
        } else if constexpr (DeciderPKs::NUM == 3) {
            vanishing_polynomial_at_challenge = challenge * (challenge - FF(1)) * (challenge - FF(2));
            lagranges = { (FF(1) - challenge) * (FF(2) - challenge) * inverse_two,
                          challenge * (FF(2) - challenge),
                          challenge * (challenge - FF(1)) / FF(2) };
        } else if constexpr (DeciderPKs::NUM == 4) {
            constexpr FF inverse_six = FF(6).invert();
            vanishing_polynomial_at_challenge =
                challenge * (challenge - FF(1)) * (challenge - FF(2)) * (challenge - FF(3));
            lagranges = { (FF(1) - challenge) * (FF(2) - challenge) * (FF(3) - challenge) * inverse_six,
                          challenge * (FF(2) - challenge) * (FF(3) - challenge) * inverse_two,
                          challenge * (challenge - FF(1)) * (FF(3) - challenge) * inverse_two,
                          challenge * (challenge - FF(1)) * (challenge - FF(2)) * inverse_six };
        }
        static_assert(DeciderPKs::NUM < 5);

        return { vanishing_polynomial_at_challenge, lagranges };
    }

    /**
     * @brief Compute the combiner quotient defined as $K$ polynomial in the paper.
     */
    static Univariate<FF, DeciderPKs::BATCHED_EXTENDED_LENGTH, DeciderPKs::NUM> compute_combiner_quotient(
        FF perturbator_evaluation, ExtendedUnivariateWithRandomization combiner)
    {
        std::array<FF, DeciderPKs::BATCHED_EXTENDED_LENGTH - DeciderPKs::NUM> combiner_quotient_evals = {};

        constexpr FF inverse_two = FF(2).invert();
        constexpr FF inverse_six = FF(6).invert();
        for (size_t point = DeciderPKs::NUM; point < combiner.size(); point++) {
            auto idx = point - DeciderPKs::NUM;
            FF lagrange_0;
            FF vanishing_polynomial;
            if constexpr (DeciderPKs::NUM == 2) {
                lagrange_0 = FF(1) - FF(point);
                vanishing_polynomial = FF(point) * (FF(point) - 1);
            } else if constexpr (DeciderPKs::NUM == 3) {
                lagrange_0 = (FF(1) - FF(point)) * (FF(2) - FF(point)) * inverse_two;
                vanishing_polynomial = FF(point) * (FF(point) - 1) * (FF(point) - 2);
            } else if constexpr (DeciderPKs::NUM == 4) {
                lagrange_0 = (FF(1) - FF(point)) * (FF(2) - FF(point)) * (FF(3) - FF(point)) * inverse_six;
                vanishing_polynomial = FF(point) * (FF(point) - 1) * (FF(point) - 2) * (FF(point) - 3);
            }
            static_assert(DeciderPKs::NUM < 5);

            combiner_quotient_evals[idx] =
                (combiner.value_at(point) - perturbator_evaluation * lagrange_0) * vanishing_polynomial.invert();
        }

        return Univariate<FF, DeciderPKs::BATCHED_EXTENDED_LENGTH, DeciderPKs::NUM>(combiner_quotient_evals);
    }

    /**
     * @brief For each parameter, collect the value in each decider pvogin key in a univariate and extend for use in the
     * combiner compute.
     */
    template <typename ExtendedRelationParameters>
    static ExtendedRelationParameters compute_extended_relation_parameters(const DeciderPKs& keys)
    {
        using UnivariateParameter = typename ExtendedRelationParameters::DataType;
        ExtendedRelationParameters result;
        size_t param_idx = 0;
        for (auto& param : result.get_to_fold()) {
            Univariate<FF, DeciderPKs::NUM> tmp(0);
            size_t key_idx = 0;
            for (auto& key : keys) {
                tmp.value_at(key_idx) = key->relation_parameters.get_to_fold()[param_idx];
                key_idx++;
            }
            param = tmp.template extend_to<UnivariateParameter::LENGTH, UnivariateParameter::SKIP_COUNT>();
            param_idx++;
        }
        return result;
    }

    /**
     * @brief Combine the relation batching parameters (alphas) from each decider proving key into a univariate for
     * using in the combiner computation.
     */
    static UnivariateSubrelationSeparators compute_and_extend_alphas(const DeciderPKs& keys)
    {
        UnivariateSubrelationSeparators result;
        size_t alpha_idx = 0;
        for (auto& alpha : result) {
            Univariate<FF, DeciderPKs::NUM> tmp;
            size_t key_idx = 0;
            for (auto& key : keys) {
                tmp.value_at(key_idx) = key->alphas[alpha_idx];
                key_idx++;
            }
            alpha = tmp.template extend_to<DeciderPKs::BATCHED_EXTENDED_LENGTH>();
            alpha_idx++;
        }
        return result;
    }

    /**
     * @brief Determine number of threads for multithreading of perterbator/combiner operations
     * @details Potentially uses fewer threads than are available to avoid distributing very small amounts of work
     *
     * @param domain_size
     * @return size_t
     */
    static size_t compute_num_threads(const size_t domain_size)
    {
        const size_t max_num_threads = get_num_cpus_pow2(); // number of available threads (power of 2)
        const size_t min_iterations_per_thread =
            1 << 6; // min number of iterations for which we'll spin up a unique thread
        const size_t desired_num_threads = domain_size / min_iterations_per_thread;
        size_t num_threads = std::min(desired_num_threads, max_num_threads); // fewer than max if justified
        num_threads = num_threads > 0 ? num_threads : 1;                     // ensure num threads is >= 1

        return num_threads;
    }
};
} // namespace bb
