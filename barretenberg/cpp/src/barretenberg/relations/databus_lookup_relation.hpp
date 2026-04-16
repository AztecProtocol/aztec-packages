// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Log-derivative lookup argument relation for establishing DataBus reads
 *
 * @details Each column of the databus can be thought of as a table from which we can look up values. The log-derivative
 * lookup argument seeks to prove lookups from a column by establishing the following sum:
 *
 * \f[
 * \sum_{i=0}^{n-1} q_{\text{logderiv_lookup},i} \cdot \frac{1}{\text{lookup_term}_i} -
 *                                      \text{read_count}_i \cdot \frac{1}{\text{table_term}_i} = 0
 * \f]
 *
 * where the lookup and table terms are both of the form \f$\text{value}_i + \text{idx}_i \cdot \beta + \gamma\f$.
 * This expression is motivated by taking the derivative of the log of a more conventional grand product style set
 * equivalence argument (see e.g. https://eprint.iacr.org/2022/1530.pdf for details). For the table term, the
 * (idx, value) pair comes from the "table" (bus column), and for the lookup term the (idx, value) pair comes from
 * wires 1 and 2 which should contain a valid entry in the table.
 *
 * Each column of the DataBus requires its own set of subrelations. The column being read is selected via a unique
 * product, i.e. a lookup from bus column \f$j\f$ is selected via \f$q_{\text{busread}} \cdot q_j\f$ (j = 1,2,...).
 *
 * For each bus column j, the inverse polynomial \f$I_j\f$ stores \f$1/(L \cdot T_j)\f$ at active rows. Inverse
 * correctness is enforced by two separate subrelations gated by disjoint conditions:
 *
 * <b>Subrelation 1a (Inverse correctness on read rows):</b>
 * \f[ (I_j \cdot L \cdot T_j - 1) \cdot \text{is\_read}_j = 0 \f]
 *
 * <b>Subrelation 1b (Inverse correctness on write rows):</b>
 * \f[ (I_j \cdot L \cdot T_j - 1) \cdot \text{count}_j = 0 \f]
 *
 * <b>Subrelation 2 (Lookup identity):</b>
 * \f[
 * \sum_{i=0}^{n-1} [\text{is\_read}_j \cdot T_j - \text{count}_j \cdot L] \cdot I_j = 0
 * \f]
 *
 * At inactive rows
 * (is_read = 0, count = 0), neither (1a) nor (1b) constrains I, but the lookup identity contribution is
 * zero regardless. The prover gets no free degrees of freedom.
 *
 * @note Subrelation (2) is "linearly dependent" in the sense that it establishes that a sum across all rows of the
 * execution trace is zero, rather than that some expression holds independently at each row. Accordingly, this
 * subrelation is not multiplied by a scaling factor at each accumulation step.
 */
template <typename FF_> class DatabusLookupRelationImpl {
  public:
    using FF = FF_;
    static constexpr size_t NUM_BUS_COLUMNS = 3; // calldata, secondary calldata, return data
    // Note: All three subrelations use length 6 to make efficient use of shared computation. Shortening (1b)/(2) to
    // length 5 forces the shared factors (lookup_term, table_term, read_selector, inverses, `I*L*T - 1`) to be
    // recomputed and is a net loss in performance.
    static constexpr size_t INVERSE_READ_SUBREL_LENGTH = 6;  // deg 5: (I*L*T - 1) * is_read
    static constexpr size_t INVERSE_WRITE_SUBREL_LENGTH = 6; // deg 4: (I*L*T - 1) * count
    static constexpr size_t LOOKUP_SUBREL_LENGTH = 6;        // deg 4: (is_read*T - count*L) * I
    static constexpr size_t NUM_SUB_RELATION_PER_IDX = 3;    // the number of subrelations per bus column

    static constexpr std::array<size_t, NUM_SUB_RELATION_PER_IDX * NUM_BUS_COLUMNS> SUBRELATION_PARTIAL_LENGTHS{
        INVERSE_READ_SUBREL_LENGTH,  // inverse correctness on read rows (bus_idx 0)
        INVERSE_WRITE_SUBREL_LENGTH, // inverse correctness on write rows (bus_idx 0)
        LOOKUP_SUBREL_LENGTH,        // log-derivative lookup argument subrelation (bus_idx 0)
        INVERSE_READ_SUBREL_LENGTH,  // inverse correctness on read rows (bus_idx 1)
        INVERSE_WRITE_SUBREL_LENGTH, // inverse correctness on write rows (bus_idx 1)
        LOOKUP_SUBREL_LENGTH,        // log-derivative lookup argument subrelation (bus_idx 1)
        INVERSE_READ_SUBREL_LENGTH,  // inverse correctness on read rows (bus_idx 2)
        INVERSE_WRITE_SUBREL_LENGTH, // inverse correctness on write rows (bus_idx 2)
        LOOKUP_SUBREL_LENGTH,        // log-derivative lookup argument subrelation (bus_idx 2)
    };

    // Subrelations (1a) and (1b) are linearly independent (per-row). Subrelation (2) is linearly dependent (summed).
    static constexpr std::array<bool, NUM_SUB_RELATION_PER_IDX * NUM_BUS_COLUMNS> SUBRELATION_LINEARLY_INDEPENDENT = {
        true, true, false, true, true, false, true, true, false
    };

    template <typename AllEntities> inline static bool skip([[maybe_unused]] const AllEntities& in)
    {
        // Ensure the input does not contain a read gate or data that is being read
        return in.q_busread.is_zero() && in.calldata_read_counts.is_zero() &&
               in.secondary_calldata_read_counts.is_zero() && in.return_data_read_counts.is_zero();
    }

    // Interface for easy access of databus components by column (bus_idx)
    template <size_t bus_idx, typename AllEntities> struct BusData;

    // Specialization for calldata (bus_idx = 0)
    template <typename AllEntities> struct BusData</*bus_idx=*/0, AllEntities> {
        static auto& values(const AllEntities& in) { return in.calldata; }
        static auto& selector(const AllEntities& in) { return in.q_l; }
        static auto& inverses(AllEntities& in) { return in.calldata_inverses; }
        static auto& inverses(const AllEntities& in) { return in.calldata_inverses; } // const version
        static auto& read_counts(const AllEntities& in) { return in.calldata_read_counts; }
    };

    // Specialization for secondary_calldata (bus_idx = 1)
    template <typename AllEntities> struct BusData</*bus_idx=*/1, AllEntities> {
        static auto& values(const AllEntities& in) { return in.secondary_calldata; }
        static auto& selector(const AllEntities& in) { return in.q_r; }
        static auto& inverses(AllEntities& in) { return in.secondary_calldata_inverses; }
        static auto& inverses(const AllEntities& in) { return in.secondary_calldata_inverses; } // const version
        static auto& read_counts(const AllEntities& in) { return in.secondary_calldata_read_counts; }
    };

    // Specialization for return data (bus_idx = 2)
    template <typename AllEntities> struct BusData</*bus_idx=*/2, AllEntities> {
        static auto& values(const AllEntities& in) { return in.return_data; }
        static auto& selector(const AllEntities& in) { return in.q_o; }
        static auto& inverses(AllEntities& in) { return in.return_data_inverses; }
        static auto& inverses(const AllEntities& in) { return in.return_data_inverses; } // const version
        static auto& read_counts(const AllEntities& in) { return in.return_data_read_counts; }
    };

    /**
     * @brief Compute scalar for read term in log derivative lookup argument
     *
     * @details The selector indicating read from bus column \f$j\f$ is given by
     * \f$q_{\text{busread}} \cdot q_j\f$, where \f$j \in \{1, 2, 3\}\f$.
     *
     */
    template <typename Accumulator, size_t bus_idx, typename AllEntities>
    static Accumulator get_read_selector(const AllEntities& in)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        auto q_busread = CoefficientAccumulator(in.q_busread);
        auto column_selector = CoefficientAccumulator(BusData<bus_idx, AllEntities>::selector(in));

        //          degree    1                1           2 (2)
        return Accumulator(q_busread * column_selector);
    }

    /**
     * @brief Compute write term denominator in log derivative lookup argument
     *
     */
    template <typename Accumulator, size_t bus_idx, typename AllEntities, typename Parameters>
    static Accumulator compute_table_term(const AllEntities& in, const Parameters& params)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ParameterCoefficientAccumulator = typename Parameters::DataType::CoefficientAccumulator;

        const auto& id = CoefficientAccumulator(in.databus_id);
        const auto& value = CoefficientAccumulator(BusData<bus_idx, AllEntities>::values(in));
        const auto& gamma = ParameterCoefficientAccumulator(params.gamma);
        const auto& beta = ParameterCoefficientAccumulator(params.beta);

        // Construct value_i + idx_i*\beta + \gamma
        // degrees         1(0) 0(1)  1(1)       0(1)
        return Accumulator(id * beta + value + gamma); // degree 1 (1)
    }

    /**
     * @brief Compute read term denominator in log derivative lookup argument
     * @note No bus_idx required here since inputs to a read are of the same form regardless the bus column
     *
     */
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_lookup_term(const AllEntities& in, const Parameters& params)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ParameterCoefficientAccumulator = typename Parameters::DataType::CoefficientAccumulator;

        // Bus value stored in w_1, index into bus column stored in w_2
        const auto& w_1 = CoefficientAccumulator(in.w_l);
        const auto& w_2 = CoefficientAccumulator(in.w_r);
        const auto& gamma = ParameterCoefficientAccumulator(params.gamma);
        const auto& beta = ParameterCoefficientAccumulator(params.beta);

        // Construct value + index*\beta + \gamma
        return Accumulator((w_2 * beta) + w_1 + gamma); // degree 1 (2)
    }

    /**
     * @brief Construct the polynomial \f$I\f$ whose components are the inverse of the product of the read and write
     * terms
     *
     * @details If the denominators of log derivative lookup relation are lookup_term and table_term, then
     * \f$I_i = (\text{lookup_term}_i \cdot \text{table_term}_i)^{-1}\f$.
     *
     * @note Importantly, \f$I_i = 0\f$ for rows \f$i\f$ at which there is no read or write, so the cost of this method
     * is proportional to the actual databus usage.
     *
     */
    template <size_t bus_idx, typename Polynomials>
    static void compute_logderivative_inverse(Polynomials& polynomials,
                                              auto& relation_parameters,
                                              const size_t circuit_size)
    {
        BB_BENCH_NAME("Databus::compute_logderivative_inverse");
        auto& inverse_polynomial = BusData<bus_idx, Polynomials>::inverses(polynomials);

        size_t min_iterations_per_thread = 1 << 6; // min number of iterations for which we'll spin up a unique thread
        size_t num_threads = bb::calculate_num_threads(circuit_size, min_iterations_per_thread);

        parallel_for(num_threads, [&](ThreadChunk chunk) {
            bool is_read = false;
            bool nonzero_read_count = false;
            for (size_t i : chunk.range(circuit_size)) {
                // Determine if the present row contains a databus operation
                auto q_busread = polynomials.q_busread[i];
                if constexpr (bus_idx == 0) { // calldata
                    is_read = q_busread == 1 && polynomials.q_l[i] == 1;
                    nonzero_read_count = polynomials.calldata_read_counts[i] > 0;
                }
                if constexpr (bus_idx == 1) { // secondary_calldata
                    is_read = q_busread == 1 && polynomials.q_r[i] == 1;
                    nonzero_read_count = polynomials.secondary_calldata_read_counts[i] > 0;
                }
                if constexpr (bus_idx == 2) { // return data
                    is_read = q_busread == 1 && polynomials.q_o[i] == 1;
                    nonzero_read_count = polynomials.return_data_read_counts[i] > 0;
                }
                // We only compute the inverse if this row contains a read gate or data that has been read
                if (is_read || nonzero_read_count) {
                    // TODO(https://github.com/AztecProtocol/barretenberg/issues/940): avoid get_row if possible.
                    auto row = polynomials.get_row(i); // Note: this is a copy. use sparingly!
                    auto value = compute_lookup_term<FF>(row, relation_parameters) *
                                 compute_table_term<FF, bus_idx>(row, relation_parameters);
                    inverse_polynomial.at(i) = value;
                }
            }
        });

        // Compute inverse polynomial I in place by inverting the product at each row
        // Note: zeroes are ignored as they are not used anyway
        FF::batch_invert(inverse_polynomial.coeffs());
    };

    /**
     * @brief Accumulate the subrelation contributions for reads from a single databus column
     * @details Three subrelations are required per bus column:
     *   (1a) Inverse correctness on read rows: (I*L*T - 1) * is_read = 0
     *   (1b) Inverse correctness on write rows: (I*L*T - 1) * count = 0
     *   (2)  Lookup identity (linearly dependent): (is_read*T - count*L) * I = 0
     */
    template <typename FF,
              size_t bus_idx,
              typename ContainerOverSubrelations,
              typename AllEntities,
              typename Parameters>
    static void accumulate_subrelation_contributions(ContainerOverSubrelations& accumulator,
                                                     const AllEntities& in,
                                                     const Parameters& params,
                                                     const FF& scaling_factor)
    {
        // Subrelation indices for this bus column
        constexpr size_t subrel_idx_inv_read = NUM_SUB_RELATION_PER_IDX * bus_idx;      // (1a)
        constexpr size_t subrel_idx_inv_write = NUM_SUB_RELATION_PER_IDX * bus_idx + 1; // (1b)
        constexpr size_t subrel_idx_lookup = NUM_SUB_RELATION_PER_IDX * bus_idx + 2;    // (2)

        using Accumulator = typename std::tuple_element_t<subrel_idx_inv_read, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto inverses_m = CoefficientAccumulator(BusData<bus_idx, AllEntities>::inverses(in));
        const auto read_counts_m = CoefficientAccumulator(BusData<bus_idx, AllEntities>::read_counts(in));

        const Accumulator inverses(inverses_m);
        const Accumulator read_counts(read_counts_m);
        const auto lookup_term = compute_lookup_term<Accumulator>(in, params);
        const auto table_term = compute_table_term<Accumulator, bus_idx>(in, params);
        const auto read_selector = get_read_selector<Accumulator, bus_idx>(in);

        // Shared factor in (1a) and (1b): I*L*T - 1
        const auto common = lookup_term * table_term * inverses - FF(1);

        // (1a) Inverse correctness on read rows: (I*L*T - 1) * is_read = 0
        std::get<subrel_idx_inv_read>(accumulator) += (common * read_selector) * scaling_factor;

        // (1b) Inverse correctness on write rows: (I*L*T - 1) * count = 0
        std::get<subrel_idx_inv_write>(accumulator) += (common * read_counts) * scaling_factor;

        // (2) Lookup identity: (is_read*T - count*L) * I = 0.
        // No scaling factor here since this constraint is enforced across the entire trace, not per-row.
        Accumulator tmp = read_selector * table_term;
        tmp -= read_counts * lookup_term;
        tmp *= inverses;
        std::get<subrel_idx_lookup>(accumulator) += tmp;
    }

    /**
     * @brief Accumulate the log derivative databus lookup argument subrelation contributions for each databus column
     * @param accumulator transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Accumulator edges.
     * @param params contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor)
    {
        // Accumulate the subrelation contributions for each column of the databus
        bb::constexpr_for<0, NUM_BUS_COLUMNS, 1>([&]<size_t bus_idx>() {
            accumulate_subrelation_contributions<FF, bus_idx>(accumulator, in, params, scaling_factor);
        });
    }
};

template <typename FF> using DatabusLookupRelation = Relation<DatabusLookupRelationImpl<FF>>;

} // namespace bb
