#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class MerkleCheckInterface {
  public:
    virtual ~MerkleCheckInterface() = default;
    virtual void assert_membership(const FF& leaf_value,
                                   const uint64_t leaf_index,
                                   const std::vector<FF>& sibling_path,
                                   const FF& root) = 0;
};

class MerkleCheck : public MerkleCheckInterface {
  public:
    MerkleCheck(EventEmitterInterface<MerkleCheckEvent>& event_emitter)
        : events(event_emitter)
    {}

    void assert_membership(const FF& leaf_value,
                           const uint64_t leaf_index,
                           const std::vector<FF>& sibling_path,
                           const FF& root) override;

  private:
    EventEmitterInterface<MerkleCheckEvent>& events;
};

} // namespace bb::avm2::simulation
