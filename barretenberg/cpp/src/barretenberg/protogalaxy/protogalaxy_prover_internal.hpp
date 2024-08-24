#pragma once
#include "barretenberg/common/container.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/utils.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"

namespace bb {

/**
 * @brief A purely static class (never add state to this!) consisting of functions used by the Protogalaxy prover.
 *
 * @tparam ProverInstances_
 */
template <class ProverInstances_> class ProtogalaxyProverInternal {
  public:
    using ProverInstances = ProverInstances_;
    using Flavor = typename ProverInstances::Flavor;
    using FF = typename Flavor::FF;
    using Instance = typename ProverInstances::Instance;
    using RelationUtils = bb::RelationUtils<Flavor>;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Relations = typename Flavor::Relations;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using CombinedRelationSeparator = typename ProverInstances::RelationSeparator;

    // The length of ExtendedUnivariate is the largest length (==max_relation_degree + 1) of a univariate polynomial
    // obtained by composing a relation with folded instance + relation parameters .
    using ExtendedUnivariate = Univariate<FF, (Flavor::MAX_TOTAL_RELATION_LENGTH - 1) * (ProverInstances::NUM - 1) + 1>;
    // Represents the total length of the combiner univariate, obtained by combining the already folded relations with
    // the folded relation batching challenge.
    using ExtendedUnivariateWithRandomization =
        Univariate<FF,
                   (Flavor::MAX_TOTAL_RELATION_LENGTH - 1 + ProverInstances::NUM - 1) * (ProverInstances::NUM - 1) + 1>;
    using ExtendedUnivariates = typename Flavor::template ProverUnivariates<ExtendedUnivariate::LENGTH>;
    using OptimisedExtendedUnivariates =
        typename Flavor::template OptimisedProverUnivariates<ExtendedUnivariate::LENGTH,
                                                             /* SKIP_COUNT= */ ProverInstances::NUM - 1>;

    using TupleOfTuplesOfUnivariates =
        typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariates<ProverInstances::NUM>;
    using OptimisedTupleOfTuplesOfUnivariates =
        typename Flavor::template OptimisedProtogalaxyTupleOfTuplesOfUnivariates<ProverInstances::NUM>;
    using RelationEvaluations = typename Flavor::TupleOfArraysOfValues;

    static constexpr size_t NUM_SUBRELATIONS = ProverInstances::NUM_SUBRELATIONS;

    /**
     * @brief Compute the values of the full Honk relation at each row in the execution trace, representing f_i(ω) in
     * the ProtoGalaxy paper, given the evaluations of all the prover polynomials and \vec{α} (the batching challenges
     * that help establishing each subrelation is independently valid in Honk - from the Plonk paper, DO NOT confuse
     * with α in ProtoGalaxy).
     *
     * @details When folding Mega instances, one of the relations is linearly dependent. We define such relations
     * as acting on the entire execution trace and hence requiring to be accumulated separately as we iterate over each
     * row. At the end of the function, the linearly dependent contribution is accumulated at index 0 representing the
     * sum f_0(ω) + α_j*g(ω) where f_0 represents the full honk evaluation at row 0, g(ω) is the linearly dependent
     * subrelation and α_j is its corresponding batching challenge.
     */
    static std::vector<FF> compute_full_honk_evaluations(const ProverPolynomials& instance_polynomials,
                                                         const RelationSeparator& alpha,
                                                         const RelationParameters<FF>& relation_parameters)

    {
        BB_OP_COUNT_TIME_NAME("ProtoGalaxyProver_::compute_full_honk_evaluations");
        auto instance_size = instance_polynomials.get_polynomial_size();
        std::vector<FF> full_honk_evaluations(instance_size);
        std::vector<FF> linearly_dependent_contribution_accumulators = parallel_for_heuristic(
            instance_size,
            /*accumulator default*/ FF(0),
            [&](size_t row, FF& linearly_dependent_contribution_accumulator) {
                auto row_evaluations = instance_polynomials.get_row(row);
                RelationEvaluations relation_evaluations;
                RelationUtils::zero_elements(relation_evaluations);

                RelationUtils::template accumulate_relation_evaluations<>(
                    row_evaluations, relation_evaluations, relation_parameters, FF(1));

                auto output = FF(0);
                auto running_challenge = FF(1);
                RelationUtils::scale_and_batch_elements(relation_evaluations,
                                                        alpha,
                                                        running_challenge,
                                                        output,
                                                        linearly_dependent_contribution_accumulator);

                full_honk_evaluations[row] = output;
            },
            thread_heuristics::ALWAYS_MULTITHREAD);
        full_honk_evaluations[0] += sum(linearly_dependent_contribution_accumulators);
        return full_honk_evaluations;
    }

    /**
     * @brief  Recursively compute the parent nodes of each level in the tree, starting from the leaves. Note that at
     * each level, the resulting parent nodes will be polynomials of degree (level+1) because we multiply by an
     * additional factor of X.
     */
    static std::vector<FF> construct_coefficients_tree(const std::vector<FF>& betas,
                                                       const std::vector<FF>& deltas,
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
    static std::vector<FF> construct_perturbator_coefficients(const std::vector<FF>& betas,
                                                              const std::vector<FF>& deltas,
                                                              const std::vector<FF>& full_honk_evaluations)
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
     * @brief Construct the power perturbator polynomial F(X) in coefficient form from the accumulator, representing the
     * relaxed instance.
     *
     *
     */
    static LegacyPolynomial<FF> compute_perturbator(std::shared_ptr<Instance> accumulator,
                                                    const std::vector<FF>& deltas)
    {
        BB_OP_COUNT_TIME();
        auto full_honk_evaluations = compute_full_honk_evaluations(
            accumulator->proving_key.polynomials, accumulator->alphas, accumulator->relation_parameters);
        const auto betas = accumulator->gate_challenges;
        assert(betas.size() == deltas.size());
        auto coeffs = construct_perturbator_coefficients(betas, deltas, full_honk_evaluations);
        return LegacyPolynomial<FF>(coeffs);
    }

    /**
     * @brief Prepare a univariate polynomial for relation execution in one step of the main loop in folded instance
     * construction.
     * @details For a fixed prover polynomial index, extract that polynomial from each instance in Instances. From
     *each polynomial, extract the value at row_idx. Use these values to create a univariate polynomial, and then
     *extend (i.e., compute additional evaluations at adjacent domain values) as needed.
     * @todo TODO(https://github.com/AztecProtocol/barretenberg/issues/751) Optimize memory
     */

    template <size_t skip_count = 0>
    static void extend_univariates(
        std::conditional_t<skip_count != 0, OptimisedExtendedUnivariates, ExtendedUnivariates>& extended_univariates,
        const ProverInstances& instances,
        const size_t row_idx)
    {
        auto base_univariates = instances.template row_to_univariates<skip_count>(row_idx);
        for (auto [extended_univariate, base_univariate] : zip_view(extended_univariates.get_all(), base_univariates)) {
            extended_univariate = base_univariate.template extend_to<ExtendedUnivariate::LENGTH, skip_count>();
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
    template <typename TupleOfTuplesOfUnivariates_,
              typename ExtendedUnivariates_,
              typename Parameters,
              size_t relation_idx = 0>
    static void accumulate_relation_univariates(TupleOfTuplesOfUnivariates_& univariate_accumulators,
                                                const ExtendedUnivariates_& extended_univariates,
                                                const Parameters& relation_parameters,
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
            accumulate_relation_univariates<TupleOfTuplesOfUnivariates_,
                                            ExtendedUnivariates_,
                                            Parameters,
                                            relation_idx + 1>(
                univariate_accumulators, extended_univariates, relation_parameters, scaling_factor);
        }
    }

    /**
     * @brief Compute the combiner polynomial $G$ in the Protogalaxy paper
     * @details We have implemented an optimization that (eg in the case where we fold one instance-witness pair at a
     * time) assumes the value G(1) is 0, which is true in the case where the witness to be folded is valid.
     * @todo (https://github.com/AztecProtocol/barretenberg/issues/968) Make combiner tests better
     *
     * @tparam skip_zero_computations whether to use the the optimization that skips computing zero.
     * @param instances
     * @param pow_betas
     * @return ExtendedUnivariateWithRandomization
     */
    template <bool skip_zero_computations = true>
    static ExtendedUnivariateWithRandomization compute_combiner(
        const ProverInstances& instances,
        PowPolynomial<FF>& pow_betas,
        TupleOfTuplesOfUnivariates& univariate_accumulators,
        OptimisedTupleOfTuplesOfUnivariates& optimised_univariate_accumulators)
    {
        BB_OP_COUNT_TIME();
        size_t common_instance_size = instances[0]->proving_key.circuit_size;
        pow_betas.compute_values(instances[0]->proving_key.log_circuit_size);
        // Determine number of threads for multithreading.
        // Note: Multithreading is "on" for every round but we reduce the number of threads from the max available based
        // on a specified minimum number of iterations per thread. This eventually leads to the use of a
        // single thread. For now we use a power of 2 number of threads simply to ensure the round size is evenly
        // divided.
        size_t max_num_threads = get_num_cpus_pow2(); // number of available threads (power of 2)
        size_t min_iterations_per_thread = 1 << 6; // min number of iterations for which we'll spin up a unique thread
        size_t desired_num_threads = common_instance_size / min_iterations_per_thread;
        size_t num_threads = std::min(desired_num_threads, max_num_threads); // fewer than max if justified
        num_threads = num_threads > 0 ? num_threads : 1;                     // ensure num threads is >= 1
        size_t iterations_per_thread = common_instance_size / num_threads;   // actual iterations per thread

        // Univariates are optimised for usual PG, but we need the unoptimised version for tests (it's a version that
        // doesn't skip computation), so we need to define types depending on the template instantiation
        using ThreadAccumulators =
            std::conditional_t<skip_zero_computations, OptimisedTupleOfTuplesOfUnivariates, TupleOfTuplesOfUnivariates>;
        using ExtendedUnivatiatesType =
            std::conditional_t<skip_zero_computations, OptimisedExtendedUnivariates, ExtendedUnivariates>;

        // Construct univariate accumulator containers; one per thread
        std::vector<ThreadAccumulators> thread_univariate_accumulators(num_threads);
        for (auto& accum : thread_univariate_accumulators) {
            // just normal relation lengths
            RelationUtils::zero_univariates(accum);
        }

        // Construct extended univariates containers; one per thread
        std::vector<ExtendedUnivatiatesType> extended_univariates;
        extended_univariates.resize(num_threads);

        // Accumulate the contribution from each sub-relation
        parallel_for(num_threads, [&](size_t thread_idx) {
            size_t start = thread_idx * iterations_per_thread;
            size_t end = (thread_idx + 1) * iterations_per_thread;

            for (size_t idx = start; idx < end; idx++) {
                // Instantiate univariates, possibly with skipping toto ignore computation in those indices (they are
                // still available for skipping relations, but all derived univariate will ignore those evaluations)
                // No need to initialise extended_univariates to 0, as it's assigned to.
                constexpr size_t skip_count = skip_zero_computations ? ProverInstances::NUM - 1 : 0;
                extend_univariates<skip_count>(extended_univariates[thread_idx], instances, idx);

                FF pow_challenge = pow_betas[idx];

                // Accumulate the i-th row's univariate contribution. Note that the relation parameters passed to
                // this function have already been folded. Moreover, linear-dependent relations that act over the
                // entire execution trace rather than on rows, will not be multiplied by the pow challenge.
                if constexpr (skip_zero_computations) {
                    accumulate_relation_univariates(
                        thread_univariate_accumulators[thread_idx],
                        extended_univariates[thread_idx],
                        instances.optimised_relation_parameters, // these parameters have already been folded
                        pow_challenge);
                } else {
                    accumulate_relation_univariates(
                        thread_univariate_accumulators[thread_idx],
                        extended_univariates[thread_idx],
                        instances.relation_parameters, // these parameters have already been folded
                        pow_challenge);
                }
            }
        });
        const auto batch_univariates = [&](auto& possibly_optimised_univariate_accumulators) {
            RelationUtils::zero_univariates(possibly_optimised_univariate_accumulators);
            // Accumulate the per-thread univariate accumulators into a single set of accumulators
            for (auto& accumulators : thread_univariate_accumulators) {
                RelationUtils::add_nested_tuples(possibly_optimised_univariate_accumulators, accumulators);
            }

            if constexpr (skip_zero_computations) { // Convert from optimised version to non-optimised
                deoptimise_univariates(possibly_optimised_univariate_accumulators, univariate_accumulators);
            };
            //  Batch the univariate contributions from each sub-relation to obtain the round univariate
            return batch_over_relations(univariate_accumulators, instances.alphas);
        };

        if constexpr (skip_zero_computations) { // Convert from optimised version to non-optimised
            return batch_univariates(optimised_univariate_accumulators);
        } else {
            return batch_univariates(univariate_accumulators);
        }
    }

    /**
     * @brief Convert univariates from optimised form to regular
     *
     * @details We need to convert before we batch relations, since optimised versions don't have enough information to
     * extend the univariates to maximum length
     *
     * @param optimised_univariate_accumulators
     * @param new_univariate_accumulators
     */
    static void deoptimise_univariates(const OptimisedTupleOfTuplesOfUnivariates& optimised_univariate_accumulators,
                                       TupleOfTuplesOfUnivariates& new_univariate_accumulators)
    {
        auto deoptimise = [&]<size_t outer_idx, size_t inner_idx>(auto& element) {
            auto& optimised_element = std::get<inner_idx>(std::get<outer_idx>(optimised_univariate_accumulators));
            element = optimised_element.convert();
        };

        RelationUtils::template apply_to_tuple_of_tuples<0, 0>(new_univariate_accumulators, deoptimise);
    }

    static ExtendedUnivariateWithRandomization batch_over_relations(TupleOfTuplesOfUnivariates& univariate_accumulators,
                                                                    const CombinedRelationSeparator& alpha)
    {
        auto result = std::get<0>(std::get<0>(univariate_accumulators))
                          .template extend_to<ProverInstances::BATCHED_EXTENDED_LENGTH>();
        size_t idx = 0;
        auto scale_and_sum = [&]<size_t outer_idx, size_t inner_idx>(auto& element) {
            auto extended = element.template extend_to<ProverInstances::BATCHED_EXTENDED_LENGTH>();
            extended *= alpha[idx];
            result += extended;
            idx++;
        };

        RelationUtils::template apply_to_tuple_of_tuples<0, 1>(univariate_accumulators, scale_and_sum);
        RelationUtils::zero_univariates(univariate_accumulators);

        return result;
    }

    static std::pair<typename ProverInstances::FF, std::array<typename ProverInstances::FF, ProverInstances::NUM>>
    compute_vanishing_polynomial_and_lagranges(const FF& challenge)
    {
        FF vanishing_polynomial_at_challenge;
        std::array<FF, ProverInstances::NUM> lagranges;
        constexpr FF inverse_two = FF(2).invert();

        if constexpr (ProverInstances::NUM == 2) {
            vanishing_polynomial_at_challenge = challenge * (challenge - FF(1));
            lagranges = { FF(1) - challenge, challenge };
        } else if constexpr (ProverInstances::NUM == 3) {
            vanishing_polynomial_at_challenge = challenge * (challenge - FF(1)) * (challenge - FF(2));
            lagranges = { (FF(1) - challenge) * (FF(2) - challenge) * inverse_two,
                          challenge * (FF(2) - challenge),
                          challenge * (challenge - FF(1)) / FF(2) };
        } else if constexpr (ProverInstances::NUM == 4) {
            constexpr FF inverse_six = FF(6).invert();
            vanishing_polynomial_at_challenge =
                challenge * (challenge - FF(1)) * (challenge - FF(2)) * (challenge - FF(3));
            lagranges = { (FF(1) - challenge) * (FF(2) - challenge) * (FF(3) - challenge) * inverse_six,
                          challenge * (FF(2) - challenge) * (FF(3) - challenge) * inverse_two,
                          challenge * (challenge - FF(1)) * (FF(3) - challenge) * inverse_two,
                          challenge * (challenge - FF(1)) * (challenge - FF(2)) * inverse_six };
        }
        static_assert(ProverInstances::NUM < 5);

        return { vanishing_polynomial_at_challenge, lagranges };
    }

    /**
     * @brief Compute the combiner quotient defined as $K$ polynomial in the paper.
     *
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/764): generalize the computation of vanishing
     * polynomials and Lagrange basis and use batch_invert.
     *
     */
    static Univariate<FF, ProverInstances::BATCHED_EXTENDED_LENGTH, ProverInstances::NUM> compute_combiner_quotient(
        FF compressed_perturbator, ExtendedUnivariateWithRandomization combiner)
    {
        std::array<FF, ProverInstances::BATCHED_EXTENDED_LENGTH - ProverInstances::NUM> combiner_quotient_evals = {};

        constexpr FF inverse_two = FF(2).invert();
        constexpr FF inverse_six = FF(6).invert();
        for (size_t point = ProverInstances::NUM; point < combiner.size(); point++) {
            auto idx = point - ProverInstances::NUM;
            FF lagrange_0;
            FF vanishing_polynomial;
            if constexpr (ProverInstances::NUM == 2) {
                lagrange_0 = FF(1) - FF(point);
                vanishing_polynomial = FF(point) * (FF(point) - 1);
            } else if constexpr (ProverInstances::NUM == 3) {
                lagrange_0 = (FF(1) - FF(point)) * (FF(2) - FF(point)) * inverse_two;
                vanishing_polynomial = FF(point) * (FF(point) - 1) * (FF(point) - 2);
            } else if constexpr (ProverInstances::NUM == 4) {
                lagrange_0 = (FF(1) - FF(point)) * (FF(2) - FF(point)) * (FF(3) - FF(point)) * inverse_six;
                vanishing_polynomial = FF(point) * (FF(point) - 1) * (FF(point) - 2) * (FF(point) - 3);
            }
            static_assert(ProverInstances::NUM < 5);

            combiner_quotient_evals[idx] =
                (combiner.value_at(point) - compressed_perturbator * lagrange_0) * vanishing_polynomial.invert();
        }

        Univariate<FF, ProverInstances::BATCHED_EXTENDED_LENGTH, ProverInstances::NUM> combiner_quotient(
            combiner_quotient_evals);
        return combiner_quotient;
    }

    /**
     * @brief Combine each relation parameter, in part, from all the instances into univariates, used in the
     * computation of combiner.
     * @details For a given relation parameter type, extract that parameter from each instance, place the values in
     * a univariate (i.e., sum them against an appropriate univariate Lagrange basis) and then extended as needed
     * during the constuction of the combiner.
     */
    static void combine_relation_parameters(ProverInstances& instances)
    {
        size_t param_idx = 0;
        auto to_fold = instances.relation_parameters.get_to_fold();
        auto to_fold_optimised = instances.optimised_relation_parameters.get_to_fold();
        for (auto [folded_parameter, optimised_folded_parameter] : zip_view(to_fold, to_fold_optimised)) {
            Univariate<FF, ProverInstances::NUM> tmp(0);
            size_t instance_idx = 0;
            for (auto& instance : instances) {
                tmp.value_at(instance_idx) = instance->relation_parameters.get_to_fold()[param_idx];
                instance_idx++;
            }
            folded_parameter = tmp.template extend_to<ProverInstances::EXTENDED_LENGTH>();
            optimised_folded_parameter =
                tmp.template extend_to<ProverInstances::EXTENDED_LENGTH, ProverInstances::NUM - 1>();
            param_idx++;
        }
    }

    /**
     * @brief Combine the relation batching parameters (alphas) from each instance into a univariate, used in the
     * computation of combiner.
     *
     */
    static void combine_alpha(ProverInstances& instances)
    {
        size_t alpha_idx = 0;
        for (auto& alpha : instances.alphas) {
            Univariate<FF, ProverInstances::NUM> tmp;
            size_t instance_idx = 0;
            for (auto& instance : instances) {
                tmp.value_at(instance_idx) = instance->alphas[alpha_idx];
                instance_idx++;
            }
            alpha = tmp.template extend_to<ProverInstances::BATCHED_EXTENDED_LENGTH>();
            alpha_idx++;
        }
    }
};
} // namespace bb