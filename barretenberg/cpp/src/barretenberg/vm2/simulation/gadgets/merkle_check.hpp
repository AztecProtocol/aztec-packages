#pragma once

#include <cstdint>
#include <memory>
#include <span>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/merkle_check.hpp"

namespace bb::avm2::simulation {

class MerkleCheck : public MerkleCheckInterface {
  public:
    MerkleCheck(Poseidon2Interface& poseidon2, EventEmitterInterface<MerkleCheckEvent>& event_emitter)
        : events(event_emitter)
        , poseidon2(poseidon2)
    {}

    void assert_membership(const FF& leaf_value,
                           const uint64_t leaf_index,
                           std::span<const FF> sibling_path,
                           const FF& root) override;

    FF write(const FF& current_value,
             const FF& new_value,
             const uint64_t leaf_index,
             std::span<const FF> sibling_path,
             const FF& current_root) override;

  private:
    EventEmitterInterface<MerkleCheckEvent>& events;
    Poseidon2Interface& poseidon2;
};

} // namespace bb::avm2::simulation
