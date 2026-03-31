#pragma once
/**
 * @brief Conversion between wire types (Fr = array<uint8_t,32>) and
 *        barretenberg domain types (bb::fr, grumpkin::fr, affine_element, etc.)
 *
 * Uses bb::field's own serialize_to_buffer / serialize_from_buffer methods
 * which handle endian swap + Montgomery form conversion correctly.
 */

#include <array>
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/// Wire field element: 32-byte serialized form
using Fr = std::array<uint8_t, 32>;

// ---------------------------------------------------------------------------
// Field element conversion — delegates to bb::field's serialization
// ---------------------------------------------------------------------------

template <typename FieldType> inline FieldType field_from_wire(const Fr& w)
{
    return FieldType::serialize_from_buffer(w.data());
}

template <typename FieldType> inline Fr field_to_wire(const FieldType& d)
{
    Fr r;
    FieldType::serialize_to_buffer(d, r.data());
    return r;
}

// ---------------------------------------------------------------------------
// Vector conversion
// ---------------------------------------------------------------------------

template <typename FieldType> inline std::vector<FieldType> field_vec_from_wire(const std::vector<Fr>& wire)
{
    std::vector<FieldType> result;
    result.reserve(wire.size());
    for (const auto& w : wire) {
        result.push_back(field_from_wire<FieldType>(w));
    }
    return result;
}

template <typename FieldType> inline std::vector<Fr> field_vec_to_wire(const std::vector<FieldType>& domain)
{
    std::vector<Fr> result;
    result.reserve(domain.size());
    for (const auto& d : domain) {
        result.push_back(field_to_wire<FieldType>(d));
    }
    return result;
}

// ---------------------------------------------------------------------------
// Affine element conversion (point = {Fq x, Fq y})
// ---------------------------------------------------------------------------

template <typename AffineType, typename WirePoint> inline AffineType point_from_wire(const WirePoint& w)
{
    AffineType r;
    r.x = field_from_wire<typename AffineType::Fq>(w.x);
    r.y = field_from_wire<typename AffineType::Fq>(w.y);
    return r;
}

template <typename WirePoint, typename AffineType> inline WirePoint point_to_wire(const AffineType& d)
{
    WirePoint r;
    r.x = field_to_wire<typename AffineType::Fq>(d.x);
    r.y = field_to_wire<typename AffineType::Fq>(d.y);
    return r;
}

} // namespace bb::bbapi
