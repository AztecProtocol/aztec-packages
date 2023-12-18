/**
 * @file generic_lookup_relation.hpp
 * @author Rumata888
 * @brief This file contains the template for the generic lookup that can be specialized to enforce various
 * lookups (for explanation on how to define them, see "relation_definer.hpp")
 *
 * @details Lookup is a mechanism to ensure that a particular value or tuple of values (these can be values of
 * witnesses, selectors or function of these) is contained withing a particular set. It is a relative of set
 * permutation, but has a one-to-many relationship beween elements that are being looked up and the table of values they
 * are being looked up from. In this relation template we use the following terminology:
 * + READ - the action of looking up the value in the table
 * + WRITE - the action of adding the value to the lookup table
 *
 * TODO(@Rumata888): Talk to Zac why "lookup_read_count" refers to the count of the looked up element in the multiset.
 * (The value is applied to the write predicate, so it is confusing).
 */
#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace proof_system::honk::sumcheck {
/**
 * @brief Specifies positions of elements in the tuple of entities received from methods in the Settings class
 *
 */

template <typename Settings, typename FF_> class GenericLookupRelationImpl {
  public:
    using FF = FF_;
    // Read and write terms counts should stay set to 1 unless we want to permute several columns at once as accumulated
    // sets (not as tuples).
    static constexpr size_t READ_TERMS = Settings::READ_TERMS;
    static constexpr size_t WRITE_TERMS = Settings::WRITE_TERMS;

    static constexpr size_t LOOKUP_TUPLE_SIZE = Settings::LOOKUP_TUPLE_SIZE;
    // 1 + polynomial degree of this relation
    static constexpr size_t LENGTH = READ_TERMS + WRITE_TERMS + 3; // 5

    // The structure of polynomial tuple returned from Settings' functions get_const_entities and get_nonconst_entities
    // is the following:
    // 1) 1 Polynomial used to contain the inverse product from which we reconstruct individual inverses
    // used in the sum
    // 2) WRITE_TERMS number of polynomials representing how much each write term has been read
    // 3) READ_TERMS number of polynomials enabling the addition of a particular read term in this row (should we lookup
    // or not)
    // 4) WRITE_TERMS number of polynomials enabling a particular write term in this row (should we add it to
    // the lookup table or not)
    // 5) Depending on the type of read terms (BASIC_TUPLE, SCALED_TUPLE or ARBITRARY):
    //  1. In case of basic tuple READ_TERMS polynomials the combination of whose values in a row is supposed to
    //  represent the looked up entry
    //  2. In case of scaled tuple there are READ_TERMS previous accumulator polynomials, READ_TERMS
    //  scaling polynomials and READ_TERMS current accumulator polynomials. The tuple is comprised of values
    //  (current_accumulator-scale*previous_accumulator)
    //  3. In the arbitrary case the are no additional read_term
    //  polynomials, because the logic is completely decided in the settings
    // 6) Depending on the type of read terms (BASIC_TUPLE or ARBITRARY):
    //  1. In case of basic tuple WRITE_TERNS polynomials the combination of whose values in a row is supposed to
    //  represent the entry written into the lookup table
    //  2. In the arbitrary case the are no additional write term polynomials,
    //  because the logic is completely decided in the settings
    static constexpr size_t INVERSE_POLYNOMIAL_INDEX = 0;
    static constexpr size_t LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX = 1;
    static constexpr size_t LOOKUP_READ_TERM_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_READ_COUNT_START_POLYNOMIAL_INDEX + WRITE_TERMS;
    static constexpr size_t LOOKUP_WRITE_TERM_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_READ_TERM_PREDICATE_START_POLYNOMIAL_INDEX + READ_TERMS;
    static constexpr size_t LOOKUP_READ_PREDICATE_START_POLYNOMIAL_INDEX =
        LOOKUP_WRITE_TERM_PREDICATE_START_POLYNOMIAL_INDEX + WRITE_TERMS;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        LENGTH, // inverse polynomial correctness sub-relation
        LENGTH  // log-derived terms subrelation
    };

    /**
     * @brief We apply the power polynomial only to the first subrelation
     *
     *@details The first subrelation establishes correspondence between the inverse polynomial elements and the terms.
     *The second relation computes the inverses of individual terms, which are then summed up with sumcheck
     *
     */
    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, false };

    /**
     * @brief Check if we need to compute the inverse polynomial element value for this row
     * @details This proxies to a method in the Settings class
     *
     * @param row All values at row
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
        // WIRE containing the inverse of the product of terms at this row. Used to reconstruct individual inversed
        // terms
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
     * @brief Returns the number of times a particular value is written (how many times it is being looked up)
     *
     * @details Lookup read counts should be independent columns, so there is no need to call a separate function
     *
     * @tparam Accumulator
     * @tparam index The index of the write predicate to which this count belongs
     * @tparam AllEntities
     * @param in
     * @return Accumulator
     */
    template <typename Accumulator, size_t index, typename AllEntities>
    static Accumulator lookup_read_counts(const AllEntities& in)
    {

        static_assert(index < WRITE_TERMS);
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
        static_assert(Settings::READ_TERM_TYPE < 3);
        static_assert(Settings::READ_TERM_TYPE >= 0);
        enum READ_TERM_TYPES { BASIC_TUPLE = 0, SCALED_TUPLE, ARBITRARY };

        if constexpr (Settings::READ_TERM_TYPE == BASIC_TUPLE) {
            // Retrieve all polynomials used
            const auto all_polynomials = Settings::get_const_entities(in);

            auto result = Accumulator(0);

            // Iterate over tuple and sum as a polynomial over beta
            barretenberg::constexpr_for<LOOKUP_READ_PREDICATE_START_POLYNOMIAL_INDEX + read_index * LOOKUP_TUPLE_SIZE,
                                        LOOKUP_READ_PREDICATE_START_POLYNOMIAL_INDEX +
                                            (read_index + 1) * LOOKUP_TUPLE_SIZE,
                                        1>(
                [&]<size_t i>() { result = (result * params.beta) + View(std::get<i>(all_polynomials)); });
            const auto& gamma = params.gamma;
            return result + gamma;
        } else if constexpr (Settings::READ_TERM_TYPE == SCALED_TUPLE) {
            // Retrieve all polynomials used
            const auto all_polynomials = Settings::get_const_entities(in);

            auto result = Accumulator(0);
            // Iterate over tuple and sum as a polynomial over beta
            barretenberg::constexpr_for<
                LOOKUP_READ_PREDICATE_START_POLYNOMIAL_INDEX + read_index * 3 * LOOKUP_TUPLE_SIZE,
                LOOKUP_READ_PREDICATE_START_POLYNOMIAL_INDEX + (read_index * 3 + 1) * LOOKUP_TUPLE_SIZE,
                1>([&]<size_t i>() {
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
        static_assert(Settings::WRITE_TERM_TYPE < 2);
        static_assert(Settings::WRITE_TERM_TYPE >= 0);
        static_assert(Settings::READ_TERM_TYPE < 3);
        static_assert(Settings::READ_TERM_TYPE >= 0);
        enum READ_TERM_TYPES { BASIC_TUPLE = 0, SCALED_TUPLE, ARBITRARY };
        enum WRITE_TERM_TYPES { WRITE_BASIC_TUPLE = 0, WRITE_ARBITRARY };

        using View = typename Accumulator::View;
        // Write term offset is dependet on which read term computation method is used
        constexpr size_t WRITE_TERMS_OFFSET = LOOKUP_READ_PREDICATE_START_POLYNOMIAL_INDEX +
                                              (Settings::READ_TERM_TYPE == BASIC_TUPLE    ? LOOKUP_TUPLE_SIZE
                                               : Settings::READ_TERM_TYPE == SCALED_TUPLE ? LOOKUP_TUPLE_SIZE * 3
                                                                                          : 0);
        if constexpr (Settings::WRITE_TERM_TYPE == WRITE_BASIC_TUPLE) {
            // Retrieve all polynomials used
            const auto all_polynomials = Settings::get_const_entities(in);

            auto result = Accumulator(0);

            // Iterate over tuple and sum as a polynomial over beta
            barretenberg::constexpr_for<WRITE_TERMS_OFFSET + write_index * LOOKUP_TUPLE_SIZE,
                                        WRITE_TERMS_OFFSET + (write_index + 1) * LOOKUP_TUPLE_SIZE,
                                        1>(
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
                           const FF& scaling_factor);
};

template <typename Settings, typename FF>
using GenericLookupRelation = Relation<GenericLookupRelationImpl<Settings, FF>>;

} // namespace proof_system::honk::sumcheck
