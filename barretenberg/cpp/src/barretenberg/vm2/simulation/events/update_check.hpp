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
    uint64_t current_timestamp;

    // Hash
    FF update_hash;
    // Hash preimage
    FF update_preimage_metadata;
    FF update_preimage_pre_class_id;
    FF update_preimage_post_class_id;

    // Read
    FF shared_mutable_slot;

    bool operator==(const UpdateCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
