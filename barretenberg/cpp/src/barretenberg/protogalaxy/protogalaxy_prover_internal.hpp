// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/container.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/protogalaxy/constants.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/utils.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"

namespace bb {

/**
 * @brief A purely static class (never add state to this!) consisting of functions used by the Protogalaxy prover.
 *
 * @tparam ProverInstance
 */
template <class ProverInstance> class ProtogalaxyProverInternal {
  public:
    using Flavor = typename ProverInstance::Flavor;
    using FF = typename Flavor::FF;
    using RelationUtils = bb::RelationUtils<Flavor>;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Relations = typename Flavor::Relations;
    using AllValues = typename Flavor::AllValues;
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;
    using ProverInstances = std::array<std::shared_ptr<ProverInstance>, NUM_INSTANCES>;

    static constexpr size_t EXTENDED_LENGTH = computed_extended_length<Flavor>();
    static constexpr size_t BATCHED_EXTENDED_LENGTH = computed_batched_extended_length<Flavor>();
    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;

    using UnivariateRelationParametersNoOptimisticSkipping = bb::RelationParameters<Univariate<FF, EXTENDED_LENGTH>>;
    using UnivariateRelationParameters =
        bb::RelationParameters<Univariate<FF, EXTENDED_LENGTH, 0, /*skip_count=*/SKIP_COUNT>>;
    using UnivariateSubrelationSeparators = std::array<Univariate<FF, BATCHED_EXTENDED_LENGTH>, NUM_SUBRELATIONS - 1>;

    // Univariates that interpolate polynomial evaluations at a given vertex across two instances
    using ExtendedUnivariate = Univariate<FF, EXTENDED_LENGTH>;
    // Combiner univariate
    using ExtendedUnivariateWithRandomization = Univariate<FF, BATCHED_EXTENDED_LENGTH>;

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
     * @note This only works for two instances.
     */
    using ShortUnivariates = typename Flavor::template ProverUnivariates<NUM_INSTANCES>;

    using ExtendedUnivariates =
        typename Flavor::template ProverUnivariatesWithOptimisticSkipping<ExtendedUnivariate::LENGTH,
                                                                          /*skip_count=*/SKIP_COUNT>;

    using ExtendedUnivariatesType =
        std::conditional_t<Flavor::USE_SHORT_MONOMIALS, ShortUnivariates, ExtendedUnivariates>;

    using TupleOfTuplesOfUnivariates = typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariates<NUM_INSTANCES>;
    using TupleOfTuplesOfUnivariatesNoOptimisticSkipping =
        typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariatesNoOptimisticSkipping<NUM_INSTANCES>;

    using RelationEvaluations = decltype(create_tuple_of_arrays_of_values<typename Flavor::Relations>());

    ExecutionTraceUsageTracker trace_usage_tracker;

    ProtogalaxyProverInternal(ExecutionTraceUsageTracker trace_usage_tracker = ExecutionTraceUsageTracker{})
        : trace_usage_tracker(std::move(trace_usage_tracker))
    {}

    /**
     * @brief Constructs univariates that interpolate the values of each instance across a given row.
     *
     * @details The returned univariates are over the domain 0, .., EXTENDED_LENGTH - 1.
     *
     * @tparam skip_count The number of evaluations to skip in the returned univariates. Used only if not using short
     * monomials.
     * @param row_idx A fixed row position in several execution traces
     * @return The univariates whose extensions will be used to construct the combiner.
     */
    template <size_t skip_count = 0> static auto row_to_univariates(const ProverInstances& instances, size_t row_idx)
    {
        using ContainerType =
            std::conditional_t<Flavor::USE_SHORT_MONOMIALS,
                               typename Flavor::template ProverUnivariates<2>,
                               std::array<Univariate<FF, ExtendedUnivariate::LENGTH, 0, skip_count>, NUM_INSTANCES>>;
        // As a practical measure, get the first prover instance's view to deduce the array type
        std::array<decltype(instances[0]->polynomials.get_all()), NUM_INSTANCES> views;
        views[0] = instances[0]->polynomials.get_all();
        views[1] = instances[1]->polynomials.get_all();

        ContainerType results;
        // Set the size corresponding to the number of rows in the execution trace
        // Iterate over the prover polynomials' views corresponding to each prover instance
        for (size_t inst_idx = 0; auto& get_all : views) {
            // Iterate over all columns in the trace execution of an prover instance and extract their value at row_idx.
            if constexpr (Flavor::USE_SHORT_MONOMIALS) {
                // In this case, the elements of the ContainerType are AllEntities, so we need to get the underlying
                // polynomials via get_all()
                for (auto [result, poly_ptr] : zip_view(results.get_all(), get_all)) {
                    result.evaluations[inst_idx] = poly_ptr[row_idx];
                }
            } else {
                for (auto [result, poly_ptr] : zip_view(results, get_all)) {
                    result.evaluations[inst_idx] = poly_ptr[row_idx];
                }
            }
            inst_idx++;
        }
        return results;
    }

    /**
     * @brief Scale all linearly independent subrelations evaluations by challenges ('alphas').
     *
     * @details Note that this is not done for linearly dependent subrelation, because their evaluation is not
     * computed on a specific row but rather on the entire execution trace.
     *
     * @param evals The evaluations of all subrelations on some row
     * @param challenges The 'alpha' challenges used to batch the subrelations (we use separate challenges rather than a
     * single alpha raised to powers to avoid an unsustainable degree increase in the combiner polynomial)
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
     * challenges that help establishing each subrelation is independently valid in Mega Honk relation - this α is same
     * as in the Plonk paper, DO NOT confuse with α in Protogalaxy).
     *
     * @details When folding Mega prover instances, one of the relations is linearly dependent. We define such
     * relations as acting on the entire execution trace and hence requiring to be accumulated separately as we iterate
     * over each row. At the end of the function, the linearly dependent contribution is accumulated at index 0
     * representing the sum f_0(ω) + α_j*g(ω) where f_0 represents the full honk evaluation at row 0, g(ω) is the
     * linearly dependent subrelation and α_j is its corresponding batching challenge.
     */
    Polynomial<FF> compute_row_evaluations(const ProverPolynomials& polynomials,
                                           const SubrelationSeparators& alphas,
                                           const RelationParameters<FF>& relation_parameters)

    {

        BB_BENCH_NAME("ProtogalaxyProver_::compute_row_evaluations");

        const size_t polynomial_size = polynomials.get_polynomial_size();
        Polynomial<FF> aggregated_relation_evaluations(polynomial_size);

        // Determine the number of threads over which to distribute the work
        const size_t num_threads = compute_num_threads(polynomial_size);

        std::vector<FF> linearly_dependent_contribution_accumulators(num_threads);

        // Distribute the execution trace rows across threads so that each handles an equal number of active rows
        trace_usage_tracker.construct_thread_ranges(num_threads, polynomial_size, /*use_prev_accumulator=*/true);

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
     * @brief Construct the perturbator polynomial F(X) in coefficient form from the accumulator resulted from a
     * previous round of Protogalaxy
     */
    Polynomial<FF> compute_perturbator(const std::shared_ptr<const ProverInstance>& accumulator,
                                       const std::vector<FF>& deltas)
    {
        BB_BENCH();
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

        // Check that the perturbator zeroth coefficient is equal to the target sum stored in the accumulator
        BB_ASSERT_EQ(perturbator[0],
                     accumulator->target_sum,
                     "ProtogalaxyProver: the zeroth coefficient of the perturbator is different from the target sum "
                     "stored in the accumulator.");

        return Polynomial<FF>{ perturbator };
    }

    /**
     * @brief Prepare a univariate polynomial for relation execution in one step of the combiner construction.
     * @details For a fixed prover polynomial index, extract that polynomial from each key in ProverInstances. From
     * each polynomial, extract the value at row_idx. Use these values to create a univariate polynomial, and then
     * extend (i.e., compute additional evaluations at adjacent domain values) as needed.
     */
    template <size_t skip_count = 0>
    BB_INLINE static void extend_univariates(ExtendedUnivariatesType& extended_univariates,
                                             const ProverInstances& instances,
                                             const size_t row_idx)
    {
        if constexpr (Flavor::USE_SHORT_MONOMIALS) {
            extended_univariates = std::move(row_to_univariates(instances, row_idx));
        } else {
            auto incoming_univariates = row_to_univariates<skip_count>(instances, row_idx);
            for (auto [extended_univariate, incoming_univariate] :
                 zip_view(extended_univariates.get_all(), incoming_univariates)) {
                incoming_univariate.template self_extend_from<NUM_INSTANCES>();
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
    ExtendedUnivariateWithRandomization compute_combiner(const ProverInstances& instances,
                                                         const GateSeparatorPolynomial<FF>& gate_separators,
                                                         const UnivariateRelationParameters& relation_parameters,
                                                         const UnivariateSubrelationSeparators& alphas,
                                                         TupleOfTuplesOfUnivariates& univariate_accumulators)
    {
        BB_BENCH();

        // Determine the number of threads over which to distribute the work
        // The polynomial size is given by the virtual size since the computation includes
        // the incoming key which could have nontrivial values on the larger domain in case of overflow.
        const size_t common_polynomial_size = instances[0]->polynomials.w_l.virtual_size();
        const size_t num_threads = compute_num_threads(common_polynomial_size);

        // Univariates are optimized for usual PG, but we need the unoptimized version for tests (it's a version that
        // doesn't skip computation), so we need to define types depending on the template instantiation
        using ThreadAccumulators = TupleOfTuplesOfUnivariates;

        // Construct univariate accumulator containers; one per thread
        // Note: std::vector will trigger {}-initialization of the contents. Therefore no need to zero the univariates.
        std::vector<ThreadAccumulators> thread_univariate_accumulators(num_threads);

        // Distribute the execution trace rows across threads so that each handles an equal number of active rows
        trace_usage_tracker.construct_thread_ranges(num_threads, common_polynomial_size);

        // Accumulate the contribution from each sub-relation
        parallel_for(num_threads, [&](size_t thread_idx) {
            // Construct extended univariates containers; one per thread
            ExtendedUnivariatesType extended_univariates;

            for (const ExecutionTraceUsageTracker::Range& range : trace_usage_tracker.thread_ranges[thread_idx]) {
                for (size_t idx = range.first; idx < range.second; idx++) {
                    // Instantiate univariates, possibly with skipping to ignore computation in those indices
                    // (they are still available for skipping relations, but all derived univariate will ignore
                    // those evaluations) No need to initialize extended_univariates to 0, as it's assigned to.
                    extend_univariates<SKIP_COUNT>(extended_univariates, instances, idx);

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
            deoptimize_univariates(univariate_accumulators);
        //  Batch the univariate contributions from each sub-relation to obtain the round univariate
        return batch_over_relations(deoptimized_univariates, alphas);
    }

    ExtendedUnivariateWithRandomization compute_combiner(const ProverInstances& instances,
                                                         const GateSeparatorPolynomial<FF>& gate_separators,
                                                         const UnivariateRelationParameters& relation_parameters,
                                                         const UnivariateSubrelationSeparators& alphas)
    {
        // Note: {} is required to initialize the tuple contents. Otherwise the univariates contain garbage.
        TupleOfTuplesOfUnivariates accumulators{};
        return compute_combiner(instances, gate_separators, relation_parameters, alphas, accumulators);
    }

    /**
     * @brief Convert univariates from optimized form to regular
     * @details We need to convert before we batch relations, since optimized versions don't have enough information to
     * extend the univariates to maximum length
     */
    template <typename TupleOfTuplesOfUnivariatePossiblyOptimistic>
    static TupleOfTuplesOfUnivariatesNoOptimisticSkipping deoptimize_univariates(
        const TupleOfTuplesOfUnivariatePossiblyOptimistic& tup)
    {
        // If input does not have optimized operators, return the input
        if constexpr (std::same_as<TupleOfTuplesOfUnivariatePossiblyOptimistic,
                                   TupleOfTuplesOfUnivariatesNoOptimisticSkipping>) {
            return tup;
        }

        const auto deoptimize = [&]<size_t outer_idx, size_t inner_idx>(auto& element) {
            auto& element_with_skipping = std::get<inner_idx>(std::get<outer_idx>(tup));
            element = element_with_skipping.convert();
        };

        // Note: {} is required to initialize the tuple contents. Otherwise the univariates contain garbage.
        TupleOfTuplesOfUnivariatesNoOptimisticSkipping result{};
        RelationUtils::apply_to_tuple_of_tuples(result, deoptimize);
        return result;
    }

    static ExtendedUnivariateWithRandomization batch_over_relations(
        TupleOfTuplesOfUnivariatesNoOptimisticSkipping& univariate_accumulators,
        const UnivariateSubrelationSeparators& alphas)
    {
        auto result = std::get<0>(std::get<0>(univariate_accumulators)).template extend_to<BATCHED_EXTENDED_LENGTH>();

        size_t idx = 0;
        const auto scale_and_sum = [&]<size_t outer_idx, size_t inner_idx>(auto& element) {
            if constexpr (outer_idx == 0 && inner_idx == 0) {
                return;
            }

            auto extended = element.template extend_to<BATCHED_EXTENDED_LENGTH>();
            extended *= alphas[idx];
            result += extended;
            idx++;
        };

        RelationUtils::apply_to_tuple_of_tuples(univariate_accumulators, scale_and_sum);
        RelationUtils::zero_univariates(univariate_accumulators);

        return result;
    }

    static std::pair<typename ProverInstance::FF, std::array<typename ProverInstance::FF, NUM_INSTANCES>>
    compute_vanishing_polynomial_and_lagranges(const FF& challenge)
    {
        FF vanishing_polynomial_at_challenge;
        std::array<FF, NUM_INSTANCES> lagranges;
        vanishing_polynomial_at_challenge = challenge * (challenge - FF(1));
        lagranges = { FF(1) - challenge, challenge };

        return { vanishing_polynomial_at_challenge, lagranges };
    }

    /**
     * @brief Compute the combiner quotient defined as $K$ polynomial in the paper specialised for only folding two
     * instances at once.
     */
    static Univariate<FF, BATCHED_EXTENDED_LENGTH, NUM_INSTANCES> compute_combiner_quotient(
        FF perturbator_evaluation, ExtendedUnivariateWithRandomization combiner)
    {
        std::array<FF, BATCHED_EXTENDED_LENGTH - NUM_INSTANCES> combiner_quotient_evals = {};

        for (size_t point = NUM_INSTANCES; point < combiner.size(); point++) {
            auto idx = point - NUM_INSTANCES;
            FF lagrange_0 = FF(1) - FF(point);
            FF vanishing_polynomial = FF(point) * (FF(point) - 1);
            combiner_quotient_evals[idx] =
                (combiner.value_at(point) - perturbator_evaluation * lagrange_0) * vanishing_polynomial.invert();
        }

        return Univariate<FF, BATCHED_EXTENDED_LENGTH, NUM_INSTANCES>(combiner_quotient_evals);
    }

    /**
     * @brief For each parameter, collect the value in each decider pvogin key in a univariate and extend for use in the
     * combiner compute.
     */
    template <typename ExtendedRelationParameters>
    static ExtendedRelationParameters compute_extended_relation_parameters(const ProverInstances& instances)
    {
        using UnivariateParameter = typename ExtendedRelationParameters::DataType;
        ExtendedRelationParameters result;
        size_t param_idx = 0;
        for (auto& param : result.get_to_fold()) {
            Univariate<FF, NUM_INSTANCES> tmp(0);
            tmp.value_at(0) = instances[0]->relation_parameters.get_to_fold()[param_idx];
            tmp.value_at(1) = instances[1]->relation_parameters.get_to_fold()[param_idx];
            param = tmp.template extend_to<UnivariateParameter::LENGTH, UnivariateParameter::SKIP_COUNT>();
            param_idx++;
        }
        return result;
    }

    /**
     * @brief Combine the relation batching parameters (alphas) from each prover instance into a univariate for the
     * combiner computation.
     */
    static UnivariateSubrelationSeparators compute_and_extend_alphas(const ProverInstances& instances)
    {
        UnivariateSubrelationSeparators result;
        size_t alpha_idx = 0;
        for (auto& alpha : result) {
            Univariate<FF, NUM_INSTANCES> tmp;
            tmp.value_at(0) = instances[0]->alphas[alpha_idx];
            tmp.value_at(1) = instances[1]->alphas[alpha_idx];
            alpha = tmp.template extend_to<BATCHED_EXTENDED_LENGTH>();
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
