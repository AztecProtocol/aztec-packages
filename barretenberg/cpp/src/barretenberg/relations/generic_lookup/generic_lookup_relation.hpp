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
 * Write \f$f_1, \ldots, f_n\f$ for the columns to be looked up, and \f$t_1, \ldots, t_m\f$ for the table columns.
 * The relation implements the log-derivative lookup argument for two cases:
 *  - BASIC_LOOKUP/BASIC_TABLE: LOOKUP_SIZE := n = m and we wish to look up the multiset
 *    \f$\{(f_1(x), \ldots, f_n(x)) : x \in H_N\}\f$, where \f$H_N\f$ is the hypercube of size N, from the table
 *    \f$\{(t_1(y), \ldots, t_n(y)) : y \in H_M\}\f$. In this case, we perform the lookup by batching together
 *    the \f$f_i\f$'s and the \f$t_i\f$'s: we define \f$f(x) = \sum_i f_i \cdot Y^i\f$,
 *    \f$t(x) = \sum_i t_i \cdot Y^i\f$, and we check the existence of a function
 *    \f$\text{counts} : B_N \rightarrow F\f$ such that
 *    \f[
 *        \sum_{x \in H_N} \frac{1}{\gamma - f(x, \beta)} = \sum_{y \in H_M} \frac{\text{counts}(y)}{\gamma - t(y, \beta)}
 *    \f]
 *  - CUSTOMIZED_LOOKUP/CUSTOMIZED_TABLE: We allow looking up values that are computed arbitrarily from
 *    \f$\{f_1, \ldots, f_n\}\f$ from values that are computed arbitrarily (and possibly in a different way)
 *    from \f$\{t_1, \ldots, t_m\}\f$.
 *
 * In both cases, we rephrase the equation check in terms of two relations:
 *  1. \f[
 *     I(x) \cdot \prod_{i=1}^{\text{NUM\_LOOKUP\_TERMS}} \text{lookup\_entry}(x) \cdot
 *     \prod_{i=0}^{\text{NUM\_TABLE\_TERMS}} \text{table\_entry}(x) - \text{inverse\_exists}(x) = 0
 *     \f]
 *  2. \f[
 *     \sum_{i=0}^{\text{NUM\_LOOKUP\_TERMS}} \text{lookup\_entry\_predicate}_i(x) \cdot \frac{1}{\text{lookup\_entry}(x)}
 *     - \sum_{i=0}^{\text{NUM\_TABLE\_TERMS}} \text{table\_entry\_predicate}_i(x) \cdot
 *     \text{lookup\_read\_count}_i(x) \cdot \frac{1}{\text{table\_entry}(x)}
 *     \f]
 *
 * Relation 1) ensures that the polynomial \f$I\f$ represents the inverse of the product of the entries to be
 * looked up and the table entries. As this polynomial doesn't need to be defined everywhere, we set the result
 * of the multiplication to be equal to the value of another polynomial: inverse\_exist, which is set to 1 only
 * if the inverse must be computed. Note that relation 1) is *independent*: it must be satisfied at every row
 * in the trace.
 *
 * Relation 2) is a *dependent* relation, it is satisfied only when its values are summed over the entire trace.
 * The result of the sum is the log-derivative expression that bears witness to the validity of the lookup. Note
 * that the lookup and table entries are multiplied by predicates that enable specifying which table lookup/table
 * entries the prover is allowed to use at any given row.
 *
 * The degrees of the above relations are:
 *  1. The degree of relation 1) is \f$\max(1 + \max(\deg(\text{lookup\_entries})) +
 *     \max(\deg(\text{table\_entries})), \deg(\text{inverse\_exists}))\f$
 *  2. The degree of relation 2) is \f$2 + \text{NUM\_LOOKUP\_TERMS} + \text{NUM\_TABLE\_TERMS}\f$.
 *     This is because we compute the inverses as:
 *     \f[
 *         \frac{1}{\text{table\_entry}(x)} = I(x) \cdot \prod_{j \neq i} \text{table\_entry}_j(x) \cdot
 *         \prod_{i} \text{lookup\_entry}_i(x)
 *     \f]
 *     whose degree is \f$1 + \text{NUM\_LOOKUP\_TERMS} + \text{NUM\_TABLE\_TERMS} - 1\f$.
 *
 * @note The predicates involved in relation 2) are assumed to have been constrained to be boolean outside this relation.
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
    static constexpr size_t NUM_LOOKUP_TERMS = Settings::READ_TERMS;
    static constexpr size_t NUM_TABLE_TERMS = Settings::WRITE_TERMS;

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

    /// NOTE: WE ARE ASSUMING THAT ALL BASIC LOOKUPS HAVE THE SAME NUMBER OF COLUMNS TO BE BATCHED, IS THIS NECESSARY?
    /**
     * When performing a basic lookup, we batch columns for efficiency. This constant represents the number of columns
     * to be batched together. For example, it would be 1 for a range constraint lookup, 3 for a XOR lookup.
     *
     */
    static constexpr size_t LOOKUP_SIZE = Settings::LOOKUP_SIZE;

    /**
     * @brief Compute the degree of the product of lookup terms
     *
     * @return Accumulated degree of all lookup terms
     */
    static constexpr size_t compute_lookup_term_product_degree()
    {
        size_t accumulated_degree = 0;
        for (size_t i = 0; i < NUM_LOOKUP_TERMS; i++) {
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
     * @brief Compute the degree of the product of table terms
     *
     * @return Accumulated degree of all table terms
     */
    static constexpr size_t compute_table_term_product_degree()
    {
        size_t accumulated_degree = 0;
        for (size_t i = 0; i < NUM_TABLE_TERMS; i++) {
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
            1,                                 // inverse polynomial correctness sub-relation
        NUM_LOOKUP_TERMS + NUM_TABLE_TERMS + 3 // log-derived terms subrelation
    };

    // The first subrelation must be satisfied at every row.
    // The second subrelation must be satisfied when summed across the entire trace
    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, false };

    /**
     * @brief Polynomial structure required for the lookup argument
     *
     * @details The implementor must provide methods get_const_entities and get_nonconst_entities via Settings
     * that return the polynomials required for the lookup argument. These polynomials have a structure that is in
     * part fixed and in part variable:
     *
     * <b>Fixed Part:</b>
     *  1. The first polynomial is the inverse polynomial
     *  2. Next we have NUM_TABLE_TERMS polynomials representing the lookup read counts, i.e., how many times each
     *     table term has been read
     *  3. Next we have NUM_LOOKUP_TERMS polynomials representing the lookup term predicates, which toggle
     *     whether a lookup term can be looked up in this row or not
     *  4. Next we have NUM_TABLE_TERMS polynomials representing the table term predicates, which toggle whether a
     *     table term can be looked up in this row or not
     *
     * <b>Variable Part:</b>
     *  5. For each lookup term, we have a variable number of polynomials depending on the type of lookup:
     *     - BASIC_LOOKUP: LOOKUP_SIZE polynomials representing the columns being looked up (and that will be batched)
     *     - CUSTOMIZED_LOOKUP: No additional polynomials are required, as the logic is fully specified in Settings
     *  6. For each table term, we have a variable number of polynomials depending on the type of table:
     *     - BASIC_TABLE: LOOKUP_SIZE polynomials representing the table columns (and that will be batched)
     *     - CUSTOMIZED_TABLE: No additional polynomials are required, as the logic is fully specified in Settings
     */
    static constexpr size_t INVERSE_POLYNOMIAL_INDEX = 0;
    static constexpr size_t LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX = 1;
    static constexpr size_t LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX + NUM_TABLE_TERMS;
    static constexpr size_t TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX + NUM_LOOKUP_TERMS;
    static constexpr size_t LOOKUP_TERM_START_POLYNOMIAL_INDEX =
        TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX + NUM_TABLE_TERMS;

    /**
     * @brief Check if we need to compute the inverse polynomial element value for this row
     *
     * @tparam AllValues Type containing all polynomial values at a given row
     * @param row All values at row
     * @return true if the inverse polynomial should be computed at this row, false otherwise
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
     * @tparam AllEntities Type containing all polynomial entities
     * @param in All entities
     * @return Non-const reference to the inverse polynomial
     */
    template <typename AllEntities> static auto& get_inverse_polynomial(AllEntities& in)
    {
        return std::get<INVERSE_POLYNOMIAL_INDEX>(Settings::get_nonconst_entities(in));
    }

    /**
     * @brief Get selector/wire switching on (1) or off (0) inverse computation
     *
     * @tparam Accumulator Accumulator type for polynomial evaluations
     * @tparam AllEntities Type containing all polynomial entities
     * @param in All entities
     * @return Accumulator value indicating whether inverse should be computed (1) or not (0)
     */
    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        // A lookup could be enabled by one of several selectors or witnesses, so we want to give as much freedom as
        // possible to the implementor
        return Settings::template compute_inverse_exists<Accumulator>(in);
    }

    /**
     * @brief Get the number of times a particular table value has been looked up
     *
     * @details We assume lookup read counts are independent columns and therefore do not allow customization of this
     * method to the implementor.
     *
     * @tparam Accumulator Accumulator type for polynomial evaluations
     * @tparam index Index of the table term (must be less than NUM_TABLE_TERMS)
     * @tparam AllEntities Type containing all polynomial entities
     * @param in All entities
     * @return Accumulator containing the read count for the specified table term
     */
    template <typename Accumulator, size_t index, typename AllEntities>
    static Accumulator lookup_read_counts(const AllEntities& in)
    {

        static_assert(index < NUM_TABLE_TERMS);
        using View = typename Accumulator::View;

        return Accumulator(
            View(std::get<LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX + index>(Settings::get_const_entities(in))));
    }

    /**
     * @brief Extract predicate enabling looking up a given lookup term at this row
     *
     * @tparam Accumulator Accumulator type for polynomial evaluations
     * @tparam lookup_index Index of the lookup term (must be less than NUM_LOOKUP_TERMS)
     * @tparam AllEntities Type containing all polynomial entities
     * @param in All entities
     * @return Accumulator containing the predicate for the specified lookup term
     */
    template <typename Accumulator, size_t lookup_index, typename AllEntities>
    static Accumulator get_lookup_term_predicate(const AllEntities& in)

    {
        static_assert(lookup_index < NUM_LOOKUP_TERMS);
        using View = typename Accumulator::View;

        return Accumulator(View(
            std::get<LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX + lookup_index>(Settings::get_const_entities(in))));
    }

    /**
     * @brief Extract predicate enabling looking up a given table term at this row
     *
     * @tparam Accumulator Accumulator type for polynomial evaluations
     * @tparam table_index Index of the table term (must be less than NUM_TABLE_TERMS)
     * @tparam AllEntities Type containing all polynomial entities
     * @param in All entities
     * @return Accumulator containing the predicate for the specified table term
     */
    template <typename Accumulator, size_t table_index, typename AllEntities>
    static Accumulator get_table_term_predicate(const AllEntities& in)
    {

        static_assert(table_index < NUM_TABLE_TERMS);
        using View = typename Accumulator::View;

        return Accumulator(View(
            std::get<TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX + table_index>(Settings::get_const_entities(in))));
    }

    /**
     * @brief Compute where the polynomials defining a particular lookup term are located
     *
     * @param lookup_index Index of the lookup term
     * @return Offset in the polynomial array where this lookup term's polynomials begin
     */
    static constexpr size_t compute_lookup_term_polynomial_offset(size_t lookup_index)
    {
        // If it's the starting index, then there is nothing to compute, just get the starting index
        if (lookup_index == 0) {
            return LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX;
        }

        switch (Settings::LOOKUP_TYPES[lookup_index - 1]) {
        case BASIC_LOOKUP:
            // If the previous lookup was a basic lookup, add lookup tuple size (it was using just a linear combination
            // of polynomials)
            return compute_lookup_term_polynomial_offset(lookup_index - 1) + LOOKUP_SIZE;
        case CUSTOMIZED_LOOKUP:
            // In case of customized lookup, no polynomials from the tuple are being used
            return compute_lookup_term_polynomial_offset(lookup_index - 1);
        default:
            bb::assert_failure("Invalid lookup type");
        }
    }

    /**
     * @brief Compute where the polynomials defining a particular table term are located
     *
     * @param table_index Index of the table term
     * @return Offset in the polynomial array where this table term's polynomials begin
     */
    static constexpr size_t compute_table_term_polynomial_offset(size_t table_index)
    {
        // If it's the starting index, then we need to find out how many polynomials were taken by lookup terms
        if (table_index == 0) {
            return compute_table_term_polynomial_offset(NUM_LOOKUP_TERMS);
        }

        switch (Settings::TABLE_TYPES[table_index - 1]) {
        case BASIC_TABLE:
            // If the previous lookup was a basic table, add lookup tuple size (it was using just a linear combination
            // of polynomials)
            return compute_table_term_polynomial_offset(table_index - 1) + LOOKUP_SIZE;
        case CUSTOMIZED_TABLE:
            // In case of customized table, no polynomials from the tuple are being used
            return compute_table_term_polynomial_offset(table_index - 1);
        default:
            bb::assert_failure("Invalid lookup type");
        }
    }

    /**
     * @brief Compute the value of the lookup term at a given index
     *
     * @tparam Accumulator Accumulator type for polynomial evaluations
     * @tparam lookup_index Index of the lookup term to compute
     * @tparam AllEntities Type containing all polynomial entities
     * @tparam Parameters Type containing relation parameters (beta, gamma)
     * @param in All entities
     * @param params Relation parameters
     * @return Accumulator containing the computed lookup term value
     */
    template <typename Accumulator, size_t lookup_index, typename AllEntities, typename Parameters>
    static Accumulator compute_lookup_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        static_assert(lookup_index < NUM_LOOKUP_TERMS);
        constexpr size_t start_polynomial_index = compute_lookup_term_polynomial_offset(lookup_index);
        const FF beta = params.beta;
        const FF gamma = params.gamma;

        if constexpr (Settings::LOOKUP_TERM_TYPES[lookup_index] == BASIC_LOOKUP) {
            // In this case we batch all the lookup columns pertaining to this lookup term using the randomness beta
            FF result = Accumulator(0);

            const auto all_polynomials = Settings::get_const_entities(in);
            bb::constexpr_for<start_polynomial_index, start_polynomial_index + LOOKUP_SIZE, 1>(
                [&]<size_t i>() { result = (result * beta) + View(std::get<i>(all_polynomials)); });

            return result + gamma;
        } else if constexpr (Settings::LOOKUP_TERM_TYPES[lookup_index] == CUSTOMIZED_LOOKUP) {
            return Settings::template compute_lookup_term<Accumulator, lookup_index>(in, params);
        } else {
            bb::assert_failure("Invalid lookup type");
        }
    }

    /**
     * @brief Compute the value of a table term at a given index
     *
     * @tparam Accumulator Accumulator type for polynomial evaluations
     * @tparam table_index Index of the table term to compute
     * @tparam AllEntities Type containing all polynomial entities
     * @tparam Parameters Type containing relation parameters (beta, gamma)
     * @param in All entities
     * @param params Relation parameters
     * @return Accumulator containing the computed table term value
     */
    template <typename Accumulator, size_t table_index, typename AllEntities, typename Parameters>
    static Accumulator compute_table_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        static_assert(table_index < NUM_TABLE_TERMS);
        constexpr size_t start_polynomial_index = compute_table_term_polynomial_offset(table_index);
        const FF beta = params.beta;
        const FF gamma = params.gamma;

        if constexpr (Settings::TABLE_TERM_TYPES[table_index] == BASIC_TABLE) {
            // In this case we batch all the lookup columns pertaining to this lookup term using the randomness beta
            auto result = Accumulator(0);

            const auto all_polynomials = Settings::get_const_entities(in);

            bb::constexpr_for<start_polynomial_index, start_polynomial_index + LOOKUP_SIZE, 1>(
                [&]<size_t i>() { result = (result * beta) + View(std::get<i>(all_polynomials)); });

            return result + gamma;
        }
        if constexpr (Settings::TABLE_TERM_TYPES[table_index] == CUSTOMIZED_TABLE) {
            return Settings::template compute_table_term<Accumulator, table_index>(in, params);
        } else {
            bb::assert_failure("Invalid table type");
        }
    }

    /**
     * @brief Expression for generic log-derivative-based set permutation
     *
     * @tparam ContainerOverSubrelations Container type for accumulating subrelation contributions
     * @tparam AllEntities Type containing all polynomial entities
     * @tparam Parameters Type containing relation parameters
     * @param accumulator Transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in An std::array containing the fully extended Accumulator edges
     * @param params Contains beta, gamma relation parameters
     * @param scaling\_factor Optional term to scale the evaluation before adding to evals
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

} // namespace bb
