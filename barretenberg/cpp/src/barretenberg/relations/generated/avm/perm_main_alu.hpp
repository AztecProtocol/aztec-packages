

#pragma once

#include "barretenberg/relations/generic_permutation/generic_permutation_relation.hpp"

#include <cstddef>
#include <tuple>

namespace bb {

class perm_main_alu_permutation_settings {
  public:
    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 16;

    /**
     * @brief If this method returns true on a row of values, then the inverse polynomial at this index. Otherwise the
     * value needs to be set to zero.
     *
     * @details If this is true then permutation takes place in this row
     */

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in.main_sel_alu == 1 || in.alu_sel_alu == 1);
    }

    /**
     * @brief Get all the entities for the permutation when we don't need to update them
     *
     * @details The entities are returned as a tuple of references in the following order:
     * - The entity/polynomial used to store the product of the inverse values
     * - The entity/polynomial that switches on the subrelation of the permutation relation that ensures correctness of
     * the inverse polynomial
     * - The entity/polynomial that enables adding a tuple-generated value from the first set to the logderivative sum
     * subrelation
     * - The entity/polynomial that enables adding a tuple-generated value from the second set to the logderivative sum
     * subrelation
     * - A sequence of COLUMNS_PER_SET entities/polynomials that represent the first set (N.B. ORDER IS IMPORTANT!)
     * - A sequence of COLUMNS_PER_SET entities/polynomials that represent the second set (N.B. ORDER IS IMPORTANT!)
     *
     * @return All the entities needed for the permutation
     */

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {

        return std::forward_as_tuple(in.perm_main_alu,
                                     in.main_sel_alu,
                                     in.main_sel_alu,
                                     in.alu_sel_alu,
                                     in.main_clk,
                                     in.main_ia,
                                     in.main_ib,
                                     in.main_ic,
                                     in.main_sel_op_add,
                                     in.main_sel_op_sub,
                                     in.main_sel_op_mul,
                                     in.main_sel_op_div,
                                     in.main_sel_op_eq,
                                     in.main_sel_op_not,
                                     in.main_sel_op_cast,
                                     in.main_sel_op_lt,
                                     in.main_sel_op_lte,
                                     in.main_sel_op_shr,
                                     in.main_sel_op_shl,
                                     in.main_alu_in_tag,
                                     in.alu_clk,
                                     in.alu_ia,
                                     in.alu_ib,
                                     in.alu_ic,
                                     in.alu_op_add,
                                     in.alu_op_sub,
                                     in.alu_op_mul,
                                     in.alu_op_div,
                                     in.alu_op_eq,
                                     in.alu_op_not,
                                     in.alu_op_cast,
                                     in.alu_op_lt,
                                     in.alu_op_lte,
                                     in.alu_op_shr,
                                     in.alu_op_shl,
                                     in.alu_in_tag);
    }

    /**
     * @brief Get all the entities for the permutation when need to update them
     *
     * @details The entities are returned as a tuple of references in the following order:
     * - The entity/polynomial used to store the product of the inverse values
     * - The entity/polynomial that switches on the subrelation of the permutation relation that ensures correctness of
     * the inverse polynomial
     * - The entity/polynomial that enables adding a tuple-generated value from the first set to the logderivative sum
     * subrelation
     * - The entity/polynomial that enables adding a tuple-generated value from the second set to the logderivative sum
     * subrelation
     * - A sequence of COLUMNS_PER_SET entities/polynomials that represent the first set (N.B. ORDER IS IMPORTANT!)
     * - A sequence of COLUMNS_PER_SET entities/polynomials that represent the second set (N.B. ORDER IS IMPORTANT!)
     *
     * @return All the entities needed for the permutation
     */

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {

        return std::forward_as_tuple(in.perm_main_alu,
                                     in.main_sel_alu,
                                     in.main_sel_alu,
                                     in.alu_sel_alu,
                                     in.main_clk,
                                     in.main_ia,
                                     in.main_ib,
                                     in.main_ic,
                                     in.main_sel_op_add,
                                     in.main_sel_op_sub,
                                     in.main_sel_op_mul,
                                     in.main_sel_op_div,
                                     in.main_sel_op_eq,
                                     in.main_sel_op_not,
                                     in.main_sel_op_cast,
                                     in.main_sel_op_lt,
                                     in.main_sel_op_lte,
                                     in.main_sel_op_shr,
                                     in.main_sel_op_shl,
                                     in.main_alu_in_tag,
                                     in.alu_clk,
                                     in.alu_ia,
                                     in.alu_ib,
                                     in.alu_ic,
                                     in.alu_op_add,
                                     in.alu_op_sub,
                                     in.alu_op_mul,
                                     in.alu_op_div,
                                     in.alu_op_eq,
                                     in.alu_op_not,
                                     in.alu_op_cast,
                                     in.alu_op_lt,
                                     in.alu_op_lte,
                                     in.alu_op_shr,
                                     in.alu_op_shl,
                                     in.alu_in_tag);
    }
};

template <typename FF_>
using perm_main_alu_relation = GenericPermutationRelation<perm_main_alu_permutation_settings, FF_>;
template <typename FF_> using perm_main_alu = GenericPermutation<perm_main_alu_permutation_settings, FF_>;

} // namespace bb
