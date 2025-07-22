#pragma once

#include <array>
#include <cstdint>
#include <vector>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class Poseidon2Interface {
  public:
    virtual ~Poseidon2Interface() = default;
    virtual FF hash(const std::vector<FF>& input) = 0;
    virtual std::array<FF, 4> permutation(const std::array<FF, 4>& input) = 0;
    // Overload for opcode execution that takes memory addresses
    virtual void permutation(MemoryInterface& memory, MemoryAddress src_address, MemoryAddress dst_address) = 0;
};

class Poseidon2 : public Poseidon2Interface {
  public:
    Poseidon2(ExecutionIdManagerInterface& execution_id_manager,
              GreaterThanInterface& gt,
              EventEmitterInterface<Poseidon2HashEvent>& hash_emitter,
              EventEmitterInterface<Poseidon2PermutationEvent>& perm_emitter,
              EventEmitterInterface<Poseidon2PermutationMemoryEvent>& perm_mem_emitter)
        : execution_id_manager(execution_id_manager)
        , gt(gt)
        , hash_events(hash_emitter)
        , perm_events(perm_emitter)
        , perm_mem_events(perm_mem_emitter)
    {}

    FF hash(const std::vector<FF>& input) override;
    std::array<FF, 4> permutation(const std::array<FF, 4>& input) override;
    void permutation(MemoryInterface& memory, MemoryAddress src_address, MemoryAddress dst_address) override;

  private:
    ExecutionIdManagerInterface& execution_id_manager;
    GreaterThanInterface& gt;
    EventEmitterInterface<Poseidon2HashEvent>& hash_events;
    EventEmitterInterface<Poseidon2PermutationEvent>& perm_events;
    EventEmitterInterface<Poseidon2PermutationMemoryEvent>& perm_mem_events;
};

} // namespace bb::avm2::simulation
