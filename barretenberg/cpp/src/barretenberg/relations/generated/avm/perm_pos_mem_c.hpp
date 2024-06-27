#pragma once

#include "barretenberg/relations/generic_permutation/generic_permutation_relation.hpp"

#include <cstddef>
#include <tuple>

namespace bb {

class perm_pos_mem_c_permutation_settings {
  public:
    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 7;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in.poseidon2_mem_op == 1 || in.mem_sel_op_gadget_c == 1);
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return std::forward_as_tuple(in.perm_pos_mem_c,
                                     in.poseidon2_mem_op,
                                     in.poseidon2_mem_op,
                                     in.mem_sel_op_gadget_c,
                                     in.poseidon2_clk,
                                     in.main_space_id,
                                     in.poseidon2_mem_addr_c,
                                     in.poseidon2_a_2,
                                     in.poseidon2_write_line,
                                     in.poseidon2_in_tag,
                                     in.poseidon2_in_tag,
                                     in.mem_clk,
                                     in.mem_space_id,
                                     in.mem_addr,
                                     in.mem_val,
                                     in.mem_rw,
                                     in.mem_r_in_tag,
                                     in.mem_w_in_tag);
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return std::forward_as_tuple(in.perm_pos_mem_c,
                                     in.poseidon2_mem_op,
                                     in.poseidon2_mem_op,
                                     in.mem_sel_op_gadget_c,
                                     in.poseidon2_clk,
                                     in.main_space_id,
                                     in.poseidon2_mem_addr_c,
                                     in.poseidon2_a_2,
                                     in.poseidon2_write_line,
                                     in.poseidon2_in_tag,
                                     in.poseidon2_in_tag,
                                     in.mem_clk,
                                     in.mem_space_id,
                                     in.mem_addr,
                                     in.mem_val,
                                     in.mem_rw,
                                     in.mem_r_in_tag,
                                     in.mem_w_in_tag);
    }
};

template <typename FF_>
class perm_pos_mem_c_relation : public GenericPermutationRelation<perm_pos_mem_c_permutation_settings, FF_> {
  public:
    static constexpr const char* NAME = "PERM_POS_MEM_C";
};
template <typename FF_> using perm_pos_mem_c = GenericPermutation<perm_pos_mem_c_permutation_settings, FF_>;

} // namespace bb