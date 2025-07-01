// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/thread.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/polynomials/row_disabling_polynomial.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/utils.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "zk_sumcheck_data.hpp"

namespace bb {

// Whether a Flavor specifies the max number of rows per thread in a chunk for univariate computation.
// Used for the AVM.
template <typename Flavor>
concept specifiesUnivariateChunks = std::convertible_to<decltype(Flavor::MAX_CHUNK_THREAD_PORTION_SIZE), size_t>;

/*! \brief Imlementation of the Sumcheck prover round.
    \class SumcheckProverRound
    \details
The evaluations of the round univariate \f$ \tilde{S}^i \f$ over the domain \f$0,\ldots, D \f$ are obtained by the
method \ref bb::SumcheckProverRound< Flavor >::compute_univariate "compute univariate". The
implementation consists of the following sub-methods:

 - \ref bb::SumcheckProverRound::extend_edges "Extend evaluations" of linear univariate
 polynomials \f$ P_j(u_0,\ldots, u_{i-1}, X_i, \vec \ell) \f$ to the domain \f$0,\ldots, D\f$.
 - \ref bb::SumcheckProverRound::accumulate_relation_univariates "Accumulate per-relation contributions" of the extended
polynomials to \f$ T^i(X_i)\f$
 - \ref bb::SumcheckProverRound::extend_and_batch_univariates "Extend and batch the subrelation contibutions"
 multiplying by the constants \f$c_i\f$ and the evaluations of \f$ ( (1−X_i) + X_i\cdot \beta_i ) \f$.

 Note: This class uses recursive function calls with template parameters. This is a common trick that is used to force
 the compiler to unroll loops. The idea is that a function that is only called once will always be inlined, and since
 template functions always create different functions, this is guaranteed.

 */

template <typename Flavor> class SumcheckProverRound {

    using Utils = bb::RelationUtils<Flavor>;
    using Relations = typename Flavor::Relations;
    using SumcheckTupleOfTuplesOfUnivariates = typename Flavor::SumcheckTupleOfTuplesOfUnivariates;
    using RelationSeparator = typename Flavor::RelationSeparator;

  public:
    using FF = typename Flavor::FF;
    using ExtendedEdges = std::conditional_t<Flavor::USE_SHORT_MONOMIALS,
                                             typename Flavor::template ProverUnivariates<2>,
                                             typename Flavor::ExtendedEdges>;
    using ZKData = ZKSumcheckData<Flavor>;
    /**
     * @brief In Round \f$i = 0,\ldots, d-1\f$, equals \f$2^{d-i}\f$.
     */
    size_t round_size;
    /**
     * @brief Number of batched sub-relations in \f$F\f$ specified by Flavor.
     *
     */
    static constexpr size_t NUM_RELATIONS = Flavor::NUM_RELATIONS;
    /**
     * @brief The total algebraic degree of the Sumcheck relation \f$ F \f$ as a polynomial in Prover Polynomials
     * \f$P_1,\ldots, P_N\f$.
     */
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = Flavor::MAX_PARTIAL_RELATION_LENGTH;
    /**
     * @brief The total algebraic degree of the Sumcheck relation \f$ F \f$ as a polynomial in Prover Polynomials
     * \f$P_1,\ldots, P_N\f$ <b> incremented by </b> 1, i.e. it is equal \ref MAX_PARTIAL_RELATION_LENGTH
     * "MAX_PARTIAL_RELATION_LENGTH + 1".
     */
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    using SumcheckRoundUnivariate = bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>;
    SumcheckTupleOfTuplesOfUnivariates univariate_accumulators;

    // The length of the polynomials used to mask the Sumcheck Round Univariates.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = Flavor::Curve::LIBRA_UNIVARIATES_LENGTH;

    // Prover constructor
    SumcheckProverRound(size_t initial_round_size)
        : round_size(initial_round_size)
    {

        PROFILE_THIS_NAME("SumcheckProverRound constructor");

        // Initialize univariate accumulators to 0
        Utils::zero_univariates(univariate_accumulators);
    }

    /**
     * @brief  To compute the round univariate in Round \f$i\f$, the prover first computes the values of Honk
     polynomials \f$ P_1,\ldots, P_N \f$ at the points of the form \f$ (u_0,\ldots, u_{i-1}, k, \vec \ell)\f$ for \f$
     k=0,\ldots, D \f$, where \f$ D \f$ is defined as
     * \ref BATCHED_RELATION_PARTIAL_LENGTH "partial algebraic degree of the relation multiplied by pow-polynomial"
     *
     * @details In the first round, \ref extend_edges "extend edges" method receives required evaluations from the
     prover polynomials.
     * In the subsequent rounds, the method receives partially evaluated polynomials.
     *
     * In both cases, in Round \f$ i \f$, \ref extend_edges "the method" receives \f$(0, \vec \ell) \in
     \{0,1\}\times\{0,1\}^{d-1 - i} \f$, accesses the evaluations \f$ P_j\left(u_0,\ldots, u_{i-1}, 0, \vec \ell\right)
     \f$ and \f$ P_j\left(u_0,\ldots, u_{i-1}, 1, \vec \ell\right) \f$ of \f$ N \f$ linear polynomials \f$
     P_j\left(u_0,\ldots, u_{i-1}, X_{i}, \vec \ell \right) \f$ that are already available either from the prover's
     input in the first round, or from the \ref multivariates table. Using general method
     \ref bb::Univariate::extend_to "extend_to", the evaluations of these polynomials are extended from the
     domain \f$ \{0,1\} \f$ to the domain \f$ \{0,\ldots, D\} \f$ required for the computation of the round univariate.
     * In the case when witness polynomials are masked (ZK Flavors), this method has to distinguish between witness and
     * non-witness polynomials. The witness univariates obtained from witness multilinears are corrected by a masking
     * quadratic term extended to the same length MAX_PARTIAL_RELATION_LENGTH.
     * Should only be called externally with relation_idx equal to 0.
     * In practice, #multivariates is either ProverPolynomials or PartiallyEvaluatedMultivariates.
     *
     * @param edge_idx A point \f$(0, \vec \ell) \in \{0,1\}^{d-i} \f$, where \f$ i\in \{0,\ldots, d-1\}\f$ is Round
     number.
     * @param extended_edges Container for the evaluations of \f$P_j(u_0,\ldots, u_{i-1}, k, \vec \ell) \f$ for
     \f$k=0,\ldots, D\f$ and \f$j=1,\ldots,N\f$.
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    void extend_edges(ExtendedEdges& extended_edges,
                      const ProverPolynomialsOrPartiallyEvaluatedMultivariates& multivariates,
                      const size_t edge_idx)
    {
        for (auto [extended_edge, multivariate] : zip_view(extended_edges.get_all(), multivariates.get_all())) {
            bb::Univariate<FF, 2> edge({ multivariate[edge_idx], multivariate[edge_idx + 1] });
            if constexpr (Flavor::USE_SHORT_MONOMIALS) {
                extended_edge = edge;
            } else {
                if (multivariate.end_index() < edge_idx) {
                    static const auto zero_univariate = bb::Univariate<FF, MAX_PARTIAL_RELATION_LENGTH>::zero();
                    extended_edge = zero_univariate;
                } else {
                    extended_edge = edge.template extend_to<MAX_PARTIAL_RELATION_LENGTH>();
                }
            }
        }
    }

    /**
     * @brief Non-ZK version: Return the evaluations of the univariate round polynomials \f$ \tilde{S}_{i} (X_{i}) \f$
     at \f$ X_{i } = 0,\ldots, D \f$. Most likely, \f$ D \f$ is around  \f$ 12 \f$. At the
     * end, reset all
     * univariate accumulators to be zero.
     * @details First, the vector of \ref pow_challenges "pow challenges" is computed.
     * Then, multi-threading is being set up.
     * Compute the evaluations of partially evaluated Honk polynomials \f$ P_j\left(u_0,\ldots, u_{i-1}, X_{i} , \vec
     \ell \right) \f$
     * for \f$ X_{i} = 2, \ldots, D \f$ using \ref extend_edges "extend edges" method.
     * This method invokes more general \ref bb::Univariate::extend_to "extend_to" method that in this case
     reduces to a very simple expression \f{align}{ P_j\left( u_0,\ldots, u_{i-1}, k, \vec \ell \right)  = P_j\left(
     u_0,\ldots, u_{i-1}, k-1, \vec \ell \right) + P_j\left( u_0,\ldots, u_{i-1}, 1, \vec \ell \right) - P_j\left(
     u_0,\ldots, u_{i-1}, 0, \vec \ell \right) \f},
     * where \f$ k=2,\ldots, D \f$.
     * For a given \f$ \vec \ell \in \{0,1\}^{d -1 -i} \f$,
     * we invoke \ref accumulate_relation_univariates "accumulate relation univariates" to compute the contributions of
     \f$ P_1\left(u_0,\ldots, u_{i-1}, k, \vec \ell \right) \f$,
     ..., \f$ P_N\left(u_0,\ldots, u_{i-1}, k, \vec \ell \right) \f$ to every sub-relation.
     * Finally, the accumulators for individual relations' contributions are summed with appropriate factors using
     method \ref extend_and_batch_univariates "extend and batch univariates".
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    SumcheckRoundUnivariate compute_univariate(ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
                                               const bb::RelationParameters<FF>& relation_parameters,
                                               const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                               const RelationSeparator& alpha)
    {
        PROFILE_THIS_NAME("compute_univariate");

        // Determine number of threads for multithreading.
        // Note: Multithreading is "on" for every round but we reduce the number of threads from the max available based
        // on a specified minimum number of iterations per thread. This eventually leads to the use of a single thread.
        // For now we use a power of 2 number of threads simply to ensure the round size is evenly divided.
        size_t min_iterations_per_thread = 1 << 6; // min number of iterations for which we'll spin up a unique thread
        size_t num_threads = bb::calculate_num_threads_pow2(round_size, min_iterations_per_thread);

        // In the AVM, the trace is more dense at the top and therefore it is worth to split the work per thread
        // in a more distributed way over the edges. To achieve this, we split the trace into chunks and each chunk is
        // evenly divided among the threads. Below we name a portion in the chunk being processed by any given thread
        // a "chunk thread portion".
        // We have: round_size = num_of_chunks * chunk_size and chunk_size = num_threads * chunk_thread_portion_size
        // Important invariant: round_size = num_of_chunks * num_threads * chunk_thread_portion_size
        // All the involved values are power of 2. We also require chunk_thread_portion_size >= 2
        // because a "work unit" cannot be smaller than 2 as extended_edges() process 2 edges at a time.
        //
        // Example: round_size = 4096, num_threads = 16, chunk_thread_portion_size = 8
        // - chunk_size = 16 * 8 = 128
        // - num_of_chunks = 4096/128 = 32
        //
        // For each chunk with index chunk_idx, the thread with index thread_idx will process the edges
        // in range starting at index: chunk_idx * chunk_size + thread_idx * chunk_thread_portion_size
        // up to index (not included): chunk_idx * chunk_size + (thread_idx + 1) * chunk_thread_portion_size
        //
        // Pattern over edges is now:
        //
        //          chunk_0             |           chunk_1             |         chunk_2 ....
        //  thread_0 | thread_1 ...     | thread_0 | thread_1 ...       | thread_0 | thread_1 ...
        //
        // Any thread now processes edges which are distributed at different locations in the trace contrary
        // to the "standard" method where thread_0 processes all the low indices and the last thread processes
        // all the high indices.
        //
        // This "chunk mechanism" is only enabled for the AVM at the time being and is guarded
        // by a compile time routine (specifiesUnivariateChunks<Flavor>) checking whether the constant
        // MAX_CHUNK_THREAD_PORTION_SIZE is defined in the flavor.
        // This constant defines the maximum value for chunk_thread_portion_size. Whenever the round_size
        // is large enough, we set chunk_thread_portion_size = MAX_CHUNK_THREAD_PORTION_SIZE. When it is
        // not possible we use a smaller value but must be at least 2 as mentioned above. If chunk_thread_portion_size
        // is not at least 2, we fallback to using a single chunk.
        // Note that chunk_size and num_of_chunks are not constant but are derived by round_size, num_threads and
        // the chunk_thread_portion_size which needs to satisfy:
        // 1) 2 <= chunk_thread_portion_size <= MAX_CHUNK_THREAD_PORTION_SIZE
        // 2) chunk_thread_portion_size * num_threads <= round_size
        // For the non-AVM flavors, we use a single chunk.

        // Non AVM flavors
        size_t num_of_chunks = 1;
        size_t chunk_thread_portion_size = round_size / num_threads;

        // AVM flavor (guarded by defined constant MAX_CHUNK_THREAD_PORTION_SIZE in flavor)
        if constexpr (specifiesUnivariateChunks<Flavor>) {
            // This constant is assumed to be a power of 2 greater or equal to 2.
            static_assert(Flavor::MAX_CHUNK_THREAD_PORTION_SIZE >= 2);
            static_assert((Flavor::MAX_CHUNK_THREAD_PORTION_SIZE & (Flavor::MAX_CHUNK_THREAD_PORTION_SIZE - 1)) == 0);

            // When the number of edges is so small that the chunk portion size per thread is lower than 2,
            // we fall back to a single chunk, i.e., we keep the "non-AVM" values.
            if (round_size / num_threads >= 2) {
                chunk_thread_portion_size = std::min(round_size / num_threads, Flavor::MAX_CHUNK_THREAD_PORTION_SIZE);
                num_of_chunks = round_size / (chunk_thread_portion_size * num_threads);
                // We show that chunk_thread_portion_size satisfies 1) and 2) defined above.
                // From "std::min()": chunk_thread_portion_size <= round_size/num_threads implying 2)
                // From static_assert above, and "if condition", we know that both values in "std::min()"
                // are >= 2 and therefore: chunk_thread_portion_size >= 2
                // Finally, "std::min()" guarantees that: chunk_thread_portion_size <= MAX_CHUNK_THREAD_PORTION_SIZE
                // which completes 1).
            }
        }

        size_t chunk_size = round_size / num_of_chunks;
        // Construct univariate accumulator containers; one per thread
        std::vector<SumcheckTupleOfTuplesOfUnivariates> thread_univariate_accumulators(num_threads);

        // Accumulate the contribution from each sub-relation accross each edge of the hyper-cube
        parallel_for(num_threads, [&](size_t thread_idx) {
            // Initialize the thread accumulator to 0
            Utils::zero_univariates(thread_univariate_accumulators[thread_idx]);
            // Construct extended univariates containers; one per thread
            ExtendedEdges extended_edges;
            for (size_t chunk_idx = 0; chunk_idx < num_of_chunks; chunk_idx++) {
                size_t start = chunk_idx * chunk_size + thread_idx * chunk_thread_portion_size;
                size_t end = chunk_idx * chunk_size + (thread_idx + 1) * chunk_thread_portion_size;
                for (size_t edge_idx = start; edge_idx < end; edge_idx += 2) {
                    extend_edges(extended_edges, polynomials, edge_idx);
                    // Compute the \f$ \ell \f$-th edge's univariate contribution,
                    // scale it by the corresponding \f$ pow_{\beta} \f$ contribution and add it to the accumulators for
                    // \f$ \tilde{S}^i(X_i) \f$. If \f$ \ell \f$'s binary representation is given by \f$
                    // (\ell_{i+1},\ldots, \ell_{d-1})\f$, the \f$ pow_{\beta}\f$-contribution is
                    // \f$\beta_{i+1}^{\ell_{i+1}} \cdot \ldots \cdot \beta_{d-1}^{\ell_{d-1}}\f$.
                    accumulate_relation_univariates(thread_univariate_accumulators[thread_idx],
                                                    extended_edges,
                                                    relation_parameters,
                                                    gate_separators[(edge_idx >> 1) * gate_separators.periodicity]);
                }
            }
        });

        // Accumulate the per-thread univariate accumulators into a single set of accumulators
        for (auto& accumulators : thread_univariate_accumulators) {
            Utils::add_nested_tuples(univariate_accumulators, accumulators);
        }

        // Batch the univariate contributions from each sub-relation to obtain the round univariate
        return batch_over_relations<SumcheckRoundUnivariate>(univariate_accumulators, alpha, gate_separators);
    }

    /**
     * @brief In the de-facto mode of of operation for ZK, we add a randomising contribution via the Libra technique to
     * hide the actual round univariate and also ensure the total contribution is amended to take into account
     * that relation execution is disabled on the last rows of the trace.
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    SumcheckRoundUnivariate compute_hiding_univariate(ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
                                                      const bb::RelationParameters<FF>& relation_parameters,
                                                      const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                                      const RelationSeparator& alpha,
                                                      const ZKData& zk_sumcheck_data,
                                                      const RowDisablingPolynomial<FF> row_disabling_polynomial,
                                                      const size_t round_idx)
        requires Flavor::HasZK

    {
        auto hiding_univariate = compute_libra_univariate(zk_sumcheck_data, round_idx);
        if constexpr (UseRowDisablingPolynomial<Flavor>) {

            hiding_univariate -= compute_disabled_contribution(
                polynomials, relation_parameters, gate_separators, alpha, round_idx, row_disabling_polynomial);
        }
        return hiding_univariate;
    }

    /*!
     * @brief For ZK Flavors: A method disabling the last 4 rows of the ProverPolynomials
     *
     * @details See description of RowDisablingPolynomial
     *
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    SumcheckRoundUnivariate compute_disabled_contribution(
        ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
        const bb::RelationParameters<FF>& relation_parameters,
        const bb::GateSeparatorPolynomial<FF>& gate_separators,
        const RelationSeparator& alpha,
        const size_t round_idx,
        const RowDisablingPolynomial<FF> row_disabling_polynomial)
        requires UseRowDisablingPolynomial<Flavor>
    {
        SumcheckTupleOfTuplesOfUnivariates univariate_accumulator;
        ExtendedEdges extended_edges;
        SumcheckRoundUnivariate result;

        // In Round 0, we have to compute the contribution from 2 edges: n - 1 = (1,1,...,1) and n-4 = (0,1,...,1).
        size_t start_edge_idx = (round_idx == 0) ? round_size - 4 : round_size - 2;

        for (size_t edge_idx = start_edge_idx; edge_idx < round_size; edge_idx += 2) {
            extend_edges(extended_edges, polynomials, edge_idx);
            accumulate_relation_univariates(univariate_accumulator,
                                            extended_edges,
                                            relation_parameters,
                                            gate_separators[(edge_idx >> 1) * gate_separators.periodicity]);
        }
        result = batch_over_relations<SumcheckRoundUnivariate>(univariate_accumulator, alpha, gate_separators);
        bb::Univariate<FF, 2> row_disabling_factor =
            bb::Univariate<FF, 2>({ row_disabling_polynomial.eval_at_0, row_disabling_polynomial.eval_at_1 });
        SumcheckRoundUnivariate row_disabling_factor_extended =
            row_disabling_factor.template extend_to<SumcheckRoundUnivariate::LENGTH>();
        result *= row_disabling_factor_extended;

        return result;
    }

    /**
     * @brief Given a tuple of tuples of extended per-relation contributions,  \f$ (t_0, t_1, \ldots,
     * t_{\text{NUM_SUBRELATIONS}-1}) \f$ and a challenge \f$ \alpha \f$, scale them by the relation separator
     * \f$\alpha\f$, extend to the correct degree, and take the sum multiplying by \f$pow_{\beta}\f$-contributions.
     *
     * @details This method receives as input the univariate accumulators computed by \ref
     * accumulate_relation_univariates "accumulate relation univariates" after passing through the entire hypercube and
     * applying \ref bb::RelationUtils::add_nested_tuples "add_nested_tuples" method to join the threads. The
     * accumulators are scaled using the method \ref bb::RelationUtils< Flavor >::scale_univariates "scale univariates",
     * extended to the degree \f$ D \f$ and summed with appropriate  \f$pow_{\beta}\f$-factors using \ref
     * extend_and_batch_univariates "extend and batch univariates method" to return a vector \f$(\tilde{S}^i(0), \ldots,
     * \tilde{S}^i(D))\f$.
     *
     * @param challenge Challenge \f$\alpha\f$.
     * @param gate_separators Round \f$pow_{\beta}\f$-factor given by  \f$ ( (1−u_i) + u_i\cdot \beta_i )\f$.
     */
    template <typename ExtendedUnivariate, typename ContainerOverSubrelations>
    static ExtendedUnivariate batch_over_relations(ContainerOverSubrelations& univariate_accumulators,
                                                   const RelationSeparator& challenge,
                                                   const bb::GateSeparatorPolynomial<FF>& gate_separators)
    {
        auto running_challenge = FF(1);
        Utils::scale_univariates(univariate_accumulators, challenge, running_challenge);

        auto result = ExtendedUnivariate(0);
        extend_and_batch_univariates(univariate_accumulators, result, gate_separators);

        // Reset all univariate accumulators to 0 before beginning accumulation in the next round
        Utils::zero_univariates(univariate_accumulators);
        return result;
    }

    /**
     * @brief Extend Univariates then sum them multiplying by the current \f$ pow_{\beta} \f$-contributions.
     * @details Since the sub-relations comprising full Honk relation are of different degrees, the computation of the
     * evaluations of round univariate \f$ \tilde{S}_{i}(X_{i}) \f$ at points \f$ X_{i} = 0,\ldots, D \f$ requires to
     * extend evaluations of individual relations to the domain \f$ 0,\ldots, D\f$. Moreover, linearly independent
     * sub-relations, i.e. whose validity is being checked at every point of the hypercube, are multiplied by the
     * constant \f$ c_i = pow_\beta(u_0,\ldots, u_{i-1}) \f$ and the current \f$pow_{\beta}\f$-factor \f$ ( (1−X_i) +
     * X_i\cdot \beta_i ) \vert_{X_i = k} \f$ for \f$ k = 0,\ldots, D\f$.
     * @tparam extended_size Size after extension
     * @param tuple A tuple of tuples of Univariates
     * @param result Round univariate \f$ \tilde{S}^i\f$ represented by its evaluations over \f$ \{0,\ldots, D\} \f$.
     * @param gate_separators Round \f$pow_{\beta}\f$-factor  \f$ ( (1−X_i) + X_i\cdot \beta_i )\f$.
     */
    template <typename ExtendedUnivariate, typename TupleOfTuplesOfUnivariates>
    static void extend_and_batch_univariates(const TupleOfTuplesOfUnivariates& tuple,
                                             ExtendedUnivariate& result,
                                             const bb::GateSeparatorPolynomial<FF>& gate_separators)
    {
        ExtendedUnivariate extended_random_polynomial;
        // Pow-Factor  \f$ (1-X) + X\beta_i \f$
        auto random_polynomial = bb::Univariate<FF, 2>({ 1, gate_separators.current_element() });
        extended_random_polynomial = random_polynomial.template extend_to<ExtendedUnivariate::LENGTH>();

        auto extend_and_sum = [&]<size_t relation_idx, size_t subrelation_idx, typename Element>(Element& element) {
            auto extended = element.template extend_to<ExtendedUnivariate::LENGTH>();

            using Relation = typename std::tuple_element_t<relation_idx, Relations>;
            const bool is_subrelation_linearly_independent =
                bb::subrelation_is_linearly_independent<Relation, subrelation_idx>();
            // Except from the log derivative subrelation, each other subrelation in part is required to be 0 hence we
            // multiply by the power polynomial. As the sumcheck prover is required to send a univariate to the
            // verifier, we additionally need a univariate contribution from the pow polynomial which is the
            // extended_random_polynomial which is the
            if (!is_subrelation_linearly_independent) {
                result += extended;
            } else {
                // Multiply by the pow polynomial univariate contribution and the partial
                // evaluation result c_i (i.e. \f$ pow(u_0,...,u_{l-1})) \f$ where \f$(u_0,...,u_{i-1})\f$ are the
                // verifier challenges from previous rounds.
                result += extended * extended_random_polynomial * gate_separators.partial_evaluation_result;
            }
        };
        Utils::apply_to_tuple_of_tuples(tuple, extend_and_sum);
    }

    /**
     * @brief Compute Libra round univariate expressed given by the formula
    \f{align}{
        \texttt{libra_round_univariate}_i(k) =
        \rho \cdot 2^{d-1-i} \left(\sum_{j = 0}^{i-1} g_j(u_{j}) + g_{i,k}+
        \sum_{j=i+1}^{d-1}\left(g_{j,0}+g_{j,1}\right)\right)
        =  \texttt{libra_univariates}_{i}(k) + \texttt{libra_running_sum}
    \f}.
     *
     * @param zk_sumcheck_data
     * @param round_idx
     */
    static SumcheckRoundUnivariate compute_libra_univariate(const ZKData& zk_sumcheck_data, size_t round_idx)
    {
        bb::Univariate<FF, LIBRA_UNIVARIATES_LENGTH> libra_round_univariate;
        // select the i'th column of Libra book-keeping table
        const auto& current_column = zk_sumcheck_data.libra_univariates[round_idx];
        // the evaluation of Libra round univariate at k=0...D are equal to \f$\texttt{libra_univariates}_{i}(k)\f$
        // corrected by the Libra running sum
        for (size_t idx = 0; idx < LIBRA_UNIVARIATES_LENGTH; ++idx) {
            libra_round_univariate.value_at(idx) =
                current_column.evaluate(FF(idx)) + zk_sumcheck_data.libra_running_sum;
        };
        if constexpr (BATCHED_RELATION_PARTIAL_LENGTH == LIBRA_UNIVARIATES_LENGTH) {
            return libra_round_univariate;
        } else {
            return libra_round_univariate.template extend_to<SumcheckRoundUnivariate::LENGTH>();
        }
    }

  private:
    /**
     * @brief In Round \f$ i \f$, for a given point \f$ \vec \ell \in \{0,1\}^{d-1 - i}\f$, calculate the contribution
     * of each sub-relation to \f$ T^i(X_i) \f$.
     *
     * @details In Round \f$ i \f$, this method computes the univariate \f$ T^i(X_i) \f$ deined in \ref
     *SumcheckProverContributionsofPow "this section". It is done  as follows:
     *   - Outer loop: iterate through the "edge" points \f$ (0,\vec \ell) \f$ on the boolean hypercube \f$\{0,1\}\times
     * \{0,1\}^{d-1 - i}\f$, i.e. skipping every other point. On each iteration, apply \ref extend_edges "extend edges".
     *   - Inner loop: iterate through the sub-relations, feeding each relation the "the group of edges", i.e. the
     * evaluations \f$ P_1(u_0,\ldots, u_{i-1}, k, \vec \ell), \ldots, P_N(u_0,\ldots, u_{i-1}, k, \vec \ell) \f$. Each
     *                 relation Flavor is endowed with \p accumulate method that computes its contribution to \f$
     * T^i(X_{i}) \f$
     *\ref extend_and_batch_univariates "Adding  these univariates together", with appropriate scaling factors, produces
     *required evaluations of \f$ \tilde S^i \f$.
     * @param univariate_accumulators The container for per-thread-per-relation univariate contributions output by \ref
     *accumulate_relation_univariates "accumulate relation univariates" for the previous "groups of edges".
     * @param extended_edges Contains tuples of evaluations of \f$ P_j\left(u_0,\ldots, u_{i-1}, k, \vec \ell \right)
     *\f$, for \f$ j=1,\ldots, N \f$,  \f$ k \in \{0,\ldots, D\} \f$ and fixed \f$\vec \ell \in \{0,1\}^{d-1 - i} \f$.
     * @param scaling_factor In Round \f$ i \f$, for \f$ (\ell_{i+1}, \ldots, \ell_{d-1}) \in \{0,1\}^{d-1-i}\f$ takes
     *an element of \ref  bb::GateSeparatorPolynomial< FF >::beta_products "vector of powers of challenges" at index \f$
     *2^{i+1}
     *(\ell_{i+1} 2^{i+1} +\ldots + \ell_{d-1} 2^{d-1})\f$.
     * @result #univariate_accumulators are updated with the contribution from the current group of edges.  For each
     * relation, a univariate of some degree is computed by accumulating the contributions of each group of edges.
     */
    template <size_t relation_idx = 0>
    void accumulate_relation_univariates(SumcheckTupleOfTuplesOfUnivariates& univariate_accumulators,
                                         const auto& extended_edges,
                                         const bb::RelationParameters<FF>& relation_parameters,
                                         const FF& scaling_factor)
    {
        using Relation = std::tuple_element_t<relation_idx, Relations>;
        // Check if the relation is skippable to speed up accumulation
        if constexpr (!isSkippable<Relation, decltype(extended_edges)>) {
            // If not, accumulate normally
            Relation::accumulate(
                std::get<relation_idx>(univariate_accumulators), extended_edges, relation_parameters, scaling_factor);
        } else {
            // If so, only compute the contribution if the relation is active
            if (!Relation::skip(extended_edges)) {
                Relation::accumulate(std::get<relation_idx>(univariate_accumulators),
                                     extended_edges,
                                     relation_parameters,
                                     scaling_factor);
            }
        }
        // Repeat for the next relation.
        if constexpr (relation_idx + 1 < NUM_RELATIONS) {
            accumulate_relation_univariates<relation_idx + 1>(
                univariate_accumulators, extended_edges, relation_parameters, scaling_factor);
        }
    }
};

/*!\brief Implementation of the Sumcheck Verifier Round
 \class SumcheckVerifierRound
 \details  This Flavor contains the methods
 * - \ref bb::SumcheckVerifierRound< Flavor >::check_sum "Check target sum": \f$\quad \sigma_{
 i } \stackrel{?}{=}  \tilde{S}^i(0) + \tilde{S}^i(1)  \f$
 * - \ref bb::SumcheckVerifierRound< Flavor >::compute_next_target_sum "Compute next target
 sum" :\f$ \quad \sigma_{i+1} \gets \tilde{S}^i(u_i) \f$ required in Round \f$ i = 0,\ldots, d-1 \f$.
 *
 * The last step of the verifification requires to compute the value \f$ pow(u_0,\ldots, u_{d-1}) \cdot F
 \left(P_1(u_0,\ldots, u_{d-1}), \ldots, P_N(u_0,\ldots, u_{d-1}) \right) \f$ implemented as
 * - \ref compute_full_relation_purported_value method needed at the last verification step.
 */
template <typename Flavor> class SumcheckVerifierRound {
    using Utils = bb::RelationUtils<Flavor>;
    using Relations = typename Flavor::Relations;
    using TupleOfArraysOfValues = typename Flavor::TupleOfArraysOfValues;
    using RelationSeparator = typename Flavor::RelationSeparator;

  public:
    using FF = typename Flavor::FF;
    using ClaimedEvaluations = typename Flavor::AllValues;
    using ClaimedLibraEvaluations = typename std::vector<FF>;

    bool round_failed = false;
    /**
     * @brief Number of batched sub-relations in \f$F\f$ specified by Flavor.
     *
     */
    static constexpr size_t NUM_RELATIONS = Flavor::NUM_RELATIONS;
    /**
     * @brief The partial algebraic degree of the relation  \f$\tilde F = pow \cdot F \f$, i.e. \ref
     * MAX_PARTIAL_RELATION_LENGTH "MAX_PARTIAL_RELATION_LENGTH + 1".
     */
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    using SumcheckRoundUnivariate = bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>;

    FF target_total_sum = 0;

    TupleOfArraysOfValues relation_evaluations;
    // Verifier constructor
    explicit SumcheckVerifierRound(FF target_total_sum = 0)
        : target_total_sum(target_total_sum)
    {
        Utils::zero_elements(relation_evaluations);
    };

    /**
     * @brief Check that the round target sum is correct
     * @details The verifier receives the claimed evaluations of the round univariate \f$ \tilde{S}^i \f$ at \f$X_i =
     * 0,\ldots, D \f$ and checks \f$\sigma_i = \tilde{S}^{i-1}(u_{i-1}) \stackrel{?}{=} \tilde{S}^i(0) + \tilde{S}^i(1)
     * \f$
     * @param univariate Round univariate \f$\tilde{S}^{i}\f$ represented by its evaluations over \f$0,\ldots,D\f$.
     *
     */
    bool check_sum(bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>& univariate, const FF& indicator)
    {
        FF total_sum =
            (FF(1) - indicator) * target_total_sum + indicator * (univariate.value_at(0) + univariate.value_at(1));
        bool sumcheck_round_failed(false);
        if constexpr (IsRecursiveFlavor<Flavor>) {
            // This bool is only needed for debugging
            if (indicator.get_value() == FF{ 1 }.get_value()) {
                sumcheck_round_failed = (target_total_sum.get_value() != total_sum.get_value());
            }

            target_total_sum.assert_equal(total_sum);
        } else {
            sumcheck_round_failed = (target_total_sum != total_sum);
        }

        round_failed = round_failed || sumcheck_round_failed;
        return !sumcheck_round_failed;
    };

    /**
     * @brief After checking that the univariate is good for this round, compute the next target sum given by the
     * evaluation \f$ \tilde{S}^i(u_i) \f$.
     *
     * @param univariate \f$ \tilde{S}^i(X) \f$, given by its evaluations over \f$ \{0,1,2,\ldots, D\}\f$.
     * @param round_challenge \f$ u_i\f$
     *
     */
    void compute_next_target_sum(bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>& univariate,
                                 FF& round_challenge,
                                 const FF& indicator)
    {
        // Evaluate \f$\tilde{S}^{i}(u_{i}) \f$
        target_total_sum = (FF(1) - indicator) * target_total_sum + indicator * univariate.evaluate(round_challenge);
    }

    /**
     * @brief Given the evaluations  \f$P_1(u_0,\ldots, u_{d-1}), \ldots, P_N(u_0,\ldots, u_{d-1}) \f$ of the
     * ProverPolynomials at the challenge point \f$(u_0,\ldots, u_{d-1})\f$ stored in \p purported_evaluations, this
     * method computes the evaluation of \f$ \tilde{F} \f$ taking these values as arguments.
     *
     */
    FF compute_full_relation_purported_value(const ClaimedEvaluations& purported_evaluations,
                                             const bb::RelationParameters<FF>& relation_parameters,
                                             const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                             const RelationSeparator alpha)
    {
        // The verifier should never skip computation of contributions from any relation
        Utils::template accumulate_relation_evaluations_without_skipping<>(purported_evaluations,
                                                                           relation_evaluations,
                                                                           relation_parameters,
                                                                           gate_separators.partial_evaluation_result);

        FF running_challenge{ 1 };
        FF output{ 0 };
        Utils::scale_and_batch_elements(relation_evaluations, alpha, running_challenge, output);
        return output;
    }
    /**
     * @brief Temporary method to pad Protogalaxy gate challenges and the gate challenges in
     * TestBasicSingleAvmRecursionConstraint to CONST_PROOF_SIZE_LOG_N. Will be deprecated by more flexible padded size
     * handling in Sumcheck and Flavor Provers/Verifiers.
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/1310): Recursive Protogalaxy issues
     *
     * @param gate_challenges
     */
    void pad_gate_challenges(std::vector<FF>& gate_challenges)
    {

        if (gate_challenges.size() < CONST_PROOF_SIZE_LOG_N) {
            FF zero{ 0 };
            if constexpr (IsRecursiveFlavor<Flavor>) {
                zero.convert_constant_to_fixed_witness(gate_challenges[0].get_context());
            }
            for (size_t idx = gate_challenges.size(); idx < CONST_PROOF_SIZE_LOG_N; idx++) {
                gate_challenges.emplace_back(zero);
            }
        }
    }
};
} // namespace bb
