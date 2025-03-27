#pragma once

#include <memory>

#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"

namespace bb::avm2::simulation {

template <typename T>
    requires std::unsigned_integral<T>
class TaggedIntegralValue {
  public:
    TaggedIntegralValue(T value)
        : value(value)
    {}
    T get_value() const { return value; }

    TaggedIntegralValue operator+(const TaggedIntegralValue& rhs) const
    {
        return TaggedIntegralValue(value + rhs.value);
    }

  private:
    T value;
};

using Uint1 = TaggedIntegralValue<bool>;
using Uint8 = TaggedIntegralValue<uint8_t>;
using Uint16 = TaggedIntegralValue<uint16_t>;
using Uint32 = TaggedIntegralValue<uint32_t>;
using Uint64 = TaggedIntegralValue<uint64_t>;
using Uint128 = TaggedIntegralValue<uint128_t>;

using TaggedMemoryValue = std::variant<Uint1, Uint8, Uint16, Uint32, Uint64, Uint128, FF>;

class TaggedValueWrapper {
  public:
    TaggedValueWrapper(TaggedMemoryValue value)
        : value(value)
    {}

    bool operator==(const TaggedValueWrapper& rhs) const
    {
        bool tag_match = get_tag() == rhs.get_tag();
        bool value_match = into_memory_value() == rhs.into_memory_value();
        return tag_match && value_match;
    }

    TaggedValueWrapper operator+(const TaggedValueWrapper& rhs) const
    {
        TaggedMemoryValue result = std::visit(
            [&](auto&& arg) -> TaggedMemoryValue {
                using T = std::decay_t<decltype(arg)>;
                return arg + std::get<T>(rhs.value);
            },
            value);
        return { result };
    }

    FF into_memory_value() const
    {
        return std::visit(
            [](auto&& arg) -> FF {
                using T = std::decay_t<decltype(arg)>;
                if constexpr (std::is_same_v<T, Uint128>) {
                    return FF(uint256_t::from_uint128(arg.get_value()));
                } else if constexpr (std::is_same_v<T, FF>) {
                    return arg;
                } else {
                    return FF(arg.get_value());
                }
            },
            value);
    }

    MemoryTag get_tag() const
    {
        return std::visit(
            [](auto&& arg) {
                using T = std::decay_t<decltype(arg)>;
                if constexpr (std::is_same_v<T, Uint1>) {
                    return MemoryTag::U1;
                } else if constexpr (std::is_same_v<T, Uint8>) {
                    return MemoryTag::U8;
                } else if constexpr (std::is_same_v<T, Uint16>) {
                    return MemoryTag::U16;
                } else if constexpr (std::is_same_v<T, Uint32>) {
                    return MemoryTag::U32;
                } else if constexpr (std::is_same_v<T, Uint64>) {
                    return MemoryTag::U64;
                } else if constexpr (std::is_same_v<T, Uint128>) {
                    return MemoryTag::U128;
                } else {
                    return MemoryTag::FF;
                    // } else {
                    //     static_assert(false, "non-exhaustive visitor");
                }
            },
            value);
    };

  private:
    TaggedMemoryValue value;
};

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
    unordered_flat_map<size_t, ValueAndTag> memory;
    EventEmitterInterface<MemoryEvent>& events;
};

} // namespace bb::avm2::simulation
