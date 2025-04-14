#pragma once

#include <memory>

#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"

namespace bb::avm2::simulation {

class AvmTaggedMemoryInterface {
  public:
    virtual ~AvmTaggedMemoryInterface() = default;

    virtual std::unique_ptr<AvmTaggedMemoryInterface> operator+(const AvmTaggedMemoryInterface& other) const = 0;
    virtual bool operator>(const AvmTaggedMemoryInterface& other) const = 0;
    virtual std::unique_ptr<AvmTaggedMemoryInterface> operator&(const AvmTaggedMemoryInterface& other) const = 0;

    virtual MemoryTag get_tag() const = 0;
    virtual MemoryValue get_memory_value() const = 0;
};

class AvmTaggedMemoryWrapper {
  public:
    AvmTaggedMemoryWrapper(std::unique_ptr<AvmTaggedMemoryInterface> value)
        : value(std::move(value))
    {}

    // Move constructor
    AvmTaggedMemoryWrapper(AvmTaggedMemoryWrapper&& other) noexcept
        : value(std::move(other.value))
    {}

    AvmTaggedMemoryWrapper operator+(const AvmTaggedMemoryWrapper& other) const { return { *value + *other.value }; }
    bool operator>(const AvmTaggedMemoryWrapper& other) const { return *value > *other.value; }
    AvmTaggedMemoryWrapper operator&(const AvmTaggedMemoryWrapper& other) const { return *value & *other.value; }

    AvmTaggedMemoryInterface& get_value() const { return *value; }
    MemoryValue get_memory_value() const { return value->get_memory_value(); }
    MemoryTag get_tag() const { return value->get_tag(); }

  private:
    std::unique_ptr<AvmTaggedMemoryInterface> value;
};

template <typename T, MemoryTag tag> class AvmIntegralType : public AvmTaggedMemoryInterface {
  public:
    AvmIntegralType(T value)
        : value(value)
    {}

    std::unique_ptr<AvmTaggedMemoryInterface> operator+(const AvmTaggedMemoryInterface& other) const override
    {
        // Check the types are the same
        if (typeid(*this) != typeid(other)) {
            throw std::runtime_error("Cannot add different types");
        }
        const auto& other_integral = dynamic_cast<const AvmIntegralType&>(other);
        return std::make_unique<AvmIntegralType>(value + other_integral.value);
    }
    bool operator>(const AvmTaggedMemoryInterface& other) const override
    {
        // Check the types are the same
        if (typeid(*this) != typeid(other)) {
            throw std::runtime_error("Cannot compare different types");
        }
        const auto& other_integral = dynamic_cast<const AvmIntegralType&>(other);
        return value > other_integral.value;
    }
    std::unique_ptr<AvmTaggedMemoryInterface> operator&(const AvmTaggedMemoryInterface& other) const override
    {
        // Check the types are the same
        if (typeid(*this) != typeid(other)) {
            throw std::runtime_error("Cannot compare different types");
        }
        const auto& other_integral = dynamic_cast<const AvmIntegralType&>(other);
        return std::make_unique<AvmIntegralType>(value && other_integral.value);
    }

    T get_value() const { return value; }
    MemoryValue get_memory_value() const override { return FF(value); }
    MemoryTag get_tag() const override { return tag; }

  private:
    T value;
};

class NewUint1 {
  public:
    NewUint1(uint8_t value)
    {
        if (value > 1) {
            throw std::runtime_error("Uint1 can only be 0 or 1");
        }
        this->value = value;
    }

    NewUint1 operator+(const NewUint1& other) const { return { static_cast<uint8_t>((value + other.value) & 1) }; }
    NewUint1 operator-(const NewUint1& other) const { return { static_cast<uint8_t>((value - other.value) & 1) }; }
    NewUint1 operator*(const NewUint1& other) const { return { static_cast<uint8_t>(value * other.value) }; }
    NewUint1 operator/(const NewUint1& other) const
    {
        if (other.value == 0) {
            throw std::runtime_error("Division by zero");
        }
        return { static_cast<uint8_t>(value / other.value) };
    }
    NewUint1 operator&(const NewUint1& other) const { return { static_cast<uint8_t>(value & other.value) }; }
    NewUint1 operator|(const NewUint1& other) const { return { static_cast<uint8_t>(value | other.value) }; }
    NewUint1 operator^(const NewUint1& other) const { return { static_cast<uint8_t>(value ^ other.value) }; }
    NewUint1 operator~() const { return { static_cast<uint8_t>(~value & 1) }; }

    bool operator==(const NewUint1& other) const { return value == other.value; }
    bool operator!=(const NewUint1& other) const { return value != other.value; }
    bool operator>(const NewUint1& other) const { return value > other.value; }
    bool operator<(const NewUint1& other) const { return value < other.value; }
    bool operator>=(const NewUint1& other) const { return value >= other.value; }
    bool operator<=(const NewUint1& other) const { return value <= other.value; }

    uint8_t get_value() const { return value; }
    static MemoryTag get_tag() { return MemoryTag::U1; }

  private:
    uint8_t value;
};

using Uint1 = AvmIntegralType<NewUint1, MemoryTag::U1>;
using Uint8 = AvmIntegralType<uint8_t, MemoryTag::U8>;
using Uint16 = AvmIntegralType<uint16_t, MemoryTag::U16>;
using Uint32 = AvmIntegralType<uint32_t, MemoryTag::U32>;
using Uint64 = AvmIntegralType<uint64_t, MemoryTag::U64>;
using Uint128 = AvmIntegralType<uint128_t, MemoryTag::U128>;

class AvmFieldType : public AvmTaggedMemoryInterface {
  public:
    AvmFieldType(const uint256_t& value)
        : value(value)
    {}

    AvmFieldType(const FF& value)
        : value(value)
    {}

    std::unique_ptr<AvmTaggedMemoryInterface> operator+(const AvmTaggedMemoryInterface& other) const override
    {
        // Check the types are the same
        if (typeid(*this) != typeid(other)) {
            throw std::runtime_error("Cannot add different types");
        }
        const auto& other_field = dynamic_cast<const AvmFieldType&>(other);
        return std::make_unique<AvmFieldType>(value + other_field.value);
    }

    bool operator>(const AvmTaggedMemoryInterface& other) const override
    {
        // Check the types are the same
        if (typeid(*this) != typeid(other)) {
            throw std::runtime_error("Cannot compare different types");
        }
        const auto& other_field = dynamic_cast<const AvmFieldType&>(other);
        return value > other_field.value;
    }

    std::unique_ptr<AvmTaggedMemoryInterface> operator&(
        [[maybe_unused]] const AvmTaggedMemoryInterface& other) const override
    {
        throw std::runtime_error("Cannot use && on field types");
    }

    uint256_t get_value() const { return value; }
    MemoryTag get_tag() const override { return MemoryTag::FF; }
    MemoryValue get_memory_value() const override { return value; }

  private:
    FF value;
};

struct ValueRefAndTag {
    const MemoryValue& value;
    MemoryTag tag;

    bool operator==(const ValueRefAndTag& other) const { return value == other.value && tag == other.tag; }
};

using SliceWithTags = RefVector<AvmTaggedMemoryWrapper>;

class MemoryInterface {
  public:
    virtual ~MemoryInterface() = default;

    virtual void set(MemoryAddress index, std::unique_ptr<AvmTaggedMemoryWrapper> value) = 0;
    virtual AvmTaggedMemoryWrapper& get(MemoryAddress index) const = 0;

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

    void set(MemoryAddress index, std::unique_ptr<AvmTaggedMemoryWrapper>) override;
    AvmTaggedMemoryWrapper& get(MemoryAddress index) const override;

    uint32_t get_space_id() const override { return space_id; }

  private:
    struct ValueAndTag {
        MemoryValue value;
        MemoryTag tag;
    };

    uint32_t space_id;
    unordered_flat_map<size_t, std::unique_ptr<AvmTaggedMemoryWrapper>> memory;
    EventEmitterInterface<MemoryEvent>& events;
};

} // namespace bb::avm2::simulation
