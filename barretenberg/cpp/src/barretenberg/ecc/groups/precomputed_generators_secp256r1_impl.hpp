#pragma once
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "precomputed_generators.hpp"

// NOTE: Must be included before using get_precomputed_generators if using secp g1!
namespace bb::detail {

template <> class PrecomputedGenerators<"biggroup table offset generator", secp256r1::g1::affine_element, 1UL, 0UL> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr secp256r1::g1::affine_element generators[1] = {
        { uint256_t{ 0x0b6d3582b5c1375fUL, 0x525281c6a2cd9599UL, 0x3716082e67e3466fUL, 0x12f1907bc0f7caa9UL },
          uint256_t{ 0xf6b90176b7328d08UL, 0x54a1b83aeaa81a7aUL, 0x786143f3d7b4f4c7UL, 0x3111b47a8c982605UL } }
    };
    static constexpr std::span<const secp256r1::g1::affine_element> get_generators() { return generators; };
};
template <> class PrecomputedGenerators<"biggroup offset generator", secp256r1::g1::affine_element, 1UL, 0UL> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr secp256r1::g1::affine_element generators[1] = {
        { uint256_t{ 0x3c8010ff162bd90aUL, 0x4ed40920c6ca71e6UL, 0xc041799e87e735afUL, 0xb61bd0f5671bc04eUL },
          uint256_t{ 0x02321033110e492bUL, 0x827f4a4a66bb781aUL, 0x32a1e62d192ea7d5UL, 0x338540b43f94cbfeUL } }
    };
    static constexpr std::span<const secp256r1::g1::affine_element> get_generators() { return generators; };
};

} // namespace bb::detail
