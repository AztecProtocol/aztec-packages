#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/l1_to_l2_message_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/l1_to_l2_message_tree_check.hpp"

namespace bb::avm2::simulation {

class L1ToL2MessageTreeCheck : public L1ToL2MessageTreeCheckInterface {
  public:
    L1ToL2MessageTreeCheck(MerkleCheckInterface& merkle_check,
                           EventEmitterInterface<L1ToL2MessageTreeCheckEvent>& event_emitter)
        : events(event_emitter)
        , merkle_check(merkle_check)
    {}

    bool exists(const FF& msg_hash,
                const FF& leaf_value,
                uint64_t leaf_index,
                std::span<const FF> sibling_path,
                const AppendOnlyTreeSnapshot& snapshot) override;

  private:
    EventEmitterInterface<L1ToL2MessageTreeCheckEvent>& events;
    MerkleCheckInterface& merkle_check;
};

} // namespace bb::avm2::simulation
