#pragma once

#include <memory>
#include <unordered_map>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"

namespace bb::avm2::simulation {

struct ValueRefAndTag {
    const MemoryValue& value;
    MemoryTag tag;
};

using SliceWithTags = std::pair<std::vector<MemoryValue>, std::vector<MemoryTag>>;

class MemoryInterface {
  public:
    virtual ~MemoryInterface() = default;

    virtual void set(MemoryAddress index, MemoryValue value, MemoryTag tag) = 0;
    virtual ValueRefAndTag get(MemoryAddress index) const = 0;
    virtual SliceWithTags get_slice(MemoryAddress start, size_t size) const = 0;

    virtual uint32_t get_space_id() const = 0;

    static bool is_valid_address(const MemoryValue& address);
    static bool is_valid_address(ValueRefAndTag address);
};

class Memory : public MemoryInterface {
  public:
    Memory(uint32_t space_id, EventEmitterInterface<MemoryEvent>& event_emitter)
        : space_id(space_id)
        , events(event_emitter)
    {}

    void set(MemoryAddress index, MemoryValue value, MemoryTag tag) override;
    ValueRefAndTag get(MemoryAddress index) const override;
    SliceWithTags get_slice(MemoryAddress start, size_t size) const override;

    uint32_t get_space_id() const override { return space_id; }

  private:
    struct ValueAndTag {
        MemoryValue value;
        MemoryTag tag;
    };

    uint32_t space_id;
    std::unordered_map<size_t, ValueAndTag> memory;
    EventEmitterInterface<MemoryEvent>& events;
};

} // namespace bb::avm2::simulation