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
 * In practice, we must rephrase this expression in terms of polynomials, one of which is a polynomial \f$I\f$
 * containing (indirectly) the rational functions in the above expression:
 * \f$I_i = 1/[(\text{lookup_term}_i) \cdot (\text{table_term}_i)]\f$. This leads to two subrelations. The first
 * demonstrates that the inverse polynomial \f$I\f$ is correctly formed. The second is the primary lookup identity,
 * where the rational functions are replaced by the use of the inverse polynomial \f$I\f$. These two subrelations can
 * be expressed as follows:
 *
 * <b>Subrelation 1 (Inverse correctness):</b>
 * \f[
 * I_i \cdot (\text{lookup_term}_i) \cdot (\text{table_term}_i) - 1 = 0
 * \f]
 *
 * In reality this relation is \f$I_i \cdot (\text{lookup_term}_i) \cdot (\text{table_term}_i) -
 * \text{inverse_exists} = 0\f$, i.e. it is only checked for active gates (more explanation below).
 *
 * <b>Subrelation 2 (Lookup identity):</b>
 * \f[
 * \sum_{i=0}^{n-1} [q_{\text{logderiv_lookup}} \cdot I_i \cdot \text{table_term}_i -
 *                                  \text{read_count}_i \cdot I_i \cdot \text{lookup_term}_i] = 0
 * \f]
 *
 * Each column of the DataBus requires its own pair of subrelations. The column being read is selected via a unique
 * product, i.e. a lookup from bus column \f$j\f$ is selected via \f$q_{\text{busread}} \cdot q_j\f$ (j = 1,2,...).
 *
 * To not compute the inverse terms packed in \f$I_i\f$ for indices not included in the sum we introduce a
 * witness called inverse_exists, which is zero when either \f$\text{read_count}_i\f$ is nonzero (a boolean called
 * read_tag) or we have a read gate. This is represented by setting \f$\text{inverse_exists} = 1 - (1 -
 * \text{read_tag}) \cdot (1 - \text{is_read_gate})\f$. Since read_gate is only dependent on selector values, we can
 * assume that the verifier can check that it is boolean. However, if read_tag (which is a derived witness), is not
 * constrained to be boolean, one can set the inverse_exists to any value when is_read_gate = 0, because
 * inverse_exists is a linear function of read_tag then. Thus we have a third subrelation, that ensures that read_tag
 * is a boolean value.
 *
 * <b>Subrelation 3 (Boolean check):</b>
 * \f[
 *  \text{read_tag} \cdot \text{read_tag} - \text{read_tag} = 0
 * \f]
 *
 * @note Subrelation (2) is "linearly dependent" in the sense that it establishes that a sum across all rows of the
 * execution trace is zero, rather than that some expression holds independently at each row. Accordingly, this
 * subrelation is not multiplied by a scaling factor at each accumulation step.
 */
template <typename FF_> class DatabusLookupRelationImpl {
  public:
    using FF = FF_;
    static constexpr size_t NUM_BUS_COLUMNS = 3; // calldata, return data
    // the actual degree of this subrelation is 3, and requires a degree adjustment of 1.
    // however as we reuse the accumulators used to compute this subrelation for the lookup subrelation, we set the
    // degree to 4 which removes the need of having degree adjustments for folding.
    static constexpr size_t INVERSE_SUBREL_LENGTH = 5; // deg + 1 of inverse correctness subrelation
    static constexpr size_t INVERSE_SUBREL_LENGTH_ADJUSTMENT = 0;
    // the max degree of this subrelation is 4
    static constexpr size_t LOOKUP_SUBREL_LENGTH = 5; // deg + 1 of log-deriv lookup subrelation
    static constexpr size_t LOOKUP_SUBREL_LENGTH_ADJUSTMENT = 0;
    static constexpr size_t READ_TAG_BOOLEAN_CHECK_SUBREL_LENGTH =
        3; // deg + 1 of the relation checking that read_tag_m is a boolean value
    static constexpr size_t READ_TAG_BOOLEAN_CHECK_SUBREL_LENGTH_ADJUSTMENT = 0;
    static constexpr size_t NUM_SUB_RELATION_PER_IDX = 3; // the number of subrelations per bus column

    static constexpr std::array<size_t, NUM_SUB_RELATION_PER_IDX * NUM_BUS_COLUMNS> SUBRELATION_PARTIAL_LENGTHS{
        INVERSE_SUBREL_LENGTH,                // inverse polynomial correctness subrelation (bus_idx 0)
        LOOKUP_SUBREL_LENGTH,                 // log-derivative lookup argument subrelation (bus_idx 0)
        READ_TAG_BOOLEAN_CHECK_SUBREL_LENGTH, // read_tag_m* read_tag_m - read_tag_m (bus_idx 0)
        INVERSE_SUBREL_LENGTH,                // inverse polynomial correctness subrelation (bus_idx 1)
        LOOKUP_SUBREL_LENGTH,                 // log-derivative lookup argument subrelation (bus_idx 1)
        READ_TAG_BOOLEAN_CHECK_SUBREL_LENGTH, // read_tag_m* read_tag_m - read_tag_m (bus_idx 1)
        INVERSE_SUBREL_LENGTH,                // inverse polynomial correctness subrelation (bus_idx 2)
        LOOKUP_SUBREL_LENGTH,                 // log-derivative lookup argument subrelation (bus_idx 2)
        READ_TAG_BOOLEAN_CHECK_SUBREL_LENGTH, // read_tag_m* read_tag_m - read_tag_m (bus_idx 2)
    };

    static constexpr bool INVERSE_SUBREL_LIN_INDEPENDENT = true;         // to be satisfied independently at each row
    static constexpr bool LOOKUP_SUBREL_LIN_INDEPENDENT = false;         // to be satisfied as a sum across all rows
    static constexpr bool READ_TAG_BOOLEAN_CHECK_LIN_INDEPENDENT = true; // to be satisfied independently at each row

    // The lookup subrelations are "linearly dependent" in the sense that they establish the value of a sum across the
    // entire execution trace rather than a per-row identity.
    static constexpr std::array<bool, NUM_SUB_RELATION_PER_IDX * NUM_BUS_COLUMNS> SUBRELATION_LINEARLY_INDEPENDENT = {
        INVERSE_SUBREL_LIN_INDEPENDENT, LOOKUP_SUBREL_LIN_INDEPENDENT, READ_TAG_BOOLEAN_CHECK_LIN_INDEPENDENT,
        INVERSE_SUBREL_LIN_INDEPENDENT, LOOKUP_SUBREL_LIN_INDEPENDENT, READ_TAG_BOOLEAN_CHECK_LIN_INDEPENDENT,
        INVERSE_SUBREL_LIN_INDEPENDENT, LOOKUP_SUBREL_LIN_INDEPENDENT, READ_TAG_BOOLEAN_CHECK_LIN_INDEPENDENT
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
        static auto& read_tags(const AllEntities& in) { return in.calldata_read_tags; }
    };

    // Specialization for secondary_calldata (bus_idx = 1)
    template <typename AllEntities> struct BusData</*bus_idx=*/1, AllEntities> {
        static auto& values(const AllEntities& in) { return in.secondary_calldata; }
        static auto& selector(const AllEntities& in) { return in.q_r; }
        static auto& inverses(AllEntities& in) { return in.secondary_calldata_inverses; }
        static auto& inverses(const AllEntities& in) { return in.secondary_calldata_inverses; } // const version
        static auto& read_counts(const AllEntities& in) { return in.secondary_calldata_read_counts; }
        static auto& read_tags(const AllEntities& in) { return in.secondary_calldata_read_tags; }
    };

    // Specialization for return data (bus_idx = 2)
    template <typename AllEntities> struct BusData</*bus_idx=*/2, AllEntities> {
        static auto& values(const AllEntities& in) { return in.return_data; }
        static auto& selector(const AllEntities& in) { return in.q_o; }
        static auto& inverses(AllEntities& in) { return in.return_data_inverses; }
        static auto& inverses(const AllEntities& in) { return in.return_data_inverses; } // const version
        static auto& read_counts(const AllEntities& in) { return in.return_data_read_counts; }
        static auto& read_tags(const AllEntities& in) { return in.return_data_read_tags; }
    };

    /**
     * @brief Determine whether the inverse I needs to be computed at a given row for a given bus column
     * @details The value of the inverse polynomial I(X) only needs to be computed when the databus lookup gate is
     * "active". Otherwise it is set to 0. This method allows for determination of when the inverse should be computed.
     *
     * @tparam AllValues
     * @param row
     */
    template <size_t bus_idx, typename AllValues> static bool operation_exists_at_row(const AllValues& row)
    {
        auto read_selector = get_read_selector<FF, bus_idx>(row);
        auto read_tag = BusData<bus_idx, AllValues>::read_tags(row);
        return (read_selector == 1 || read_tag == 1);
    }

    /**
     * @brief Compute the Accumulator whose values indicate whether the inverse is computed or not
     *
     * @details This is needed for efficiency since we don't need to compute the inverse unless the log derivative
     * lookup relation is active at a given row. We skip the inverse computation for all the rows that
     * \f$\text{read_count}_i = 0\f$ AND \f$\text{read_selector}$ is 0.
     *
     * @note \f$\text{read_tag}\f$ is constructed such that \f$\text{read_tag}_i \in \{0, 1\}\f$. We add a subrelation
     * to check that \f$\text{read_tag}$ is a boolean value.
     *
     */
    template <typename Accumulator, size_t bus_idx, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        const auto is_read_gate = get_read_selector<Accumulator, bus_idx>(in); // is this a read gate
        const auto read_tag_m =
            CoefficientAccumulator(BusData<bus_idx, AllEntities>::read_tags(in)); // does row contain data being read
        const Accumulator read_tag(read_tag_m);
        // Relation checking: is_read_gate == 1 || read_tag == 1
        // Important note: the relation written below assumes that is_read_gate and read_tag are boolean values, which
        // is guaranteed by the boolean_check subrelation. If not, fixing one of the two, the return value is a linear
        // function in the other variable and can be set to an arbitrary value independent of the fixed value. See the
        // boolean_check subrelation for more explanation.
        //         degree 2(2)   1             2 (2)        1       // Degree 3 (3)
        return is_read_gate + read_tag - (is_read_gate * read_tag); // Degree 3 (5)
    }

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
     * @details Three subrelations are required per bus column, one to establish correctness of the precomputed
     * inverses, one to establish the validity of the read, and one to ensure read_tags is a boolean value
     *
     * @param accumulator
     * @param in
     * @param params
     * @param scaling_factor
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
        using Accumulator = typename std::tuple_element_t<4, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ShortAccumulator = std::tuple_element_t<2, ContainerOverSubrelations>;
        const auto inverses_m = CoefficientAccumulator(BusData<bus_idx, AllEntities>::inverses(in)); // Degree 1
        Accumulator inverses(inverses_m);
        const auto read_counts_m = CoefficientAccumulator(BusData<bus_idx, AllEntities>::read_counts(in)); // Degree 1
        const auto lookup_term = compute_lookup_term<Accumulator>(in, params);                             // Degree 1
        const auto table_term = compute_table_term<Accumulator, bus_idx>(in, params);                      // Degree 1
        const auto inverse_exists = compute_inverse_exists<Accumulator, bus_idx>(in);                      // Degree 3
        const auto read_selector = get_read_selector<Accumulator, bus_idx>(in);                            // Degree 2

        // Determine which pair of subrelations to update based on which bus column is being read
        // The inverse relation subrelation index
        constexpr size_t subrel_idx_1 = NUM_SUB_RELATION_PER_IDX * bus_idx;
        // The lookup relation subrelation index
        constexpr size_t subrel_idx_2 = NUM_SUB_RELATION_PER_IDX * bus_idx + 1;
        // The read_tag boolean check subrelation index
        constexpr size_t subrel_idx_3 = NUM_SUB_RELATION_PER_IDX * bus_idx + 2;

        // Establish the correctness of the polynomial of inverses I. Note: inverses is computed so that the value
        // is 0 if !inverse_exists. Degree 3
        // degrees            3    =              1           1              1           3
        std::get<subrel_idx_1>(accumulator) += (lookup_term * table_term * inverses - inverse_exists) * scaling_factor;

        // Establish validity of the read. Note: no scaling factor here since this constraint is enforced across the
        // entire trace, not on a per-row basis.

        // degree  3   =         2          1
        Accumulator tmp = read_selector * table_term;
        // degree 2 =             1           1
        tmp -= Accumulator(read_counts_m) * lookup_term;
        // degree 1
        tmp *= inverses;
        std::get<subrel_idx_2>(accumulator) += tmp; // Deg 4 (4)

        const auto read_tag_m = CoefficientAccumulator(BusData<bus_idx, AllEntities>::read_tags(in));
        const auto read_tag = ShortAccumulator(read_tag_m);
        // // this is done by row so we have to multiply by the scaling factor
        // degree                                    1        1            1      =      2
        std::get<subrel_idx_3>(accumulator) += (read_tag * read_tag - read_tag) * scaling_factor;
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
