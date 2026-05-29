// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/polynomials/row_disabling_polynomial.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/relations/utils.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "zk_sumcheck_data.hpp"

#include <algorithm>

namespace bb {

// To know if a flavor is AVM, without including the flavor.
template <typename Flavor>
concept isAvmFlavor = std::convertible_to<decltype(Flavor::IS_AVM), bool>;

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

  public:
    using FF = typename Flavor::FF;
    using Relations = typename Flavor::Relations;
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using SubrelationSeparators = std::array<FF, Flavor::NUM_SUBRELATIONS - 1>;
    using ExtendedEdges = std::conditional_t<Flavor::USE_SHORT_MONOMIALS,
                                             typename Flavor::template ProverUnivariates<2>,
                                             typename Flavor::ExtendedEdges>;
    using ZKData = ZKSumcheckData<Flavor>;
    /**
     * @brief In Round \f$i = 0,\ldots, d-1\f$, equals \f$2^{d-i}\f$.
     */
    size_t round_size;

    // Number of rows excluded from the main sumcheck loop and handled by compute_disabled_contribution.
    // In round 0, the RowDisablingPolynomial disables TRACE_OFFSET rows (2 edge pairs for TRACE_OFFSET=4)
    // at the TOP of the trace. After partial evaluation in round 1+, this collapses to 2 rows (1 edge pair).
    // Only non-zero for ZK flavors: non-ZK disabled rows are all zeros and handled by the main loop.
    size_t excluded_head_size = Flavor::HasZK ? Flavor::TRACE_OFFSET : 0;

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
    // Note: since this is not initialized with {}, the univariates contain garbage.
    SumcheckTupleOfTuplesOfUnivariates univariate_accumulators;

    // The length of the polynomials used to mask the Sumcheck Round Univariates.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = Flavor::Curve::LIBRA_UNIVARIATES_LENGTH;

    // Prover constructor
    SumcheckProverRound(size_t initial_round_size)
        : round_size(initial_round_size)
    {
        BB_BENCH_NAME("SumcheckProverRound constructor");

        // Initialize univariate accumulators to 0
        Utils::zero_univariates(univariate_accumulators);
    }

    /**
     * @brief Compute the effective round size by finding the maximum end_index() across witness polynomials.
     * @details Witness polynomials only contain meaningful data up to their end_index(), and we can avoid
     * iterating over the zero region beyond that point. The disabled head rows are handled separately by
     * compute_disabled_contribution, so we don't include them here.
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    size_t compute_effective_round_size(const ProverPolynomialsOrPartiallyEvaluatedMultivariates& multivariates) const
    {
        size_t max_end_index = 0;
        if constexpr (requires { multivariates.get_witness(); }) {
            for (auto& witness_poly : multivariates.get_witness()) {
                max_end_index = std::max(max_end_index, witness_poly.end_index());
            }
        } else {
            return round_size;
        }

        size_t effective = max_end_index + (max_end_index % 2); // round up to next even
        if constexpr (Flavor::HasZK) {
            if constexpr (!UseRowDisablingPolynomial<Flavor>) {
                // ZK flavors without row disabling (e.g. Translator) must iterate over the full round_size.
                return round_size;
            }
        }
        return std::min(round_size, effective);
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
            if constexpr (Flavor::USE_SHORT_MONOMIALS) {
                extended_edge = bb::Univariate<FF, 2>({ multivariate[edge_idx], multivariate[edge_idx + 1] });
            } else {
                if (multivariate.end_index() < edge_idx) {
                    static const auto zero_univariate = bb::Univariate<FF, MAX_PARTIAL_RELATION_LENGTH>::zero();
                    extended_edge = zero_univariate;
                } else {
                    extended_edge = bb::Univariate<FF, 2>({ multivariate[edge_idx], multivariate[edge_idx + 1] })
                                        .template extend_to<MAX_PARTIAL_RELATION_LENGTH>();
                }
            }
        }
    }

    /**
     * @brief Return the evaluations of the univariate round polynomials. Toggles between chunked computation
     * (designed with the AVM in mind) and a version which intelligently allows from row-skipped functionality
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    SumcheckRoundUnivariate compute_univariate(ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
                                               const bb::RelationParameters<FF>& relation_parameters,
                                               const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                               const SubrelationSeparators& alphas)
    {
        if constexpr (isAvmFlavor<Flavor>) {
            return compute_univariate_avm(polynomials, relation_parameters, gate_separators, alphas);
        } else {
            return compute_univariate_with_row_skipping(polynomials, relation_parameters, gate_separators, alphas);
        }
    }

    /**
     * @brief Shared chunk scheduler for dynamic work-stealing in the sumcheck prover's main loop.
     * @details Splits the edge range [start_edge_idx, end_edge_idx) into fixed-size chunks and hands them out via an
     * atomic counter. Workers call `pop()` in a loop; each call returns the next chunk to process (or nullopt when the
     * range is exhausted). Spawns at most as many threads as there are chunks. Designed to balance thread-work by
     * accounting for the non-uniform cost of relation algebra execution across different rows of the trace.
     */
    struct ChunkStealer {
        const size_t start_edge_idx;
        const size_t end_edge_idx;
        const size_t rows_per_chunk;
        const size_t total_chunks;
        std::atomic<size_t> next_chunk{ 0 };

        ChunkStealer(size_t start, size_t end, size_t rpc)
            : start_edge_idx(start)
            , end_edge_idx(end)
            , rows_per_chunk(rpc)
            , total_chunks(((end - start) / rpc) + ((end - start) % rpc > 0 ? 1 : 0))
        {
            BB_ASSERT(start % 2 == 0, "start_edge_idx must be even");
            BB_ASSERT(end % 2 == 0, "end_edge_idx must be even");
            BB_ASSERT(rpc >= 2 && rpc % 2 == 0, "rows_per_chunk must be at least 2 and even");
            BB_ASSERT(start <= end, "start_edge_idx must not exceed end_edge_idx");
        }

        size_t num_slots() const { return std::min(bb::get_num_cpus(), std::max<size_t>(total_chunks, 1)); }

        std::optional<std::pair<size_t, size_t>> pop()
        {
            const size_t id = next_chunk.fetch_add(1, std::memory_order_relaxed);
            if (id >= total_chunks) {
                return std::nullopt;
            }
            const size_t chunk_start = start_edge_idx + id * rows_per_chunk;
            const size_t chunk_end = std::min(chunk_start + rows_per_chunk, end_edge_idx);
            return std::make_pair(chunk_start, chunk_end);
        }
    };

    /**
     * @brief A version of `compute_univariate` that is better optimized for the AVM.
     * @details Main changes are:
     * - Use a different threading strategy ("chunking").
     * - Use lazy extension of edges.
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    SumcheckRoundUnivariate compute_univariate_avm(ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
                                                   const bb::RelationParameters<FF>& relation_parameters,
                                                   const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                                   const SubrelationSeparators& alphas)
    {
        BB_BENCH_NAME("compute_univariate_avm");

        // Compute the effective round size. If the trace is short, we don't need to iterate over the full round_size.
        const size_t effective_round_size = compute_effective_round_size(polynomials);

        // Prepare for work-stealing across chunks of edges
        constexpr size_t rows_per_chunk = 16; // empirically chosen for good load balance in AVM
        ChunkStealer chunks{ excluded_head_size, effective_round_size, rows_per_chunk };

        // One accumulator slot per outer task; each outer task's iteration index IS its slot.
        // No state is shared with other SumcheckProverRound invocations.
        std::vector<SumcheckTupleOfTuplesOfUnivariates> thread_univariate_accumulators(chunks.num_slots());

        // Accumulate the contribution from each sub-relation across each edge of the hyper-cube.
        parallel_for(chunks.num_slots(), [&](size_t slot_id) {
            ExtendedEdges lazy_extended_edges(polynomials);
            auto& accum = thread_univariate_accumulators[slot_id];
            while (auto range = chunks.pop()) {
                const auto [start, end] = *range;
                for (size_t edge_idx = start; edge_idx < end; edge_idx += 2) {
                    lazy_extended_edges.set_current_edge(edge_idx);
                    // Compute the \f$ \ell \f$-th edge's univariate contribution,
                    // scale it by the corresponding \f$ pow_{\beta} \f$ contribution and add it to the accumulators
                    // for \f$ \tilde{S}^i(X_i) \f$. If \f$ \ell \f$'s binary representation is given by \f$
                    // (\ell_{i+1},\ldots, \ell_{d-1})\f$, the \f$ pow_{\beta}\f$-contribution is
                    // \f$\beta_{i+1}^{\ell_{i+1}} \cdot \ldots \cdot \beta_{d-1}^{\ell_{d-1}}\f$.
                    accumulate_relation_univariates(
                        accum, lazy_extended_edges, relation_parameters, gate_separators[edge_idx]);
                }
            }
        });

        // Accumulate the per-thread univariate accumulators into a single set of accumulators
        for (auto& accumulators : thread_univariate_accumulators) {
            Utils::add_nested_tuples(univariate_accumulators, accumulators);
        }

        // Batch the univariate contributions from each sub-relation to obtain the round univariate
        return batch_over_relations<SumcheckRoundUnivariate>(univariate_accumulators, alphas, gate_separators);
    }

    /**
     * @brief Helper struct that describes a block of non-zero unskippable rows
     */
    struct BlockOfContiguousRows {
        size_t starting_edge_idx;
        size_t size;
    };

    // ECCVM exposes a static row-skip manifest: a contiguous active-trace prefix that the prover can use directly
    // instead of scanning every row. Translator deliberately does not (its trace over-covered when expressed as a
    // static manifest); it falls back to the dynamic skip_entire_row scan below.
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    static constexpr bool HAS_STATIC_ROW_SKIP_MANIFEST =
        IsAnyOf<Flavor, ECCVMFlavor, ECCVMShortMonomialFlavor, ECCVMRecursiveFlavor> &&
        requires(const ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials) {
            Flavor::row_skip_active_prefix_end(polynomials);
        };

    static size_t round_up_to_even(const size_t value) { return value + (value & 1U); }

    static void append_scan_range(std::vector<BlockOfContiguousRows>& ranges, const size_t start, const size_t end)
    {
        if (end <= start) {
            return;
        }
        if (!ranges.empty()) {
            auto& previous = ranges.back();
            const size_t previous_end = previous.starting_edge_idx + previous.size;
            if (start <= previous_end) {
                previous.size = std::max(previous_end, end) - previous.starting_edge_idx;
                return;
            }
        }
        ranges.push_back(BlockOfContiguousRows{ .starting_edge_idx = start, .size = end - start });
    }

    static void merge_contiguous_blocks(std::vector<BlockOfContiguousRows>& blocks)
    {
        if (blocks.empty()) {
            return;
        }
        std::sort(blocks.begin(), blocks.end(), [](const BlockOfContiguousRows& lhs, const BlockOfContiguousRows& rhs) {
            return lhs.starting_edge_idx < rhs.starting_edge_idx;
        });

        size_t write_idx = 0;
        for (size_t read_idx = 1; read_idx < blocks.size(); ++read_idx) {
            auto& previous = blocks[write_idx];
            const auto& current = blocks[read_idx];
            const size_t previous_end = previous.starting_edge_idx + previous.size;
            if (current.starting_edge_idx <= previous_end) {
                previous.size =
                    std::max(previous_end, current.starting_edge_idx + current.size) - previous.starting_edge_idx;
            } else {
                ++write_idx;
                blocks[write_idx] = current;
            }
        }
        blocks.resize(write_idx + 1);
    }

    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    std::vector<BlockOfContiguousRows> compute_row_skip_scan_ranges(
        ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials, const size_t effective_round_size) const
    {
        const size_t scan_start = excluded_head_size;
        std::vector<BlockOfContiguousRows> ranges;
        if (effective_round_size <= scan_start) {
            return ranges;
        }

        if constexpr (HAS_STATIC_ROW_SKIP_MANIFEST<ProverPolynomialsOrPartiallyEvaluatedMultivariates>) {
            const size_t row_skip_active_prefix_end = Flavor::row_skip_active_prefix_end(polynomials);
            if (row_skip_active_prefix_end == 0) {
                append_scan_range(ranges, scan_start, effective_round_size);
                return ranges;
            }

            const size_t active_prefix_end =
                std::min(round_up_to_even(row_skip_active_prefix_end), effective_round_size);
            append_scan_range(ranges, scan_start, std::max(scan_start, active_prefix_end));

            // Lagrange-last lives at the end of the domain. Everything between the active prefix and this final
            // edge-pair is known to be relation-trivial, so do not spend scan work proving it row-by-row.
            if (effective_round_size >= scan_start + 2) {
                append_scan_range(ranges, effective_round_size - 2, effective_round_size);
            }
        } else {
            append_scan_range(ranges, scan_start, effective_round_size);
        }
        return ranges;
    }

    /**
     * @brief Compute the number of unskippable rows we must iterate over
     * @details Some circuits have a circuit size much larger than the number of used rows (ECCVM, Translator).
     *          Static row-manifest flavors provide the unskippable ranges directly; row-skippable flavors expose a
     *          `skip_entire_row` predicate and this method scans the trace to compute contiguous unskippable blocks.
     * @note We assume that the number of blocks returned by this fn is small. i.e. the circuit does not have a large
     * number of interleaved empty rows. If the circuit *does* have a lot of interleaved empty/non-empty rows, this
     * function will be quite slow as the returned vector will be large.
     *
     * @tparam ProverPolynomialsOrPartiallyEvaluatedMultivariates
     * @param polynomials
     * @return std::vector<BlockOfContiguousRows>
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    std::vector<BlockOfContiguousRows> compute_contiguous_round_size(
        ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials)
    {
        // When !HasZK, compute the effective round size to avoid iterating over zero regions
        const size_t effective_round_size = compute_effective_round_size(polynomials);

        // The disabled head rows are handled by compute_disabled_contribution, so skip them here
        const size_t start_edge_idx = excluded_head_size;

        std::vector<BlockOfContiguousRows> result;
        constexpr bool has_static_row_skip_manifest =
            HAS_STATIC_ROW_SKIP_MANIFEST<ProverPolynomialsOrPartiallyEvaluatedMultivariates>;
        constexpr bool can_skip_rows = (isRowSkippable<Flavor, decltype(polynomials), size_t>);

        if constexpr (has_static_row_skip_manifest) {
            // Static row manifests describe the relation-active edge pairs directly, avoiding the old per-row skip
            // scan over the whole trace.
            result = compute_row_skip_scan_ranges(polynomials, effective_round_size);
        } else if constexpr (can_skip_rows) {
            // Iterate over edge-pairs (stride-2) so each thread gets an even-aligned range.
            const std::vector<BlockOfContiguousRows> scan_ranges =
                compute_row_skip_scan_ranges(polynomials, effective_round_size);
            // Cost per iteration: skip_entire_row reads across polynomial columns.
            // Overestimates by using total entity count (skip_entire_row only checks a subset).
            constexpr size_t heuristic_cost = bb::thread_heuristics::FF_COPY_COST * 2 * Flavor::NUM_ALL_ENTITIES;
            std::vector<std::vector<BlockOfContiguousRows>> all_thread_blocks(bb::get_num_cpus());

            for (const auto& scan_range : scan_ranges) {
                const size_t num_edge_pairs = scan_range.size / 2;
                bb::parallel_for_heuristic(
                    num_edge_pairs,
                    [&](ThreadChunk chunk) {
                        auto range = chunk.range(num_edge_pairs);
                        if (range.empty()) {
                            return;
                        }
                        // Scan edge pairs to find contiguous runs of non-skippable rows.
                        // We track the start and size of the current run, emitting a block
                        // whenever we hit a skippable row or reach the end of the range.
                        size_t current_block_start = 0;
                        size_t current_block_size = 0;
                        std::vector<BlockOfContiguousRows> thread_blocks;
                        for (size_t pair_idx : range) {
                            size_t edge_idx = scan_range.starting_edge_idx + pair_idx * 2;
                            if (!Flavor::skip_entire_row(polynomials, edge_idx)) {
                                // Non-skippable row: begin a new block or extend the current one
                                if (current_block_size == 0) {
                                    current_block_start = edge_idx;
                                }
                                current_block_size += 2; // each pair covers 2 edges
                            } else {
                                // Skippable row: flush the current block if one is open
                                if (current_block_size > 0) {
                                    thread_blocks.push_back(BlockOfContiguousRows{
                                        .starting_edge_idx = current_block_start, .size = current_block_size });
                                    current_block_size = 0;
                                }
                            }
                        }
                        // Flush any remaining block at the end of the range
                        if (current_block_size > 0) {
                            thread_blocks.push_back(BlockOfContiguousRows{ .starting_edge_idx = current_block_start,
                                                                           .size = current_block_size });
                        }
                        auto& blocks = all_thread_blocks[chunk.thread_index];
                        blocks.insert(blocks.end(), thread_blocks.begin(), thread_blocks.end());
                    },
                    heuristic_cost);
            }

            for (const auto& thread_blocks : all_thread_blocks) {
                for (const auto block : thread_blocks) {
                    result.push_back(block);
                }
            }
            merge_contiguous_blocks(result);
        } else {
            result.push_back(BlockOfContiguousRows{ .starting_edge_idx = start_edge_idx,
                                                    .size = effective_round_size - start_edge_idx });
        }
        return result;
    }

    /**
     * @brief Return the evaluations of the univariate round polynomials \f$ \tilde{S}_{i} (X_{i}) \f$
     at \f$ X_{i } = 0,\ldots, D \f$. Most likely, \f$ D \f$ is around  \f$ 12 \f$. At the end, reset all
     * univariate accumulators to be zero.
     *
     * @details First, the vector of \ref pow_challenges "pow challenges" is computed.
     * Then, multi-threading is being set up.
     * Compute the evaluations of partially evaluated Honk polynomials
     * \f$ P_j\left(u_0,\ldots, u_{i-1}, X_{i} , \vec \ell \right) \f$
     * for \f$ X_{i} = 2, \ldots, D \f$ using \ref extend_edges "extend edges" method.
     * This method invokes more general \ref bb::Univariate::extend_to "extend_to" method that in this case
     * reduces to a very simple expression \f{align}{ P_j\left( u_0,\ldots, u_{i-1}, k, \vec \ell \right)  = P_j\left(
     * u_0,\ldots, u_{i-1}, k-1, \vec \ell \right) + P_j\left( u_0,\ldots, u_{i-1}, 1, \vec \ell \right) - P_j\left(
     * u_0,\ldots, u_{i-1}, 0, \vec \ell \right) \f}, where \f$ k=2,\ldots, D \f$.
     * For a given \f$ \vec \ell \in \{0,1\}^{d -1 -i} \f$,
     * we invoke \ref accumulate_relation_univariates "accumulate relation univariates" to compute the contributions of
     * \f$ P_1\left(u_0,\ldots, u_{i-1}, k, \vec \ell \right) \f$, ..., \f$
     * P_N\left(u_0,\ldots, u_{i-1}, k, \vec \ell \right) \f$ to every sub-relation.
     * Finally, the accumulators for individual relations' contributions are summed with appropriate factors using
     * method \ref extend_and_batch_univariates "extend and batch univariates".
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    SumcheckRoundUnivariate compute_univariate_with_row_skipping(
        ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
        const bb::RelationParameters<FF>& relation_parameters,
        const bb::GateSeparatorPolynomial<FF>& gate_separators,
        const SubrelationSeparators alphas)
    {
        BB_BENCH_NAME("compute_univariate_with_row_skipping");

        constexpr bool has_static_row_skip_manifest =
            HAS_STATIC_ROW_SKIP_MANIFEST<ProverPolynomialsOrPartiallyEvaluatedMultivariates>;
        constexpr bool can_skip_rows = (isRowSkippable<Flavor, decltype(polynomials), size_t>);
        constexpr bool uses_row_manifest = has_static_row_skip_manifest || can_skip_rows;

        if constexpr (!uses_row_manifest) {
            // Non-row-skipping flavors (UltraHonk, Mega, MultilinearBatching) use dynamic chunk
            // dispatch to balance per-row cost variance from selector-gated relation skipping.
            // Short traces don't need to iterate over the zero tail of the polynomial.
            const size_t effective_round_size = compute_effective_round_size(polynomials);
            constexpr size_t rows_per_chunk = 64; // empirically chosen for good load balance
            ChunkStealer chunks{ excluded_head_size, effective_round_size, rows_per_chunk };

            // Construct univariate accumulator containers; one per slot.
            // Note: std::vector will trigger {}-initialization of the contents. Therefore no need to zero the
            // univariates.
            std::vector<SumcheckTupleOfTuplesOfUnivariates> thread_univariate_accumulators(chunks.num_slots());

            parallel_for(chunks.num_slots(), [&](size_t slot_id) {
                // Construct extended univariates container; reused across every chunk this slot claims.
                ExtendedEdges extended_edges;
                auto& accum = thread_univariate_accumulators[slot_id];
                while (auto range = chunks.pop()) {
                    const auto [start, end] = *range;
                    for (size_t edge_idx = start; edge_idx < end; edge_idx += 2) {
                        extend_edges(extended_edges, polynomials, edge_idx);
                        // Compute the \f$ \ell \f$-th edge's univariate contribution,
                        // scale it by the corresponding \f$ pow_{\beta} \f$ contribution and add it to the accumulators
                        // for \f$ \tilde{S}^i(X_i) \f$. If \f$ \ell \f$'s binary representation is given by \f$
                        // (\ell_{i+1},\ldots, \ell_{d-1})\f$, the \f$ pow_{\beta}\f$-contribution is
                        // \f$\beta_{i+1}^{\ell_{i+1}} \cdot \ldots \cdot \beta_{d-1}^{\ell_{d-1}}\f$.
                        // MultilinearBatching flavors use eq polynomials and no pow_beta, so the factor is 1.
                        FF scaling_factor{ 1 };
                        if constexpr (!isMultilinearBatchingFlavor<Flavor>) {
                            scaling_factor = gate_separators[edge_idx];
                        }
                        accumulate_relation_univariates(accum, extended_edges, relation_parameters, scaling_factor);
                    }
                }
            });

            // Accumulate the per-slot univariate accumulators into a single set of accumulators.
            for (auto& accumulators : thread_univariate_accumulators) {
                Utils::add_nested_tuples(univariate_accumulators, accumulators);
            }
            // Batch the univariate contributions from each sub-relation to obtain the round univariate;
            // these are unmasked; we will mask in sumcheck.
            return batch_over_relations<SumcheckRoundUnivariate>(univariate_accumulators, alphas, gate_separators);
        }

        // Row-skipping flavors (ECCVM, Translator) iterate only over contiguous blocks of non-skippable
        // rows; work within each block is statically divided among threads via ThreadChunk ranges.
        std::vector<BlockOfContiguousRows> round_manifest;
        if constexpr (IsTranslatorFlavor<Flavor>) {
            BB_BENCH_NAME("compute_univariate_with_row_skipping/translator_compute_manifest");
            round_manifest = compute_contiguous_round_size(polynomials);
        } else {
            BB_BENCH_NAME("compute_univariate_with_row_skipping/compute_manifest");
            round_manifest = compute_contiguous_round_size(polynomials);
        }

        // Construct univariate accumulator containers; one per thread
        // Note: std::vector will trigger {}-initialization of the contents. Therefore no need to zero the univariates.
        std::vector<SumcheckTupleOfTuplesOfUnivariates> thread_univariate_accumulators(get_num_cpus());

        parallel_for([&](ThreadChunk chunk) {
            auto accumulate_blocks = [&]() {
                // Construct extended univariates containers; one per thread
                ExtendedEdges extended_edges;

                // Process each block, dividing work within each block
                for (const BlockOfContiguousRows& block : round_manifest) {
                    size_t block_iterations = block.size / 2;

                    // Get the range of iterations this thread should process for this block
                    auto iteration_range = chunk.range(block_iterations);

                    for (size_t i : iteration_range) {
                        size_t edge_idx = block.starting_edge_idx + (i * 2);
                        extend_edges(extended_edges, polynomials, edge_idx);
                        // Compute the \f$ \ell \f$-th edge's univariate contribution,
                        // scale it by the corresponding \f$ pow_{\beta} \f$ contribution and add it to the accumulators
                        // for \f$
                        // \tilde{S}^i(X_i) \f$. If \f$ \ell \f$'s binary representation is given by \f$
                        // (\ell_{i+1},\ldots, \ell_{d-1})\f$, the \f$ pow_{\beta}\f$-contribution is
                        // \f$\beta_{i+1}^{\ell_{i+1}} \cdot \ldots
                        // \cdot
                        // \beta_{d-1}^{\ell_{d-1}}\f$.

                        FF scaling_factor{ 1 };
                        if constexpr (!isMultilinearBatchingFlavor<Flavor>) {
                            scaling_factor = gate_separators[edge_idx];
                        }
                        accumulate_relation_univariates(thread_univariate_accumulators[chunk.thread_index],
                                                        extended_edges,
                                                        relation_parameters,
                                                        scaling_factor);
                    }
                }
            };

            if constexpr (IsTranslatorFlavor<Flavor>) {
                BB_BENCH_NAME("compute_univariate_with_row_skipping/translator_accumulate_blocks");
                accumulate_blocks();
            } else {
                BB_BENCH_NAME("compute_univariate_with_row_skipping/accumulate_blocks");
                accumulate_blocks();
            }
        });

        // Accumulate the per-thread univariate accumulators into a single set of accumulators
        for (auto& accumulators : thread_univariate_accumulators) {
            Utils::add_nested_tuples(univariate_accumulators, accumulators);
        }
        // Batch the univariate contributions from each sub-relation to obtain the round univariate
        // these are unmasked; we will mask in sumcheck.
        return batch_over_relations<SumcheckRoundUnivariate>(univariate_accumulators, alphas, gate_separators);
    };

    /**
     * @brief Compute the disabled rows' contribution to the round univariate.
     * @details The main sumcheck loop excludes disabled head edge pairs. This method computes the
     * relation evaluation at those positions directly from the (partially evaluated) polynomials,
     * multiplied by the (1-L) row-disabling factor. Masking values are already in the polynomials.
     *
     * Result is H_disabled * (1-L), to be ADDED to S_active.
     * In round 0, (1-L) = 0, so this returns zero.
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    SumcheckRoundUnivariate compute_disabled_contribution(
        ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
        const bb::RelationParameters<FF>& relation_parameters,
        const bb::GateSeparatorPolynomial<FF>& gate_separators,
        const SubrelationSeparators& alphas,
        const RowDisablingPolynomial<FF> row_disabling_polynomial)
        requires UseRowDisablingPolynomial<Flavor>
    {
        SumcheckTupleOfTuplesOfUnivariates univariate_accumulator{};
        ExtendedEdges extended_edges;
        SumcheckRoundUnivariate result{};

        for (size_t edge_idx = 0; edge_idx < excluded_head_size; edge_idx += 2) {
            extend_edges(extended_edges, polynomials, edge_idx);
            accumulate_relation_univariates(
                univariate_accumulator, extended_edges, relation_parameters, gate_separators[edge_idx]);
        }

        result = batch_over_relations<SumcheckRoundUnivariate>(univariate_accumulator, alphas, gate_separators);

        // Multiply by (1-L) factor.
        bb::Univariate<FF, 2> one_minus_L(
            { FF::one() - row_disabling_polynomial.eval_at_0, FF::one() - row_disabling_polynomial.eval_at_1 });
        SumcheckRoundUnivariate one_minus_L_extended =
            one_minus_L.template extend_to<SumcheckRoundUnivariate::LENGTH>();
        result *= one_minus_L_extended;

        return result;
    }

    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    SumcheckRoundUnivariate compute_virtual_contribution(
        ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
        const bb::RelationParameters<FF>& relation_parameters,
        const GateSeparatorPolynomial<FF>& gate_separator,
        const SubrelationSeparators& alphas)
    {
        // Note: {} is required to initialize the tuple contents. Otherwise the univariates contain garbage.
        SumcheckTupleOfTuplesOfUnivariates univariate_accumulator{};

        // For a given prover polynomial P_i(X_0, ..., X_{d-1}) extended by zero, i.e. multiplied by
        //      \tau(X_d, ..., X_{virtual_log_n - 1}) =  \prod (1 - X_k)
        // for k = d, ..., virtual_log_n - 1, the computation of the virtual sumcheck round univariate reduces to the
        // edge (0, ...,0).
        const size_t virtual_contribution_edge_idx = 0;

        // Perform the usual sumcheck accumulation, but for a single edge.
        // Note: we use a combination of `auto`, constexpr and a lambda to construct different types.
        auto extended_edges = [&]() {
            if constexpr (isAvmFlavor<Flavor>) {
                auto lazy_extended_edges = ExtendedEdges(polynomials);
                lazy_extended_edges.set_current_edge(virtual_contribution_edge_idx);
                return lazy_extended_edges;
            } else {
                ExtendedEdges extended_edges;
                extend_edges(extended_edges, polynomials, virtual_contribution_edge_idx);
                return extended_edges;
            }
        }();

        // The tail of G(X) = \prod_{k} (1 + X_k(\beta_k - 1) ) evaluated at the edge (0, ..., 0).
        const FF gate_separator_tail{ 1 };
        accumulate_relation_univariates(
            univariate_accumulator, extended_edges, relation_parameters, gate_separator_tail);

        return batch_over_relations<SumcheckRoundUnivariate>(univariate_accumulator, alphas, gate_separator);
    };
    /**
     * @brief Given a tuple of tuples of extended per-relation contributions,  \f$ (t_0, t_1, \ldots,
     * t_{\text{NUM_SUBRELATIONS}-1}) \f$ and a challenge \f$ \alpha \f$, scale them by the relation separator
     * \f$\alpha\f$, extend to the correct degree, and take the sum multiplying by \f$pow_{\beta}\f$-contributions.
     *
     * @details This method receives as input the univariate accumulators computed by \ref
     * accumulate_relation_univariates "accumulate relation univariates" after passing through the entire hypercube and
     * applying \ref bb::RelationUtils::add_nested_tuples "add_nested_tuples" method to join the threads. The
     * accumulators are scaled using the method \ref bb::RelationUtils< Flavor >::scale_univariates "scale
     * univariates", extended to the degree \f$ D \f$ and summed with appropriate  \f$pow_{\beta}\f$-factors using \ref
     * extend_and_batch_univariates "extend and batch univariates method" to return a vector \f$(\tilde{S}^i(0),
     * \ldots, \tilde{S}^i(D))\f$.
     *
     * @param challenge Challenge \f$\alpha\f$.
     * @param gate_separators Round \f$pow_{\beta}\f$-factor given by  \f$ ( (1−u_i) + u_i\cdot \beta_i )\f$.
     */
    template <typename ExtendedUnivariate, typename ContainerOverSubrelations>
    static ExtendedUnivariate batch_over_relations(ContainerOverSubrelations& univariate_accumulators,
                                                   const SubrelationSeparators& challenge,
                                                   const bb::GateSeparatorPolynomial<FF>& gate_separators)
    {
        Utils::scale_univariates(univariate_accumulators, challenge);

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
        // Pow-Factor  \f$ (1-X) + X\beta_i \f$
        auto random_polynomial = bb::Univariate<FF, 2>({ 1, gate_separators.current_element() });
        ExtendedUnivariate extended_random_polynomial =
            random_polynomial.template extend_to<ExtendedUnivariate::LENGTH>();

        constexpr_for<0, std::tuple_size_v<TupleOfTuplesOfUnivariates>, 1>([&]<size_t relation_idx>() {
            const auto& outer_element = std::get<relation_idx>(tuple);
            constexpr_for<0, std::tuple_size_v<std::decay_t<decltype(outer_element)>>, 1>(
                [&]<size_t subrelation_idx>() {
                    const auto& element = std::get<subrelation_idx>(outer_element);
                    auto extended = element.template extend_to<ExtendedUnivariate::LENGTH>();

                    using Relation = typename std::tuple_element_t<relation_idx, Relations>;
                    constexpr bool is_subrelation_linearly_independent =
                        bb::subrelation_is_linearly_independent<Relation, subrelation_idx>();
                    // Except from the log derivative subrelation, each other subrelation in part is required to be 0
                    // hence we multiply by the power polynomial. As the sumcheck prover is required to send a
                    // univariate to the verifier, we additionally need a univariate contribution from the pow
                    // polynomial which is the extended_random_polynomial which is the
                    if constexpr (!is_subrelation_linearly_independent) {
                        result += extended;
                    } else {
                        // Multiply by the pow polynomial univariate contribution and the partial
                        // evaluation result c_i (i.e. \f$ pow(u_0,...,u_{l-1})) \f$ where \f$(u_0,...,u_{i-1})\f$ are
                        // the verifier challenges from previous rounds.
                        result += extended * extended_random_polynomial * gate_separators.partial_evaluation_result;
                    }
                });
        });
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

    // Methods made accessible for testing
    void accumulate_relation_univariates_public(SumcheckTupleOfTuplesOfUnivariates& univariate_accumulators,
                                                const auto& extended_edges,
                                                const bb::RelationParameters<FF>& relation_parameters,
                                                const FF& scaling_factor)
    {
        accumulate_relation_univariates(univariate_accumulators, extended_edges, relation_parameters, scaling_factor);
    }

  private:
    /**
     * @brief In Round \f$ i \f$, for a given point \f$ \vec \ell \in \{0,1\}^{d-1 - i}\f$, calculate the contribution
     * of each sub-relation to \f$ T^i(X_i) \f$.
     *
     * @details In Round \f$ i \f$, this method computes the univariate \f$ T^i(X_i) \f$ defined in \ref
     *SumcheckProverContributionsofPow "this section". It is done  as follows:
     *   - Outer loop: iterate through the "edge" points \f$ (0,\vec \ell) \f$ on the boolean hypercube
     *\f$\{0,1\}\times
     * \{0,1\}^{d-1 - i}\f$, i.e. skipping every other point. On each iteration, apply \ref extend_edges "extend
     *edges".
     *   - Inner loop: iterate through the sub-relations, feeding each relation the "the group of edges", i.e. the
     * evaluations \f$ P_1(u_0,\ldots, u_{i-1}, k, \vec \ell), \ldots, P_N(u_0,\ldots, u_{i-1}, k, \vec \ell) \f$. Each
     *                 relation Flavor is endowed with \p accumulate method that computes its contribution to \f$
     * T^i(X_{i}) \f$
     *\ref extend_and_batch_univariates "Adding  these univariates together", with appropriate scaling factors,
     *produces required evaluations of \f$ \tilde S^i \f$.
     * @param univariate_accumulators The container for per-thread-per-relation univariate contributions output by \ref
     *accumulate_relation_univariates "accumulate relation univariates" for the previous "groups of edges".
     * @param extended_edges Contains tuples of evaluations of \f$ P_j\left(u_0,\ldots, u_{i-1}, k, \vec \ell \right)
     *\f$, for \f$ j=1,\ldots, N \f$,  \f$ k \in \{0,\ldots, D\} \f$ and fixed \f$\vec \ell \in \{0,1\}^{d-1 - i} \f$.
     * @param scaling_factor In Round \f$ i \f$, for \f$ (\ell_{i+1}, \ldots, \ell_{d-1}) \in \{0,1\}^{d-1-i}\f$ takes
     *an element of \ref  bb::GateSeparatorPolynomial< FF >::beta_products "vector of powers of challenges" at index
     *\f$ 2^{i+1}
     *(\ell_{i+1} 2^{i+1} +\ldots + \ell_{d-1} 2^{d-1})\f$.
     * @result #univariate_accumulators are updated with the contribution from the current group of edges.  For each
     * relation, a univariate of some degree is computed by accumulating the contributions of each group of edges.
     */
    void accumulate_relation_univariates(SumcheckTupleOfTuplesOfUnivariates& univariate_accumulators,
                                         const auto& extended_edges,
                                         const bb::RelationParameters<FF>& relation_parameters,
                                         const FF& scaling_factor)
    {
        constexpr_for<0, NUM_RELATIONS, 1>([&]<size_t relation_idx>() {
            using Relation = std::tuple_element_t<relation_idx, Relations>;
            const auto accumulate_relation = [&]() {
                // Check if the relation is skippable to speed up accumulation
                if constexpr (!isSkippable<Relation, decltype(extended_edges)>) {
                    // If not, accumulate normally
                    Relation::accumulate(std::get<relation_idx>(univariate_accumulators),
                                         extended_edges,
                                         relation_parameters,
                                         scaling_factor);
                } else {
                    // If so, only compute the contribution if the relation is active
                    if (!Relation::skip(extended_edges)) {
                        Relation::accumulate(std::get<relation_idx>(univariate_accumulators),
                                             extended_edges,
                                             relation_parameters,
                                             scaling_factor);
                    }
                }
            };

            if constexpr (!IsTranslatorFlavor<Flavor>) {
                accumulate_relation();
            } else if constexpr (relation_idx == 0) {
                BB_BENCH_NAME("translator_relation/permutation");
                accumulate_relation();
            } else if constexpr (relation_idx == 1) {
                BB_BENCH_NAME("translator_relation/delta_range");
                accumulate_relation();
            } else if constexpr (relation_idx == 2) {
                BB_BENCH_NAME("translator_relation/opcode");
                accumulate_relation();
            } else if constexpr (relation_idx == 3) {
                BB_BENCH_NAME("translator_relation/accumulator_transfer");
                accumulate_relation();
            } else if constexpr (relation_idx == 4) {
                BB_BENCH_NAME("translator_relation/decomposition");
                accumulate_relation();
            } else if constexpr (relation_idx == 5) {
                BB_BENCH_NAME("translator_relation/non_native_field");
                accumulate_relation();
            } else {
                BB_BENCH_NAME("translator_relation/zero_constraints");
                accumulate_relation();
            }
        });
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
template <typename Flavor, bool CommittedSumcheck = UsesCommittedSumcheck<Flavor>> class SumcheckVerifierRound {
    using FF = typename Flavor::FF;
    using Utils = bb::RelationUtils<Flavor>;
    using Relations = typename Flavor::Relations;
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<typename Flavor::Relations>());
    using SubrelationSeparators = std::array<FF, Flavor::NUM_SUBRELATIONS - 1>;

  public:
    using ClaimedEvaluations = typename Flavor::AllValues;
    using ClaimedLibraEvaluations = typename std::vector<FF>;
    using Transcript = typename Flavor::Transcript;
    using Commitment = typename Flavor::Commitment;

    bool round_failed = false;
    static constexpr size_t NUM_RELATIONS = Flavor::NUM_RELATIONS;
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    using SumcheckRoundUnivariate = bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>;

    FF target_total_sum = 0;
    TupleOfArraysOfValues relation_evaluations;

    explicit SumcheckVerifierRound(FF target_total_sum = 0)
        : target_total_sum(target_total_sum)
    {
        Utils::zero_elements(relation_evaluations);
    };

    /**
     * @brief Check that the round target sum is correct
     */
    void check_sum(bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>& univariate)
    {
        // OriginTag false positive: The univariate is constrained by the sumcheck relation S^i(0) + S^i(1) =
        // S^{i-1}(u_{i-1}).
        if constexpr (IsRecursiveFlavor<Flavor>) {
            const auto bound_tag = target_total_sum.get_origin_tag();
            for (auto& eval : univariate.evaluations) {
                eval.set_origin_tag(bound_tag);
            }
        }

        FF total_sum = univariate.value_at(0) + univariate.value_at(1);
        bool sumcheck_round_failed(false);
        if constexpr (IsRecursiveFlavor<Flavor>) {
            sumcheck_round_failed = (target_total_sum.get_value() != total_sum.get_value());
            target_total_sum.assert_equal(total_sum);
        } else {
            sumcheck_round_failed = (target_total_sum != total_sum);
        }
        round_failed = round_failed || sumcheck_round_failed;
    };

    /**
     * @brief Compute the next target sum
     */
    void compute_next_target_sum(bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>& univariate, FF& round_challenge)
    {
        target_total_sum = univariate.evaluate(round_challenge);
    }

    /**
     * @brief Compute the full relation purported value
     */
    FF compute_full_relation_purported_value(const ClaimedEvaluations& purported_evaluations,
                                             const bb::RelationParameters<FF>& relation_parameters,
                                             const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                             const SubrelationSeparators& alphas)
    {
        Utils::template accumulate_relation_evaluations_without_skipping<>(purported_evaluations,
                                                                           relation_evaluations,
                                                                           relation_parameters,
                                                                           gate_separators.partial_evaluation_result);
        return Utils::scale_and_batch_elements(relation_evaluations, alphas);
    }

    /**
     * @brief Process a single sumcheck round: receive univariate from transcript, verify sum, generate challenge.
     * 1. gets the round univariate and round challenge
     * 2. checks the consistency of the new round univariate with respect to the one from the previous round
     * 3. updates the target for the next consistency check
     */
    void process_round(const std::shared_ptr<Transcript>& transcript,
                       std::vector<FF>& multivariate_challenge,
                       bb::GateSeparatorPolynomial<FF>& gate_separators,
                       size_t round_idx)
    {
        // Obtain the round univariate from the transcript
        std::string round_univariate_label = "Sumcheck:univariate_" + std::to_string(round_idx);
        auto round_univariate =
            transcript->template receive_from_prover<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(
                round_univariate_label);
        FF round_challenge = transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
        multivariate_challenge.emplace_back(round_challenge);
        // Check that $\tilde{S}^{i-1}(u_{i-1}) == \tilde{S}^{i}(0) + \tilde{S}^{i}(1)$
        // For i = 0, check that $\tilde{S}^0(u_0) == target_total_sum$
        check_sum(round_univariate);
        // Evaluate $\tilde{S}^{i}(u_i)$
        compute_next_target_sum(round_univariate, round_challenge);
        gate_separators.partially_evaluate(round_challenge);
    }

    /**
     * @brief Perform final verification: check that the computed target sum matches the full relation evaluation. i.e.
     * the final evaluation check
     */
    bool perform_final_verification(const FF& full_honk_purported_value)
    {
        bool verified = false;
        if constexpr (IsRecursiveFlavor<Flavor>) {
            verified = (full_honk_purported_value.get_value() == target_total_sum.get_value());
            full_honk_purported_value.assert_equal(target_total_sum);
        } else {
            verified = (full_honk_purported_value == target_total_sum);
        }
        return verified;
    }

    /**
     * @brief Get round univariate commitments (only used for Grumpkin flavors).
     */
    std::vector<Commitment> get_round_univariate_commitments() { return {}; }

    /**
     * @brief Get round univariate evaluations (only used for Grumpkin flavors).
     */
    std::vector<std::array<FF, 3>> get_round_univariate_evaluations() { return {}; }
};

/**
 * @brief Specialization for Grumpkin flavors: receive commitments and evaluations,
 * defer per-round verification to Shplemini.
 */
template <typename Flavor> class SumcheckVerifierRound<Flavor, true> {
    using FF = typename Flavor::FF;
    using Utils = bb::RelationUtils<Flavor>;
    using Relations = typename Flavor::Relations;
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<typename Flavor::Relations>());
    using SubrelationSeparators = std::array<FF, Flavor::NUM_SUBRELATIONS - 1>;

  public:
    using ClaimedEvaluations = typename Flavor::AllValues;
    using ClaimedLibraEvaluations = typename std::vector<FF>;
    using Transcript = typename Flavor::Transcript;
    using Commitment = typename Flavor::Commitment;

    bool round_failed = false;
    static constexpr size_t NUM_RELATIONS = Flavor::NUM_RELATIONS;
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    using SumcheckRoundUnivariate = bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>;

    FF target_total_sum = 0;
    TupleOfArraysOfValues relation_evaluations;

    // Grumpkin-specific state for Shplemini
    std::vector<Commitment> round_univariate_commitments;
    std::vector<std::array<FF, 3>> round_univariate_evaluations;

    explicit SumcheckVerifierRound(FF target_total_sum = 0)
        : target_total_sum(target_total_sum)
    {
        Utils::zero_elements(relation_evaluations);
    };

    /**
     * @brief Compute the full relation purported value
     */
    FF compute_full_relation_purported_value(const ClaimedEvaluations& purported_evaluations,
                                             const bb::RelationParameters<FF>& relation_parameters,
                                             const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                             const SubrelationSeparators& alphas)
    {
        Utils::template accumulate_relation_evaluations_without_skipping<>(purported_evaluations,
                                                                           relation_evaluations,
                                                                           relation_parameters,
                                                                           gate_separators.partial_evaluation_result);
        return Utils::scale_and_batch_elements(relation_evaluations, alphas);
    }

    /**
     * @brief Process a single sumcheck round for Grumpkin: receive commitment and evaluations,
     * defer per-round verification to Shplemini.
     */
    void process_round(const std::shared_ptr<Transcript>& transcript,
                       std::vector<FF>& multivariate_challenge,
                       bb::GateSeparatorPolynomial<FF>& gate_separators,
                       size_t round_idx)
    {
        const std::string round_univariate_comm_label = "Sumcheck:univariate_comm_" + std::to_string(round_idx);
        const std::string univariate_eval_label_0 = "Sumcheck:univariate_" + std::to_string(round_idx) + "_eval_0";
        const std::string univariate_eval_label_1 = "Sumcheck:univariate_" + std::to_string(round_idx) + "_eval_1";

        // Receive the commitment to the round univariate
        round_univariate_commitments.push_back(
            transcript->template receive_from_prover<Commitment>(round_univariate_comm_label));
        // Receive evals at 0 and 1
        round_univariate_evaluations.push_back(
            { transcript->template receive_from_prover<FF>(univariate_eval_label_0),
              transcript->template receive_from_prover<FF>(univariate_eval_label_1),
              FF(0) }); // Third element will be populated in perform_final_verification

        const FF round_challenge = transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round_idx));
        multivariate_challenge.emplace_back(round_challenge);

        gate_separators.partially_evaluate(round_challenge);

        // For Grumpkin, we don't perform per-round verification here
        // It will be deferred to the final check
    }

    /**
     * @brief Perform final verification for Grumpkin: check first round sum, populate Shplemini data, and store final
     * evaluation.
     */
    bool perform_final_verification(const FF& full_honk_purported_value)
    {
        // Compute the sum of evaluations at 0 and 1 for the first round
        FF first_sumcheck_round_evaluations_sum =
            round_univariate_evaluations[0][0] + round_univariate_evaluations[0][1];

        bool verified = false;
        if constexpr (IsRecursiveFlavor<Flavor>) {
            if constexpr (IsGrumpkinFlavor<Flavor>) {
                first_sumcheck_round_evaluations_sum.self_reduce();
                target_total_sum.self_reduce();
                full_honk_purported_value.self_reduce();
            }
            verified = (first_sumcheck_round_evaluations_sum.get_value() == target_total_sum.get_value());
            first_sumcheck_round_evaluations_sum.assert_equal(target_total_sum);
        } else {
            verified = (first_sumcheck_round_evaluations_sum == target_total_sum);
        }

        // Populate claimed evaluations of Sumcheck Round Univariates at the round challenges.
        // These will be checked as a part of Shplemini.
        for (size_t round_idx = 1; round_idx < round_univariate_evaluations.size(); round_idx++) {
            round_univariate_evaluations[round_idx - 1][2] =
                round_univariate_evaluations[round_idx][0] + round_univariate_evaluations[round_idx][1];
        }

        // Store the final evaluation for Shplemini
        round_univariate_evaluations[round_univariate_evaluations.size() - 1][2] = full_honk_purported_value;
        return verified;
    }

    /**
     * @brief Get round univariate commitments for Shplemini.
     */
    std::vector<Commitment> get_round_univariate_commitments() { return round_univariate_commitments; }

    /**
     * @brief Get round univariate evaluations for Shplemini.
     */
    std::vector<std::array<FF, 3>> get_round_univariate_evaluations() { return round_univariate_evaluations; }
};
} // namespace bb
