// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../bool/bool.hpp"
#include "../byte_array/byte_array.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "../plookup/plookup.hpp"

namespace bb::stdlib {

template <typename Builder, typename Native> class uint {
  public:
    using FF = typename Builder::FF;
    static constexpr size_t width = sizeof(Native) * 8;

    uint(const witness_t<Builder>& other);
    uint(const field_t<Builder>& other);
    uint(const uint256_t& value = 0);
    uint(Builder* builder, const uint256_t& value = 0);
    uint(const byte_array<Builder>& other);
    uint(Builder* parent_context, const std::vector<bool_t<Builder>>& wires);
    uint(Builder* parent_context, const std::array<bool_t<Builder>, width>& wires);

    uint(const Native v)
        : uint(static_cast<uint256_t>(v))
    {}

    std::vector<uint32_t> constrain_accumulators(Builder* ctx, const uint32_t witness_index) const;

    static constexpr size_t bits_per_limb = 12;
    static constexpr size_t num_accumulators() { return (width + bits_per_limb - 1) / bits_per_limb; }

    uint(const uint& other);
    uint(uint&& other);

    uint& operator=(const uint& other);
    uint& operator=(uint&& other);

    explicit operator byte_array<Builder>() const;
    explicit operator field_t<Builder>() const;

    uint operator+(const uint& other) const;
    uint operator-(const uint& other) const;
    uint operator*(const uint& other) const;
    uint operator/(const uint& other) const;
    uint operator%(const uint& other) const;

    uint operator&(const uint& other) const;
    uint operator^(const uint& other) const;
    uint operator|(const uint& other) const;
    uint operator~() const;

    uint operator>>(const size_t shift) const;
    uint operator<<(const size_t shift) const;

    uint ror(const size_t target_rotation) const;
    uint rol(const size_t target_rotation) const;
    uint ror(const uint256_t target_rotation) const { return ror(static_cast<size_t>(target_rotation.data[0])); }
    uint rol(const uint256_t target_rotation) const { return rol(static_cast<size_t>(target_rotation.data[0])); }

    bool_t<Builder> operator>(const uint& other) const;
    bool_t<Builder> operator<(const uint& other) const;
    bool_t<Builder> operator>=(const uint& other) const;
    bool_t<Builder> operator<=(const uint& other) const;
    bool_t<Builder> operator==(const uint& other) const;
    bool_t<Builder> operator!=(const uint& other) const;
    bool_t<Builder> operator!() const;

    uint operator+=(const uint& other)
    {
        *this = operator+(other);
        return *this;
    }
    uint operator-=(const uint& other)
    {
        *this = operator-(other);
        return *this;
    }
    uint operator*=(const uint& other)
    {
        *this = operator*(other);
        return *this;
    }
    uint operator/=(const uint& other)
    {
        *this = operator/(other);
        return *this;
    }
    uint operator%=(const uint& other)
    {
        *this = operator%(other);
        return *this;
    }

    uint operator&=(const uint& other)
    {
        *this = operator&(other);
        return *this;
    }
    uint operator^=(const uint& other)
    {
        *this = operator^(other);
        return *this;
    }
    uint operator|=(const uint& other)
    {
        *this = operator|(other);
        return *this;
    }

    uint operator>>=(const size_t shift)
    {
        *this = operator>>(shift);
        return *this;
    }
    uint operator<<=(const size_t shift)
    {
        *this = operator<<(shift);
        return *this;
    }

    uint normalize() const;

    uint256_t get_value() const;

    bool is_constant() const { return witness_index == IS_CONSTANT; }
    Builder* get_context() const { return context; }

    bool_t<Builder> at(const size_t bit_index) const;

    size_t get_width() const { return width; }

    uint32_t get_witness_index() const { return witness_index; }

    uint256_t get_additive_constant() const { return additive_constant; }

    std::vector<uint32_t> get_accumulators() const { return accumulators; }
    uint256_t get_unbounded_value() const;

  protected:
    Builder* context;

    enum WitnessStatus { OK, NOT_NORMALIZED, WEAK_NORMALIZED };

    mutable uint256_t additive_constant;
    mutable WitnessStatus witness_status;

    // N.B. Not an accumulator! Contains 6-bit slices of input
    mutable std::vector<uint32_t> accumulators;
    mutable uint32_t witness_index;

    static constexpr uint256_t CIRCUIT_UINT_MAX_PLUS_ONE = (uint256_t(1) << width);
    static constexpr uint256_t MASK = CIRCUIT_UINT_MAX_PLUS_ONE - 1;

  private:
    enum LogicOp {
        AND,
        XOR,
    };

    std::pair<uint, uint> divmod(const uint& other) const;
    uint logic_operator(const uint& other, const LogicOp op_type) const;
};

template <typename Builder> using uint8 = uint<Builder, uint8_t>;
template <typename Builder> using uint16 = uint<Builder, uint16_t>;
template <typename Builder> using uint32 = uint<Builder, uint32_t>;
template <typename Builder> using uint64 = uint<Builder, uint64_t>;

template <typename T, typename w> inline std::ostream& operator<<(std::ostream& os, uint<T, w> const& v)
{
    return os << v.get_value();
}

} // namespace bb::stdlib
