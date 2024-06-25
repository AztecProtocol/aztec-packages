/**
 * @file generic_copy_relation.hpp
 * @author Maddiaa0
 * @brief This file contains the template for the generic grand products that can be specialized to enforce various
 * copy constraints
 *
 */
#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename Settings, typename FF_> class GenericCopyRelationImpl {
  public:
    using FF = FF_;
    // Read and write terms counts should stay set to 1 unless we want to permute several columns at once as accumulated
    // sets (not as tuples).
    static constexpr size_t READ_TERMS = 1;
    static constexpr size_t WRITE_TERMS = 1;
    // 1 + polynomial degree of this relation

    // As each copy tuple is multiplied together
    // TODO(md): update relation degree lengths
    static constexpr size_t LENGTH = 2 * Settings::COLUMNS_PER_SET;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        LENGTH, // inverse polynomial correctness sub-relation
        LENGTH  // Final grand product value check
    };

    // Contains the index of the polynomial used to calculate grand products
    static constexpr size_t GRAND_PRODUCT_POLYNOMIAL_INDEX = 0;

    // Contains the index of the polynomial that is a shift of the grand product
    static constexpr size_t GRAND_PRODUCT_SHIFT_POLYNOMIAL_INDEX = 1;

    // Contains the index of the LAGRANGE FIRST polynomial
    static constexpr size_t LAGRANGE_FIRST_POLYMONIAL_INDEX = 2;

    // Contains the index of the LAGRANGE LAST polynomial
    static constexpr size_t LAGRANGE_LAST_POLYMONIAL_INDEX = 3;

    // The lhs (read) terms will be COLUMNS_PER_SET long starting from index 1
    static constexpr size_t COPY_SET_POLYNOMIAL_INDEX = 4;

    // The rhs (write) terms will be COLUMNS_PER_SET long starting from the end of COPY_SET
    static constexpr size_t SIGMA_SET_POLYNOMIAL_INDEX = COPY_SET_POLYNOMIAL_INDEX + Settings::COLUMNS_PER_SET;

    // The identity terms will be the last set of polynomials, and will be COLUMNS_PER_SET long
    static constexpr size_t IDENTITY_SET_POLYNOMIAL_INDEX = SIGMA_SET_POLYNOMIAL_INDEX + Settings::COLUMNS_PER_SET;

    /**
     * @brief Both relations are linearly independent as the grand product is calculated on a per row basis
     *
     */
    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, true };

    /**
     * @brief Get the grand product polynomial
     *
     */
    template <typename AllEntities> static auto& get_grand_product_polynomial(AllEntities& in)
    {
        return std::get<GRAND_PRODUCT_POLYNOMIAL_INDEX>(Settings::get_nonconst_entities(in));
    }

    /**
     * @brief Get the grand product shift polynomial
     *
     */
    template <typename AllEntities> static auto& get_grand_product_shift_polynomial(AllEntities& in)
    {
        return std::get<GRAND_PRODUCT_SHIFT_POLYNOMIAL_INDEX>(Settings::get_nonconst_entities(in));
    }

    /**
     * @brief Get the lagrange first polynomial
     */
    template <typename AllEntities> static auto& get_lagrange_first_polynomial(AllEntities& in)
    {
        return std::get<LAGRANGE_FIRST_POLYMONIAL_INDEX>(Settings::get_nonconst_entities(in));
    }

    /**
     * @brief Get the lagrange last polynomial
     */
    template <typename AllEntities> static auto& get_lagrange_last_polynomial(AllEntities& in)
    {
        return std::get<LAGRANGE_LAST_POLYMONIAL_INDEX>(Settings::get_nonconst_entities(in));
    }

    /**
     * @brief Compute the value of a single item in the set
     *
     * @details Computes the polynomial \sum_{i=0}^{num_columns}(\gamma + column_{i} + id_{i}*\beta_{i}), so the tuple
     * of
     *
     * @param params Used for beta and gamma
     */
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_grand_product_numerator(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;
        using ParameterView = GetParameterView<Parameters, View>;

        const auto grand_product_contribution_polynomials = Settings::get_const_entities(in);

        const ParameterView& gamma = ParameterView(params.gamma);
        const ParameterView& beta = ParameterView(params.beta);

        auto result = Accumulator(1);

        // For each polynomial in the permuatation sets
        bb::constexpr_for<0, Settings::COLUMNS_PER_SET, 1>([&]<size_t i>() {
            const View& value = View(std::get<COPY_SET_POLYNOMIAL_INDEX + i>(grand_product_contribution_polynomials));
            const View& id = View(std::get<IDENTITY_SET_POLYNOMIAL_INDEX + i>(grand_product_contribution_polynomials));

            result = result * (value + (id * beta) + gamma);
        });

        return result;
    }

    /**
     * @brief Compute the value of a single item in the set
     *
     * @details Computes the polynomial \gamma + \sum_{i=0}^{num_columns}(val_{i} + \sigma\beta + \gamma), so the tuple
     * of columns is
     *
     * @param params Used for beta and gamma
     */
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_grand_product_denominator(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;
        using ParameterView = GetParameterView<Parameters, View>;

        const auto& grand_product_contribution_polynomials = Settings::get_const_entities(in);

        const ParameterView& gamma = ParameterView(params.gamma);
        const ParameterView& beta = ParameterView(params.beta);

        auto result = Accumulator(1);
        bb::constexpr_for<0, Settings::COLUMNS_PER_SET, 1>([&]<size_t i>() {
            const View& value = View(std::get<COPY_SET_POLYNOMIAL_INDEX + i>(grand_product_contribution_polynomials));
            const View& sigma = View(std::get<SIGMA_SET_POLYNOMIAL_INDEX + i>(grand_product_contribution_polynomials));

            result = result * (value + (sigma * beta) + gamma);
        });

        return result;
    }

    /**
     * @brief Expression for generic grand product based set permutation.
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
        accumulate_grand_product_subrelation_contributions<FF, GenericCopyRelationImpl<Settings, FF>>(
            accumulator, in, params, scaling_factor);
    }
};

template <typename Settings, typename FF> using GenericCopyRelation = Relation<GenericCopyRelationImpl<Settings, FF>>;
template <typename Settings, typename FF> using GenericCopy = GenericCopyRelationImpl<Settings, FF>;

} // namespace bb
