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
 * @brief Specialization of the polynomial structure required for the lookup argument to the case of the permutation
 * argument
 *
 * @details This class works exactly as LookupPolynomialStructure, but with fixed parameters for the permutation
 * argument: NUM_LOOKUP_TERMS = NUM_TABLE_TERMS = 1 and all terms are of type BASIC
 */
template <typename Settings> class PermutationPolynomialStructure {
  private:
    static constexpr size_t NUM_LOOKUP_TERMS = 1;
    static constexpr size_t NUM_TABLE_TERMS = 1;

    static constexpr size_t INVERSE_POLYNOMIAL_INDEX = 0;
    static constexpr size_t LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX = INVERSE_POLYNOMIAL_INDEX + NUM_TABLE_TERMS;
    static constexpr size_t TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX + NUM_LOOKUP_TERMS;
    static constexpr size_t LOOKUP_TERM_START_POLYNOMIAL_INDEX =
        TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX + NUM_TABLE_TERMS;
    static constexpr size_t TABLE_TERM_START_POLYNOMIAL_INDEX =
        LOOKUP_TERM_START_POLYNOMIAL_INDEX + Settings::COLUMNS_PER_SET;

  public:
    static constexpr size_t get_inverse_polynomial_index() { return INVERSE_POLYNOMIAL_INDEX; }

    static constexpr size_t get_lookup_term_predicate_index() { return LOOKUP_TERM_PREDICATE_START_POLYNOMIAL_INDEX; }
    static constexpr size_t get_table_term_predicate_index() { return TABLE_TERM_PREDICATE_START_POLYNOMIAL_INDEX; }

    static constexpr size_t compute_lookup_term_polynomial_offset() { return LOOKUP_TERM_START_POLYNOMIAL_INDEX; }

    static constexpr size_t compute_table_term_polynomial_offset() { return TABLE_TERM_START_POLYNOMIAL_INDEX; }
};

/**
 * @brief Implementation of a generic permutation relation
 *
 * @details Implementation of a generic permutation relation that uses a log-derivative argument to prove that elements
 * in two columns of the execution trace are equal. The strategy is to use the lookup log-derivate argument with read
 * counts (i.e., number of times the lookup terms are looked up) equal to 1. This enforces the sets we are comparing to
 * be permutations of one another. The relation is composed of two subrelations, the first is equal to the first
 * subrelation in GenericLookupRelationImpl. The second one is the modification of the second subrelation of the generic
 * lookup in which we hard-code the read counts to 1:
 * \f[
 *     \sum_{i=0}^{\text{NUM_LOOKUP_TERMS}} \text{lookup_entry_predicate}_i(x) \cdot \frac{1}{\text{lookup_entry}_i(x)}
 *     - \sum_{i=0}^{\text{NUM_TABLE_TERMS}} \text{table_entry_predicate}_i(x) \cdot \frac{1}{\text{table_entry}_i(x)}
 * \f]
 *
 * @note The predicates involved in the second subrelation are assumed to have been constrained to be boolean outside
 * this relation.
 *
 */
template <typename Settings, typename FF_> class GenericPermutationRelationImpl {
  public:
    using FF = FF_;
    using PolynomialStructure = PermutationPolynomialStructure<Settings>;

    // The term counts should stay set to 1 unless we want to permute several columns at once as accumulated
    // sets (not as tuples).
    static constexpr size_t NUM_LOOKUP_TERMS = 1;
    static constexpr size_t NUM_TABLE_TERMS = 1;

    // Specialization of the calculation of the length for the generic lookup relation to the permutation relation; note
    // that the second subrelation degree is one lower than the one in the lookup argument because there is not read
    // count polynomial
    static constexpr size_t FIRST_RELATION_PARTIAL_LENGTH = std::max(NUM_LOOKUP_TERMS + NUM_TABLE_TERMS + 1,
                                                                     Settings::INVERSE_EXISTS_POLYNOMIAL_DEGREE) +
                                                            1; // inverse polynomial correctness sub-relation
    static constexpr size_t SECOND_RELATION_PARTIAL_LENGTH =
        NUM_LOOKUP_TERMS + NUM_TABLE_TERMS + 2; // log-derived terms sub-relation
    static constexpr size_t LENGTH = std::max(FIRST_RELATION_PARTIAL_LENGTH, SECOND_RELATION_PARTIAL_LENGTH);

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        LENGTH, // inverse polynomial correctness sub-relation
        LENGTH  // log-derived terms subrelation
    };

    /**
     * @brief We apply the power polynomial only to the first subrelation
     *
     * @details The first subrelation establishes correspondence between the inverse polynomial elements and the terms.
     * The second relation computes the inverses of individual terms, which are then summed up with sumcheck
     *
     */
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
     * @brief Get the inverse permutation polynomial (needed to compute its value)
     *
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
        using View = typename Accumulator::View;

        Accumulator const& first_set_enabled = Accumulator(
            View(std::get<PolynomialStructure::get_lookup_term_predicate_index()>(Settings::get_const_entities(in))));

        Accumulator const& second_set_enabled = Accumulator(
            View(std::get<PolynomialStructure::get_table_term_predicate_index()>(Settings::get_const_entities(in))));

        // The following expression (assuming the values are boolean) is the algebraic representation of a logical OR
        return (first_set_enabled + second_set_enabled - (first_set_enabled * second_set_enabled));
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

        // The selector/wire value that determines that an element from the first set needs to be included. Can be
        // different from the wire used in the write part.
        return Accumulator(
            View(std::get<PolynomialStructure::get_lookup_term_predicate_index()>(Settings::get_const_entities(in))));
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

        return Accumulator(
            View(std::get<PolynomialStructure::get_table_term_predicate_index()>(Settings::get_const_entities(in))));
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
        constexpr size_t start_polynomial_index = PolynomialStructure::compute_lookup_term_polynomial_offset();
        const FF beta = params.beta;
        const FF gamma = params.gamma;

        auto result = Accumulator(0);

        // Retrieve all polynomials used
        const auto all_polynomials = Settings::get_const_entities(in);

        // Iterate over tuple and sum as a polynomial over beta
        bb::constexpr_for<start_polynomial_index, start_polynomial_index + Settings::COLUMNS_PER_SET, 1>(
            [&]<size_t i>() { result = result * beta + View(std::get<i>(all_polynomials)); });

        return result + gamma;
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
        constexpr size_t start_polynomial_index = PolynomialStructure::compute_table_term_polynomial_offset();
        const FF beta = params.beta;
        const FF gamma = params.gamma;

        auto result = Accumulator(0);

        // Retrieve all polynomials used
        const auto all_polynomials = Settings::get_const_entities(in);

        // Iterate over tuple and sum as a polynomial over beta
        bb::constexpr_for<start_polynomial_index, start_polynomial_index + Settings::COLUMNS_PER_SET, 1>(
            [&]<size_t i>() { result = result * beta + View(std::get<i>(all_polynomials)); });

        return result + gamma;
    }

    /**
     * @brief Compute generic log-derivative set permutation subrelation accumulation
     * @details he generic log-derivative lookup relation consists of two subrelations. The first demonstrates that the
     * inverse polynomial I has been computed correctly. The second establishes the correctness of the lookups
     * themselves based on the log-derivative lookup argument. Note that the latter subrelation is "linearly dependent"
     * in the sense that it establishes that a sum across all rows of the exectution trace is zero, rather than that
     * some expression holds independently at each row. Accordingly, this subrelation is not multiplied by a scaling
     * factor at each accumulation step. See the documentation for GenericPermutationRelationImpl for the definition of
     * the subrelations.
     *
     * @tparam ContainerOverSubrelations Container type for accumulating subrelation contributions
     * @tparam AllEntities Type containing all polynomial entities
     * @tparam Parameters Type containing relation parameters
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
        _accumulate_logderivative_subrelation_contributions<FF,
                                                            GenericPermutationRelationImpl<Settings, FF>,
                                                            ContainerOverSubrelations,
                                                            AllEntities,
                                                            Parameters,
                                                            true>(accumulator, in, params, scaling_factor);
    }
};

template <typename Settings, typename FF>
using GenericPermutationRelation = Relation<GenericPermutationRelationImpl<Settings, FF>>;

} // namespace bb
