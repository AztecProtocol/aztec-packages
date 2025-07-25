// AUTOGENERATED FILE
#pragma once

#include <cstddef>
#include <string_view>
#include <tuple>

#include "../columns.hpp"
#include "barretenberg/relations/generic_lookup/generic_lookup_relation.hpp"
#include "barretenberg/vm2/constraining/relations/interactions_base.hpp"

namespace bb::avm2 {

/////////////////// lookup_alu_register_tag_value ///////////////////

struct lookup_alu_register_tag_value_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_REGISTER_TAG_VALUE";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 8;
    static constexpr Column SRC_SELECTOR = Column::execution_sel_execute_alu;
    static constexpr Column DST_SELECTOR = Column::alu_sel;
    static constexpr Column COUNTS = Column::lookup_alu_register_tag_value_counts;
    static constexpr Column INVERSES = Column::lookup_alu_register_tag_value_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::execution_register_0_,           ColumnAndShifts::execution_mem_tag_reg_0_,
        ColumnAndShifts::execution_register_1_,           ColumnAndShifts::execution_mem_tag_reg_1_,
        ColumnAndShifts::execution_register_2_,           ColumnAndShifts::execution_mem_tag_reg_2_,
        ColumnAndShifts::execution_subtrace_operation_id, ColumnAndShifts::execution_sel_opcode_error
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::alu_ia,     ColumnAndShifts::alu_ia_tag,     ColumnAndShifts::alu_ib,
        ColumnAndShifts::alu_ib_tag, ColumnAndShifts::alu_ic,         ColumnAndShifts::alu_ic_tag,
        ColumnAndShifts::alu_op_id,  ColumnAndShifts::alu_sel_tag_err
    };
};

using lookup_alu_register_tag_value_settings = lookup_settings<lookup_alu_register_tag_value_settings_>;
template <typename FF_>
using lookup_alu_register_tag_value_relation = lookup_relation_base<FF_, lookup_alu_register_tag_value_settings>;

/////////////////// lookup_alu_tag_max_bits_value ///////////////////

struct lookup_alu_tag_max_bits_value_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_TAG_MAX_BITS_VALUE";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 3;
    static constexpr Column SRC_SELECTOR = Column::alu_sel;
    static constexpr Column DST_SELECTOR = Column::precomputed_sel_tag_parameters;
    static constexpr Column COUNTS = Column::lookup_alu_tag_max_bits_value_counts;
    static constexpr Column INVERSES = Column::lookup_alu_tag_max_bits_value_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = { ColumnAndShifts::alu_ia_tag,
                                                                                    ColumnAndShifts::alu_max_bits,
                                                                                    ColumnAndShifts::alu_max_value };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::precomputed_clk,
        ColumnAndShifts::precomputed_tag_max_bits,
        ColumnAndShifts::precomputed_tag_max_value
    };
};

using lookup_alu_tag_max_bits_value_settings = lookup_settings<lookup_alu_tag_max_bits_value_settings_>;
template <typename FF_>
using lookup_alu_tag_max_bits_value_relation = lookup_relation_base<FF_, lookup_alu_tag_max_bits_value_settings>;

/////////////////// lookup_alu_range_check_mul_u128_a_lo ///////////////////

struct lookup_alu_range_check_mul_u128_a_lo_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_RANGE_CHECK_MUL_U128_A_LO";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 2;
    static constexpr Column SRC_SELECTOR = Column::alu_sel_mul_u128;
    static constexpr Column DST_SELECTOR = Column::range_check_sel;
    static constexpr Column COUNTS = Column::lookup_alu_range_check_mul_u128_a_lo_counts;
    static constexpr Column INVERSES = Column::lookup_alu_range_check_mul_u128_a_lo_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = { ColumnAndShifts::alu_a_lo,
                                                                                    ColumnAndShifts::alu_constant_64 };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::range_check_value, ColumnAndShifts::range_check_rng_chk_bits
    };
};

using lookup_alu_range_check_mul_u128_a_lo_settings = lookup_settings<lookup_alu_range_check_mul_u128_a_lo_settings_>;
template <typename FF_>
using lookup_alu_range_check_mul_u128_a_lo_relation =
    lookup_relation_base<FF_, lookup_alu_range_check_mul_u128_a_lo_settings>;

/////////////////// lookup_alu_range_check_mul_u128_a_hi ///////////////////

struct lookup_alu_range_check_mul_u128_a_hi_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_RANGE_CHECK_MUL_U128_A_HI";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 2;
    static constexpr Column SRC_SELECTOR = Column::alu_sel_mul_u128;
    static constexpr Column DST_SELECTOR = Column::range_check_sel;
    static constexpr Column COUNTS = Column::lookup_alu_range_check_mul_u128_a_hi_counts;
    static constexpr Column INVERSES = Column::lookup_alu_range_check_mul_u128_a_hi_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = { ColumnAndShifts::alu_a_hi,
                                                                                    ColumnAndShifts::alu_constant_64 };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::range_check_value, ColumnAndShifts::range_check_rng_chk_bits
    };
};

using lookup_alu_range_check_mul_u128_a_hi_settings = lookup_settings<lookup_alu_range_check_mul_u128_a_hi_settings_>;
template <typename FF_>
using lookup_alu_range_check_mul_u128_a_hi_relation =
    lookup_relation_base<FF_, lookup_alu_range_check_mul_u128_a_hi_settings>;

/////////////////// lookup_alu_range_check_mul_u128_b_lo ///////////////////

struct lookup_alu_range_check_mul_u128_b_lo_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_RANGE_CHECK_MUL_U128_B_LO";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 2;
    static constexpr Column SRC_SELECTOR = Column::alu_sel_mul_u128;
    static constexpr Column DST_SELECTOR = Column::range_check_sel;
    static constexpr Column COUNTS = Column::lookup_alu_range_check_mul_u128_b_lo_counts;
    static constexpr Column INVERSES = Column::lookup_alu_range_check_mul_u128_b_lo_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = { ColumnAndShifts::alu_b_lo,
                                                                                    ColumnAndShifts::alu_constant_64 };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::range_check_value, ColumnAndShifts::range_check_rng_chk_bits
    };
};

using lookup_alu_range_check_mul_u128_b_lo_settings = lookup_settings<lookup_alu_range_check_mul_u128_b_lo_settings_>;
template <typename FF_>
using lookup_alu_range_check_mul_u128_b_lo_relation =
    lookup_relation_base<FF_, lookup_alu_range_check_mul_u128_b_lo_settings>;

/////////////////// lookup_alu_range_check_mul_u128_b_hi ///////////////////

struct lookup_alu_range_check_mul_u128_b_hi_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_RANGE_CHECK_MUL_U128_B_HI";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 2;
    static constexpr Column SRC_SELECTOR = Column::alu_sel_mul_u128;
    static constexpr Column DST_SELECTOR = Column::range_check_sel;
    static constexpr Column COUNTS = Column::lookup_alu_range_check_mul_u128_b_hi_counts;
    static constexpr Column INVERSES = Column::lookup_alu_range_check_mul_u128_b_hi_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = { ColumnAndShifts::alu_b_hi,
                                                                                    ColumnAndShifts::alu_constant_64 };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::range_check_value, ColumnAndShifts::range_check_rng_chk_bits
    };
};

using lookup_alu_range_check_mul_u128_b_hi_settings = lookup_settings<lookup_alu_range_check_mul_u128_b_hi_settings_>;
template <typename FF_>
using lookup_alu_range_check_mul_u128_b_hi_relation =
    lookup_relation_base<FF_, lookup_alu_range_check_mul_u128_b_hi_settings>;

/////////////////// lookup_alu_range_check_mul_u128_c_hi ///////////////////

struct lookup_alu_range_check_mul_u128_c_hi_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_RANGE_CHECK_MUL_U128_C_HI";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 2;
    static constexpr Column SRC_SELECTOR = Column::alu_sel_mul_u128;
    static constexpr Column DST_SELECTOR = Column::range_check_sel;
    static constexpr Column COUNTS = Column::lookup_alu_range_check_mul_u128_c_hi_counts;
    static constexpr Column INVERSES = Column::lookup_alu_range_check_mul_u128_c_hi_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = { ColumnAndShifts::alu_c_hi,
                                                                                    ColumnAndShifts::alu_constant_64 };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::range_check_value, ColumnAndShifts::range_check_rng_chk_bits
    };
};

using lookup_alu_range_check_mul_u128_c_hi_settings = lookup_settings<lookup_alu_range_check_mul_u128_c_hi_settings_>;
template <typename FF_>
using lookup_alu_range_check_mul_u128_c_hi_relation =
    lookup_relation_base<FF_, lookup_alu_range_check_mul_u128_c_hi_settings>;

/////////////////// lookup_alu_ff_gt ///////////////////

struct lookup_alu_ff_gt_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_FF_GT";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 3;
    static constexpr Column SRC_SELECTOR = Column::alu_sel_ff_lt_ops;
    static constexpr Column DST_SELECTOR = Column::ff_gt_sel_gt;
    static constexpr Column COUNTS = Column::lookup_alu_ff_gt_counts;
    static constexpr Column INVERSES = Column::lookup_alu_ff_gt_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::alu_lt_ops_input_a, ColumnAndShifts::alu_lt_ops_input_b, ColumnAndShifts::alu_lt_ops_result_c
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = { ColumnAndShifts::ff_gt_a,
                                                                                    ColumnAndShifts::ff_gt_b,
                                                                                    ColumnAndShifts::ff_gt_result };
};

using lookup_alu_ff_gt_settings = lookup_settings<lookup_alu_ff_gt_settings_>;
template <typename FF_> using lookup_alu_ff_gt_relation = lookup_relation_base<FF_, lookup_alu_ff_gt_settings>;

/////////////////// lookup_alu_int_gt ///////////////////

struct lookup_alu_int_gt_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_INT_GT";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 3;
    static constexpr Column SRC_SELECTOR = Column::alu_sel_int_lt_ops;
    static constexpr Column DST_SELECTOR = Column::gt_sel;
    static constexpr Column COUNTS = Column::lookup_alu_int_gt_counts;
    static constexpr Column INVERSES = Column::lookup_alu_int_gt_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::alu_lt_ops_input_a, ColumnAndShifts::alu_lt_ops_input_b, ColumnAndShifts::alu_lt_ops_result_c
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = { ColumnAndShifts::gt_input_a,
                                                                                    ColumnAndShifts::gt_input_b,
                                                                                    ColumnAndShifts::gt_res };
};

using lookup_alu_int_gt_settings = lookup_settings<lookup_alu_int_gt_settings_>;
template <typename FF_> using lookup_alu_int_gt_relation = lookup_relation_base<FF_, lookup_alu_int_gt_settings>;

/////////////////// lookup_alu_exec_dispatching_cast ///////////////////

struct lookup_alu_exec_dispatching_cast_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_EXEC_DISPATCHING_CAST";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 5;
    static constexpr Column SRC_SELECTOR = Column::execution_sel_execute_cast;
    static constexpr Column DST_SELECTOR = Column::alu_sel_op_truncate;
    static constexpr Column COUNTS = Column::lookup_alu_exec_dispatching_cast_counts;
    static constexpr Column INVERSES = Column::lookup_alu_exec_dispatching_cast_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::execution_register_0_,
        ColumnAndShifts::execution_rop_2_,
        ColumnAndShifts::execution_subtrace_operation_id,
        ColumnAndShifts::execution_register_1_,
        ColumnAndShifts::execution_mem_tag_reg_1_
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = { ColumnAndShifts::alu_ia,
                                                                                    ColumnAndShifts::alu_ia_tag,
                                                                                    ColumnAndShifts::alu_op_id,
                                                                                    ColumnAndShifts::alu_ic,
                                                                                    ColumnAndShifts::alu_ia_tag };
};

using lookup_alu_exec_dispatching_cast_settings = lookup_settings<lookup_alu_exec_dispatching_cast_settings_>;
template <typename FF_>
using lookup_alu_exec_dispatching_cast_relation = lookup_relation_base<FF_, lookup_alu_exec_dispatching_cast_settings>;

/////////////////// lookup_alu_exec_dispatching_set ///////////////////

struct lookup_alu_exec_dispatching_set_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_EXEC_DISPATCHING_SET";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 5;
    static constexpr Column SRC_SELECTOR = Column::execution_sel_execute_set;
    static constexpr Column DST_SELECTOR = Column::alu_sel_op_truncate;
    static constexpr Column COUNTS = Column::lookup_alu_exec_dispatching_set_counts;
    static constexpr Column INVERSES = Column::lookup_alu_exec_dispatching_set_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::execution_rop_2_,
        ColumnAndShifts::execution_rop_1_,
        ColumnAndShifts::execution_subtrace_operation_id,
        ColumnAndShifts::execution_register_0_,
        ColumnAndShifts::execution_mem_tag_reg_0_
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = { ColumnAndShifts::alu_ia,
                                                                                    ColumnAndShifts::alu_ia_tag,
                                                                                    ColumnAndShifts::alu_op_id,
                                                                                    ColumnAndShifts::alu_ic,
                                                                                    ColumnAndShifts::alu_ic_tag };
};

using lookup_alu_exec_dispatching_set_settings = lookup_settings<lookup_alu_exec_dispatching_set_settings_>;
template <typename FF_>
using lookup_alu_exec_dispatching_set_relation = lookup_relation_base<FF_, lookup_alu_exec_dispatching_set_settings>;

/////////////////// lookup_alu_large_trunc_canonical_dec ///////////////////

struct lookup_alu_large_trunc_canonical_dec_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_LARGE_TRUNC_CANONICAL_DEC";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 3;
    static constexpr Column SRC_SELECTOR = Column::alu_sel_trunc_gte_128;
    static constexpr Column DST_SELECTOR = Column::ff_gt_sel_dec;
    static constexpr Column COUNTS = Column::lookup_alu_large_trunc_canonical_dec_counts;
    static constexpr Column INVERSES = Column::lookup_alu_large_trunc_canonical_dec_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = { ColumnAndShifts::alu_ia,
                                                                                    ColumnAndShifts::alu_a_lo,
                                                                                    ColumnAndShifts::alu_a_hi };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = { ColumnAndShifts::ff_gt_a,
                                                                                    ColumnAndShifts::ff_gt_a_lo,
                                                                                    ColumnAndShifts::ff_gt_a_hi };
};

using lookup_alu_large_trunc_canonical_dec_settings = lookup_settings<lookup_alu_large_trunc_canonical_dec_settings_>;
template <typename FF_>
using lookup_alu_large_trunc_canonical_dec_relation =
    lookup_relation_base<FF_, lookup_alu_large_trunc_canonical_dec_settings>;

/////////////////// lookup_alu_range_check_trunc_mid ///////////////////

struct lookup_alu_range_check_trunc_mid_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_ALU_RANGE_CHECK_TRUNC_MID";
    static constexpr std::string_view RELATION_NAME = "alu";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 2;
    static constexpr Column SRC_SELECTOR = Column::alu_sel_trunc_non_trivial;
    static constexpr Column DST_SELECTOR = Column::range_check_sel;
    static constexpr Column COUNTS = Column::lookup_alu_range_check_trunc_mid_counts;
    static constexpr Column INVERSES = Column::lookup_alu_range_check_trunc_mid_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = { ColumnAndShifts::alu_mid,
                                                                                    ColumnAndShifts::alu_mid_bits };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::range_check_value, ColumnAndShifts::range_check_rng_chk_bits
    };
};

using lookup_alu_range_check_trunc_mid_settings = lookup_settings<lookup_alu_range_check_trunc_mid_settings_>;
template <typename FF_>
using lookup_alu_range_check_trunc_mid_relation = lookup_relation_base<FF_, lookup_alu_range_check_trunc_mid_settings>;

} // namespace bb::avm2
