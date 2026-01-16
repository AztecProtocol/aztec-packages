#pragma once

#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

// Just a map that doesn't emit events or do anything else.
class MemoryStore : public MemoryInterface {
  public:
    MemoryStore(uint16_t space_id = 0)
        : space_id(space_id)
    {}

    const MemoryValue& get(MemoryAddress index) const override
    {
        static const auto default_value = MemoryValue::from<FF>(0);
        auto it = memory.find(index);
        const auto& vt = it != memory.end() ? it->second : default_value;
        debug("Memory read: ", index, " -> ", vt.to_string());
        return vt;
    }
    void set(MemoryAddress index, MemoryValue value) override
    {
        memory[index] = value;
        debug("Memory write: ", index, " <- ", value.to_string());
    }
    uint16_t get_space_id() const override { return space_id; }

  private:
    uint16_t space_id;
    unordered_flat_map<MemoryAddress, MemoryValue> memory;
};

class PureMemoryProvider : public MemoryProviderInterface {
  public:
    PureMemoryProvider() = default;
    ~PureMemoryProvider() override = default;
    std::unique_ptr<MemoryInterface> make_memory(uint16_t space_id) override
    {
        return std::make_unique<MemoryStore>(space_id);
    }
};

} // namespace bb::avm2::simulation
