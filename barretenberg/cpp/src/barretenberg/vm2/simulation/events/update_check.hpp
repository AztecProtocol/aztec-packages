#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct UpdateCheckEvent {
    // Inputs
    AztecAddress address = 0;
    FF current_class_id = 0;
    FF original_class_id = 0;
    FF public_data_tree_root = 0;
    uint64_t current_timestamp = 0;

    // Hash
    FF update_hash = 0;
    // Hash preimage
    FF update_preimage_metadata = 0;
    FF update_preimage_pre_class_id = 0;
    FF update_preimage_post_class_id = 0;

    // Read
    FF delayed_public_mutable_slot = 0;

    bool operator==(const UpdateCheckEvent& other) const = default;
};

} // namespace bb::avm2::simulation
