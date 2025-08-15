// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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
 * @details Each column of the databus can be thought of as a table from which we can look up values. The log-derivative
 * lookup argument seeks to prove lookups from a column by establishing the following sum:
 *
 * \sum_{i=0}^{n-1} q_{logderiv_lookup}_i * (1 / write_term_i) + read_count_i * (1 / read_term_i) = 0
 *
 * where the read and write terms are both of the form value_i + idx_i*\beta + \gamma. This expression is motivated by
 * taking the derivative of the log of a more conventional grand product style set equivalence argument (see e.g.
 * https://eprint.iacr.org/2022/1530.pdf for details). For the write term, the (idx, value) pair comes from the "table"
 * (bus column), and for the read term the (idx, value) pair comes from wires 1 and 2 which should contain a valid entry
 * in the table. (Note: the meaning of "read" here is clear: the inputs are an (index, value) pair that we want to read
 * from the table. Here "write" refers to data that is present in the "table", i.e. the bus column. There is no gate
 * associated with a write, the data is simply populated in the corresponding column and committed to when constructing
 * a proof).
 *
 * In practice, we must rephrase this expression in terms of polynomials, one of which is a polynomial I containing
 * (indirectly) the rational functions in the above expression: I_i =  1/[(read_term_i) * (write_term_i)]. This leads to
 * two subrelations. The first demonstrates that the inverse polynomial I is correctly formed. The second is the primary
 * lookup identity, where the rational functions are replaced by the use of the inverse polynomial I. These two
 * subrelations can be expressed as follows:
 *
 *  (1) I_i * (read_term_i) * (write_term_i) - 1 = 0
 *
 *  (2) \sum_{i=0}^{n-1} [q_{logderiv_lookup} * I_i * write_term_i + read_count_i * I_i * read_term_i] = 0
 *
 * Each column of the DataBus requires its own pair of subrelations. The column being read is selected via a unique
 * product, i.e. a lookup from bus column j is selected via q_busread * q_j (j = 1,2,...).
 *
 * Note: that the latter subrelation is "linearly dependent" in the sense that it establishes that a sum across all
 * rows of the exectution trace is zero, rather than that some expression holds independently at each row. Accordingly,
 * this subrelation is not multiplied by a scaling factor at each accumulation step.
 *
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
    // the max degree of this subrelation is 4 in both the sumcheck and protogalaxy contexts because in the latter case
    // databus_id is always degree 0 when formed via interpolation across two instances
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

    static constexpr std::array<size_t, NUM_SUB_RELATION_PER_IDX * NUM_BUS_COLUMNS> TOTAL_LENGTH_ADJUSTMENTS{
        INVERSE_SUBREL_LENGTH_ADJUSTMENT,
        LOOKUP_SUBREL_LENGTH_ADJUSTMENT,
        READ_TAG_BOOLEAN_CHECK_SUBREL_LENGTH_ADJUSTMENT,
        INVERSE_SUBREL_LENGTH_ADJUSTMENT,
        LOOKUP_SUBREL_LENGTH_ADJUSTMENT,
        READ_TAG_BOOLEAN_CHECK_SUBREL_LENGTH_ADJUSTMENT,
        INVERSE_SUBREL_LENGTH_ADJUSTMENT,
        LOOKUP_SUBREL_LENGTH_ADJUSTMENT,
        READ_TAG_BOOLEAN_CHECK_SUBREL_LENGTH_ADJUSTMENT
    };

    static constexpr bool INVERSE_SUBREL_LIN_INDEPENDENT = true;         // to be satisfied independently at each row
    static constexpr bool LOOKUP_SUBREL_LIN_INDEPENDENT = false;         // to be satisfied as a sum across all rows
    static constexpr bool READ_TAG_BOOLEAN_CHECK_LIN_INDEPENDENT = true; // to be satisfied independently at each row

    // The lookup subrelations are "linearly dependent" in the sense that they establish the value of a sum across the
    // entire execution trace rather than a per-row identity.
    static constexpr std::array<bool, NUM_SUB_RELATION_PER_IDX* NUM_BUS_COLUMNS> SUBRELATION_LINEARLY_INDEPENDENT = {
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
     * @details This is needed for efficiency since we don't need to compute the inverse unless the log derivative
     * lookup relation is active at a given row.
     * @note read_counts is constructed such that read_count_i <= 1 and is thus treated as boolean.
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
        //         degree 2(2)   1             2 (2)        1       // Degree 3 (3)
        return is_read_gate + read_tag - (is_read_gate * read_tag); // Degree 3 (5)
    }

    /**
     * @brief Compute scalar for read term in log derivative lookup argument
     * @details The selector indicating read from bus column j is given by q_busread * q_j, j = 1,2,3
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
    static Accumulator compute_write_term(const AllEntities& in, const Parameters& params)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using ParameterCoefficientAccumulator =
            typename GetParameterView<Parameters, typename Accumulator::View>::CoefficientAccumulator;

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
    static Accumulator compute_read_term(const AllEntities& in, const Parameters& params)
    {
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;
        using View = typename Accumulator::View;
        using ParameterView = GetParameterView<Parameters, View>;
        using ParameterCoefficientAccumulator = typename ParameterView::CoefficientAccumulator;

        // Bus value stored in w_1, index into bus column stored in w_2
        const auto& w_1 = CoefficientAccumulator(in.w_l);
        const auto& w_2 = CoefficientAccumulator(in.w_r);
        const auto& gamma = ParameterCoefficientAccumulator(params.gamma);
        const auto& beta = ParameterCoefficientAccumulator(params.beta);

        // Construct value + index*\beta + \gamma
        return Accumulator((w_2 * beta) + w_1 + gamma); // degree 1 (2)
    }

    /**
     * @brief Construct the polynomial I whose components are the inverse of the product of the read and write terms
     * @details If the denominators of log derivative lookup relation are read_term and write_term, then I_i =
     * (read_term_i*write_term_i)^{-1}.
     * @note Importantly, I_i = 0 for rows i at which there is no read or write, so the cost of this method is
     * proportional to the actual databus usage.
     *
     */
    template <size_t bus_idx, typename Polynomials>
    static void compute_logderivative_inverse(Polynomials& polynomials,
                                              auto& relation_parameters,
                                              const size_t circuit_size)
    {
        PROFILE_THIS_NAME("Databus::compute_logderivative_inverse");
        auto& inverse_polynomial = BusData<bus_idx, Polynomials>::inverses(polynomials);

        size_t min_iterations_per_thread = 1 << 6; // min number of iterations for which we'll spin up a unique thread
        size_t num_threads = bb::calculate_num_threads_pow2(circuit_size, min_iterations_per_thread);
        size_t iterations_per_thread = circuit_size / num_threads; // actual iterations per thread

        parallel_for(num_threads, [&](size_t thread_idx) {
            size_t start = thread_idx * iterations_per_thread;
            size_t end = (thread_idx + 1) * iterations_per_thread;
            bool is_read = false;
            bool nonzero_read_count = false;
            for (size_t i = start; i < end; ++i) {
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
                    auto value = compute_read_term<FF>(row, relation_parameters) *
                                 compute_write_term<FF, bus_idx>(row, relation_parameters);
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
     * @details Two subrelations are required per bus column, one to establish correctness of the precomputed inverses
     * and one to establish the validity of the read.
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
        const auto read_term = compute_read_term<Accumulator>(in, params);            // Degree 1 (2)
        const auto write_term = compute_write_term<Accumulator, bus_idx>(in, params); // Degree 1 (1)
        const auto inverse_exists = compute_inverse_exists<Accumulator, bus_idx>(in); // Degree 3 (3)
        const auto read_selector = get_read_selector<Accumulator, bus_idx>(in);       // Degree 2 (2)

        // Determine which pair of subrelations to update based on which bus column is being read
        constexpr size_t subrel_idx_1 = NUM_SUB_RELATION_PER_IDX * bus_idx;
        constexpr size_t subrel_idx_2 = NUM_SUB_RELATION_PER_IDX * bus_idx + 1;
        // the subrelation index for checking the read_tag is boolean
        constexpr size_t subrel_idx_3 = NUM_SUB_RELATION_PER_IDX * bus_idx + 2;

        // Establish the correctness of the polynomial of inverses I. Note: inverses is computed so that the value
        // is 0 if !inverse_exists. Degree 3 (4)
        // degrees            3(4)    =            1(2)         1(1)       1(1)           3(3)
        std::get<subrel_idx_1>(accumulator) += (read_term * write_term * inverses - inverse_exists) * scaling_factor;

        // Establish validity of the read. Note: no scaling factor here since this constraint is enforced across the
        // entire trace, not on a per-row basis.

        // degree  3(3)   =    2(2)          1(1)
        Accumulator tmp = read_selector * write_term;
        // degree 2(3) =        1(1)         1(2)
        tmp -= Accumulator(read_counts_m) * read_term;
        // degree 1(1)
        tmp *= inverses;
        std::get<subrel_idx_2>(accumulator) += tmp; // Deg 4 (4)

        const auto read_tag_m = CoefficientAccumulator(BusData<bus_idx, AllEntities>::read_tags(in));
        const auto read_tag = ShortAccumulator(read_tag_m);
        // // this is done by row so we have to multiply by the scaling factor
        // degree                                  1(1)       1(1)       1(1)      =      2(2)
        std::get<subrel_idx_3>(accumulator) += (read_tag * read_tag - read_tag) * scaling_factor;
    }

    /**
     * @brief Accumulate the log derivative databus lookup argument subrelation contributions for each databus column
     * @details Each databus column requires three subrelations. the last relation is to make sure that the read_tag is
     * a boolean value. check the logderiv_lookup_relation.hpp for more details.
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
