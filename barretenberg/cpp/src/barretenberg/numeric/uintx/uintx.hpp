// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

/**
 * uintx
 * Copyright Aztec 2020
 *
 * An unsigned 512 bit integer type.
 *
 * Constructor and all methods are constexpr. Ideally, uintx should be able to be treated like any other literal
 *type.
 *
 * Not optimized for performance, this code doesn"t touch any of our hot paths when constructing PLONK proofs
 **/
#pragma once

#include "../uint256/uint256.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstdint>
#include <iomanip>
#include <iostream>

namespace bb::numeric {

template <class base_uint> class uintx {
  public:
    constexpr uintx(const uint64_t& data = 0)
        : lo(data)
        , hi(base_uint(0))
    {}

    constexpr uintx(const uint256_t& data)
        requires(!std::is_same_v<base_uint, uint256_t>)
        : lo(data)
        , hi(base_uint(0))

    {}
    constexpr uintx(const base_uint input_lo)
        : lo(input_lo)
        , hi(base_uint(0))
    {}

    constexpr uintx(const base_uint input_lo, const base_uint input_hi)
        : lo(input_lo)
        , hi(input_hi)
    {}

    constexpr uintx(const uintx& other) = default;
    constexpr uintx(uintx&& other) noexcept = default;

    static size_t length() { return 2 * base_uint::length(); }
    uintx& operator=(const uintx& other) = default;
    uintx& operator=(uintx&& other) noexcept = default;

    ~uintx() = default;
    explicit operator bool() const { return static_cast<bool>(lo); };
    explicit operator uint8_t() const { return static_cast<uint8_t>(lo); };
    explicit operator uint16_t() const { return static_cast<uint16_t>(lo); };
    explicit operator uint32_t() const { return static_cast<uint32_t>(lo); };
    explicit operator uint64_t() const { return static_cast<uint64_t>(lo); };

    explicit operator base_uint() const { return lo; }

    [[nodiscard]] bool get_bit(uint64_t bit_index) const;
    [[nodiscard]] constexpr uint64_t get_msb() const
    {
        uint64_t hi_idx = hi.get_msb();
        uint64_t lo_idx = lo.get_msb();
        return (hi_idx || (hi > base_uint(0))) ? (hi_idx + base_uint::length()) : lo_idx;
    }
    uintx slice(uint64_t start, uint64_t end) const;

    uintx operator+(const uintx& other) const;
    uintx operator-(const uintx& other) const;
    uintx operator-() const;

    uintx operator*(const uintx& other) const;
    uintx operator/(const uintx& other) const;
    uintx operator%(const uintx& other) const;

    std::pair<uintx, uintx> mul_extended(const uintx& other) const;

    uintx operator>>(uint64_t other) const;
    uintx operator<<(uint64_t other) const;

    uintx operator&(const uintx& other) const;
    uintx operator^(const uintx& other) const;
    uintx operator|(const uintx& other) const;
    uintx operator~() const;

    bool operator==(const uintx& other) const;
    bool operator!=(const uintx& other) const;
    bool operator!() const;

    bool operator>(const uintx& other) const;
    bool operator<(const uintx& other) const;
    bool operator>=(const uintx& other) const;
    bool operator<=(const uintx& other) const;

    uintx& operator+=(const uintx& other)
    {
        *this = *this + other;
        return *this;
    };
    uintx& operator-=(const uintx& other)
    {
        *this = *this - other;
        return *this;
    };
    uintx& operator*=(const uintx& other)
    {
        *this = *this * other;
        return *this;
    };
    uintx& operator/=(const uintx& other)

    {
        *this = *this / other;
        return *this;
    };
    uintx& operator%=(const uintx& other)

    {
        *this = *this % other;
        return *this;
    };

    uintx& operator++()
    {
        *this += uintx(1);
        return *this;
    };
    uintx& operator--()
    {
        *this -= uintx(1);
        return *this;
    };

    uintx& operator&=(const uintx& other)
    {
        *this = *this & other;
        return *this;
    };
    uintx& operator^=(const uintx& other)
    {
        *this = *this ^ other;
        return *this;
    };
    uintx& operator|=(const uintx& other)
    {
        *this = *this | other;
        return *this;
    };

    uintx& operator>>=(const uint64_t other)
    {
        *this = *this >> other;
        return *this;
    };
    uintx& operator<<=(const uint64_t other)
    {
        *this = *this << other;
        return *this;
    };

    uintx invmod(const uintx& modulus) const;
    uintx unsafe_invmod(const uintx& modulus) const;

    base_uint lo;
    base_uint hi;

    template <base_uint modulus> std::pair<uintx, uintx> barrett_reduction() const;

    // This only works (and is only used) for uint256_t
    std::pair<uintx, uintx> divmod(const uintx& b) const;
    // This only works (and is only used) for uint256_t
    std::pair<uintx, uintx> divmod_base(const uintx& b) const;
};

template <typename B, typename Params> inline void read(B& it, uintx<Params>& value)
{
    using serialize::read;
    Params a;
    Params b;
    read(it, b);
    read(it, a);
    value = uintx<Params>(a, b);
}

template <typename B, typename Params> inline void write(B& it, uintx<Params> const& value)
{
    using serialize::write;
    write(it, value.hi);
    write(it, value.lo);
}

template <class base_uint> inline std::ostream& operator<<(std::ostream& os, uintx<base_uint> const& a)
{
    os << a.lo << ", " << a.hi << std::endl;
    return os;
}

extern template class uintx<uint256_t>;
using uint512_t = uintx<uint256_t>;
extern template class uintx<uint512_t>;
using uint1024_t = uintx<uint512_t>;

} // namespace bb::numeric

using bb::numeric::uint1024_t; // NOLINT
using bb::numeric::uint512_t;  // NOLINT
