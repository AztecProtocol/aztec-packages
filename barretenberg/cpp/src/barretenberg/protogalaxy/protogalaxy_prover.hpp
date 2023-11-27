#pragma once
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/polynomials/pow.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/utils.hpp"
#include "barretenberg/sumcheck/instance/instances.hpp"

namespace proof_system::honk {
template <class ProverInstances_> class ProtoGalaxyProver_ {
  public:
    using ProverInstances = ProverInstances_;
    using Flavor = typename ProverInstances::Flavor;
    using FF = typename Flavor::FF;
    using Instance = typename ProverInstances::Instance;
    using Utils = barretenberg::RelationUtils<Flavor>;
    using RowEvaluations = typename Flavor::AllValues;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Relations = typename Flavor::Relations;
    using AlphaType = typename ProverInstances::AlphaType;

    using BaseUnivariate = Univariate<FF, ProverInstances::NUM>;
    // The length of ExtendedUnivariate is the largest length (==max_relation_degree + 1) of a univariate polynomial
    // obtained by composing a relation with folded instance + relation parameters .
    using ExtendedUnivariate = Univariate<FF, (Flavor::MAX_TOTAL_RELATION_LENGTH - 1) * (ProverInstances::NUM - 1) + 1>;
    // Represents the total length of the combiner univariate, obtained by combining the already folded relations with
    // the folded relation batching challenge.
    using ExtendedUnivariateWithRandomization =
        Univariate<FF,
                   (Flavor::MAX_TOTAL_RELATION_LENGTH - 1 + ProverInstances::NUM - 1) * (ProverInstances::NUM - 1) + 1>;

    using ExtendedUnivariates = typename Flavor::template ProverUnivariates<ExtendedUnivariate::LENGTH>;

    using TupleOfTuplesOfUnivariates =
        typename Flavor::template ProtogalaxyTupleOfTuplesOfUnivariates<ProverInstances::NUM>;
    using RelationEvaluations = typename Flavor::TupleOfArraysOfValues;

    ProverInstances instances;
    BaseTranscript<FF> transcript;

    ProtoGalaxyProver_() = default;
    ProtoGalaxyProver_(ProverInstances insts)
        : instances(insts){};
    ~ProtoGalaxyProver_() = default;

    /**
     * @brief Prior to folding we need to add all the public inputs to the transcript, labelled by their corresponding
     * instance index, compute all the instance's polynomials and record the relation parameters involved in computing
     * these polynomials in the transcript.
     *
     */
    void prepare_for_folding();

    /**
     * @brief Given a vector \vec{\beta} of values, compute the pow polynomial on these values as defined in the paper.
     */
    static std::vector<FF> compute_pow_polynomial_at_values(const std::vector<FF>& betas, const size_t instance_size)
    {
        std::vector<FF> pow_betas(instance_size);
        for (size_t i = 0; i < instance_size; i++) {
            auto res = FF(1);
            for (size_t j = i, beta_idx = 0; j > 0; j >>= 1, beta_idx++) {
                if ((j & 1) == 1) {
                    res *= betas[beta_idx];
                }
            }
            pow_betas[i] = res;
        }
        return pow_betas;
    }

    /**
     * @brief For a new round challenge δ at each iteration of the ProtoGalaxy protocol, compute the vector
     * [δ, δ^2,..., δ^t] where t = logn and n is the size of the instance.
     */
    static std::vector<FF> compute_round_challenge_pows(const size_t log_instance_size, const FF& round_challenge)
    {
        std::vector<FF> pows(log_instance_size);
        pows[0] = round_challenge;
        for (size_t i = 1; i < log_instance_size; i++) {
            pows[i] = pows[i - 1].sqr();
        }
        return pows;
    }

    // Returns the accumulator, which is the first element in ProverInstances. The accumulator is assumed to have the
    // FoldingParameters set and be the result of a previous round of folding.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/740): handle the case when the accumulator is empty
    // (i.e. we are in the first round of folding)/
    std::shared_ptr<Instance> get_accumulator() { return instances[0]; }

    /**
     * @brief Compute the values of the full Honk relation at each row in the execution trace, f_i(ω) in the
     * ProtoGalaxy paper, given the evaluations of all the prover polynomials and α (the parameter that helps establish
     * each subrelation is independently valid in Honk - from the Plonk paper, DO NOT confuse with α in ProtoGalaxy),
     */
    static std::vector<FF> compute_full_honk_evaluations(const ProverPolynomials& instance_polynomials,
                                                         const FF& alpha,
                                                         const RelationParameters<FF>& relation_parameters)
    {
        auto instance_size = instance_polynomials.get_polynomial_size();

        std::vector<FF> full_honk_evaluations(instance_size);
        for (size_t row = 0; row < instance_size; row++) {
            auto row_evaluations = instance_polynomials.get_row(row);
            RelationEvaluations relation_evaluations;
            Utils::zero_elements(relation_evaluations);

            // Note that the evaluations are accumulated with the gate separation challenge being 1 at this stage, as
            // this specific randomness is added later through the power polynomial univariate specific to ProtoGalaxy
            Utils::template accumulate_relation_evaluations<>(
                row_evaluations, relation_evaluations, relation_parameters, FF(1));

            auto running_challenge = FF(1);
            auto output = FF(0);
            Utils::scale_and_batch_elements(relation_evaluations, alpha, running_challenge, output);
            full_honk_evaluations[row] = output;
        }
        return full_honk_evaluations;
    }

    /**
     * @brief  Recursively compute the parent nodes of each level in there, starting from the leaves. Note that at each
     * level, the resulting parent nodes will be polynomials of degree (level + 1) because we multiply by an additional
     * factor of X.
     */
    static std::vector<FF> construct_coefficients_tree(const std::vector<FF>& betas,
                                                       const std::vector<FF>& deltas,
                                                       const std::vector<std::vector<FF>>& prev_level_coeffs,
                                                       size_t level = 1)
    {
        // if we are at level t in the tree, where t = logn and n is the instance size, we have reached the root which
        // contains the coefficients of the perturbator polynomial
        if (level == betas.size()) {
            return prev_level_coeffs[0];
        }

        auto degree = level + 1;
        auto prev_level_width = prev_level_coeffs.size();
        // we need degree + 1 terms to represent the intermediate polynomials
        std::vector<std::vector<FF>> level_coeffs(prev_level_width >> 1, std::vector<FF>(degree + 1, 0));
        for (size_t node = 0; node < prev_level_width; node += 2) {
            auto parent = node >> 1;
            std::copy(prev_level_coeffs[node].begin(), prev_level_coeffs[node].end(), level_coeffs[parent].begin());
            for (size_t d = 0; d < degree; d++) {
                level_coeffs[parent][d] += prev_level_coeffs[node + 1][d] * betas[level];
                level_coeffs[parent][d + 1] += prev_level_coeffs[node + 1][d] * deltas[level];
            }
        }
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
        std::vector<std::vector<FF>> first_level_coeffs(width >> 1, std::vector<FF>(2, 0));
        for (size_t node = 0; node < width; node += 2) {
            auto parent = node >> 1;
            first_level_coeffs[parent][0] = full_honk_evaluations[node] + full_honk_evaluations[node + 1] * betas[0];
            first_level_coeffs[parent][1] = full_honk_evaluations[node + 1] * deltas[0];
        }
        return construct_coefficients_tree(betas, deltas, first_level_coeffs);
    }

    /**
     * @brief Construct the power perturbator polynomial F(X) in coefficient form from the accumulator, representing the
     * relaxed instance.
     *
     *
     */
    static Polynomial<FF> compute_perturbator(const std::shared_ptr<Instance> accumulator,
                                              const std::vector<FF>& deltas)
    {
        auto full_honk_evaluations = compute_full_honk_evaluations(
            accumulator->prover_polynomials, accumulator->alpha, accumulator->relation_parameters);
        const auto betas = accumulator->folding_parameters.gate_separation_challenges;
        assert(betas.size() == deltas.size());
        auto coeffs = construct_perturbator_coefficients(betas, deltas, full_honk_evaluations);
        return Polynomial<FF>(coeffs);
    }

    ProverFoldingResult<Flavor> fold_instances();

    TupleOfTuplesOfUnivariates univariate_accumulators;

    /**
     * @brief Prepare a univariate polynomial for relation execution in one step of the main loop in folded instance
     * construction.
     * @details For a fixed prover polynomial index, extract that polynomial from each instance in Instances. From each
     * polynomial, extract the value at row_idx. Use these values to create a univariate polynomial, and then extend
     * (i.e., compute additional evaluations at adjacent domain values) as needed.
     * @todo TODO(https://github.com/AztecProtocol/barretenberg/issues/751) Optimize memory
     */
    void extend_univariates(ExtendedUnivariates& extended_univariates,
                            const ProverInstances& instances,
                            const size_t row_idx)
    {
        auto base_univariates = instances.row_to_univariates(row_idx);
        for (auto [extended_univariate, base_univariate] :
             zip_view(extended_univariates.pointer_view(), base_univariates)) {
            *extended_univariate = base_univariate.template extend_to<ExtendedUnivariate::LENGTH>();
        }
    }

    template <typename Parameters, size_t relation_idx = 0>
    void accumulate_relation_univariates(TupleOfTuplesOfUnivariates& univariate_accumulators,
                                         const ExtendedUnivariates& extended_univariates,
                                         const Parameters& relation_parameters,
                                         const FF& scaling_factor)
    {
        using Relation = std::tuple_element_t<relation_idx, Relations>;
        Relation::accumulate(
            std::get<relation_idx>(univariate_accumulators), extended_univariates, relation_parameters, scaling_factor);

        // Repeat for the next relation.
        if constexpr (relation_idx + 1 < Flavor::NUM_RELATIONS) {
            accumulate_relation_univariates<Parameters, relation_idx + 1>(
                univariate_accumulators, extended_univariates, relation_parameters, scaling_factor);
        }
    }

    /**
     * @brief Compute the combiner polynomial $G$ in the Protogalaxy paper.
     *
     */
    ExtendedUnivariateWithRandomization compute_combiner(const ProverInstances& instances,
                                                         const std::vector<FF>& pow_betas_star)
    {
        size_t common_circuit_size = instances[0]->prover_polynomials.get_polynomial_size();

        // Determine number of threads for multithreading.
        // Note: Multithreading is "on" for every round but we reduce the number of threads from the max available based
        // on a specified minimum number of iterations per thread. This eventually leads to the use of a single thread.
        // For now we use a power of 2 number of threads simply to ensure the round size is evenly divided.
        size_t max_num_threads = get_num_cpus_pow2(); // number of available threads (power of 2)
        size_t min_iterations_per_thread = 1 << 6; // min number of iterations for which we'll spin up a unique thread
        size_t desired_num_threads = common_circuit_size / min_iterations_per_thread;
        size_t num_threads = std::min(desired_num_threads, max_num_threads); // fewer than max if justified
        num_threads = num_threads > 0 ? num_threads : 1;                     // ensure num threads is >= 1
        size_t iterations_per_thread = common_circuit_size / num_threads;    // actual iterations per thread

        // Constuct univariate accumulator containers; one per thread
        std::vector<TupleOfTuplesOfUnivariates> thread_univariate_accumulators(num_threads);
        for (auto& accum : thread_univariate_accumulators) {
            Utils::zero_univariates(accum);
        }

        // Constuct extended univariates containers; one per thread
        std::vector<ExtendedUnivariates> extended_univariates;
        extended_univariates.resize(num_threads);

        // Accumulate the contribution from each sub-relation
        parallel_for(num_threads, [&](size_t thread_idx) {
            size_t start = thread_idx * iterations_per_thread;
            size_t end = (thread_idx + 1) * iterations_per_thread;

            for (size_t idx = start; idx < end; idx++) {
                extend_univariates(extended_univariates[thread_idx], instances, idx);

                FF pow_challenge = pow_betas_star[idx];

                // Accumulate the i-th row's univariate contribution. Note that the relation parameters passed to this
                // function have already been folded
                accumulate_relation_univariates(
                    thread_univariate_accumulators[thread_idx],
                    extended_univariates[thread_idx],
                    instances.relation_parameters, // these parameters have already been folded
                    pow_challenge);
            }
        });

        // Accumulate the per-thread univariate accumulators into a single set of accumulators
        for (auto& accumulators : thread_univariate_accumulators) {
            Utils::add_nested_tuples(univariate_accumulators, accumulators);
        }
        // Batch the univariate contributions from each sub-relation to obtain the round univariate
        return batch_over_relations(univariate_accumulators, instances.alpha);
    }
    static ExtendedUnivariateWithRandomization batch_over_relations(TupleOfTuplesOfUnivariates univariate_accumulators,
                                                                    AlphaType alpha)
    {

        // First relation does not get multiplied by a batching challenge
        auto result = std::get<0>(std::get<0>(univariate_accumulators))
                          .template extend_to<ProverInstances::BATCHED_EXTENDED_LENGTH>();
        auto scale_and_sum = [&]<size_t outer_idx, size_t>(auto& element) {
            auto extended = element.template extend_to<ProverInstances::BATCHED_EXTENDED_LENGTH>();
            extended *= alpha;
            result += extended;
        };

        Utils::template apply_to_tuple_of_tuples<0, 1>(univariate_accumulators, scale_and_sum);
        Utils::zero_univariates(univariate_accumulators);

        return result;
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

        // Compute the combiner quotient polynomial as evaluations on points that are not in the vanishing set.
        //
        for (size_t point = ProverInstances::NUM; point < combiner.size(); point++) {
            auto idx = point - ProverInstances::NUM;
            auto lagrange_0 = FF(1) - FF(point);
            auto vanishing_polynomial = FF(point) * (FF(point) - 1);

            combiner_quotient_evals[idx] =
                (combiner.value_at(point) - compressed_perturbator * lagrange_0) * vanishing_polynomial.invert();
        }

        Univariate<FF, ProverInstances::BATCHED_EXTENDED_LENGTH, ProverInstances::NUM> combiner_quotient(
            combiner_quotient_evals);
        return combiner_quotient;
    }

    /**
     * @brief Create folded (univariate) relation parameters.
     * @details For a given relation parameter type, extract that parameter from each instance, place the values in a
     * univariate (i.e., sum them against an appropriate univariate Lagrange basis) and then extended as needed during
     * the constuction of the combiner.
     */
    static void fold_relation_parameters(ProverInstances& instances)
    {
        // array of parameters to be computed
        auto& folded_parameters = instances.relation_parameters.to_fold;
        size_t param_idx = 0;
        for (auto& folded_parameter : folded_parameters) {
            Univariate<FF, ProverInstances::NUM> tmp(0);
            size_t instance_idx = 0;
            for (auto& instance : instances) {
                tmp.value_at(instance_idx) = instance->relation_parameters.to_fold[param_idx];
                instance_idx++;
            }
            folded_parameter.get() = tmp.template extend_to<ProverInstances::EXTENDED_LENGTH>();
            param_idx++;
        }
    }

    /**
     * @brief Create folded univariate for the relation batching parameter (alpha).
     *
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/772): At the moment we have a single α per Instance, we
    // fold them and then we use the unique folded_α for each folded subrelation that is batched in the combiner. This
    // is obviously insecure. We need to generate α_i for each subrelation_i, fold them and then use folded_α_i when
    // batching the i-th folded subrelation in the combiner.
    static void fold_alpha(ProverInstances& instances)
    {
        Univariate<FF, ProverInstances::NUM> accumulated_alpha;
        size_t instance_idx = 0;
        for (auto& instance : instances) {
            accumulated_alpha.value_at(instance_idx) = instance->alpha;
            instance_idx++;
        }
        instances.alpha = accumulated_alpha.template extend_to<ProverInstances::BATCHED_EXTENDED_LENGTH>();
    }
};

extern template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::Ultra, 2>>;
extern template class ProtoGalaxyProver_<ProverInstances_<honk::flavor::GoblinUltra, 2>>;
} // namespace proof_system::honk
