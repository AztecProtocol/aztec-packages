#pragma once

#include "barretenberg/ecc/curves/types.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <array>
#include <cstdint>

namespace bb::stdlib {

// TODO(AI): Keep these literals tested against Curve::GroupNative::one + Curve::GroupNative::one.
template <typename Curve> constexpr std::array<uint8_t, 32> ecdsa_default_public_key_x_bytes()
{
    static_assert(Curve::type == bb::CurveType::SECP256K1 || Curve::type == bb::CurveType::SECP256R1,
                  "Unsupported ECDSA curve type");

    if constexpr (Curve::type == bb::CurveType::SECP256K1) {
        return { 0xc6, 0x04, 0x7f, 0x94, 0x41, 0xed, 0x7d, 0x6d, 0x30, 0x45, 0x40,
                 0x6e, 0x95, 0xc0, 0x7c, 0xd8, 0x5c, 0x77, 0x8e, 0x4b, 0x8c, 0xef,
                 0x3c, 0xa7, 0xab, 0xac, 0x09, 0xb9, 0x5c, 0x70, 0x9e, 0xe5 };
    } else {
        return { 0x7c, 0xf2, 0x7b, 0x18, 0x8d, 0x03, 0x4f, 0x7e, 0x8a, 0x52, 0x38,
                 0x03, 0x04, 0xb5, 0x1a, 0xc3, 0xc0, 0x89, 0x69, 0xe2, 0x77, 0xf2,
                 0x1b, 0x35, 0xa6, 0x0b, 0x48, 0xfc, 0x47, 0x66, 0x99, 0x78 };
    }
}

template <typename Curve> constexpr std::array<uint8_t, 32> ecdsa_default_public_key_y_bytes()
{
    static_assert(Curve::type == bb::CurveType::SECP256K1 || Curve::type == bb::CurveType::SECP256R1,
                  "Unsupported ECDSA curve type");

    if constexpr (Curve::type == bb::CurveType::SECP256K1) {
        return { 0x1a, 0xe1, 0x68, 0xfe, 0xa6, 0x3d, 0xc3, 0x39, 0xa3, 0xc5, 0x84,
                 0x19, 0x46, 0x6c, 0xea, 0xee, 0xf7, 0xf6, 0x32, 0x65, 0x32, 0x66,
                 0xd0, 0xe1, 0x23, 0x64, 0x31, 0xa9, 0x50, 0xcf, 0xe5, 0x2a };
    } else {
        return { 0x07, 0x77, 0x55, 0x10, 0xdb, 0x8e, 0xd0, 0x40, 0x29, 0x3d, 0x9a,
                 0xc6, 0x9f, 0x74, 0x30, 0xdb, 0xba, 0x7d, 0xad, 0xe6, 0x3c, 0xe9,
                 0x82, 0x29, 0x9e, 0x04, 0xb7, 0x9d, 0x22, 0x78, 0x73, 0xd1 };
    }
}

template <typename Curve> constexpr uint256_t ecdsa_default_public_key_x_uint256()
{
    static_assert(Curve::type == bb::CurveType::SECP256K1 || Curve::type == bb::CurveType::SECP256R1,
                  "Unsupported ECDSA curve type");

    if constexpr (Curve::type == bb::CurveType::SECP256K1) {
        return uint256_t(0xabac09b95c709ee5ULL,
                         0x5c778e4b8cef3ca7ULL,
                         0x3045406e95c07cd8ULL,
                         0xc6047f9441ed7d6dULL);
    } else {
        return uint256_t(0xa60b48fc47669978ULL,
                         0xc08969e277f21b35ULL,
                         0x8a52380304b51ac3ULL,
                         0x7cf27b188d034f7eULL);
    }
}

template <typename Curve> constexpr uint256_t ecdsa_default_public_key_y_uint256()
{
    static_assert(Curve::type == bb::CurveType::SECP256K1 || Curve::type == bb::CurveType::SECP256R1,
                  "Unsupported ECDSA curve type");

    if constexpr (Curve::type == bb::CurveType::SECP256K1) {
        return uint256_t(0x236431a950cfe52aULL,
                         0xf7f632653266d0e1ULL,
                         0xa3c58419466ceaeeULL,
                         0x1ae168fea63dc339ULL);
    } else {
        return uint256_t(0x9e04b79d227873d1ULL,
                         0xba7dade63ce98229ULL,
                         0x293d9ac69f7430dbULL,
                         0x07775510db8ed040ULL);
    }
}

} // namespace bb::stdlib
