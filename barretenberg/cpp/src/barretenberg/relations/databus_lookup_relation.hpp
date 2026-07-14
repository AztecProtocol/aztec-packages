// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <array>
#include <tuple>

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
        // Skip when the row is not a read gate AND has no read counts on this column.
        return in[AllEntities::EntityId::q_busread].is_zero() && in[ReadCountsId].is_zero();
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

        const size_t num_rows = circuit_size - start_index;
        size_t min_iterations_per_thread = 1 << 6;
        size_t num_threads = bb::calculate_num_threads(num_rows, min_iterations_per_thread);

        parallel_for(num_threads, [&](ThreadChunk chunk) {
            BB_BENCH_TRACY_NAME("Databus::compute_inverses/chunk");
            for (size_t j : chunk.range(num_rows)) {
                size_t i = j + start_index;
                const bool is_read = polynomials.q_busread()[i] == 1 && column_selector[i] == 1;
                const bool nonzero_read_count = read_counts[i] > 0;
                if (is_read || nonzero_read_count) {
                    // TODO(https://github.com/AztecProtocol/barretenberg/issues/940): avoid get_row if possible.
                    auto row = polynomials.get_row(i);
                    auto value = compute_lookup_term<FF>(row, relation_parameters) *
                                 compute_table_term<FF>(row, relation_parameters);
                    inverse_polynomial.at(i) = value;
                }
            }
        });

        FF::batch_invert(inverse_polynomial.coeffs());
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
