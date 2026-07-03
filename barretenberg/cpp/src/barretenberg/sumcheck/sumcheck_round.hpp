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
#include <array>
#include <bitset>
#include <optional>

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
    // See HasLazyShortEdges: native Ultra/Mega materialize edges lazily per column; others extend eagerly.
    static constexpr bool USE_LAZY_SHORT_EDGES = HasLazyShortEdges<Flavor>;
    // Flavors whose edge container is materialized on demand (`set_current_edge`) rather than eagerly extended:
    // AVM (flavor-provided lazy container) and native Ultra/Mega (LazyExtendedEdges wrapper).
    static constexpr bool USE_LAZY_EDGES = isAvmFlavor<Flavor> || USE_LAZY_SHORT_EDGES;

    // Edge-pairs per work-stealing chunk in the main sumcheck loop. AVM uses smaller (finer-grained) chunks
    // for better load balance; other flavors use 64.
    static constexpr size_t ROWS_PER_CHUNK = isAvmFlavor<Flavor> ? 16 : 64;
    using ZKData = ZKSumcheckData<Flavor>;

    // Number of rows excluded from the main sumcheck loop and handled by compute_offset_area_contribution.
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
        , multivariate_d(numeric::get_msb(initial_round_size))
    {
        BB_BENCH_NAME("SumcheckProverRound constructor");

        // Initialize univariate accumulators to 0
        Utils::zero_univariates(univariate_accumulators);
    }

    /**
     * @brief Advance to the next regular sumcheck round: halve the active hypercube size and increment the round
     * index.
     * @details Called exactly once per regular round. After the multivariate_d regular rounds, round_index equals
     * multivariate_d, so the remaining zero-extension (virtual) rounds satisfy is_virtual_round().
     */
    void advance_round()
    {
        round_size >>= 1;
        ++round_index;
    }

    /**
     * @brief A virtual (zero-extension) round is any round at or beyond the multivariate_d regular rounds. Used to
     * enforce that compute_virtual_contribution only runs after all regular rounds have completed.
     */
    bool is_virtual_round() const { return round_index >= multivariate_d; }

    /**
     * @brief Compute the effective round size by finding the maximum end_index() across witness polynomials.
     * @details Witness polynomials only contain meaningful data up to their end_index(), so we cap per-round
     * iteration there and skip the trailing zero region. The disabled head rows are handled separately by
     * compute_offset_area_contribution, so they are not included here.
     *
     * INVARIANT: capping at the maximum *witness* end_index (rather than the full round_size) is only sound while
     * the following hold:
     *   1. Every subrelation term carries at least one witness factor, so on any row where all witnesses are zero
     *      (i.e. beyond the witness support) every relation contribution is zero.
     *   2. The support of the precomputed/selector polynomials is contained in the witness support, so no relation
     *      becomes active on a row past the max witness end_index.
     *   3. end_index() upper-bounds a polynomial's non-zero support
     * A relation term with no witness factor, or a precomputed column whose support exceeds the witnesses, would
     * make this cap drop non-zero rows.
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
        // ZK flavors without row disabling (e.g. Translator) must iterate over the full round_size.
        if constexpr (Flavor::HasZK && !UseRowDisablingPolynomial<Flavor>) {
            return round_size;
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
                // end_index() is exclusive, so end_index() == edge_idx already means the pair
                // {multivariate[edge_idx], multivariate[edge_idx + 1]} lies entirely in the zero region.
                if (multivariate.end_index() <= edge_idx) {
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
     * @brief Lazy edge container for USE_SHORT_MONOMIALS flavors.
     * @details For short-monomial flavors the edge "extension" is the identity (relations consume the
     * degree-1 edge \f$\{P_j(\text{edge}), P_j(\text{edge}+1)\}\f$ directly), so the eager `extend_edges`
     * copies all NUM_ALL_ENTITIES columns up front, including columns of relations that `skip()` on this
     * row. This container instead materializes each entity's edge on first access for the current edge,
     * so columns never read by an active relation are never touched. Values are cached in inline storage
     * and returned by reference, so `UnivariateView` consumers (which alias their operand) stay valid.
     * Relations index exclusively via `operator[](EntityId)` (verified across the relation set), so the
     * named accessors / `get_all` of the materialized container are not needed here.
     */
    template <typename Multivariates> class LazyExtendedEdges {
      public:
        using EntityId = typename Flavor::template ProverUnivariates<2>::EntityId;

        explicit LazyExtendedEdges(const Multivariates& multivariates)
            : multivariates(multivariates)
        {}

        void set_current_edge(const size_t edge_idx)
        {
            current_edge = edge_idx;
            materialized.reset();
        }

        const bb::Univariate<FF, 2>& operator[](const EntityId id) const
        {
            const size_t index = static_cast<size_t>(id);
            if (!materialized.test(index)) {
                const auto& multivariate = multivariates.get_all()[index];
                cache[index] = bb::Univariate<FF, 2>({ multivariate[current_edge], multivariate[current_edge + 1] });
                materialized.set(index);
            }
            return cache[index];
        }

      private:
        const Multivariates& multivariates;
        mutable std::array<bb::Univariate<FF, 2>, Flavor::NUM_ALL_ENTITIES> cache{};
        size_t current_edge = 0;
        mutable std::bitset<Flavor::NUM_ALL_ENTITIES> materialized;
    };

    // Construct the per-thread edge container: lazy for AVM and short-monomial flavors (materialize
    // columns on demand), eager (full copy via extend_edges) otherwise.
    template <typename Multivariates> auto make_extended_edges(const Multivariates& multivariates)
    {
        if constexpr (isAvmFlavor<Flavor>) {
            return ExtendedEdges(multivariates);
        } else if constexpr (USE_LAZY_SHORT_EDGES) {
            return LazyExtendedEdges<Multivariates>(multivariates);
        } else {
            return ExtendedEdges{};
        }
    }

    // Point an edge container produced by make_extended_edges at edge_idx.
    template <typename Edges, typename Multivariates>
    void load_edge(Edges& edges, const Multivariates& multivariates, const size_t edge_idx)
    {
        if constexpr (USE_LAZY_EDGES) {
            edges.set_current_edge(edge_idx);
        } else {
            extend_edges(edges, multivariates, edge_idx);
        }
    }

    /**
     * @brief Return the evaluations of the round univariate \f$ \tilde{S}_{i}(X_{i}) \f$ at \f$ X_i = 0,\ldots,D \f$.
     * @details Work is split into fixed-size chunks handed to threads by a work-stealing scheduler, which balances
     * the per-row cost variance that selector-gated relation skipping introduces. `make_edge_chunks` selects, at
     * compile time, which edges the round visits and the scheduler that covers them -- the canonical taxonomy for
     * the rest of this file:
     * - Row-skipping flavors (ECCVM/Translator): only the live edge ranges from `compute_edge_ranges`, scheduled by
     *   a `ListedEdgeChunks` manifest.
     * - Dense flavors (AVM/Ultra/Mega/MultilinearBatching): the single contiguous active range, scheduled by
     *   `ContiguousEdgeChunks`.
     * Per-relation accumulators are then batched into the round univariate (unmasked; masking happens later in
     * sumcheck). See `accumulate_edge_chunks` for the per-edge accumulation and `batch_over_relations` for the
     * batching.
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    SumcheckRoundUnivariate compute_univariate(ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
                                               const bb::RelationParameters<FF>& relation_parameters,
                                               const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                               const SubrelationSeparators& alphas)
    {
        BB_BENCH_NAME("compute_univariate");

        auto chunks = make_edge_chunks(polynomials);
        accumulate_edge_chunks(chunks, polynomials, relation_parameters, gate_separators);

        return batch_over_relations<SumcheckRoundUnivariate>(univariate_accumulators, alphas, gate_separators);
    }

    struct EdgeRange {
        size_t begin;
        size_t end;
    };

    // Number of fixed-size chunks needed to cover `span` edges.
    static size_t chunk_count(const size_t span, const size_t rows_per_chunk)
    {
        return span / rows_per_chunk + (span % rows_per_chunk > 0 ? 1 : 0);
    }

    // Work-stealing scheduler over a single contiguous edge range (the dense-flavor case, see
    // `compute_univariate`). `pop()` computes chunk bounds arithmetically, so it allocates nothing.
    struct ContiguousEdgeChunks {
        const size_t begin;
        const size_t end;
        const size_t rows_per_chunk;
        const size_t total_chunks;
        std::atomic<size_t> next_chunk{ 0 };

        ContiguousEdgeChunks(const size_t begin, const size_t end, const size_t rows_per_chunk)
            : begin(begin)
            , end(end)
            , rows_per_chunk(rows_per_chunk)
            , total_chunks(chunk_count(end - begin, rows_per_chunk))
        {
            BB_ASSERT(begin % 2 == 0, "edge range begin must be even");
            BB_ASSERT(end % 2 == 0, "edge range end must be even");
            BB_ASSERT(begin <= end, "edge range begin must not exceed end");
            BB_ASSERT(rows_per_chunk >= 2 && rows_per_chunk % 2 == 0, "rows_per_chunk must be at least 2 and even");
        }

        size_t num_slots() const { return std::min(bb::get_num_cpus(), std::max<size_t>(total_chunks, 1)); }

        std::optional<EdgeRange> pop()
        {
            const size_t id = next_chunk.fetch_add(1, std::memory_order_relaxed);
            if (id >= total_chunks) {
                return std::nullopt;
            }
            const size_t chunk_begin = begin + id * rows_per_chunk;
            return EdgeRange{ .begin = chunk_begin, .end = std::min(chunk_begin + rows_per_chunk, end) };
        }
    };

    // Work-stealing scheduler over a manifest of contiguous ranges (the row-skipping case, see
    // `compute_univariate`). The ranges are flattened into a chunk list up front, since a single arithmetic
    // stride can't express the gaps between them; the manifest is small, so the materialization cost is bounded.
    struct ListedEdgeChunks {
        std::vector<EdgeRange> chunks;
        std::atomic<size_t> next_chunk{ 0 };

        ListedEdgeChunks(const std::vector<EdgeRange>& ranges, const size_t rows_per_chunk)
        {
            BB_ASSERT(rows_per_chunk >= 2 && rows_per_chunk % 2 == 0, "rows_per_chunk must be at least 2 and even");

            size_t num_chunks = 0;
            for (const EdgeRange& range : ranges) {
                BB_ASSERT(range.begin % 2 == 0, "edge range begin must be even");
                BB_ASSERT(range.end % 2 == 0, "edge range end must be even");
                BB_ASSERT(range.begin <= range.end, "edge range begin must not exceed end");
                num_chunks += chunk_count(range.end - range.begin, rows_per_chunk);
            }

            chunks.reserve(num_chunks);
            for (const EdgeRange& range : ranges) {
                for (size_t chunk_begin = range.begin; chunk_begin < range.end; chunk_begin += rows_per_chunk) {
                    chunks.push_back(
                        EdgeRange{ .begin = chunk_begin, .end = std::min(chunk_begin + rows_per_chunk, range.end) });
                }
            }
        }

        size_t num_slots() const { return std::min(bb::get_num_cpus(), std::max<size_t>(chunks.size(), 1)); }

        std::optional<EdgeRange> pop()
        {
            const size_t id = next_chunk.fetch_add(1, std::memory_order_relaxed);
            if (id >= chunks.size()) {
                return std::nullopt;
            }
            return chunks[id];
        }
    };

    // Build the work-stealing scheduler for the round's active edges (see `compute_univariate` for the taxonomy):
    // a `ListedEdgeChunks` manifest when the flavor skips rows, else a single-range `ContiguousEdgeChunks`. The
    // scheduler type is selected at compile time.
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    auto make_edge_chunks(ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials)
    {
        if constexpr (USES_ROW_MANIFEST<ProverPolynomialsOrPartiallyEvaluatedMultivariates>) {
            std::vector<EdgeRange> round_manifest;
            {
                BB_BENCH_NAME("compute_univariate/compute_manifest");
                round_manifest = compute_edge_ranges(polynomials);
            }
            return ListedEdgeChunks{ round_manifest, ROWS_PER_CHUNK };
        } else {
            // Short traces don't need to iterate over the zero tail of the polynomial.
            const size_t effective_round_size = compute_effective_round_size(polynomials);
            return ContiguousEdgeChunks{ excluded_head_size, effective_round_size, ROWS_PER_CHUNK };
        }
    }

    template <typename EdgeChunks, typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    void accumulate_edge_chunks(EdgeChunks& chunks,
                                ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
                                const bb::RelationParameters<FF>& relation_parameters,
                                const bb::GateSeparatorPolynomial<FF>& gate_separators)
    {
        std::vector<SumcheckTupleOfTuplesOfUnivariates> slot_accumulators(chunks.num_slots());

        parallel_for(chunks.num_slots(), [&](size_t slot_id) {
            auto extended_edges = make_extended_edges(polynomials);
            auto& accum = slot_accumulators[slot_id];
            while (auto chunk = chunks.pop()) {
                for (size_t edge_idx = chunk->begin; edge_idx < chunk->end; edge_idx += 2) {
                    load_edge(extended_edges, polynomials, edge_idx);

                    FF scaling_factor{ 1 };
                    if constexpr (!isMultilinearBatchingFlavor<Flavor>) {
                        scaling_factor = gate_separators[edge_idx];
                    }
                    accumulate_relation_univariates(accum, extended_edges, relation_parameters, scaling_factor);
                }
            }
        });

        for (auto& accumulators : slot_accumulators) {
            Utils::add_nested_tuples(univariate_accumulators, accumulators);
        }
    }

    // True when the flavor exposes a static row-skip manifest: a contiguous prefix [head, active_prefix_end) holding
    // every relation-active row, used directly instead of the row-by-row skip_entire_row scan below. Only sound when
    // the prefix is tight (no inactive rows inside it); flavors whose active rows are interspersed should omit it and
    // use the dynamic scan. See Flavor::row_skip_active_prefix_end.
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    static constexpr bool HAS_STATIC_ROW_SKIP_MANIFEST =
        IsAnyOf<Flavor, ECCVMFlavor, ECCVMShortMonomialFlavor, ECCVMRecursiveFlavor> &&
        requires(const ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials) {
            Flavor::row_skip_active_prefix_end(polynomials);
        };

    // True when the flavor exposes a per-row `skip_entire_row` predicate, used to dynamically scan the trace for
    // contiguous runs of relation-active rows.
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    static constexpr bool CAN_SKIP_ROWS =
        isRowSkippable<Flavor, ProverPolynomialsOrPartiallyEvaluatedMultivariates&, size_t>;

    // True when the round univariate is computed over a manifest of relation-active edge ranges (the row-skipping
    // case in `compute_univariate`) rather than the whole contiguous active range -- i.e. either row-skip predicate.
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    static constexpr bool USES_ROW_MANIFEST =
        HAS_STATIC_ROW_SKIP_MANIFEST<ProverPolynomialsOrPartiallyEvaluatedMultivariates> ||
        CAN_SKIP_ROWS<ProverPolynomialsOrPartiallyEvaluatedMultivariates>;

    static size_t round_up_to_even(const size_t value) { return value + (value & 1U); }

    static void append_edge_range(std::vector<EdgeRange>& ranges, const size_t start, const size_t end)
    {
        if (end <= start) {
            return;
        }
        if (!ranges.empty()) {
            auto& previous = ranges.back();
            const size_t previous_end = previous.end;
            if (start <= previous_end) {
                previous.end = std::max(previous_end, end);
                return;
            }
        }
        ranges.push_back(EdgeRange{ .begin = start, .end = end });
    }

    static void merge_edge_ranges(std::vector<EdgeRange>& ranges)
    {
        if (ranges.empty()) {
            return;
        }
        std::sort(ranges.begin(), ranges.end(), [](const EdgeRange& lhs, const EdgeRange& rhs) {
            return lhs.begin < rhs.begin;
        });

        size_t write_idx = 0;
        for (size_t read_idx = 1; read_idx < ranges.size(); ++read_idx) {
            auto& previous = ranges[write_idx];
            const auto& current = ranges[read_idx];
            const size_t previous_end = previous.end;
            if (current.begin <= previous_end) {
                previous.end = std::max(previous_end, current.end);
            } else {
                ++write_idx;
                ranges[write_idx] = current;
            }
        }
        ranges.resize(write_idx + 1);
    }

    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    std::vector<EdgeRange> compute_row_skip_edge_ranges(ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
                                                        const size_t effective_round_size) const
    {
        const size_t scan_start = excluded_head_size;
        std::vector<EdgeRange> ranges;
        if (effective_round_size <= scan_start) {
            return ranges;
        }

        if constexpr (HAS_STATIC_ROW_SKIP_MANIFEST<ProverPolynomialsOrPartiallyEvaluatedMultivariates>) {
            const size_t row_skip_active_prefix_end = Flavor::row_skip_active_prefix_end(polynomials);
            if (row_skip_active_prefix_end == 0) {
                append_edge_range(ranges, scan_start, effective_round_size);
                return ranges;
            }

            const size_t active_prefix_end =
                std::min(round_up_to_even(row_skip_active_prefix_end), effective_round_size);
            append_edge_range(ranges, scan_start, std::max(scan_start, active_prefix_end));

            // Lagrange-last lives at the end of the domain. Everything between the active prefix and this final
            // edge-pair is known to be relation-trivial, so do not spend scan work proving it row-by-row.
            if (effective_round_size >= scan_start + 2) {
                append_edge_range(ranges, effective_round_size - 2, effective_round_size);
            }
        } else {
            append_edge_range(ranges, scan_start, effective_round_size);
        }
        return ranges;
    }

    /**
     * @brief Compute the edge ranges the main sumcheck loop must visit.
     * @details Some circuits have a circuit size much larger than the number of used rows (ECCVM, Translator).
     *          Static row-manifest flavors provide the relation-active edge ranges directly; row-skippable flavors
     * expose a `skip_entire_row` predicate and this method scans the trace to compute contiguous live edge ranges.
     *
     * @tparam ProverPolynomialsOrPartiallyEvaluatedMultivariates
     * @param polynomials
     * @return std::vector<EdgeRange>
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    std::vector<EdgeRange> compute_edge_ranges(ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials)
    {
        // When !HasZK, compute the effective round size to avoid iterating over zero regions
        const size_t effective_round_size = compute_effective_round_size(polynomials);

        std::vector<EdgeRange> result;
        if constexpr (HAS_STATIC_ROW_SKIP_MANIFEST<ProverPolynomialsOrPartiallyEvaluatedMultivariates>) {
            // Static row manifests describe the relation-active edge pairs directly, avoiding the old per-row skip
            // scan over the whole trace.
            result = compute_row_skip_edge_ranges(polynomials, effective_round_size);
        } else if constexpr (CAN_SKIP_ROWS<ProverPolynomialsOrPartiallyEvaluatedMultivariates>) {
            // Iterate over edge-pairs (stride-2) so each thread gets an even-aligned range.
            const std::vector<EdgeRange> scan_ranges = compute_row_skip_edge_ranges(polynomials, effective_round_size);
            // Cost per iteration: skip_entire_row reads across polynomial columns.
            // Overestimates by using total entity count (skip_entire_row only checks a subset).
            constexpr size_t heuristic_cost = bb::thread_heuristics::FF_COPY_COST * 2 * Flavor::NUM_ALL_ENTITIES;
            std::vector<std::vector<EdgeRange>> all_thread_ranges(bb::get_num_cpus());

            for (const auto& scan_range : scan_ranges) {
                const size_t num_edge_pairs = (scan_range.end - scan_range.begin) / 2;
                bb::parallel_for_heuristic(
                    num_edge_pairs,
                    [&](ThreadChunk chunk) {
                        auto range = chunk.range(num_edge_pairs);
                        if (range.empty()) {
                            return;
                        }
                        // Scan edge pairs to find contiguous live ranges.
                        size_t current_block_start = 0;
                        size_t current_block_size = 0;
                        std::vector<EdgeRange> thread_ranges;
                        for (size_t pair_idx : range) {
                            size_t edge_idx = scan_range.begin + pair_idx * 2;
                            if (!Flavor::skip_entire_row(polynomials, edge_idx)) {
                                if (current_block_size == 0) {
                                    current_block_start = edge_idx;
                                }
                                current_block_size += 2; // each pair covers 2 edges
                            } else {
                                if (current_block_size > 0) {
                                    thread_ranges.push_back(
                                        EdgeRange{ .begin = current_block_start,
                                                   .end = current_block_start + current_block_size });
                                    current_block_size = 0;
                                }
                            }
                        }
                        if (current_block_size > 0) {
                            thread_ranges.push_back(EdgeRange{ .begin = current_block_start,
                                                               .end = current_block_start + current_block_size });
                        }
                        auto& ranges = all_thread_ranges[chunk.thread_index];
                        ranges.insert(ranges.end(), thread_ranges.begin(), thread_ranges.end());
                    },
                    heuristic_cost);
            }

            for (const auto& thread_ranges : all_thread_ranges) {
                for (const auto range : thread_ranges) {
                    result.push_back(range);
                }
            }
            merge_edge_ranges(result);
        } else {
            // The disabled head rows are handled by compute_offset_area_contribution, so skip them here.
            result.push_back(EdgeRange{ .begin = excluded_head_size, .end = effective_round_size });
        }
        return result;
    }

    /**
     * @brief Contribution to the round univariate from the offset-area head rows (rows 0 ..
     * `TRACE_OFFSET - 1`), which are excluded from the main sumcheck loop.
     *
     * @details Let `L = L_0 + L_1 + L_2 + L_3` be the indicator of the offset area. The full Honk
     * relation on the hypercube is
     * \f[
     *   H(x) = (1 - L)(x) \cdot \sum_{R \in \text{main}} H_R(x) + L(x) \cdot \sum_{R \in \text{offset-only}} H_R(x),
     * \f]
     * so each relation's head-row contribution carries its own row-disabling factor:
     *   - main-domain relations (default): factor `(1 - L)`,
     *   - offset-only relations (`IsOffsetOnlyRelation`): factor `L`.
     *
     * At round 0 the head-row values of `(1 - L)` vanish while those of `L` equal 1, so the round
     * univariate receives offset-only contributions there and no main-domain contribution. At
     * later rounds both factors are nontrivial linear univariates tracked by `RowDisablingPolynomial`.
     *
     * When the flavor lists no offset-only relation, the per-relation dispatch reduces to
     * multiplying the whole head-edge accumulation by `(1 - L)`.
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    [[nodiscard]] SumcheckRoundUnivariate compute_offset_area_contribution(
        ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
        const bb::RelationParameters<FF>& relation_parameters,
        const bb::GateSeparatorPolynomial<FF>& gate_separators,
        const SubrelationSeparators& alphas,
        const RowDisablingPolynomial<FF> row_disabling_polynomial)
        requires UseRowDisablingPolynomial<Flavor>
    {
        SumcheckTupleOfTuplesOfUnivariates univariate_accumulator{};
        auto extended_edges = make_extended_edges(polynomials);

        for (size_t edge_idx = 0; edge_idx < excluded_head_size; edge_idx += 2) {
            load_edge(extended_edges, polynomials, edge_idx);
            accumulate_relation_univariates(
                univariate_accumulator, extended_edges, relation_parameters, gate_separators[edge_idx]);
        }

        return batch_over_relations<SumcheckRoundUnivariate>(
            univariate_accumulator, alphas, gate_separators, &row_disabling_polynomial);
    }

    /**
     * @brief Virtual (zero-extension) round univariate contribution.
     */
    template <typename ProverPolynomialsOrPartiallyEvaluatedMultivariates>
    [[nodiscard]] SumcheckRoundUnivariate compute_virtual_contribution(
        ProverPolynomialsOrPartiallyEvaluatedMultivariates& polynomials,
        const bb::RelationParameters<FF>& relation_parameters,
        const GateSeparatorPolynomial<FF>& gate_separator,
        const SubrelationSeparators& alphas,
        const RowDisablingPolynomial<FF>* row_disabling_polynomial = nullptr)
    {
        // A virtual (zero-extension) contribution is only well-defined once all multivariate_d regular rounds have
        // run: it treats the prover polynomials as padded by zero beyond the real hypercube.
        BB_ASSERT(is_virtual_round(),
                  "compute_virtual_contribution must only run in virtual rounds (after all regular rounds)");

        // Note: {} is required to initialize the tuple contents. Otherwise the univariates contain garbage.
        SumcheckTupleOfTuplesOfUnivariates univariate_accumulator{};

        // For a given prover polynomial P_i(X_0, ..., X_{d-1}) extended by zero, i.e. multiplied by
        //      \tau(X_d, ..., X_{virtual_log_n - 1}) =  \prod (1 - X_k)
        // for k = d, ..., virtual_log_n - 1, the computation of the virtual sumcheck round univariate reduces to the
        // edge (0, ...,0).
        const size_t virtual_contribution_edge_idx = 0;

        // Perform the usual sumcheck accumulation, but for a single edge.
        auto extended_edges = make_extended_edges(polynomials);
        load_edge(extended_edges, polynomials, virtual_contribution_edge_idx);

        // The tail of G(X) = \prod_{k} (1 + X_k(\beta_k - 1) ) evaluated at the edge (0, ..., 0).
        const FF gate_separator_tail{ 1 };
        accumulate_relation_univariates(
            univariate_accumulator, extended_edges, relation_parameters, gate_separator_tail);

        return batch_over_relations<SumcheckRoundUnivariate>(
            univariate_accumulator, alphas, gate_separator, row_disabling_polynomial);
    }

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
                                                   const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                                   const RowDisablingPolynomial<FF>* row_disabling_polynomial = nullptr)
    {
        Utils::scale_univariates(univariate_accumulators, challenge);

        auto result = ExtendedUnivariate(0);
        extend_and_batch_univariates<ExtendedUnivariate>(
            univariate_accumulators, result, gate_separators, row_disabling_polynomial);

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
     *
     * Each relation's per-relation sum is then scaled by a row-disabling factor `Λ_R`:
     * `(1 - L^{(i)})(X)` for main-domain relations and `L^{(i)}(X)` for offset-only relations.
     * When `row_disabling_polynomial == nullptr` the factors default to the constants `(1, 0)`,
     * so main relations pass through unscaled and offset-only relations collapse to zero.
     *
     * @param tuple A tuple of tuples of Univariates.
     * @param result Round univariate \f$ \tilde{S}^i\f$ represented by its evaluations over \f$ \{0,\ldots, D\} \f$.
     * @param gate_separators Round \f$pow_{\beta}\f$-factor \f$ ( (1−X_i) + X_i\cdot \beta_i )\f$.
     * @param row_disabling_polynomial Optional; when non-null, its `eval_at_0/1` supply `L^{(i)}`
     *        for per-relation `L` / `(1 - L)` scaling.
     */
    template <typename ExtendedUnivariate, typename TupleOfTuplesOfUnivariates>
    static void extend_and_batch_univariates(const TupleOfTuplesOfUnivariates& tuple,
                                             ExtendedUnivariate& result,
                                             const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                             const RowDisablingPolynomial<FF>* row_disabling_polynomial = nullptr)
    {
        // Pow-Factor  \f$ (1-X) + X\beta_i \f$
        auto random_polynomial = bb::Univariate<FF, 2>({ 1, gate_separators.current_element() });
        ExtendedUnivariate extended_random_polynomial =
            random_polynomial.template extend_to<ExtendedUnivariate::LENGTH>();

        // Row-disabling factors. Defaults (1, 0) encode "no row disabling": main relations pass
        // through unscaled and offset-only relations collapse to zero. When a row-disabling
        // polynomial is supplied, `L^{(i)}(X) = L(u_0, ..., u_{i-1}, X, 0, ..., 0)` is a linear
        // univariate with evals `eval_at_0/1`; the main-domain factor is `(1 - L^{(i)})(X)` and
        // the offset-only factor is `L^{(i)}(X)`.
        bb::Univariate<FF, 2> main_linear({ FF::one(), FF::one() });
        bb::Univariate<FF, 2> offset_linear({ FF::zero(), FF::zero() });
        if (row_disabling_polynomial != nullptr) {
            main_linear = bb::Univariate<FF, 2>(
                { FF::one() - row_disabling_polynomial->eval_at_0, FF::one() - row_disabling_polynomial->eval_at_1 });
            offset_linear =
                bb::Univariate<FF, 2>({ row_disabling_polynomial->eval_at_0, row_disabling_polynomial->eval_at_1 });
        }
        const ExtendedUnivariate main_factor = main_linear.template extend_to<ExtendedUnivariate::LENGTH>();
        const ExtendedUnivariate offset_factor = offset_linear.template extend_to<ExtendedUnivariate::LENGTH>();

        // Extend and batch one relation's subrelation accumulators, applying the appropriate
        // row-disabling factor. Independent across relations, so it can run serially or in parallel.
        auto batch_one_relation = [&]<size_t relation_idx>() -> ExtendedUnivariate {
            using Relation = typename std::tuple_element_t<relation_idx, Relations>;
            const auto& outer_element = std::get<relation_idx>(tuple);

            ExtendedUnivariate per_relation(0);
            constexpr_for<0, std::tuple_size_v<std::decay_t<decltype(outer_element)>>, 1>(
                [&]<size_t subrelation_idx>() {
                    const auto& element = std::get<subrelation_idx>(outer_element);
                    auto extended = element.template extend_to<ExtendedUnivariate::LENGTH>();

                    constexpr bool is_subrelation_linearly_independent =
                        bb::subrelation_is_linearly_independent<Relation, subrelation_idx>();
                    // Except for the log-derivative subrelation, each subrelation is required to
                    // vanish at every point of the hypercube, hence we multiply by the pow
                    // polynomial. Since the sumcheck prover sends a univariate to the verifier, we
                    // additionally apply the univariate contribution `extended_random_polynomial`.
                    if constexpr (!is_subrelation_linearly_independent) {
                        per_relation += extended;
                    } else {
                        // Multiply by the pow polynomial univariate contribution and the partial
                        // evaluation \f$ c_i = pow_\beta(u_0, ..., u_{i-1}) \f$.
                        per_relation +=
                            extended * extended_random_polynomial * gate_separators.partial_evaluation_result;
                    }
                });

            if constexpr (IsOffsetOnlyRelation<Relation>) {
                return per_relation * offset_factor;
            } else {
                return per_relation * main_factor;
            }
        };

        constexpr size_t num_relations_in_tuple = std::tuple_size_v<TupleOfTuplesOfUnivariates>;
        // Batching runs every round at a fixed cost independent of the round size, so for flavors with many
        // high-degree subrelations (ECCVM) it becomes a serial per-round floor dominating the geometrically
        // shrinking sumcheck tail. Such flavors opt into parallel batching (ParallelizesRelationBatching); other
        // flavors batch serially, where thread dispatch would cost more than it saves.
        if constexpr (ParallelizesRelationBatching<Flavor>) {
            // One relation per slot; sum in relation order afterwards so the result is schedule-independent.
            std::array<ExtendedUnivariate, num_relations_in_tuple> per_relation_results;
            parallel_for(num_relations_in_tuple, [&](size_t slot) {
                constexpr_for<0, num_relations_in_tuple, 1>([&]<size_t relation_idx>() {
                    if (relation_idx == slot) {
                        per_relation_results[relation_idx] = batch_one_relation.template operator()<relation_idx>();
                    }
                });
            });
            for (const auto& per_relation : per_relation_results) {
                result += per_relation;
            }
        } else {
            constexpr_for<0, num_relations_in_tuple, 1>(
                [&]<size_t relation_idx>() { result += batch_one_relation.template operator()<relation_idx>(); });
        }
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
        BB_ASSERT(round_idx < zk_sumcheck_data.libra_univariates.size(),
                  "compute_libra_univariate: round_idx out of range");
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
        });
    }

    /**
     * @brief In regular round i = 0,...,multivariate_d-1, equals 2^{multivariate_d - i}; halved once per regular
     * round via advance_round().
     */
    size_t round_size;
    // Number of regular sumcheck rounds, i.e. log2 of the initial hypercube size passed to the constructor.
    size_t multivariate_d;
    // Incremented once per regular round via advance_round(); reaches multivariate_d after all regular rounds.
    size_t round_index = 0;
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
     * @brief Evaluate the full Honk relation at the sumcheck challenge `u`.
     *
     * @details Row-disabling gating is internal: for `UseRowDisablingPolynomial<Flavor> &&
     * Flavor::HasZK`, main-domain rels are scaled by `(1 - L)(u)` and offset-only rels by `L(u)`;
     * otherwise factors collapse to `(1, 0)` (offset-only rels drop out).
     */
    FF compute_full_relation_purported_value(const ClaimedEvaluations& purported_evaluations,
                                             const bb::RelationParameters<FF>& relation_parameters,
                                             const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                             const SubrelationSeparators& alphas,
                                             std::span<const FF> multivariate_challenge = {})
    {
        Utils::template accumulate_relation_evaluations_without_skipping<>(purported_evaluations,
                                                                           relation_evaluations,
                                                                           relation_parameters,
                                                                           gate_separators.partial_evaluation_result);
        FF main_factor{ 1 };
        FF offset_factor{ 0 };
        if constexpr (UseRowDisablingPolynomial<Flavor> && Flavor::HasZK) {
            main_factor = RowDisablingPolynomial<FF>::evaluate_at_challenge(multivariate_challenge,
                                                                            multivariate_challenge.size());
            offset_factor = FF{ 1 } - main_factor;
        }
        return Utils::scale_and_batch_elements(relation_evaluations, alphas, main_factor, offset_factor);
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
     * @brief Evaluate the full Honk relation at the sumcheck challenge `u` (Grumpkin variant).
     * @details See the analogous method in the non-Grumpkin `SumcheckVerifierRound` above.
     */
    FF compute_full_relation_purported_value(const ClaimedEvaluations& purported_evaluations,
                                             const bb::RelationParameters<FF>& relation_parameters,
                                             const bb::GateSeparatorPolynomial<FF>& gate_separators,
                                             const SubrelationSeparators& alphas,
                                             std::span<const FF> multivariate_challenge = {})
    {
        Utils::template accumulate_relation_evaluations_without_skipping<>(purported_evaluations,
                                                                           relation_evaluations,
                                                                           relation_parameters,
                                                                           gate_separators.partial_evaluation_result);
        FF main_factor{ 1 };
        FF offset_factor{ 0 };
        if constexpr (UseRowDisablingPolynomial<Flavor> && Flavor::HasZK) {
            main_factor = RowDisablingPolynomial<FF>::evaluate_at_challenge(multivariate_challenge,
                                                                            multivariate_challenge.size());
            offset_factor = FF{ 1 } - main_factor;
        }
        return Utils::scale_and_batch_elements(relation_evaluations, alphas, main_factor, offset_factor);
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
