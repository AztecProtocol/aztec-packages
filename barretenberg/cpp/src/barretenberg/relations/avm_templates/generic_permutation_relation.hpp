/**
 * @file generic_permutation_relation.hpp
 * @author Rumata888
 * @brief This file contains an example relation that is used as a basis for generic permutation relations generated
 * with PIL
 *
 */
#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace proof_system::honk::sumcheck {

template <typename FF_> class GenericPermutationRelationImpl {
  public:
    using FF = FF_;
    // Read and write terms counts should stay set to 1 unless we want to permute several columns at once as accumulated
    // sets (not as tuples).
    static constexpr size_t READ_TERMS = 1;
    static constexpr size_t WRITE_TERMS = 1;
    // 1 + polynomial degree of this relation
    static constexpr size_t LENGTH = READ_TERMS + WRITE_TERMS + 3; // 5

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
     *
     * @param row All values at row
     */
    template <typename AllValues> static bool operation_exists_at_row(const AllValues& row)

    {
        // WIRE/SELECTOR enabling the permutation
        // N.B. PIL TEMPLATED VALUE
        return (row.enable_set_permutation == 1);
    }

    /**
     * @brief Get the inverse permutation polynomial
     *
     */
    template <typename AllEntities> static auto& get_inverse_polynomial(AllEntities& in)
    {
        // WIRE containing the inverse of the product of terms at this row. Used to reconstruct individual inversed
        // terms
        // N.B. PIL TEMPLATED VALUE
        return in.permutation_inverses;
    }

    /**
     * @brief Get selector/wire switching on(1) or off(0) inverse computation
     *
     */
    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        using View = typename Accumulator::View;

        // WIRE/SELECTOR enabling the permutation used in the sumcheck computation. This affects the first subrelation
        // N.B. PIL TEMPLATED VALUE
        return Accumulator(View(in.enable_set_permutation));
    }

    /**
     * @brief Compute if the value from the first set exists in this row
     *
     * @tparam read_index Kept for compatibility with lookups, behavior doesn't change
     */
    template <typename Accumulator, size_t read_index, typename AllEntities>
    static Accumulator compute_read_term_predicate(const AllEntities& in)

    {
        static_assert(read_index < WRITE_TERMS);
        using View = typename Accumulator::View;

        // The selector/wire value that determines that an element from the first set needs to be included. Can be
        // different from the wire used in the write part.
        // N.B. PIL TEMPLATED VALUE
        return Accumulator(View(in.enable_set_permutation));
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

        // The selector/wire value that determines that an element from the second set needs to be included. Can be
        // different from the wire used in the read part.
        // N.B. PIL TEMPLATED VALUE
        return Accumulator(View(in.enable_set_permutation));
    }

    /**
     * @brief Compute the value of a single item in the set
     *
     * @details Computes the polynomial \gamma + \sum_{i=0}^{num_columns}(column_i*\beta^i), so the tuple of columnes is
     * in the first set
     *
     * @tparam read_index Kept for compatibility with lookups, behavior doesn't change
     *
     * @param params Used for beta and gamma
     */
    template <typename Accumulator, size_t read_index, typename AllEntities, typename Parameters>
    static Accumulator compute_read_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        static_assert(read_index < READ_TERMS);

        // The tuple of columns a single row of which represents a single element of the first set (we are doing a
        // permutation of tuples). The length is 1+
        // N.B. PIL TEMPLATED VALUE
        const auto read_term_entitites =
            std::forward_as_tuple(View(in.permutation_set_column_3), View(in.permutation_set_column_4));

        auto result = Accumulator(0);
        constexpr size_t tuple_size = std::tuple_size_v<decltype(read_term_entitites)>;
        // Iterate over tuple and sum as a polynomial over beta
        barretenberg::constexpr_for<0, tuple_size, 1>(
            [&]<size_t i>() { result = result * params.beta + std::get<i>(read_term_entitites); });

        const auto& gamma = params.gamma;
        return result + gamma;
    }

    /**
     * @brief Compute the value of a single item in the set
     *
     * @details Computes the polynomial \gamma + \sum_{i=0}^{num_columns}(column_i*\beta^i), so the tuple of columnes is
     * in the second set
     *
     * @tparam write_index Kept for compatibility with lookups, behavior doesn't change
     *
     * @param params Used for beta and gamma
     */
    template <typename Accumulator, size_t write_index, typename AllEntities, typename Parameters>
    static Accumulator compute_write_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        static_assert(write_index < WRITE_TERMS);

        // The tuple of columns a single row of which represents a single element of the second set (we are doing a
        // permutation of tuples). The length is 1+
        // N.B. PIL TEMPLATED VALUE
        const auto write_term_entities =
            std::forward_as_tuple(View(in.permutation_set_column_1), View(in.permutation_set_column_2));
        auto result = Accumulator(0);
        constexpr size_t tuple_size = std::tuple_size_v<decltype(write_term_entities)>;

        // Iterate over tuple and sum as a polynomial over beta
        barretenberg::constexpr_for<0, tuple_size, 1>(
            [&]<size_t i>() { result = result * params.beta + std::get<i>(write_term_entities); });
        const auto& gamma = params.gamma;
        return result + gamma;
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

template <typename FF> using GenericPermutationRelation = Relation<GenericPermutationRelationImpl<FF>>;

} // namespace proof_system::honk::sumcheck
