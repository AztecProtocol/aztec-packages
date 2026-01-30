// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * Write f_1, .., f_n for the values at a row i of the columns we wish to look up, and t_1, .., t_m for table
 * columns. We allow two types of lookups:
 *  - BASIC_LOOKUP/BASIC_TABLE: Looking up a subset S_f \subset {f_1, .., f_n} from a subset S_t \subset {t_1, ..,
 *                              t_m}
 *  - CUSTOMIZED_LOOKUP/CUSTOMIZED_TABLE: Looking up values that are computed arbitrarily from {f_1, .., f_n} from
 *                                        values that are computed arbitrarily (and possibly in a different way)
 *                                        from {t_1, .., t_m}
 *
 */
enum LOOKUP_TYPE : uint8_t { BASIC_LOOKUP, CUSTOMIZED_LOOKUP };
enum TABLE_TYPE : uint8_t { BASIC_TABLE, CUSTOMIZED_TABLE };

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
 *     - BASIC_LOOKUP: LOOKUP_TUPLE_SIZE polynomials representing the columns being looked up (and that will be
 * batched)
 *     - CUSTOMIZED_LOOKUP: No additional polynomials are required, as the logic is fully specified in Settings
 *  6. For each table term, we have a variable number of polynomials depending on the type of table:
 *     - BASIC_TABLE: LOOKUP_TUPLE_SIZE polynomials representing the table columns (and that will be batched)
 *     - CUSTOMIZED_TABLE: No additional polynomials are required, as the logic is fully specified in Settings
 */
template <typename Settings_> class LookupPolynomialStructure {
  private:
    static constexpr size_t NUM_LOOKUP_TERMS = Settings_::NUM_LOOKUP_TERMS;
    static constexpr size_t NUM_TABLE_TERMS = Settings_::NUM_TABLE_TERMS;

    static constexpr size_t INVERSE_POLYNOMIAL_INDEX = 0;
    static constexpr size_t LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX = 1;
    static constexpr size_t LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX + NUM_TABLE_TERMS;
    static constexpr size_t TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX + NUM_LOOKUP_TERMS;
    static constexpr size_t LOOKUP_TERM_START_POLYNOMIAL_INDEX =
        TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX + NUM_TABLE_TERMS;

  public:
    static constexpr size_t get_inverse_polynomial_index() { return INVERSE_POLYNOMIAL_INDEX; }

    static constexpr size_t get_read_count_polynomial_index(const size_t index)
    {
        return LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX + index;
    }

    static constexpr size_t get_lookup_term_predicate_index(const size_t lookup_index)
    {
        return LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX + lookup_index;
    }

    static constexpr size_t get_table_term_predicate_index(const size_t table_index)
    {
        return TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX + table_index;
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
            return LOOKUP_TERM_START_POLYNOMIAL_INDEX;
        }

        switch (Settings_::LOOKUP_TYPES[lookup_index - 1]) {
        case BASIC_LOOKUP:
            // If the previous lookup was a basic lookup, add lookup tuple size (it was using just a linear combination
            // of polynomials)
            return compute_lookup_term_polynomial_offset(lookup_index - 1) + Settings_::LOOKUP_TUPLE_SIZE;
        case CUSTOMIZED_LOOKUP:
            // In case of customized lookup, no polynomials from the tuple are being used
            return compute_lookup_term_polynomial_offset(lookup_index - 1);
        default:
            bb::assert_failure("Invalid lookup type");
            return SIZE_MAX;
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
            return compute_lookup_term_polynomial_offset(NUM_LOOKUP_TERMS);
        }

        switch (Settings_::TABLE_TYPES[table_index - 1]) {
        case BASIC_TABLE:
            // If the previous lookup was a basic table, add lookup tuple size (it was using just a linear combination
            // of polynomials)
            return compute_table_term_polynomial_offset(table_index - 1) + Settings_::LOOKUP_TUPLE_SIZE;
        case CUSTOMIZED_TABLE:
            // In case of customized table, no polynomials from the tuple are being used
            return compute_table_term_polynomial_offset(table_index - 1);
        default:
            bb::assert_failure("Invalid lookup type");
            return SIZE_MAX;
        }
    }
};

// clang-format off
/**
 * @brief Concept defining the requirements for the Settings struct used to configure the GenericLookupRelationImpl
 *
 * @details This is the concept that should be satisfied by lookup settings. As the AVM instantiates many lookup relations
 * (+200), enforcing this concept hurts compilation times. Thus, we only use this concept for documentation purposes.
 */
template <typename S>
concept GenericLookupSettings = requires {
    // We allow looking up multiple items per row from a variable number of table columns. These values are not
    // bound to the real number of columns the lookup operates on. We allow looking up virtual columns (i.e.,
    // combinations of columns) from virtual table columns (i.e., combinations of table columns).
    requires std::is_same_v<decltype(S::NUM_LOOKUP_TERMS), const size_t>;
    requires std::is_same_v<decltype(S::NUM_TABLE_TERMS), const size_t>;

    // An array defining the types of the lookups performed. They can be BASIC_LOOKUP or CUSTOMIZED_LOOKUP
    requires std::is_same_v<decltype(S::LOOKUP_TYPES), const std::array<uint8_t, S::NUM_LOOKUP_TERMS>>;
    // An array defining the types of the tables used. They can be BASIC_TABLE or CUSTOMIZED_TABLE
    requires std::is_same_v<decltype(S::TABLE_TYPES), const std::array<uint8_t, S::NUM_TABLE_TERMS>>;
    // An array specifying the degree of the lookup terms
    requires std::is_same_v<decltype(S::LOOKUP_TERM_DEGREES), const std::array<size_t, S::NUM_LOOKUP_TERMS>>;
    // An array specifying the degree of the table terms
    requires std::is_same_v<decltype(S::TABLE_TERM_DEGREES), const std::array<size_t, S::NUM_TABLE_TERMS>>;

    requires std::is_same_v<decltype(S::LOOKUP_TUPLE_SIZE), const size_t>; // Number of columns to batch for basic lookups

    // Degree of the polynomial expression indicating whether the inverse polynomial exists at a given row
    requires std::is_same_v<decltype(S::INVERSE_EXISTS_POLYNOMIAL_DEGREE), const size_t>;

    // Settings also require the following methods, but some of them are templated, so we can't check them here.
    // 1) Settings::inverse_polynomial_is_computed_at_row(const AllValues& row), method to compute whether the inverse polynomial should be computed at a given row
    // 2) Settings::compute_inverse_exists<Accumulator>(const AllEntities& in), method to compute the value of the inverse_exists polynomial at a given row
    // 3) Settings::template compute_lookup_term<Accumulator, size_t>(const AllEntities&, const Parameters&), method to compute the lookup term at a given index
    // 4) Settings::template compute_table_term<Accumulator, size_t>(const AllEntities&, const Parameters&), method to compute the table term at a given index
    // 5) Settings::get_nonconst_entities(AllEntities&), method to extract non constant references to the columns used in the relation
    // 6) Settings::get_const_entities(const AllEntities&), method to extract constant references to the columns used in the relation
};

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
 *  - BASIC_LOOKUP/BASIC_TABLE: LOOKUP_TUPLE_SIZE := n = m and we wish to look up the multiset
 *    \f$\{(f_1(x), \ldots, f_n(x)) : x \in H_N\}\f$, where \f$H_N\f$ is the hypercube of size N, from the table
 *    \f$\{(t_1(y), \ldots, t_n(y)) : y \in H_N\}\f$. In this case, we perform the lookup by batching together
 *    the \f$f_i\f$'s and the \f$t_i\f$'s: we define \f$f(x) = \sum_i f_i \cdot Y^i\f$,
 *    \f$t(x) = \sum_i t_i \cdot Y^i\f$, and we check the existence of a function
 *    \f$\text{counts} : B_N \rightarrow F\f$ such that
 *    \f[
 *        \sum_{x \in H_N} \frac{1}{\gamma - f(x, \beta)} = \sum_{x \in H_N} \frac{\text{counts}(x)}{\gamma - t(x, \beta)}
 *    \f]
 *  - CUSTOMIZED_LOOKUP/CUSTOMIZED_TABLE: We allow looking up values that are computed arbitrarily from
 *    \f$\{f_1, \ldots, f_n\}\f$ from values that are computed arbitrarily (and possibly in a different way)
 *    from \f$\{t_1, \ldots, t_m\}\f$.
 *
 * In both cases, we rephrase the equation check in terms of two relations:
 *  1. \f[
 *     I(x) \cdot \prod_{i=1}^{\text{NUM_LOOKUP_TERMS}} \text{lookup_entry}_i(x) \cdot
 *     \prod_{i=0}^{\text{NUM_TABLE_TERMS}} \text{table_entry}_i(x) - \text{inverse_exists}(x) = 0
 *     \f]
 *  2. \f[
 *     \sum_{i=0}^{\text{NUM_LOOKUP_TERMS}} \text{lookup_entry_predicate}_i(x) \cdot \frac{1}{\text{lookup_entry}_i(x)}
 *     - \sum_{i=0}^{\text{NUM_TABLE_TERMS}} \text{table_entry_predicate}_i(x) \cdot
 *     \text{lookup_read_count}_i(x) \cdot \frac{1}{\text{table_entry}_i(x)}
 *     \f]
 *
 * The first relation ensures that the polynomial \f$I\f$ represents the inverse of the product of the entries to be
 * looked up and the table entries. As this polynomial doesn't need to be defined everywhere, we set the result
 * of the multiplication to be equal to the value of another polynomial: inverse_exist, which is set to 1 only
 * if the inverse must be computed. Note that relation 1) is *independent*: it must be satisfied at every row
 * in the trace.
 *
 * The second relation is a *dependent* relation, it is satisfied only when its values are summed over the entire trace.
 * The result of the sum is the log-derivative expression that bears witness to the validity of the lookup. Note
 * that the lookup and table entries are multiplied by predicates that enable specifying which table lookup/table
 * entries the prover is allowed to use at any given row.
 *
 * The degrees of the above relations are:
 *  1. The degree of relation 1) is \f$\max(1 + \sum \deg(\text{lookup_entries}) + \sum \deg(\text{table_entries}), \deg(\text{inverse_exists}))\f$
 *  2. The degree of relation 2) is is \f$2 + M\f$, where \f$M = \max(\sum \deg(\text{lookup_entries}) + \sum \deg(\text{table_entries} - \deg(\text{term}_i))\f$
 *     for \f$\text{term}_i\f$ iterating over all terms. This is because we compute the inverses as:
 *     \f[
 *         \frac{1}{\text{table_entry}_i(x)} = I(x) \cdot \prod_{j \neq i} \text{table_entry}_j(x) \cdot
 *         \prod_{j} \text{lookup_entry}_j(x)
 *     \f]
 *
 * @note The predicates involved in relation 2) are assumed to have been constrained to be boolean outside this relation.
 *
*/
// clang-format on
template <typename Settings, typename FF_> class GenericLookupRelationImpl {
  public:
    using FF = FF_;
    using PolynomialStructure = LookupPolynomialStructure<Settings>;

    static constexpr size_t NUM_LOOKUP_TERMS = Settings::NUM_LOOKUP_TERMS;
    static constexpr size_t NUM_TABLE_TERMS = Settings::NUM_TABLE_TERMS;

    /**
     * When performing a basic lookup, we batch columns for efficiency. This constant represents the number of columns
     * to be batched together. For example, it would be 1 for a range constraint lookup, 3 for a XOR lookup.
     *
     * @note For simplicity of implementation, we assume that all basic lookups use the same tuple size.
     */
    static constexpr size_t LOOKUP_TUPLE_SIZE = Settings::LOOKUP_TUPLE_SIZE;

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
                bb::assert_failure("Invalid table type");
                break;
            }
            accumulated_degree += current_degree;
        }
        return accumulated_degree;
    }

    /**
     * @brief Compute the degree of the second subrelation
     *
     * @details Iterate over all terms and compute the maximum of the sum of the degree of all terms minus the degree of
     * the term we are currently looking at. The degree of the subrelation is the maximum plus 2 to account for the
     * inverse polynomial and the read count.
     *
     */
    static constexpr size_t compute_second_subrelation_degree()
    {
        size_t total_term_product_degree = compute_lookup_term_product_degree() + compute_table_term_product_degree();

        size_t max_degree = 0;
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
            size_t adjusted_degree = total_term_product_degree - current_degree;
            max_degree = std::max(max_degree, adjusted_degree);
        }
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
                bb::assert_failure("Invalid table type");
                break;
            }
            size_t adjusted_degree = total_term_product_degree - current_degree;
            max_degree = std::max(max_degree, adjusted_degree);
        }
        return max_degree + 2;
    }

    // (Sub)relation lengths: equal to 1 + relation degree
    static constexpr size_t LOOKUP_TERM_ACCUMULATED_DEGREE = compute_lookup_term_product_degree();
    static constexpr size_t TABLE_TERM_ACCUMULATED_DEGREE = compute_table_term_product_degree();
    static_assert(LOOKUP_TERM_ACCUMULATED_DEGREE > 0);
    static_assert(TABLE_TERM_ACCUMULATED_DEGREE > 0);

    static constexpr size_t FIRST_RELATION_PARTIAL_LENGTH =
        std::max(LOOKUP_TERM_ACCUMULATED_DEGREE + TABLE_TERM_ACCUMULATED_DEGREE + 1,
                 Settings::INVERSE_EXISTS_POLYNOMIAL_DEGREE) +
        1; // inverse polynomial correctness sub-relation
    static constexpr size_t SECOND_RELATION_PARTIAL_LENGTH =
        compute_second_subrelation_degree() + 1; // log-derived terms sub-relation
    static constexpr size_t LENGTH = std::max(FIRST_RELATION_PARTIAL_LENGTH, SECOND_RELATION_PARTIAL_LENGTH);

    // We use the max of the subrelation lengths because the inverses of lookup/table terms must be used in both
    // subrelations
    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{ LENGTH, LENGTH };

    // The first subrelation must be satisfied at every row.
    // The second subrelation must be satisfied when summed across the entire trace
    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, false };

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
        return std::get<PolynomialStructure::get_inverse_polynomial_index()>(Settings::get_nonconst_entities(in));
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

        return Accumulator(View(
            std::get<PolynomialStructure::get_read_count_polynomial_index(index)>(Settings::get_const_entities(in))));
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

        return Accumulator(View(std::get<PolynomialStructure::get_lookup_term_predicate_index(lookup_index)>(
            Settings::get_const_entities(in))));
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

        return Accumulator(View(std::get<PolynomialStructure::get_table_term_predicate_index(table_index)>(
            Settings::get_const_entities(in))));
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
        constexpr size_t start_polynomial_index =
            PolynomialStructure::compute_lookup_term_polynomial_offset(lookup_index);
        const FF beta = params.beta;
        const FF gamma = params.gamma;

        if constexpr (Settings::LOOKUP_TYPES[lookup_index] == BASIC_LOOKUP) {
            // In this case we batch all the lookup columns pertaining to this lookup term using the randomness beta
            Accumulator result = Accumulator(0);

            const auto all_polynomials = Settings::get_const_entities(in);
            bb::constexpr_for<start_polynomial_index, start_polynomial_index + LOOKUP_TUPLE_SIZE, 1>(
                [&]<size_t i>() { result = (result * beta) + View(std::get<i>(all_polynomials)); });

            return result + gamma;
        } else if constexpr (Settings::LOOKUP_TYPES[lookup_index] == CUSTOMIZED_LOOKUP) {
            return Settings::template compute_lookup_term<Accumulator, lookup_index>(in, params);
        } else {
            bb::assert_failure("Invalid lookup type");
            return Accumulator(0);
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
        constexpr size_t start_polynomial_index =
            PolynomialStructure::compute_table_term_polynomial_offset(table_index);
        const FF beta = params.beta;
        const FF gamma = params.gamma;

        if constexpr (Settings::TABLE_TYPES[table_index] == BASIC_TABLE) {
            // In this case we batch all the lookup columns pertaining to this lookup term using the randomness beta
            Accumulator result = Accumulator(0);

            const auto all_polynomials = Settings::get_const_entities(in);

            bb::constexpr_for<start_polynomial_index, start_polynomial_index + LOOKUP_TUPLE_SIZE, 1>(
                [&]<size_t i>() { result = (result * beta) + View(std::get<i>(all_polynomials)); });

            return result + gamma;
        } else if constexpr (Settings::TABLE_TYPES[table_index] == CUSTOMIZED_TABLE) {
            return Settings::template compute_table_term<Accumulator, table_index>(in, params);
        } else {
            bb::assert_failure("Invalid table type");
            return Accumulator(0);
        }
    }

    /**
     * @brief Compute generic log-derivative lookup subrelation accumulation
     * @details The generic log-derivative lookup relation consists of two subrelations. The first demonstrates that the
     * inverse polynomial I has been computed correctly. The second establishes the correctness of the lookups
     * themselves based on the log-derivative lookup argument. Note that the latter subrelation is "linearly dependent"
     * in the sense that it establishes that a sum across all rows of the exectution trace is zero, rather than that
     * some expression holds independently at each row. Accordingly, this subrelation is not multiplied by a scaling
     * factor at each accumulation step. See the documentation for GenericLookupRelationImpl for the definition of the
     * subrelations.
     *
     * @tparam ContainerOverSubrelations Container type for accumulating subrelation contributions
     * @tparam AllEntities Type containing all polynomial entities
     * @tparam Parameters Type containing relation parameters
     * @param accumulator Transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in An std::array containing the fully extended Accumulator edges
     * @param params Contains beta, gamma relation parameters
     * @param scaling_factor Optional term to scale the evaluation before adding to evals
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor)
    {
        _accumulate_logderivative_subrelation_contributions<FF,
                                                            GenericLookupRelationImpl<Settings, FF>,
                                                            ContainerOverSubrelations,
                                                            AllEntities,
                                                            Parameters,
                                                            false>(accumulator, in, params, scaling_factor);
    }
};

template <typename Settings, typename FF>
using GenericLookupRelation = Relation<GenericLookupRelationImpl<Settings, FF>>;

} // namespace bb
