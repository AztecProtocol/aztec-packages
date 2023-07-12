

#pragma once
#include "aztec3/circuits/abis/append_only_tree_snapshot.hpp"
#include "aztec3/circuits/abis/rollup/merge/previous_rollup_data.hpp"
#include "aztec3/constants.hpp"
#include "aztec3/utils/msgpack_derived_output.hpp"

#include <ostream>

namespace aztec3::circuits::abis {

// TODO: The copy constructor for this struct may throw memory access out of bounds
// Hit when running aztec3-packages/yarn-project/circuits.js/src/rollup/rollup_wasm_wrapper.test.ts."calls
// root_rollup__sim"
template <typename NCT> struct RootRollupInputs {
    using fr = typename NCT::fr;

    // All below are shared between the base and merge rollups
    std::array<PreviousRollupData<NCT>, 2> previous_rollup_data;

    std::array<fr, PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT> new_historic_private_data_tree_root_sibling_path;
    std::array<fr, CONTRACT_TREE_ROOTS_TREE_HEIGHT> new_historic_contract_tree_root_sibling_path;

    // inputs required to process l1 to l2 messages
    std::array<fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP> l1_to_l2_messages;
    std::array<fr, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH> new_l1_to_l2_message_tree_root_sibling_path;
    std::array<fr, L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT> new_historic_l1_to_l2_message_roots_tree_sibling_path;

    AppendOnlyTreeSnapshot<NCT> start_l1_to_l2_message_tree_snapshot;
    AppendOnlyTreeSnapshot<NCT> start_historic_tree_l1_to_l2_message_tree_roots_snapshot;

    // for serialization, update with new fields
    MSGPACK_FIELDS(previous_rollup_data,
                   new_historic_private_data_tree_root_sibling_path,
                   new_historic_contract_tree_root_sibling_path,
                   l1_to_l2_messages,
                   new_l1_to_l2_message_tree_root_sibling_path,
                   new_historic_l1_to_l2_message_roots_tree_sibling_path,
                   start_l1_to_l2_message_tree_snapshot,
                   start_historic_tree_l1_to_l2_message_tree_roots_snapshot);
    bool operator==(RootRollupInputs<NCT> const&) const = default;
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, RootRollupInputs<NCT> const& obj)
{
    utils::msgpack_derived_output(os, obj);
    return os;
}

}  // namespace aztec3::circuits::abis
