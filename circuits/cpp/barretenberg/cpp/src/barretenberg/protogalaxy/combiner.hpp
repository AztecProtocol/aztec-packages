#pragma once
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/pow.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/proof_system/relations/relation_parameters.hpp"
#include "barretenberg/proof_system/relations/utils.hpp"

namespace barretenberg {

template <typename Flavor, size_t NUM_> struct Instances {
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    static constexpr size_t NUM = NUM_;

    using ArrayType = std::array<ProverPolynomials, NUM>;
    ArrayType _data;
    ProverPolynomials const& operator[](size_t idx) const { return _data[idx]; }
    typename ArrayType::iterator begin() { return _data.begin(); };
    typename ArrayType::iterator end() { return _data.end(); };

    Univariate<FF, NUM> row_to_base_univariate(size_t entity_idx, size_t row_idx) const
    {
        Univariate<FF, NUM> result;
        size_t instance_idx = 0;
        for (auto& instance : _data) {
            // WORKTODO cleanup
            result.evaluations[instance_idx] = instance._data[entity_idx][row_idx];
            instance_idx++;
        }
        return result;
    }
};

template <typename Flavor, typename Instances> class ProtogalaxyProver {
  public:
    using Utils = RelationUtils<Flavor>;

    using FF = typename Flavor::FF;
    using Relations = typename Flavor::Relations;
    using BaseUnivariate = Univariate<FF, Instances::NUM>;
    using ExtendedUnivariate = Univariate<FF, (Flavor::MAX_RELATION_LENGTH - 1) * (Instances::NUM - 1) + 1>;
    using RandomExtendedUnivariate =
        Univariate<FF, (Flavor::MAX_RANDOM_RELATION_LENGTH - 1) * (Instances::NUM - 1) + 1>;
    using ExtendedUnivariates =
        typename Flavor::template ProverUnivariates<(Flavor::MAX_RELATION_LENGTH - 1) * (Instances::NUM - 1) + 1>;

    using RelationProtogalaxyUnivariates = typename Flavor::Relation2ProtogalaxyUnivariates;
    RelationProtogalaxyUnivariates univariate_accumulators;

    /**
     * For a fixed entity label, extract that endity from each instance in Instances, and extract
     * @todo WORKTODO: Initial copying step is more efficient?
     */
    void extend_univariates(ExtendedUnivariates& extended_univariates, const Instances& instances, const size_t row_idx)
    {
        for (size_t entity_idx = 0; entity_idx < Flavor::NUM_ALL_ENTITIES; entity_idx++) {
            auto univariate = instances.row_to_base_univariate(entity_idx, row_idx);
            extended_univariates[entity_idx] = univariate.template extend_to<ExtendedUnivariate::LENGTH>();
        }
    }

    template <size_t relation_idx = 0>
    void accumulate_relation_univariates(RelationProtogalaxyUnivariates& univariate_accumulators,
                                         const auto& extended_univariates,
                                         const proof_system::RelationParameters<FF>& relation_parameters,
                                         const FF& scaling_factor)
    {
        using Relation = std::tuple_element_t<relation_idx, Relations>;
        Relation::add_2protogalaxy_univariate_contribution(
            std::get<relation_idx>(univariate_accumulators), extended_univariates, relation_parameters, scaling_factor);

        // Repeat for the next relation.
        if constexpr (relation_idx + 1 < Flavor::NUM_RELATIONS) {
            accumulate_relation_univariates<relation_idx + 1>(
                univariate_accumulators, extended_univariates, relation_parameters, scaling_factor);
        }
    }

    RandomExtendedUnivariate compute_combiner(
        const Instances& instances,
        const proof_system::RelationParameters<typename Flavor::FF>& relation_parameters,
        const PowUnivariate<typename Flavor::FF>& pow_univariate,
        const typename Flavor::FF alpha)
    {
        size_t common_circuit_size = instances[0]._data[0].size();
        // Precompute the vector of required powers of zeta
        // WORKTODO: Parallelize this
        std::vector<FF> pow_challenges(common_circuit_size);
        pow_challenges[0] =
            pow_univariate.partial_evaluation_constant; // LEFTOFFHERE: segfault here; need nonempty polynomials!
        for (size_t i = 1; i < common_circuit_size; ++i) {
            pow_challenges[i] = pow_challenges[i - 1] * pow_univariate.zeta_pow;
        }

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
        std::vector<RelationProtogalaxyUnivariates> thread_univariate_accumulators(num_threads);
        for (auto& accum : thread_univariate_accumulators) {
            Utils::zero_univariates(accum);
        }

        // Constuct extended edge containers; one per thread
        std::vector<ExtendedUnivariates> extended_univariates;
        extended_univariates.resize(num_threads);

        // Accumulate the contribution from each sub-relation across each edge of the hypercube
        parallel_for(num_threads, [&](size_t thread_idx) {
            size_t start = thread_idx * iterations_per_thread;
            size_t end = (thread_idx + 1) * iterations_per_thread;

            for (size_t idx = start; idx < end; idx++) {
                extend_univariates(extended_univariates[thread_idx], instances, idx);

                // Update the pow polynomial's contribution c_l ⋅ ζ_{l+1}ⁱ for the next edge.
                FF pow_challenge = pow_challenges[idx];

                // Compute the i-th edge's univariate contribution,
                // scale it by the pow polynomial's constant and zeta power "c_l ⋅ ζ_{l+1}ⁱ"
                // and add it to the accumulators for Sˡ(Xₗ)
                accumulate_relation_univariates(thread_univariate_accumulators[thread_idx],
                                                extended_univariates[thread_idx],
                                                relation_parameters,
                                                pow_challenge);
            }
        });

        // Accumulate the per-thread univariate accumulators into a single set of accumulators
        for (auto& accumulators : thread_univariate_accumulators) {
            Utils::add_nested_tuples(univariate_accumulators, accumulators);
        }
        // Batch the univariate contributions from each sub-relation to obtain the round univariate
        return Utils::template batch_over_relations<RandomExtendedUnivariate>(
            univariate_accumulators, alpha, pow_univariate);
    }
};
} // namespace barretenberg