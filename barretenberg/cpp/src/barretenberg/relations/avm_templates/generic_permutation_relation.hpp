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
    static constexpr size_t READ_TERMS = 1;
    static constexpr size_t WRITE_TERMS = 1;
    // 1 + polynomial degree of this relation
    static constexpr size_t LENGTH = READ_TERMS + WRITE_TERMS + 3; // 9

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        LENGTH, // grand product construction sub-relation
        LENGTH  // left-shiftable polynomial sub-relation
    };

    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, false };

    template <typename AllValues> static bool operation_exists_at_row(const AllValues& row)

    {
        // WIRE/SELECTOR enabling the permutation
        return (row.enable_set_permutation == 1);
    }

    /**
     * @brief Get the inverse permutation polynomial
     *
     * @tparam AllEntities
     * @param in
     * @return auto&
     */
    template <typename AllEntities> static auto& get_inverse_polynomial(AllEntities& in)
    {
        return in.permutation_inverses;
    }

    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        using View = typename Accumulator::View;

        return Accumulator(View(in.enable_set_permutation));
    }

    template <typename Accumulator, size_t read_index, typename AllEntities>
    static Accumulator compute_read_term_predicate(const AllEntities& in)

    {
        static_assert(read_index < WRITE_TERMS);
        using View = typename Accumulator::View;

        return Accumulator(View(in.enable_set_permutation));
    }

    template <typename Accumulator, size_t write_index, typename AllEntities>
    static Accumulator compute_write_term_predicate(const AllEntities& in)
    {
        static_assert(write_index < WRITE_TERMS);
        using View = typename Accumulator::View;

        return Accumulator(View(in.enable_set_permutation));
    }

    template <typename Accumulator, size_t write_index, typename AllEntities, typename Parameters>
    static Accumulator compute_write_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        static_assert(write_index < WRITE_TERMS);

        const auto write_term_entities =
            std::forward_as_tuple(View(in.permutation_set_column_1), View(in.permutation_set_column_2));
        auto result = Accumulator(0);
        constexpr size_t tuple_size = std::tuple_size_v<decltype(write_term_entities)>;
        barretenberg::constexpr_for<0, tuple_size, 1>(
            [&]<size_t i>() { result = result * params.beta + std::get<i>(write_term_entities); });
        const auto& gamma = params.gamma;
        return result + gamma;
    }

    template <typename Accumulator, size_t read_index, typename AllEntities, typename Parameters>
    static Accumulator compute_read_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        // read term:
        static_assert(read_index < READ_TERMS);
        const auto read_term_entitites =
            std::forward_as_tuple(View(in.permutation_set_column_3), View(in.permutation_set_column_4));
        auto result = Accumulator(0);
        constexpr size_t tuple_size = std::tuple_size_v<decltype(read_term_entitites)>;
        barretenberg::constexpr_for<0, tuple_size, 1>(
            [&]<size_t i>() { result = result * params.beta + std::get<i>(read_term_entitites); });

        const auto& gamma = params.gamma;
        return result + gamma;
    }

    /**
     * @brief Expression for ECCVM lookup tables.
     * @details We use log-derivative lookup tables for the following case:
     * Table writes: ECCVMPointTable columns: we define Straus point table:
     * { {0, -15[P]}, {1, -13[P]}, ..., {15, 15[P]} }
     * write source: { precompute_round, precompute_tx, precompute_ty }
     * Table reads: ECCVMMSM columns. Each row adds up to 4 points into MSM accumulator
     * read source: { msm_slice1, msm_x1, msm_y1 }, ..., { msm_slice4, msm_x4, msm_y4 }
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
