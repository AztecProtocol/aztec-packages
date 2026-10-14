// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <array>
#include <tuple>
#include <vector>

#include "barretenberg/common/thread.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/stdlib_circuit_builders/databus.hpp"

namespace bb {

/**
 * @brief Log-derivative lookup argument for a single DataBus column.
 *
 * @details Each bus column (kernel_calldata, app_calldata_0, …, returndata) is its own table; this
 * relation establishes that reads from one column are well-formed. The relation is parameterized
 * on the EntityId values for the column's five entities — `value`, `read_counts`, `inverses`,
 * `indicator`, `selector` — so the flavor binds a concrete bus at typedef time and the C++ side
 * sees a fixed-shape relation with no bus loop. A flavor with N buses simply lists N independent
 * `SingleBusLookupRelation` instantiations in its `Relations_<FF>` tuple.
 *
 * Per-column subrelations (4 total):
 *
 * (1a) Inverse correctness on read rows:    (I · L · T − 1) · is_read = 0   (per-row, deg 5)
 * (1b) Inverse correctness on write rows:   (I · L · T − 1) · count   = 0   (per-row, deg 4)
 * (2)  Lookup identity (linearly dep'nt):   Σ_rows (is_read · T − count · L) · I = 0  (deg 4)
 * (3)  Read-count locality:                 (1 − indicator) · count   = 0   (per-row, deg 2)
 *
 * Where L = w_l + w_r·β + γ (read term) and T = value + databus_id·β + γ (table term). is_read =
 * q_busread · selector. Subrelations (1a)/(1b)/(2) all share length 6 to amortize the common
 * `I·L·T − 1` factor across rows; (3) uses length 3 since it has no shared computation.
 */
template <typename FF_, auto ValueId, auto ReadCountsId, auto InversesId, auto IndicatorId, auto SelectorId>
class SingleBusLookupRelationImpl {
  public:
    using FF = FF_;

    static constexpr size_t INVERSE_READ_SUBREL_LENGTH = 6;        // deg 5: (I*L*T - 1) * is_read
    static constexpr size_t INVERSE_WRITE_SUBREL_LENGTH = 6;       // deg 4: (I*L*T - 1) * count
    static constexpr size_t LOOKUP_SUBREL_LENGTH = 6;              // deg 4: (is_read*T - count*L) * I
    static constexpr size_t READ_COUNT_LOCALITY_SUBREL_LENGTH = 3; // deg 2: (1 - indicator) * count

    static constexpr std::array<size_t, 4> SUBRELATION_PARTIAL_LENGTHS{
        INVERSE_READ_SUBREL_LENGTH,
        INVERSE_WRITE_SUBREL_LENGTH,
        LOOKUP_SUBREL_LENGTH,
        READ_COUNT_LOCALITY_SUBREL_LENGTH,
    };
    // (1a)/(1b)/(3) are per-row identities; (2) is a sum across the trace.
    static constexpr std::array<bool, 4> SUBRELATION_LINEARLY_INDEPENDENT{ true, true, false, true };

    // Marker used by tooling (RelationChecker, etc.) to identify per-bus lookup relations in a
    // flavor's `Relations_<FF>` tuple without baking the relation's identity into a heuristic.
    static constexpr bool IS_SINGLE_BUS_LOOKUP = true;
    static constexpr bool HAS_LOGDERIVATIVE_INVERSE_COMPUTATION = true;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        // Skip when the row is not a read gate of this column (q_busread · selector vanishes) AND has no read counts
        // on this column.
        return (in[AllEntities::EntityId::q_busread].is_zero() || in[SelectorId].is_zero()) &&
               in[ReadCountsId].is_zero();
    }

    /**
     * @brief Compute scalar for read term in log derivative lookup argument
     * @details Read selector for this bus column: q_busread · selector.
     */
    template <typename Accumulator, typename AllEntities> static Accumulator get_read_selector(const AllEntities& in)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        auto q_busread = CoefficientAccumulator(in[AllEntities::EntityId::q_busread]);
        auto column_selector = CoefficientAccumulator(in[SelectorId]);
        return Accumulator(q_busread * column_selector);
    }

    /** @brief Write term denominator: value + databus_id·β + γ. */
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_table_term(const AllEntities& in, const Parameters& params)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ParameterCoefficientAccumulator = typename Parameters::DataType::CoefficientAccumulator;

        const auto& id = CoefficientAccumulator(in[AllEntities::EntityId::databus_id]);
        const auto& value = CoefficientAccumulator(in[ValueId]);
        const auto& gamma = ParameterCoefficientAccumulator(params.gamma);
        const auto& beta = ParameterCoefficientAccumulator(params.beta);

        return Accumulator(id * beta + value + gamma);
    }

    /** @brief Read term denominator: w_l + w_r·β + γ. Bus-independent. */
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_lookup_term(const AllEntities& in, const Parameters& params)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ParameterCoefficientAccumulator = typename Parameters::DataType::CoefficientAccumulator;

        const auto& w_1 = CoefficientAccumulator(in[AllEntities::EntityId::w_l]);
        const auto& w_2 = CoefficientAccumulator(in[AllEntities::EntityId::w_r]);
        const auto& gamma = ParameterCoefficientAccumulator(params.gamma);
        const auto& beta = ParameterCoefficientAccumulator(params.beta);

        return Accumulator((w_2 * beta) + w_1 + gamma);
    }

    /**
     * @brief Compute the column's inverse polynomial \f$I_i = (L_i · T_i)^{-1}\f$ at active rows.
     *
     * @note \f$I_i = 0\f$ at rows that are neither a read gate nor have a non-zero read count, so
     * the cost is proportional to the column's actual usage.
     */
    template <typename Polynomials>
    static void compute_logderivative_inverse(Polynomials& polynomials,
                                              auto& relation_parameters,
                                              const size_t circuit_size,
                                              const size_t start_index = 0)
    {
        BB_BENCH_NAME("Databus::compute_logderivative_inverse");
        auto& inverse_polynomial = polynomials[InversesId];
        const auto& column_selector = polynomials[SelectorId];
        const auto& read_counts = polynomials[ReadCountsId];

        const auto& q_busread = polynomials.q_busread();
        const auto& w_l = polynomials.w_l();
        const auto& w_r = polynomials.w_r();
        const auto& databus_id = polynomials.databus_id();
        const auto& value_column = polynomials[ValueId];
        const FF& gamma = relation_parameters.gamma;
        const FF& beta = relation_parameters.beta;

        // A row needs an inverse only if it is a read gate (q_busread != 0) or has a non-zero read count, so only
        // rows inside the backing ranges of q_busread and read_counts are visited; both are zero elsewhere. Each
        // thread handles a slice of the inverse polynomial's backing range (which covers both) and then inverts the
        // non-zero entries of its slice; inverses are unique, so this matches a whole-polynomial batch inversion.
        const size_t backing_start = inverse_polynomial.start_index();
        const size_t backing_size = inverse_polynomial.size();
        size_t min_iterations_per_thread = 1 << 6;
        size_t num_threads = bb::calculate_num_threads(backing_size, min_iterations_per_thread);

        parallel_for(num_threads, [&](ThreadChunk chunk) {
            BB_BENCH_TRACY_NAME("Databus::compute_inverses/chunk");
            auto range = chunk.range(backing_size, backing_start);
            if (range.empty()) {
                return;
            }
            const size_t chunk_begin = *range.begin();
            const size_t chunk_end = chunk_begin + range.size();
            const size_t row_begin = std::max(chunk_begin, start_index);
            const size_t row_end = std::min(chunk_end, circuit_size);

            const auto compute_row = [&](size_t i) {
                const bool is_read = q_busread[i] == 1 && column_selector[i] == 1;
                const bool nonzero_read_count = read_counts[i] > 0;
                if (is_read || nonzero_read_count) {
                    // compute_lookup_term · compute_table_term at row i, reading only the four columns they use
                    const FF lookup_term = (w_r[i] * beta) + w_l[i] + gamma;
                    const FF table_term = (databus_id[i] * beta) + value_column[i] + gamma;
                    inverse_polynomial.at(i) = lookup_term * table_term;
                }
            };
            const size_t read_begin = std::max(row_begin, q_busread.start_index());
            const size_t read_end = std::min(row_end, q_busread.end_index());
            for (size_t i = read_begin; i < read_end; ++i) {
                compute_row(i);
            }
            const size_t count_begin = std::max(row_begin, read_counts.start_index());
            const size_t count_end = std::min(row_end, read_counts.end_index());
            for (size_t i = count_begin; i < count_end; ++i) {
                if (i < read_begin || i >= read_end) {
                    compute_row(i);
                }
            }

            // Invert the non-zero entries of the slice in place (zeroes are left as they are).
            std::vector<size_t> nonzero_indices;
            std::vector<FF> nonzero_values;
            for (size_t i = chunk_begin; i < chunk_end; ++i) {
                if (!inverse_polynomial[i].is_zero()) {
                    nonzero_indices.push_back(i);
                    nonzero_values.push_back(inverse_polynomial[i]);
                }
            }
            FF::batch_invert(nonzero_values);
            for (size_t k = 0; k < nonzero_indices.size(); ++k) {
                inverse_polynomial.at(nonzero_indices[k]) = nonzero_values[k];
            }
        });
    };

    /**
     * @brief Accumulate this column's four subrelation contributions.
     *   (1a) (I*L*T - 1) * is_read   = 0
     *   (1b) (I*L*T - 1) * count     = 0
     *   (2)  (is_read*T - count*L)*I = 0       (linearly dependent — summed across trace)
     *   (3)  (1 - indicator) * count = 0       (read_counts vanish outside the bus's data rows)
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor)
    {
        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto inverses_m = CoefficientAccumulator(in[InversesId]);
        const auto read_counts_m = CoefficientAccumulator(in[ReadCountsId]);

        if constexpr (IsProverAccumulator<Accumulator>) {
            // A row is typically either a read gate of this column or one of its data rows with a read count, so the
            // terms carrying the other (identically zero) factor are dropped.
            const auto q_busread_m = CoefficientAccumulator(in[AllEntities::EntityId::q_busread]);
            const auto column_selector_m = CoefficientAccumulator(in[SelectorId]);
            const bool is_read = !q_busread_m.is_zero() && !column_selector_m.is_zero();
            const bool has_read_counts = !read_counts_m.is_zero();

            const Accumulator inverses(inverses_m);
            const auto lookup_term = compute_lookup_term<Accumulator>(in, params);
            const auto table_term = compute_table_term<Accumulator>(in, params);
            // I·L·T − 1
            const auto common = lookup_term * table_term * inverses - FF(1);

            Accumulator tmp(0);
            if (is_read) {
                const auto read_selector_m = q_busread_m * column_selector_m;
                // (1a) (I·L·T − 1) · is_read
                std::get<0>(accumulator) += common * Accumulator(read_selector_m * scaling_factor);
                tmp = Accumulator(read_selector_m) * table_term;
            }
            if (has_read_counts) {
                // (1b) (I·L·T − 1) · count
                std::get<1>(accumulator) += common * Accumulator(read_counts_m * scaling_factor);
                tmp -= Accumulator(read_counts_m) * lookup_term;
                // (3) (1 − indicator) · count
                using ShortAccumulator = typename std::tuple_element_t<3, ContainerOverSubrelations>;
                const auto indicator_m = CoefficientAccumulator(in[IndicatorId]);
                const ShortAccumulator indicator_short(indicator_m);
                const ShortAccumulator read_counts_short(read_counts_m);
                std::get<3>(accumulator) += (read_counts_short - indicator_short * read_counts_short) * scaling_factor;
            }
            // (2) (is_read·T − count·L) · I
            tmp *= inverses;
            std::get<2>(accumulator) += tmp;
            return;
        }

        const Accumulator inverses(inverses_m);
        const Accumulator read_counts(read_counts_m);
        const auto lookup_term = compute_lookup_term<Accumulator>(in, params);
        const auto table_term = compute_table_term<Accumulator>(in, params);
        const auto read_selector = get_read_selector<Accumulator>(in);

        // Shared factor across (1a) and (1b): I·L·T − 1.
        const auto common = lookup_term * table_term * inverses - FF(1);

        // (1a) (I·L·T − 1) · is_read
        std::get<0>(accumulator) += (common * read_selector) * scaling_factor;
        // (1b) (I·L·T − 1) · count
        std::get<1>(accumulator) += (common * read_counts) * scaling_factor;
        // (2)  (is_read·T − count·L) · I — no scaling factor (linearly dependent).
        Accumulator tmp = read_selector * table_term;
        tmp -= read_counts * lookup_term;
        tmp *= inverses;
        std::get<2>(accumulator) += tmp;

        // (3) (1 − indicator) · count, in a length-3 accumulator.
        using ShortAccumulator = typename std::tuple_element_t<3, ContainerOverSubrelations>;
        const auto indicator_m = CoefficientAccumulator(in[IndicatorId]);
        const ShortAccumulator indicator_short(indicator_m);
        const ShortAccumulator read_counts_short(read_counts_m);
        std::get<3>(accumulator) += (read_counts_short - indicator_short * read_counts_short) * scaling_factor;
    }
};

template <typename FF, auto V, auto RC, auto IV, auto IND, auto SEL>
using SingleBusLookupRelation = Relation<SingleBusLookupRelationImpl<FF, V, RC, IV, IND, SEL>>;

} // namespace bb
