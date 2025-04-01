#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct UpdateCheckEvent {
    // Inputs
    AztecAddress address;
    FF current_class_id;
    FF original_class_id;
    FF public_data_tree_root;
    uint32_t block_number;

    // Hash
    FF update_hash;
    // Hash preimage
    FF update_delay;
    FF update_pre_class;
    FF update_post_class;
    uint32_t update_block_of_change;

    // Read
    FF shared_mutable_slot;
    FF shared_mutable_leaf_slot;

    bool operator==(const UpdateCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
