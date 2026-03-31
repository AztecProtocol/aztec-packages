#pragma once
/**
 * @brief Zero-cost conversion between wire types (Fr = array<uint8_t,32>) and
 *        barretenberg domain types (bb::fr, grumpkin::fr, affine_element, etc.)
 *
 * All field elements are 32-byte Montgomery form both on wire and in memory,
 * so conversion is just memcpy. affine_element is {Fq x, Fq y} = 2×32 bytes.
 */

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <vector>

namespace bb::bbapi {

/// Wire field element: 32-byte Montgomery form (same as bb::fr in memory)
using Fr = std::array<uint8_t, 32>;

// ---------------------------------------------------------------------------
// Field element conversion (all 32-byte Montgomery types)
// ---------------------------------------------------------------------------

/// Convert wire Fr → any 32-byte field type (bb::fr, grumpkin::fr, secp256k1::fr, etc.)
template <typename FieldType> inline FieldType field_from_wire(const Fr& w)
{
    FieldType r;
    std::memcpy(static_cast<void*>(&r), w.data(), 32);
    return r;
}

/// Convert any 32-byte field type → wire Fr
template <typename FieldType> inline Fr field_to_wire(const FieldType& d)
{
    Fr r;
    std::memcpy(r.data(), static_cast<const void*>(&d), 32);
    return r;
}

// ---------------------------------------------------------------------------
// Vector conversion
// ---------------------------------------------------------------------------

template <typename DomainType, typename WireType, typename ConvertFn>
inline std::vector<DomainType> vec_from_wire(const std::vector<WireType>& wire, ConvertFn convert)
{
    std::vector<DomainType> result;
    result.reserve(wire.size());
    for (const auto& w : wire) {
        result.push_back(convert(w));
    }
    return result;
}

template <typename WireType, typename DomainType, typename ConvertFn>
inline std::vector<WireType> vec_to_wire(const std::vector<DomainType>& domain, ConvertFn convert)
{
    std::vector<WireType> result;
    result.reserve(domain.size());
    for (const auto& d : domain) {
        result.push_back(convert(d));
    }
    return result;
}

/// Shorthand for vector<Fr> ↔ vector<FieldType>
template <typename FieldType> inline std::vector<FieldType> field_vec_from_wire(const std::vector<Fr>& wire)
{
    return vec_from_wire<FieldType>(wire, field_from_wire<FieldType>);
}

template <typename FieldType> inline std::vector<Fr> field_vec_to_wire(const std::vector<FieldType>& domain)
{
    return vec_to_wire<Fr>(domain, field_to_wire<FieldType>);
}

// ---------------------------------------------------------------------------
// Affine element conversion (point = {Fq x, Fq y})
// Wire point = struct { Fr x; Fr y; }
// ---------------------------------------------------------------------------

/// Convert a wire point struct (with .x, .y as Fr) to an affine_element
template <typename AffineType, typename WirePoint> inline AffineType point_from_wire(const WirePoint& w)
{
    AffineType r;
    std::memcpy(static_cast<void*>(&r.x), w.x.data(), 32);
    std::memcpy(static_cast<void*>(&r.y), w.y.data(), 32);
    return r;
}

/// Convert an affine_element to a wire point struct
template <typename WirePoint, typename AffineType> inline WirePoint point_to_wire(const AffineType& d)
{
    WirePoint r;
    std::memcpy(r.x.data(), static_cast<const void*>(&d.x), 32);
    std::memcpy(r.y.data(), static_cast<const void*>(&d.y), 32);
    return r;
}

} // namespace bb::bbapi
