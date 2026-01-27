// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/**
 * TODO(@Rumata888): Talk to Zac why "lookup_read_count" refers to the count of the looked up element in the multiset.
 * (The value is applied to the write predicate, so it is confusing).
 */
#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

// clang-format off
/**
 *
 * @brief Generic implementation of a log-derivative based lookup relation
 *
 * @details The following is a generic implementation of a log-derivative based lookup relation that allows the
 * implementor to highly customize the lookup operations performed. For ease of use, the struct implements a
 * default lookup argument with column batching, see below for more details.
 *
 * The implementor is expected to provide two template parameters:
 *  - FF_: the base field over which the relation is defined
 *  - Settings: a struct that defines parameters and methods that allow the customization of the lookup relation.
 *
 * Write f_1, .., f_n for the columns to be looked up, and t_1, .., t_m for the table columns. The relation implements
 * the log-derivative lookup argument for two cases:
 *  - BASIC_LOOKUP/BASIC_TABLE: LOOKUP_SIZE := n = m and we wish to look up the multiset {(f_1(x), .., f_n(x)) : x \in
 *                              H_N}, where H_N is the hypercube of size N, from the table {(t_1(y), .., t_n(y)) : y \in
 *                              H_M}. In this case, we perform the lookup by batching together the f_i's and the t_i's:
 *                              we define f(x) = \sum_i f_i * Y^i, t(x) = \sum_i t_i * Y^i, and we check the existence
 *                              of a function \f$counts : B_N \rightarrow\f$ F such that
 *                              \f[
 *                                  \sum_{x \in H_N} \frac{1}{\gamma - f(x, \beta)} = \sum_{y \in H_M} \frac{counts(y)}{\gamma - t(y, \beta)}
 *                              \f]
 * - CUSTOMIZED_LOOKUP/CUSTOMIZED_TABLE: We allow looking up values that are computed arbitrarily from {f_1, .., f_n}
 *                                       from values that are computed arbitrarily (and possibly in a different way) from {t_1, .., t_m}.
 *
 * In both cases, we rephrase the equation check in terms of two relations:
 *  1) \f[ I(x) * \prod_{i=1}^{NUM_LOOKUPS_IN_ONE_ROW} lookup_entry(x) \cdot \prod_{i=0}^{NUM_TABLE_COLUMNS} table_entry(x) - inverse_exists(x) = 0 \f]
 *  2) \f[ \sum_{i=0}^{NUM_LOOKUPS_IN_ONE_ROW} lookup_entry_predicate_i(x) * 1 / lookup_entry(x)
 *                                              - \sum_{i=0}^{NUM_TABLE_COLUMNS} table_entry_predicate_i(x) * lookup_read_count_i(x) * 1 / table_entry(x) \f]
 *
 * Relation 1) ensures that the polynomial \f$I\f$ represent the inverse of the product of the entries to be looked up and the table entries.
 * As this polynomial doesn't need to be defined everywhere, we set the result of the multiplication to be equal to the value of another
 * polynomial: inverse_exist, which is set to 1 only if the inverse must be computed. Note that relation 1) is *independent*: it must be satisfied
 * at every row in the trace.
 *
 * Relation 2) is a *dependent* relation, it is satisfied only when its values are summed over the entire trace. The result of the sum is the log-derivative
 * expression that bear witness to the validity of the lookup. Note that the lookup and table entries are multiplied by predicates that enable specifying which table
 * lookup/table entries the prover is allowed to use at any given row.
 *
 * The degrees of the above relations are:
 * 1) The degree of relation 1) is MAX(1 + max(deg(lookup_entries)) + max(deg(table_entries)), deg(inverse_exists))
 * 2) The degree of relation 2) is 2 + NUM_LOOKUPS_IN_ONE_ROW + NUM_TABLE_COLUMNS. This is because we compute the inverses as:
 *    \f[
 *          1 / table_entry(x) = I(x) * \prod_{j \neq i} table_entry_j(x) * \prod_{i} lookup_entry_i(x)
 *    \f]
 *    whose degree is 1 + NUM_LOOKUPS_IN_ONE_ROW + NUM_TABLE_COLUMNS - 1.
 *
 * // OLD STUFF ========================================================================================
 * @details Lookup is a mechanism to ensure that a particular value or tuple of values (these can be values of
 * witnesses, selectors or a function of these) is contained within a particular set. It is a relative of set
 * permutation, but has a one-to-many relationship beween elements that are being looked up and the table of values they
 * are being looked up from. In this relation template we use the following terminology:
 * + READ - the action of looking up the value in the table
 * + WRITE - the action of adding the value to the lookup table
 *
 */
// clang-format on
template <typename Settings, typename FF_> class GenericLookupRelationImpl {
  public:
    using FF = FF_;

    /**
     * We allow looking up multiple items per row from a variable number of table columns. Both these values are
     * specified in Settings and are not bound to the real number of columns the lookup operates on. We allow looking up
     * virtual columns (i.e., combinations of columns) from virtual table columns (i.e., combinations of table columns).
     *
     */
    static constexpr size_t NUM_LOOKUPS_IN_ONE_ROW = Settings::READ_TERMS;
    static constexpr size_t NUM_TABLE_COLUMNS = Settings::WRITE_TERMS;

    /**
     * Write f_1, .., f_n for the values at a row i the columns we wish to look up, and t_1, .., t_m for table
     * columns. We allow two types of lookups:
     *  - BASIC_LOOKUP/BASIC_TABLE: Looking up a subset S_f \subset {f_1, .., f_n} from a subset S_t \subset {t_1, ..,
     *                              t_m}
     *  - CUSTOMIZED_LOOKUP/CUSTOMIZED_TABLE: Looking up values that are computed arbitrarily from {f_1, .., f_n} from
     *                                        values that are computed arbitrarily (and possibly in a different way)
     *                                        from {t_1, .., t_m}
     *
     */
    enum LOOKUP_TYPE { BASIC_LOOKUP, CUSTOMIZED_LOOKUP };
    enum TABLE_TYPE { BASIC_TABLE, CUSTOMIZED_TABLE };

    /**
     * When performing a basic lookup, we batch columns for efficiency. This constant represents the number of columns
     * to be batched together. For example, it would be 1 for a range constraint lookup, 3 for a XOR lookup.
     *
     */
    static constexpr size_t LOOKUP_SIZE = Settings::LOOKUP_SIZE;

    /**
     * @brief Compute the degree of of the product of lookup terms
     *
     */
    static constexpr size_t compute_lookup_term_product_degree()
    {
        size_t accumulated_degree = 0;
        for (size_t i = 0; i < NUM_LOOKUPS_IN_ONE_ROW; i++) {
            size_t current_degree = 0;
            switch (Settings::LOOKUP_TYPES[i]) {
            case BASIC_LOOKUP:
                current_degree = 1;
                break;
            case CUSTOMIZED_LOOKUP:
                current_degree = Settings::LOOKUP_TERM_DEGREES[i];
                break;
            default:
                bb::assert_failure("Invalid lookup type");
            }
            accumulated_degree += current_degree;
        }
        return accumulated_degree;
    }

    /**
     * @brief Compute the degree of of the product of table terms
     *
     */
    static constexpr size_t compute_table_term_product_degree()
    {
        size_t accumulated_degree = 0;
        for (size_t i = 0; i < NUM_TABLE_COLUMNS; i++) {
            size_t current_degree = 0;
            switch (Settings::TABLE_TYPES[i]) {
            case BASIC_TABLE:
                current_degree = 1;
                break;
            case CUSTOMIZED_TABLE:
                current_degree = Settings::TABLE_TERM_DEGREES[i];
                break;
            default:
                break;
            }
            accumulated_degree += current_degree;
        }
        return accumulated_degree;
    }

    // (Sub)relation lengths: equal to 1 + relation degree
    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        std::max((compute_lookup_term_product_degree() + compute_table_term_product_degree() + 1),
                 Settings::INVERSE_EXISTS_POLYNOMIAL_DEGREE) +
            1,                                         // inverse polynomial correctness sub-relation
        NUM_LOOKUPS_IN_ONE_ROW + NUM_TABLE_COLUMNS + 3 // log-derived terms subrelation
    };

    // The first subrelation must be satisfied at every row.
    // The second subrelation must be satisfied when summed across the entire trace
    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, false };

    /**
     * The implementor must provide methods get_const_entities and get_nonconst_entities via Settings that return the
     * polynomials required for the lookup argument. These polynomials have a structure that is in part fixed and in
     * part variable:
     * ====== FIXED PART ======
     *  1) The first polynomial is the inverse polynomial
     *  2) Next we have NUM_TABLE_COLUMNS polynomials representing the lookup read counts, i.e., how many times each
     *     table term has been read
     *  3) Next we have NUM_LOOKUPS_IN_ONE_ROW polynomials representing the lookup term predicates, which toggle
     *     whether a lookup term can be looked up in this row or not
     *  4) Next we have NUM_TABLE_COLUMNS polynomials representing the table term predicates, which toggle whether a
     *     table term can be looked up in this row or not
     * ====== VARIABLE PART ======
     *  5) For each lookup term, we have a variable number of polynomials depending on the type of lookup:
     *     - BASIC_LOOKUP: LOOKUP_SIZE polynomials representing the columns being looked up (and that will be batched)
     *     - CUSTOMIZED_LOOKUP: No additional polynomials are required, as the logic is fully specified in Settings
     *  6) For each table term, we have a variable number of polynomials depending on the type of table:
     *     - BASIC_TABLE: LOOKUP_SIZE polynomials representing the table columns (and that will be batched)
     *     - CUSTOMIZED_TABLE: No additional polynomials are required, as the logic is fully specified in Settings
     */
    static constexpr size_t INVERSE_POLYNOMIAL_INDEX = 0;
    static constexpr size_t LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX = 1;
    static constexpr size_t LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX + NUM_TABLE_COLUMNS;
    static constexpr size_t TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX + NUM_LOOKUPS_IN_ONE_ROW;
    static constexpr size_t LOOKUP_TERM_START_POLYNOMIAL_INDEX =
        TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX + NUM_TABLE_COLUMNS;

    /**
     * @brief Check if we need to compute the inverse polynomial element value for this row
     *
     * @param row All values at row
     */
    template <typename AllValues> static bool operation_exists_at_row(const AllValues& row)
    {
        return Settings::inverse_polynomial_is_computed_at_row(row);
    }

    /**
     * @brief Get the inverse permutation polynomial
     *
     * @details This method needs to return a non-const reference because it's used to compute the value of the inverse
     * polynomial
     *
     */
    template <typename AllEntities> static auto& get_inverse_polynomial(AllEntities& in)
    {
        return std::get<INVERSE_POLYNOMIAL_INDEX>(Settings::get_nonconst_entities(in));
    }

    /**
     * @brief Get selector/wire switching on(1) or off(0) inverse computation
     *
     */
    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        // A lookup could be enabled by one of several selectors or witnesses, so we want to give as much freedom as
        // possible to the implementor
        return Settings::template compute_inverse_exists<Accumulator>(in);
    }

    /**
     * @brief Returns the number of times a particular table value has been looked up
     *
     * @details We assume lookup read counts are independent columns and therefore do not allow customization of this
     * method to the implementor.
     *
     */
    template <typename Accumulator, size_t index, typename AllEntities>
    static Accumulator lookup_read_counts(const AllEntities& in)
    {

        static_assert(index < NUM_TABLE_COLUMNS);
        using View = typename Accumulator::View;

        return Accumulator(
            View(std::get<LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX + index>(Settings::get_const_entities(in))));
    }

    /**
     * @brief Compute if the value from the first set exists in this row
     *
     * @tparam read_index Kept for compatibility with lookups, behavior doesn't change
     */
    template <typename Accumulator, size_t read_index, typename AllEntities>
    static Accumulator compute_read_term_predicate(const AllEntities& in)

    {
        static_assert(read_index < READ_TERMS);
        using View = typename Accumulator::View;

        // The selector/wire value that determines that an element from the first set needs to be included. Can be
        // different from the wire used in the write part.
        return Accumulator(View(std::get<LOOKUP_READ_TERM_PREDICATE_START_POLYNOMIAL_INDEX + read_index>(
            Settings::get_const_entities(in))));
    }

    /**
     * @brief Compute if the value from the second set exists in this row
     *
     * @tparam write_index Kept for compatibility with lookups, behavior doesn't change
     */
    template <typename Accumulator, size_t write_index, typename AllEntities>
    static Accumulator compute_write_term_predicate(const AllEntities& in)
    {

        static_assert(write_index < WRITE_TERMS);
        using View = typename Accumulator::View;

        // The selector/wire value that determines that an element from the first set needs to be included. Can be
        // different from the wire used in the write part.
        return Accumulator(View(std::get<LOOKUP_WRITE_TERM_PREDICATE_START_POLYNOMIAL_INDEX + write_index>(
            Settings::get_const_entities(in))));
    }

    /**
     * @brief Compute where the polynomials defining a particular read term are located
     *
     * @details We pass polynomials involved in read an write terms from settings as a tuple of references. However,
     * depending on the type of read term different number of polynomials can be used to compute it. So we need to
     * compute the offset in the tuple iteratively
     *
     * @param read_index Index of the read term
     * @return constexpr size_t
     */
    static constexpr size_t compute_read_term_polynomial_offset(size_t read_index)
    {
        // If it's the starting index, then there is nothing to compute, just get the starting index
        if (read_index == 0) {
            return LOOKUP_READ_PREDICATE_START_POLYNOMIAL_INDEX;
        }

        // If the previous term used basic tuple lookup, add lookup tuple size (it was using just a linear combination
        // of polynomials)
        if (Settings::READ_TERM_TYPES[read_index - 1] == READ_BASIC_TUPLE) {
            return compute_read_term_polynomial_offset(read_index - 1) + LOOKUP_TUPLE_SIZE;
        }

        // If the previous term used scaled tuple lookup, add lookup tuple size x 3 (it was using just a linear
        // combination of differences (current - previous⋅scale))

        if (Settings::READ_TERM_TYPES[read_index - 1] == READ_SCALED_TUPLE) {
            return compute_read_term_polynomial_offset(read_index - 1) + 3 * LOOKUP_TUPLE_SIZE;
        }
        // In case of arbitrary read term, no polynomials from the tuple are being used
        if (Settings::READ_TERM_TYPES[read_index - 1] == READ_ARBITRARY) {
            return compute_read_term_polynomial_offset(read_index - 1);
        }
        return SIZE_MAX;
    }

    /**
     * @brief Compute where the polynomials defining a particular write term are located
     *
     * @details We pass polynomials involved in read an write terms from settings as a tuple of references. However,
     * depending on the type of term different number of polynomials can be used to compute it. So we need to
     * compute the offset in the tuple iteratively
     *
     * @param write_index Index of the write term
     * @return constexpr size_t
     */
    static constexpr size_t compute_write_term_polynomial_offset(size_t write_index)
    {
        // If it's the starting index, then we need to find out how many polynomials were taken by read terms
        if (write_index == 0) {
            return compute_read_term_polynomial_offset(READ_TERMS);
        }

        // If the previous term used basic tuple lookup, add lookup tuple size (it was using just a linear combination
        // of polynomials)
        if (Settings::WRITE_TERM_TYPES[write_index - 1] == WRITE_BASIC_TUPLE) {
            return compute_write_term_polynomial_offset(write_index - 1) + LOOKUP_TUPLE_SIZE;
        }

        // In case of arbitrary write term, no polynomials from the tuple are being used
        if (Settings::WRITE_TERM_TYPES[write_index - 1] == WRITE_ARBITRARY) {
            return compute_write_term_polynomial_offset(write_index - 1);
        }
        return SIZE_MAX;
    }

    /**
     * @brief Compute the value of a single item in the set
     *
     * @details Computes the polynomial \gamma + \sum_{i=0}^{num_columns}(column_i*\beta^i), so the tuple of columns is
     * in the first set
     *
     * @tparam read_index The chosen polynomial relation
     *
     * @param params Used for beta and gamma
     */
    template <typename Accumulator, size_t read_index, typename AllEntities, typename Parameters>
    static Accumulator compute_read_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        static_assert(read_index < READ_TERMS);
        constexpr size_t start_polynomial_index = compute_read_term_polynomial_offset(read_index);
        if constexpr (Settings::READ_TERM_TYPES[read_index] == READ_BASIC_TUPLE) {
            // Retrieve all polynomials used
            const auto all_polynomials = Settings::get_const_entities(in);

            auto result = Accumulator(0);

            // Iterate over tuple and sum as a polynomial over beta
            bb::constexpr_for<start_polynomial_index, start_polynomial_index + LOOKUP_TUPLE_SIZE, 1>(
                [&]<size_t i>() { result = (result * params.beta) + View(std::get<i>(all_polynomials)); });
            const auto& gamma = params.gamma;
            return result + gamma;
        } else if constexpr (Settings::READ_TERM_TYPES[read_index] == READ_SCALED_TUPLE) {
            // Retrieve all polynomials used
            const auto all_polynomials = Settings::get_const_entities(in);

            auto result = Accumulator(0);
            // Iterate over tuple and sum as a polynomial over beta
            bb::constexpr_for<start_polynomial_index, start_polynomial_index + LOOKUP_TUPLE_SIZE, 1>([&]<size_t i>() {
                result = (result * params.beta) + View(std::get<i + 2 * LOOKUP_TUPLE_SIZE>(all_polynomials)) -
                         View(std::get<i + LOOKUP_TUPLE_SIZE>(all_polynomials)) * View(std::get<i>(all_polynomials));
            });
            const auto& gamma = params.gamma;
            return result + gamma;
        } else {

            return Settings::template compute_read_term<Accumulator, read_index>(in, params);
        }
    }

    /**
     * @brief Compute the value of a single item in the set
     *
     * @details Computes the polynomial \gamma + \sum_{i=0}^{num_columns}(column_i*\beta^i), so the tuple of columns is
     * in the second set
     *
     * @tparam write_index Kept for compatibility with lookups, behavior doesn't change
     *
     * @param params Used for beta and gamma
     */
    template <typename Accumulator, size_t write_index, typename AllEntities, typename Parameters>
    static Accumulator compute_write_term(const AllEntities& in, const Parameters& params)
    {

        static_assert(write_index < WRITE_TERMS);

        using View = typename Accumulator::View;
        constexpr size_t start_polynomial_index = compute_write_term_polynomial_offset(write_index);

        if constexpr (Settings::WRITE_TERM_TYPES[write_index] == WRITE_BASIC_TUPLE) {
            // Retrieve all polynomials used
            const auto all_polynomials = Settings::get_const_entities(in);

            auto result = Accumulator(0);

            // Iterate over tuple and sum as a polynomial over beta
            bb::constexpr_for<start_polynomial_index, start_polynomial_index + LOOKUP_TUPLE_SIZE, 1>(
                [&]<size_t i>() { result = (result * params.beta) + View(std::get<i>(all_polynomials)); });
            const auto& gamma = params.gamma;
            return result + gamma;
        } else {
            // Sometimes we construct lookup tables on the fly from intermediate

            return Settings::template compute_write_term<Accumulator, write_index>(in, params);
        }
    }

    /**
     * @brief Expression for generic log-derivative-based set permutation.
     * @param accumulator transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Accumulator edges.
     * @param relation_params contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor)
    {
        accumulate_logderivative_lookup_subrelation_contributions<FF, GenericLookupRelationImpl<Settings, FF>>(
            accumulator, in, params, scaling_factor);
    }
};

template <typename Settings, typename FF>
using GenericLookupRelation = Relation<GenericLookupRelationImpl<Settings, FF>>;

template <typename Settings, typename FF> using GenericLookup = GenericLookupRelationImpl<Settings, FF>;

} // namespace bb
