// AUTOGENERATED FILE
#pragma once

#include <cstddef>
#include <string_view>
#include <tuple>

#include "../columns.hpp"
#include "barretenberg/relations/generic_lookup/generic_lookup_relation.hpp"
#include "barretenberg/vm2/constraining/relations/interactions_base.hpp"

namespace bb::avm2 {

/////////////////// lookup_written_public_data_slots_tree_check_silo_poseidon2 ///////////////////

struct lookup_written_public_data_slots_tree_check_silo_poseidon2_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_WRITTEN_PUBLIC_DATA_SLOTS_TREE_CHECK_SILO_POSEIDON2";
    static constexpr std::string_view RELATION_NAME = "written_public_data_slots_tree_check";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 5;
    static constexpr Column SRC_SELECTOR = Column::written_public_data_slots_tree_check_sel;
    static constexpr Column DST_SELECTOR = Column::poseidon2_hash_end;
    static constexpr Column COUNTS = Column::lookup_written_public_data_slots_tree_check_silo_poseidon2_counts;
    static constexpr Column INVERSES = Column::lookup_written_public_data_slots_tree_check_silo_poseidon2_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::written_public_data_slots_tree_check_sel,
        ColumnAndShifts::written_public_data_slots_tree_check_siloing_separator,
        ColumnAndShifts::written_public_data_slots_tree_check_address,
        ColumnAndShifts::written_public_data_slots_tree_check_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_leaf_slot
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::poseidon2_hash_start,
        ColumnAndShifts::poseidon2_hash_input_0,
        ColumnAndShifts::poseidon2_hash_input_1,
        ColumnAndShifts::poseidon2_hash_input_2,
        ColumnAndShifts::poseidon2_hash_output
    };
};

using lookup_written_public_data_slots_tree_check_silo_poseidon2_settings =
    lookup_settings<lookup_written_public_data_slots_tree_check_silo_poseidon2_settings_>;
template <typename FF_>
using lookup_written_public_data_slots_tree_check_silo_poseidon2_relation =
    lookup_relation_base<FF_, lookup_written_public_data_slots_tree_check_silo_poseidon2_settings>;

/////////////////// lookup_written_public_data_slots_tree_check_low_leaf_poseidon2 ///////////////////

struct lookup_written_public_data_slots_tree_check_low_leaf_poseidon2_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_WRITTEN_PUBLIC_DATA_SLOTS_TREE_CHECK_LOW_LEAF_POSEIDON2";
    static constexpr std::string_view RELATION_NAME = "written_public_data_slots_tree_check";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 5;
    static constexpr Column SRC_SELECTOR = Column::written_public_data_slots_tree_check_sel;
    static constexpr Column DST_SELECTOR = Column::poseidon2_hash_end;
    static constexpr Column COUNTS = Column::lookup_written_public_data_slots_tree_check_low_leaf_poseidon2_counts;
    static constexpr Column INVERSES = Column::lookup_written_public_data_slots_tree_check_low_leaf_poseidon2_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::written_public_data_slots_tree_check_sel,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_next_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_next_index,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_hash
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::poseidon2_hash_start,
        ColumnAndShifts::poseidon2_hash_input_0,
        ColumnAndShifts::poseidon2_hash_input_1,
        ColumnAndShifts::poseidon2_hash_input_2,
        ColumnAndShifts::poseidon2_hash_output
    };
};

using lookup_written_public_data_slots_tree_check_low_leaf_poseidon2_settings =
    lookup_settings<lookup_written_public_data_slots_tree_check_low_leaf_poseidon2_settings_>;
template <typename FF_>
using lookup_written_public_data_slots_tree_check_low_leaf_poseidon2_relation =
    lookup_relation_base<FF_, lookup_written_public_data_slots_tree_check_low_leaf_poseidon2_settings>;

/////////////////// lookup_written_public_data_slots_tree_check_updated_low_leaf_poseidon2 ///////////////////

struct lookup_written_public_data_slots_tree_check_updated_low_leaf_poseidon2_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_WRITTEN_PUBLIC_DATA_SLOTS_TREE_CHECK_UPDATED_LOW_LEAF_POSEIDON2";
    static constexpr std::string_view RELATION_NAME = "written_public_data_slots_tree_check";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 5;
    static constexpr Column SRC_SELECTOR = Column::written_public_data_slots_tree_check_should_insert;
    static constexpr Column DST_SELECTOR = Column::poseidon2_hash_end;
    static constexpr Column COUNTS =
        Column::lookup_written_public_data_slots_tree_check_updated_low_leaf_poseidon2_counts;
    static constexpr Column INVERSES =
        Column::lookup_written_public_data_slots_tree_check_updated_low_leaf_poseidon2_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::written_public_data_slots_tree_check_sel,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_updated_low_leaf_next_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_updated_low_leaf_next_index,
        ColumnAndShifts::written_public_data_slots_tree_check_updated_low_leaf_hash
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::poseidon2_hash_start,
        ColumnAndShifts::poseidon2_hash_input_0,
        ColumnAndShifts::poseidon2_hash_input_1,
        ColumnAndShifts::poseidon2_hash_input_2,
        ColumnAndShifts::poseidon2_hash_output
    };
};

using lookup_written_public_data_slots_tree_check_updated_low_leaf_poseidon2_settings =
    lookup_settings<lookup_written_public_data_slots_tree_check_updated_low_leaf_poseidon2_settings_>;
template <typename FF_>
using lookup_written_public_data_slots_tree_check_updated_low_leaf_poseidon2_relation =
    lookup_relation_base<FF_, lookup_written_public_data_slots_tree_check_updated_low_leaf_poseidon2_settings>;

/////////////////// lookup_written_public_data_slots_tree_check_low_leaf_merkle_check ///////////////////

struct lookup_written_public_data_slots_tree_check_low_leaf_merkle_check_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_WRITTEN_PUBLIC_DATA_SLOTS_TREE_CHECK_LOW_LEAF_MERKLE_CHECK";
    static constexpr std::string_view RELATION_NAME = "written_public_data_slots_tree_check";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 7;
    static constexpr Column SRC_SELECTOR = Column::written_public_data_slots_tree_check_sel;
    static constexpr Column DST_SELECTOR = Column::merkle_check_start;
    static constexpr Column COUNTS = Column::lookup_written_public_data_slots_tree_check_low_leaf_merkle_check_counts;
    static constexpr Column INVERSES = Column::lookup_written_public_data_slots_tree_check_low_leaf_merkle_check_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::written_public_data_slots_tree_check_should_insert,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_hash,
        ColumnAndShifts::written_public_data_slots_tree_check_updated_low_leaf_hash,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_index,
        ColumnAndShifts::written_public_data_slots_tree_check_tree_height,
        ColumnAndShifts::written_public_data_slots_tree_check_root,
        ColumnAndShifts::written_public_data_slots_tree_check_intermediate_root
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::merkle_check_write,      ColumnAndShifts::merkle_check_read_node,
        ColumnAndShifts::merkle_check_write_node, ColumnAndShifts::merkle_check_index,
        ColumnAndShifts::merkle_check_path_len,   ColumnAndShifts::merkle_check_read_root,
        ColumnAndShifts::merkle_check_write_root
    };
};

using lookup_written_public_data_slots_tree_check_low_leaf_merkle_check_settings =
    lookup_settings<lookup_written_public_data_slots_tree_check_low_leaf_merkle_check_settings_>;
template <typename FF_>
using lookup_written_public_data_slots_tree_check_low_leaf_merkle_check_relation =
    lookup_relation_base<FF_, lookup_written_public_data_slots_tree_check_low_leaf_merkle_check_settings>;

/////////////////// lookup_written_public_data_slots_tree_check_low_leaf_slot_validation ///////////////////

struct lookup_written_public_data_slots_tree_check_low_leaf_slot_validation_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_WRITTEN_PUBLIC_DATA_SLOTS_TREE_CHECK_LOW_LEAF_SLOT_VALIDATION";
    static constexpr std::string_view RELATION_NAME = "written_public_data_slots_tree_check";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 3;
    static constexpr Column SRC_SELECTOR = Column::written_public_data_slots_tree_check_leaf_not_exists;
    static constexpr Column DST_SELECTOR = Column::ff_gt_sel_gt;
    static constexpr Column COUNTS =
        Column::lookup_written_public_data_slots_tree_check_low_leaf_slot_validation_counts;
    static constexpr Column INVERSES = Column::lookup_written_public_data_slots_tree_check_low_leaf_slot_validation_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::written_public_data_slots_tree_check_leaf_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_sel
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = { ColumnAndShifts::ff_gt_a,
                                                                                    ColumnAndShifts::ff_gt_b,
                                                                                    ColumnAndShifts::ff_gt_result };
};

using lookup_written_public_data_slots_tree_check_low_leaf_slot_validation_settings =
    lookup_settings<lookup_written_public_data_slots_tree_check_low_leaf_slot_validation_settings_>;
template <typename FF_>
using lookup_written_public_data_slots_tree_check_low_leaf_slot_validation_relation =
    lookup_relation_base<FF_, lookup_written_public_data_slots_tree_check_low_leaf_slot_validation_settings>;

/////////////////// lookup_written_public_data_slots_tree_check_low_leaf_next_slot_validation ///////////////////

struct lookup_written_public_data_slots_tree_check_low_leaf_next_slot_validation_settings_ {
    static constexpr std::string_view NAME =
        "LOOKUP_WRITTEN_PUBLIC_DATA_SLOTS_TREE_CHECK_LOW_LEAF_NEXT_SLOT_VALIDATION";
    static constexpr std::string_view RELATION_NAME = "written_public_data_slots_tree_check";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 3;
    static constexpr Column SRC_SELECTOR = Column::written_public_data_slots_tree_check_next_slot_is_nonzero;
    static constexpr Column DST_SELECTOR = Column::ff_gt_sel_gt;
    static constexpr Column COUNTS =
        Column::lookup_written_public_data_slots_tree_check_low_leaf_next_slot_validation_counts;
    static constexpr Column INVERSES =
        Column::lookup_written_public_data_slots_tree_check_low_leaf_next_slot_validation_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_next_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_leaf_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_sel
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = { ColumnAndShifts::ff_gt_a,
                                                                                    ColumnAndShifts::ff_gt_b,
                                                                                    ColumnAndShifts::ff_gt_result };
};

using lookup_written_public_data_slots_tree_check_low_leaf_next_slot_validation_settings =
    lookup_settings<lookup_written_public_data_slots_tree_check_low_leaf_next_slot_validation_settings_>;
template <typename FF_>
using lookup_written_public_data_slots_tree_check_low_leaf_next_slot_validation_relation =
    lookup_relation_base<FF_, lookup_written_public_data_slots_tree_check_low_leaf_next_slot_validation_settings>;

/////////////////// lookup_written_public_data_slots_tree_check_new_leaf_poseidon2 ///////////////////

struct lookup_written_public_data_slots_tree_check_new_leaf_poseidon2_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_WRITTEN_PUBLIC_DATA_SLOTS_TREE_CHECK_NEW_LEAF_POSEIDON2";
    static constexpr std::string_view RELATION_NAME = "written_public_data_slots_tree_check";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 5;
    static constexpr Column SRC_SELECTOR = Column::written_public_data_slots_tree_check_should_insert;
    static constexpr Column DST_SELECTOR = Column::poseidon2_hash_end;
    static constexpr Column COUNTS = Column::lookup_written_public_data_slots_tree_check_new_leaf_poseidon2_counts;
    static constexpr Column INVERSES = Column::lookup_written_public_data_slots_tree_check_new_leaf_poseidon2_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::written_public_data_slots_tree_check_sel,
        ColumnAndShifts::written_public_data_slots_tree_check_leaf_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_next_slot,
        ColumnAndShifts::written_public_data_slots_tree_check_low_leaf_next_index,
        ColumnAndShifts::written_public_data_slots_tree_check_new_leaf_hash
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::poseidon2_hash_start,
        ColumnAndShifts::poseidon2_hash_input_0,
        ColumnAndShifts::poseidon2_hash_input_1,
        ColumnAndShifts::poseidon2_hash_input_2,
        ColumnAndShifts::poseidon2_hash_output
    };
};

using lookup_written_public_data_slots_tree_check_new_leaf_poseidon2_settings =
    lookup_settings<lookup_written_public_data_slots_tree_check_new_leaf_poseidon2_settings_>;
template <typename FF_>
using lookup_written_public_data_slots_tree_check_new_leaf_poseidon2_relation =
    lookup_relation_base<FF_, lookup_written_public_data_slots_tree_check_new_leaf_poseidon2_settings>;

/////////////////// lookup_written_public_data_slots_tree_check_new_leaf_merkle_check ///////////////////

struct lookup_written_public_data_slots_tree_check_new_leaf_merkle_check_settings_ {
    static constexpr std::string_view NAME = "LOOKUP_WRITTEN_PUBLIC_DATA_SLOTS_TREE_CHECK_NEW_LEAF_MERKLE_CHECK";
    static constexpr std::string_view RELATION_NAME = "written_public_data_slots_tree_check";
    static constexpr size_t LOOKUP_TUPLE_SIZE = 7;
    static constexpr Column SRC_SELECTOR = Column::written_public_data_slots_tree_check_should_insert;
    static constexpr Column DST_SELECTOR = Column::merkle_check_start;
    static constexpr Column COUNTS = Column::lookup_written_public_data_slots_tree_check_new_leaf_merkle_check_counts;
    static constexpr Column INVERSES = Column::lookup_written_public_data_slots_tree_check_new_leaf_merkle_check_inv;
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        ColumnAndShifts::written_public_data_slots_tree_check_sel,
        ColumnAndShifts::precomputed_zero,
        ColumnAndShifts::written_public_data_slots_tree_check_new_leaf_hash,
        ColumnAndShifts::written_public_data_slots_tree_check_tree_size_before_write,
        ColumnAndShifts::written_public_data_slots_tree_check_tree_height,
        ColumnAndShifts::written_public_data_slots_tree_check_intermediate_root,
        ColumnAndShifts::written_public_data_slots_tree_check_write_root
    };
    static constexpr std::array<ColumnAndShifts, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        ColumnAndShifts::merkle_check_write,      ColumnAndShifts::merkle_check_read_node,
        ColumnAndShifts::merkle_check_write_node, ColumnAndShifts::merkle_check_index,
        ColumnAndShifts::merkle_check_path_len,   ColumnAndShifts::merkle_check_read_root,
        ColumnAndShifts::merkle_check_write_root
    };
};

using lookup_written_public_data_slots_tree_check_new_leaf_merkle_check_settings =
    lookup_settings<lookup_written_public_data_slots_tree_check_new_leaf_merkle_check_settings_>;
template <typename FF_>
using lookup_written_public_data_slots_tree_check_new_leaf_merkle_check_relation =
    lookup_relation_base<FF_, lookup_written_public_data_slots_tree_check_new_leaf_merkle_check_settings>;

} // namespace bb::avm2
