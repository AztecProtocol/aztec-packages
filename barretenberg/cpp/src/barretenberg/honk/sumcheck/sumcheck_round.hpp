#pragma once
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/pow.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/proof_system/relations/relation_parameters.hpp"
#include "barretenberg/proof_system/relations/utils.hpp"

namespace proof_system::honk::sumcheck {

/*
 Notation: The polynomial P(X0, X1) that is the low-degree extension of its values vij = P(i,j)
 for i,j ∈ H = {0,1} is conveniently recorded as follows:
     (0,1)-----(1,1)   v01 ------ v11
       |          |     |          |  P(X0,X1) =   (v00 * (1-X0) + v10 * X0) * (1-X1)
   X1  |   H^2    |     | P(X0,X1) |             + (v01 * (1-X0) + v11 * X0) *   X1
       |          |     |          |
     (0,0) ---- (1,0)  v00 -------v10
            X0
*/

/*
 Example: There are two low-degree extensions Y1, Y2 over the square H^2 in the Cartesian plane.

    3 -------- 7   4 -------- 8
    |          |   |          | Let F(X0, X1) = G(Y1, Y2) =     G0(Y1(X0, X1), Y2(X0, X1))
    |    Y1    |   |    Y2    |                             + α G1(Y1(X0, X1), Y2(X0, X1)),
    |          |   |          |  where the relations are G0(Y1, Y2) = Y1 * Y2
    1 -------- 5   2 -------- 6                      and G1(Y1, Y2) = Y1 + Y2.

 G1, G2 together comprise the Relations.

 In the first round, the computations will relate elements along horizontal lines. As a mnemonic, we
 use the term "edge" for the linear, univariate polynomials corresponding to the four lines
  1 - 5
  2 - 6
  3 - 7
  4 - 8

 The polynomials Y1, Y2 are stored in an array in Multivariates. In the first round, these are arrays
 of spans living outside of the Multivariates object, and in sebsequent rounds these are arrays of field
 elements that are stored in the Multivariates. The rationale for adopting this model is to
 avoid copying the full-length polynomials; this way, the largest polynomial array stores in a
 Multivariates class is multivariates_n/2.

 Note: This class uses recursive function calls with template parameters. This is a common trick that is used to force
 the compiler to unroll loops. The idea is that a function that is only called once will always be inlined, and since
 template functions always create different functions, this is guaranteed.

 @todo TODO(#390): Template only on Flavor? Is it useful to have these decoupled?
 */

template <typename Flavor> class SumcheckProverRound {

    using Utils = barretenberg::RelationUtils<Flavor>;
    using Relations = typename Flavor::Relations;
    using RelationSumcheckUnivariates = typename Flavor::RelationSumcheckUnivariates;

  public:
    using FF = typename Flavor::FF;
    using ExtendedEdges = typename Flavor::template ProverUnivariates<Flavor::MAX_RELATION_LENGTH>;

    size_t round_size; // a power of 2

    static constexpr size_t NUM_RELATIONS = Flavor::NUM_RELATIONS;
    static constexpr size_t MAX_RELATION_LENGTH = Flavor::MAX_RELATION_LENGTH;
    static constexpr size_t MAX_RANDOM_RELATION_LENGTH = Flavor::MAX_RANDOM_RELATION_LENGTH;

    RelationSumcheckUnivariates univariate_accumulators;

    // Prover constructor
    SumcheckProverRound(size_t initial_round_size)
        : round_size(initial_round_size)
    {
        // Initialize univariate accumulators to 0
        Utils::zero_univariates(univariate_accumulators);
    }

    /**
     * @brief Extend each edge in the edge group at to max-relation-length-many values.
     *
     * @details Should only be called externally with relation_idx equal to 0.
     * In practice, multivariates is one of ProverPolynomials or FoldedPolynomials.
     *
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    void extend_edges(ExtendedEdges& extended_edges,
                      /* const */ ProverPolynomialsOrPartiallyEvaluatedMultivariates& multivariates,
                      size_t edge_idx)
    {
        size_t univariate_idx = 0; // TODO(#391) zip
        for (auto& poly : multivariates) {
            auto edge = barretenberg::Univariate<FF, 2>({ poly[edge_idx], poly[edge_idx + 1] });
            extended_edges[univariate_idx] = edge.template extend_to<MAX_RELATION_LENGTH>();
            ++univariate_idx;
        }
    }

    /**
     * @brief Return the evaluations of the univariate restriction (S_l(X_l) in the thesis) at num_multivariates-many
     * values. Most likely this will end up being S_l(0), ... , S_l(t-1) where t is around 12. At the end, reset all
     * univariate accumulators to be zero.
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    barretenberg::Univariate<FF, MAX_RANDOM_RELATION_LENGTH> compute_univariate(
        ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
        const proof_system::RelationParameters<FF>& relation_parameters,
        const barretenberg::PowUnivariate<FF>& pow_univariate,
        const FF alpha)
    {
        // Precompute the vector of required powers of zeta
        // TODO(luke): Parallelize this
        std::vector<FF> pow_challenges(round_size >> 1);
        pow_challenges[0] = pow_univariate.partial_evaluation_constant;
        for (size_t i = 1; i < (round_size >> 1); ++i) {
            pow_challenges[i] = pow_challenges[i - 1] * pow_univariate.zeta_pow_sqr;
        }

        // Determine number of threads for multithreading.
        // Note: Multithreading is "on" for every round but we reduce the number of threads from the max available based
        // on a specified minimum number of iterations per thread. This eventually leads to the use of a single thread.
        // For now we use a power of 2 number of threads simply to ensure the round size is evenly divided.
        size_t max_num_threads = get_num_cpus_pow2(); // number of available threads (power of 2)
        size_t min_iterations_per_thread = 1 << 6; // min number of iterations for which we'll spin up a unique thread
        size_t desired_num_threads = round_size / min_iterations_per_thread;
        size_t num_threads = std::min(desired_num_threads, max_num_threads); // fewer than max if justified
        num_threads = num_threads > 0 ? num_threads : 1;                     // ensure num threads is >= 1
        size_t iterations_per_thread = round_size / num_threads;             // actual iterations per thread

        // Constuct univariate accumulator containers; one per thread
        std::vector<RelationSumcheckUnivariates> thread_univariate_accumulators(num_threads);
        for (auto& accum : thread_univariate_accumulators) {
            Utils::zero_univariates(accum);
        }

        // Constuct extended edge containers; one per thread
        std::vector<ExtendedEdges> extended_edges;
        extended_edges.resize(num_threads);

        // Accumulate the contribution from each sub-relation accross each edge of the hyper-cube
        parallel_for(num_threads, [&](size_t thread_idx) {
            size_t start = thread_idx * iterations_per_thread;
            size_t end = (thread_idx + 1) * iterations_per_thread;

            // For each edge_idx = 2i, we need to multiply the whole contribution by zeta^{2^{2i}}
            // This means that each univariate for each relation needs an extra multiplication.
            for (size_t edge_idx = start; edge_idx < end; edge_idx += 2) {
                extend_edges(extended_edges[thread_idx], polynomials, edge_idx);

                // Update the pow polynomial's contribution c_l ⋅ ζ_{l+1}ⁱ for the next edge.
                FF pow_challenge = pow_challenges[edge_idx >> 1];

                // Compute the i-th edge's univariate contribution,
                // scale it by the pow polynomial's constant and zeta power "c_l ⋅ ζ_{l+1}ⁱ"
                // and add it to the accumulators for Sˡ(Xₗ)
                accumulate_relation_univariates<>(thread_univariate_accumulators[thread_idx],
                                                  extended_edges[thread_idx],
                                                  relation_parameters,
                                                  pow_challenge);
            }
        });

        // Accumulate the per-thread univariate accumulators into a single set of accumulators
        for (auto& accumulators : thread_univariate_accumulators) {
            Utils::add_nested_tuples(univariate_accumulators, accumulators);
        }
        // Batch the univariate contributions from each sub-relation to obtain the round univariate
        return Utils::template batch_over_relations<barretenberg::Univariate<FF, MAX_RANDOM_RELATION_LENGTH>>(
            univariate_accumulators, alpha, pow_univariate);
    }

  private:
    /**
     * @brief For a given edge, calculate the contribution of each relation to the prover round univariate (S_l in the
     * thesis).
     *
     * @details In Round l, the univariate S_l computed by the prover is computed as follows:
     *   - Outer loop: iterate through the points on the boolean hypercube of dimension = log(round_size), skipping
     *                 every other point. On each iteration, create a Univariate<FF, 2> (an 'edge') for each
     *                 multivariate.
     *   - Inner loop: iterate through the relations, feeding each relation the present collection of edges. Each
     *                 relation adds a contribution
     *
     * Result: for each relation, a univariate of some degree is computed by accumulating the contributions of each
     * group of edges. These are stored in `univariate_accumulators`. Adding these univariates together, with
     * appropriate scaling factors, produces S_l.
     */
    template <size_t relation_idx = 0>
    void accumulate_relation_univariates(RelationSumcheckUnivariates& univariate_accumulators,
                                         const auto& extended_edges,
                                         const proof_system::RelationParameters<FF>& relation_parameters,
                                         const FF& scaling_factor)
    {
        using Relation = std::tuple_element_t<relation_idx, Relations>;
        Relation::add_edge_contribution(
            std::get<relation_idx>(univariate_accumulators), extended_edges, relation_parameters, scaling_factor);

        // Repeat for the next relation.
        if constexpr (relation_idx + 1 < NUM_RELATIONS) {
            accumulate_relation_univariates<relation_idx + 1>(
                univariate_accumulators, extended_edges, relation_parameters, scaling_factor);
        }
    }
};

template <typename Flavor> class SumcheckVerifierRound {

    using Relations = typename Flavor::Relations;
    using RelationEvaluations = typename Flavor::RelationValues;

  public:
    using FF = typename Flavor::FF;
    using ClaimedEvaluations = typename Flavor::ClaimedEvaluations;

    bool round_failed = false;

    Relations relations;
    static constexpr size_t NUM_RELATIONS = Flavor::NUM_RELATIONS;
    static constexpr size_t MAX_RANDOM_RELATION_LENGTH = Flavor::MAX_RANDOM_RELATION_LENGTH;

    FF target_total_sum = 0;

    RelationEvaluations relation_evaluations;

    // Verifier constructor
    explicit SumcheckVerifierRound() { zero_elements(relation_evaluations); };

    /**
     * @brief Calculate the contribution of each relation to the expected value of the full Honk relation.
     *
     * @details For each relation, use the purported values (supplied by the prover) of the multivariates to calculate
     * a contribution to the purported value of the full Honk relation. These are stored in `evaluations`. Adding these
     * together, with appropriate scaling factors, produces the expected value of the full Honk relation. This value is
     * checked against the final value of the target total sum, defined as sigma_d.
     */
    FF compute_full_honk_relation_purported_value(ClaimedEvaluations purported_evaluations,
                                                  const proof_system::RelationParameters<FF>& relation_parameters,
                                                  const barretenberg::PowUnivariate<FF>& pow_univariate,
                                                  const FF alpha)
    {
        accumulate_relation_evaluations<>(
            purported_evaluations, relation_parameters, pow_univariate.partial_evaluation_constant);

        auto running_challenge = FF(1);
        auto output = FF(0);
        scale_and_batch_elements(relation_evaluations, alpha, running_challenge, output);
        return output;
    }

    /**
     * @brief check if S^{l}(0) + S^{l}(1) = S^{l-1}(u_{l-1}) = sigma_{l} (or 0 if l=0)
     *
     * @param univariate T^{l}(X), the round univariate that is equal to S^{l}(X)/( (1−X) + X⋅ζ^{ 2^l } )
     */
    bool check_sum(barretenberg::Univariate<FF, MAX_RANDOM_RELATION_LENGTH>& univariate)
    {
        // S^{l}(0) = ( (1−0) + 0⋅ζ^{ 2^l } ) ⋅ T^{l}(0) = T^{l}(0)
        // S^{l}(1) = ( (1−1) + 1⋅ζ^{ 2^l } ) ⋅ T^{l}(1) = ζ^{ 2^l } ⋅ T^{l}(1)
        FF total_sum = univariate.value_at(0) + univariate.value_at(1);
        // target_total_sum = sigma_{l} =
        // TODO(#673): Conditionals like this can go away once native verification is is just recursive verification
        // with a simulated builder.
        bool sumcheck_round_failed(false);
        if constexpr (IsRecursiveFlavor<Flavor>) {
            // TODO(#726): Need to constrain this equality and update the native optional return value mechanism for the
            // recursive setting.
            sumcheck_round_failed = (target_total_sum != total_sum).get_value();
        } else {
            sumcheck_round_failed = (target_total_sum != total_sum);
        }

        round_failed = round_failed || sumcheck_round_failed;
        return !sumcheck_round_failed;
    };

    /**
     * @brief After checking that the univariate is good for this round, compute the next target sum.
     *
     * @param univariate T^l(X), given by its evaluations over {0,1,2,...},
     * equal to S^{l}(X)/( (1−X) + X⋅ζ^{ 2^l } )
     * @param round_challenge u_l
     * @return FF sigma_{l+1} = S^l(u_l)
     */
    FF compute_next_target_sum(barretenberg::Univariate<FF, MAX_RANDOM_RELATION_LENGTH>& univariate,
                               FF& round_challenge)
    {
        // Evaluate T^{l}(u_{l})
        target_total_sum = univariate.evaluate(round_challenge);
        return target_total_sum;
    }

  private:
    // TODO(#224)(Cody): make uniform with accumulate_relation_univariates
    /**
     * @brief Calculate the contribution of each relation to the expected value of the full Honk relation.
     *
     * @details For each relation, use the purported values (supplied by the prover) of the multivariates to calculate
     * a contribution to the purported value of the full Honk relation. These are stored in `evaluations`. Adding these
     * together, with appropriate scaling factors, produces the expected value of the full Honk relation. This value is
     * checked against the final value of the target total sum (called sigma_0 in the thesis).
     */
    template <size_t relation_idx = 0>
    // TODO(#224)(Cody): Input should be an array?
    void accumulate_relation_evaluations(ClaimedEvaluations purported_evaluations,
                                         const proof_system::RelationParameters<FF>& relation_parameters,
                                         const FF& partial_evaluation_constant)
    {
        using Relation = std::tuple_element_t<relation_idx, Relations>;
        Relation::add_full_relation_value_contribution(std::get<relation_idx>(relation_evaluations),
                                                       purported_evaluations,
                                                       relation_parameters,
                                                       partial_evaluation_constant);

        // Repeat for the next relation.
        if constexpr (relation_idx + 1 < NUM_RELATIONS) {
            accumulate_relation_evaluations<relation_idx + 1>(
                purported_evaluations, relation_parameters, partial_evaluation_constant);
        }
    }

  public:
    /**
     * Utility methods for tuple of arrays
     */

    /**
     * @brief Set each element in a tuple of arrays to zero.
     * @details FF's default constructor may not initialize to zero (e.g., barretenberg::fr), hence we can't rely on
     * aggregate initialization of the evaluations array.
     */
    template <size_t idx = 0> static void zero_elements(auto& tuple)
    {
        auto set_to_zero = [](auto& element) { std::fill(element.begin(), element.end(), FF(0)); };
        apply_to_tuple_of_arrays(set_to_zero, tuple);
    };

    /**
     * @brief Scale elements by consecutive powers of the challenge then sum
     * @param result Batched result
     */
    static void scale_and_batch_elements(auto& tuple, const FF& challenge, FF current_scalar, FF& result)
    {
        auto scale_by_challenge_and_accumulate = [&](auto& element) {
            for (auto& entry : element) {
                result += entry * current_scalar;
                current_scalar *= challenge;
            }
        };
        apply_to_tuple_of_arrays(scale_by_challenge_and_accumulate, tuple);
    }

    /**
     * @brief General purpose method for applying a tuple of arrays (of FFs)
     *
     * @tparam Operation Any operation valid on elements of the inner arrays (FFs)
     * @param tuple Tuple of arrays (of FFs)
     */
    template <typename Operation, size_t idx = 0, typename... Ts>
    static void apply_to_tuple_of_arrays(Operation&& operation, std::tuple<Ts...>& tuple)
    {
        auto& element = std::get<idx>(tuple);

        std::invoke(std::forward<Operation>(operation), element);

        if constexpr (idx + 1 < sizeof...(Ts)) {
            apply_to_tuple_of_arrays<Operation, idx + 1>(operation, tuple);
        }
    }
};
} // namespace proof_system::honk::sumcheck
