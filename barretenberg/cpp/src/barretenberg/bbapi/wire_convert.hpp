#pragma once
/**
 * @brief Conversion between wire types (Fr = array<uint8_t,32>) and
 *        barretenberg domain types (bb::fr, grumpkin::fr, affine_element, etc.)
 *
 * Wire format: 32-byte big-endian canonical form (matching bb::fr msgpack serialization).
 * Domain format: little-endian Montgomery form (bb::fr internal representation).
 *
 * The conversion performs endian swap + Montgomery form conversion to match
 * the existing msgpack_pack/msgpack_unpack in field_impl.hpp.
 */

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <vector>

#ifdef _WIN32
#include <winsock2.h>
#else
#include <arpa/inet.h>
#endif

// htonll/ntohll may not be defined on all platforms
#ifndef htonll
#define htonll(x) ((((uint64_t)htonl((uint32_t)(x))) << 32) | htonl((uint32_t)((x) >> 32)))
#endif
#ifndef ntohll
#define ntohll(x) htonll(x)
#endif

namespace bb::bbapi {

/// Wire field element: 32-byte big-endian canonical form
using Fr = std::array<uint8_t, 32>;

// ---------------------------------------------------------------------------
// Field element conversion
// Wire format: 32-byte big-endian canonical (same as bb::fr msgpack wire format)
// Domain format: 4×uint64_t little-endian Montgomery (bb::fr internal)
// ---------------------------------------------------------------------------

/// Convert wire Fr (big-endian canonical) → any 32-byte field type (bb::fr, grumpkin::fr, etc.)
/// Matches the logic of bb::field::msgpack_unpack in field_impl.hpp.
template <typename FieldType> inline FieldType field_from_wire(const Fr& w)
{
    // Read big-endian uint64_t's and swap to host endianness (matching msgpack_unpack)
    const auto* cast_data = reinterpret_cast<const uint64_t*>(w.data()); // NOLINT
    FieldType r;
    r.data[0] = ntohll(cast_data[3]);
    r.data[1] = ntohll(cast_data[2]);
    r.data[2] = ntohll(cast_data[1]);
    r.data[3] = ntohll(cast_data[0]);
    // Convert from canonical to Montgomery form
    r = r.to_montgomery_form_reduced();
    return r;
}

/// Convert any 32-byte field type → wire Fr (big-endian canonical)
/// Matches the logic of bb::field::msgpack_pack in field_impl.hpp.
template <typename FieldType> inline Fr field_to_wire(const FieldType& d)
{
    // Convert from Montgomery form to canonical [0, p)
    auto adjusted = d.from_montgomery_form_reduced();
    // Write as big-endian (matching msgpack_pack)
    Fr r;
    auto* out = reinterpret_cast<uint64_t*>(r.data()); // NOLINT
    out[0] = htonll(adjusted.data[3]);
    out[1] = htonll(adjusted.data[2]);
    out[2] = htonll(adjusted.data[1]);
    out[3] = htonll(adjusted.data[0]);
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
/// Uses field_from_wire for proper big-endian canonical → Montgomery conversion.
template <typename AffineType, typename WirePoint> inline AffineType point_from_wire(const WirePoint& w)
{
    AffineType r;
    r.x = field_from_wire<typename AffineType::Fq>(w.x);
    r.y = field_from_wire<typename AffineType::Fq>(w.y);
    return r;
}

/// Convert an affine_element to a wire point struct
/// Uses field_to_wire for proper Montgomery → big-endian canonical conversion.
template <typename WirePoint, typename AffineType> inline WirePoint point_to_wire(const AffineType& d)
{
    WirePoint r;
    r.x = field_to_wire<typename AffineType::Fq>(d.x);
    r.y = field_to_wire<typename AffineType::Fq>(d.y);
    return r;
}

} // namespace bb::bbapi
