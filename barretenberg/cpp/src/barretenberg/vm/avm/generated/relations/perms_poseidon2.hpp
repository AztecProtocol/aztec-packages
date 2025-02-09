// AUTOGENERATED FILE
#pragma once

#include "../columns.hpp"
#include "barretenberg/relations/generic_permutation/generic_permutation_relation.hpp"

#include <cstddef>
#include <string_view>
#include <tuple>

namespace bb::avm {

/////////////////// perm_pos_mem_read_a ///////////////////

class perm_pos_mem_read_a_permutation_settings {
  public:
    static constexpr std::string_view NAME = "PERM_POS_MEM_READ_A";

    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 5;

    // Columns using the Column enum.
    static constexpr Column SRC_SELECTOR = Column::poseidon2_sel_poseidon_perm_mem_op;
    static constexpr Column DST_SELECTOR = Column::mem_sel_op_poseidon_read_a;
    static constexpr Column INVERSES = Column::perm_pos_mem_read_a_inv;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in._poseidon2_sel_poseidon_perm_mem_op() == 1 || in._mem_sel_op_poseidon_read_a() == 1);
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_read_a_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_read_a(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_read_a(),
                                     in._poseidon2_a_0(),
                                     in._main_zeroes(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_read_a_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_read_a(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_read_a(),
                                     in._poseidon2_a_0(),
                                     in._main_zeroes(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }
};

template <typename FF_>
class perm_pos_mem_read_a_relation : public GenericPermutationRelation<perm_pos_mem_read_a_permutation_settings, FF_> {
  public:
    static constexpr std::string_view NAME = perm_pos_mem_read_a_permutation_settings::NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.poseidon2_sel_poseidon_perm_mem_op.is_zero() && in.mem_sel_op_poseidon_read_a.is_zero();
    }
};
template <typename FF_> using perm_pos_mem_read_a = GenericPermutation<perm_pos_mem_read_a_permutation_settings, FF_>;

/////////////////// perm_pos_mem_read_b ///////////////////

class perm_pos_mem_read_b_permutation_settings {
  public:
    static constexpr std::string_view NAME = "PERM_POS_MEM_READ_B";

    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 5;

    // Columns using the Column enum.
    static constexpr Column SRC_SELECTOR = Column::poseidon2_sel_poseidon_perm_mem_op;
    static constexpr Column DST_SELECTOR = Column::mem_sel_op_poseidon_read_b;
    static constexpr Column INVERSES = Column::perm_pos_mem_read_b_inv;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in._poseidon2_sel_poseidon_perm_mem_op() == 1 || in._mem_sel_op_poseidon_read_b() == 1);
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_read_b_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_read_b(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_read_b(),
                                     in._poseidon2_a_1(),
                                     in._main_zeroes(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_read_b_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_read_b(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_read_b(),
                                     in._poseidon2_a_1(),
                                     in._main_zeroes(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }
};

template <typename FF_>
class perm_pos_mem_read_b_relation : public GenericPermutationRelation<perm_pos_mem_read_b_permutation_settings, FF_> {
  public:
    static constexpr std::string_view NAME = perm_pos_mem_read_b_permutation_settings::NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.poseidon2_sel_poseidon_perm_mem_op.is_zero() && in.mem_sel_op_poseidon_read_b.is_zero();
    }
};
template <typename FF_> using perm_pos_mem_read_b = GenericPermutation<perm_pos_mem_read_b_permutation_settings, FF_>;

/////////////////// perm_pos_mem_read_c ///////////////////

class perm_pos_mem_read_c_permutation_settings {
  public:
    static constexpr std::string_view NAME = "PERM_POS_MEM_READ_C";

    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 5;

    // Columns using the Column enum.
    static constexpr Column SRC_SELECTOR = Column::poseidon2_sel_poseidon_perm_mem_op;
    static constexpr Column DST_SELECTOR = Column::mem_sel_op_poseidon_read_c;
    static constexpr Column INVERSES = Column::perm_pos_mem_read_c_inv;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in._poseidon2_sel_poseidon_perm_mem_op() == 1 || in._mem_sel_op_poseidon_read_c() == 1);
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_read_c_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_read_c(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_read_c(),
                                     in._poseidon2_a_2(),
                                     in._main_zeroes(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_read_c_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_read_c(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_read_c(),
                                     in._poseidon2_a_2(),
                                     in._main_zeroes(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }
};

template <typename FF_>
class perm_pos_mem_read_c_relation : public GenericPermutationRelation<perm_pos_mem_read_c_permutation_settings, FF_> {
  public:
    static constexpr std::string_view NAME = perm_pos_mem_read_c_permutation_settings::NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.poseidon2_sel_poseidon_perm_mem_op.is_zero() && in.mem_sel_op_poseidon_read_c.is_zero();
    }
};
template <typename FF_> using perm_pos_mem_read_c = GenericPermutation<perm_pos_mem_read_c_permutation_settings, FF_>;

/////////////////// perm_pos_mem_read_d ///////////////////

class perm_pos_mem_read_d_permutation_settings {
  public:
    static constexpr std::string_view NAME = "PERM_POS_MEM_READ_D";

    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 5;

    // Columns using the Column enum.
    static constexpr Column SRC_SELECTOR = Column::poseidon2_sel_poseidon_perm_mem_op;
    static constexpr Column DST_SELECTOR = Column::mem_sel_op_poseidon_read_d;
    static constexpr Column INVERSES = Column::perm_pos_mem_read_d_inv;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in._poseidon2_sel_poseidon_perm_mem_op() == 1 || in._mem_sel_op_poseidon_read_d() == 1);
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_read_d_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_read_d(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_read_d(),
                                     in._poseidon2_a_3(),
                                     in._main_zeroes(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_read_d_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_read_d(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_read_d(),
                                     in._poseidon2_a_3(),
                                     in._main_zeroes(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }
};

template <typename FF_>
class perm_pos_mem_read_d_relation : public GenericPermutationRelation<perm_pos_mem_read_d_permutation_settings, FF_> {
  public:
    static constexpr std::string_view NAME = perm_pos_mem_read_d_permutation_settings::NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.poseidon2_sel_poseidon_perm_mem_op.is_zero() && in.mem_sel_op_poseidon_read_d.is_zero();
    }
};
template <typename FF_> using perm_pos_mem_read_d = GenericPermutation<perm_pos_mem_read_d_permutation_settings, FF_>;

/////////////////// perm_pos_mem_write_a ///////////////////

class perm_pos_mem_write_a_permutation_settings {
  public:
    static constexpr std::string_view NAME = "PERM_POS_MEM_WRITE_A";

    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 5;

    // Columns using the Column enum.
    static constexpr Column SRC_SELECTOR = Column::poseidon2_sel_poseidon_perm_mem_op;
    static constexpr Column DST_SELECTOR = Column::mem_sel_op_poseidon_write_a;
    static constexpr Column INVERSES = Column::perm_pos_mem_write_a_inv;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in._poseidon2_sel_poseidon_perm_mem_op() == 1 || in._mem_sel_op_poseidon_write_a() == 1);
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_write_a_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_write_a(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_write_a(),
                                     in._poseidon2_b_0(),
                                     in._poseidon2_sel_poseidon_perm(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_write_a_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_write_a(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_write_a(),
                                     in._poseidon2_b_0(),
                                     in._poseidon2_sel_poseidon_perm(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }
};

template <typename FF_>
class perm_pos_mem_write_a_relation
    : public GenericPermutationRelation<perm_pos_mem_write_a_permutation_settings, FF_> {
  public:
    static constexpr std::string_view NAME = perm_pos_mem_write_a_permutation_settings::NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.poseidon2_sel_poseidon_perm_mem_op.is_zero() && in.mem_sel_op_poseidon_write_a.is_zero();
    }
};
template <typename FF_> using perm_pos_mem_write_a = GenericPermutation<perm_pos_mem_write_a_permutation_settings, FF_>;

/////////////////// perm_pos_mem_write_b ///////////////////

class perm_pos_mem_write_b_permutation_settings {
  public:
    static constexpr std::string_view NAME = "PERM_POS_MEM_WRITE_B";

    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 5;

    // Columns using the Column enum.
    static constexpr Column SRC_SELECTOR = Column::poseidon2_sel_poseidon_perm_mem_op;
    static constexpr Column DST_SELECTOR = Column::mem_sel_op_poseidon_write_b;
    static constexpr Column INVERSES = Column::perm_pos_mem_write_b_inv;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in._poseidon2_sel_poseidon_perm_mem_op() == 1 || in._mem_sel_op_poseidon_write_b() == 1);
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_write_b_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_write_b(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_write_b(),
                                     in._poseidon2_b_1(),
                                     in._poseidon2_sel_poseidon_perm(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_write_b_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_write_b(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_write_b(),
                                     in._poseidon2_b_1(),
                                     in._poseidon2_sel_poseidon_perm(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }
};

template <typename FF_>
class perm_pos_mem_write_b_relation
    : public GenericPermutationRelation<perm_pos_mem_write_b_permutation_settings, FF_> {
  public:
    static constexpr std::string_view NAME = perm_pos_mem_write_b_permutation_settings::NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.poseidon2_sel_poseidon_perm_mem_op.is_zero() && in.mem_sel_op_poseidon_write_b.is_zero();
    }
};
template <typename FF_> using perm_pos_mem_write_b = GenericPermutation<perm_pos_mem_write_b_permutation_settings, FF_>;

/////////////////// perm_pos_mem_write_c ///////////////////

class perm_pos_mem_write_c_permutation_settings {
  public:
    static constexpr std::string_view NAME = "PERM_POS_MEM_WRITE_C";

    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 5;

    // Columns using the Column enum.
    static constexpr Column SRC_SELECTOR = Column::poseidon2_sel_poseidon_perm_mem_op;
    static constexpr Column DST_SELECTOR = Column::mem_sel_op_poseidon_write_c;
    static constexpr Column INVERSES = Column::perm_pos_mem_write_c_inv;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in._poseidon2_sel_poseidon_perm_mem_op() == 1 || in._mem_sel_op_poseidon_write_c() == 1);
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_write_c_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_write_c(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_write_c(),
                                     in._poseidon2_b_2(),
                                     in._poseidon2_sel_poseidon_perm(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_write_c_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_write_c(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_write_c(),
                                     in._poseidon2_b_2(),
                                     in._poseidon2_sel_poseidon_perm(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }
};

template <typename FF_>
class perm_pos_mem_write_c_relation
    : public GenericPermutationRelation<perm_pos_mem_write_c_permutation_settings, FF_> {
  public:
    static constexpr std::string_view NAME = perm_pos_mem_write_c_permutation_settings::NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.poseidon2_sel_poseidon_perm_mem_op.is_zero() && in.mem_sel_op_poseidon_write_c.is_zero();
    }
};
template <typename FF_> using perm_pos_mem_write_c = GenericPermutation<perm_pos_mem_write_c_permutation_settings, FF_>;

/////////////////// perm_pos_mem_write_d ///////////////////

class perm_pos_mem_write_d_permutation_settings {
  public:
    static constexpr std::string_view NAME = "PERM_POS_MEM_WRITE_D";

    // This constant defines how many columns are bundled together to form each set.
    constexpr static size_t COLUMNS_PER_SET = 5;

    // Columns using the Column enum.
    static constexpr Column SRC_SELECTOR = Column::poseidon2_sel_poseidon_perm_mem_op;
    static constexpr Column DST_SELECTOR = Column::mem_sel_op_poseidon_write_d;
    static constexpr Column INVERSES = Column::perm_pos_mem_write_d_inv;

    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return (in._poseidon2_sel_poseidon_perm_mem_op() == 1 || in._mem_sel_op_poseidon_write_d() == 1);
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_write_d_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_write_d(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_write_d(),
                                     in._poseidon2_b_3(),
                                     in._poseidon2_sel_poseidon_perm(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {
        return std::forward_as_tuple(in._perm_pos_mem_write_d_inv(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._poseidon2_sel_poseidon_perm_mem_op(),
                                     in._mem_sel_op_poseidon_write_d(),
                                     in._poseidon2_clk(),
                                     in._poseidon2_space_id(),
                                     in._poseidon2_mem_addr_write_d(),
                                     in._poseidon2_b_3(),
                                     in._poseidon2_sel_poseidon_perm(),
                                     in._mem_clk(),
                                     in._mem_space_id(),
                                     in._mem_addr(),
                                     in._mem_val(),
                                     in._mem_rw());
    }
};

template <typename FF_>
class perm_pos_mem_write_d_relation
    : public GenericPermutationRelation<perm_pos_mem_write_d_permutation_settings, FF_> {
  public:
    static constexpr std::string_view NAME = perm_pos_mem_write_d_permutation_settings::NAME;

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        return in.poseidon2_sel_poseidon_perm_mem_op.is_zero() && in.mem_sel_op_poseidon_write_d.is_zero();
    }
};
template <typename FF_> using perm_pos_mem_write_d = GenericPermutation<perm_pos_mem_write_d_permutation_settings, FF_>;

} // namespace bb::avm