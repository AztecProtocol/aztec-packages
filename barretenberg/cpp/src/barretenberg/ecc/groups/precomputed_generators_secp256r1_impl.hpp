#pragma once
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "precomputed_generators.hpp"

// NOTE: Must be included before using get_precomputed_generators if using secp g1!
namespace bb::detail {

template <> class PrecomputedGenerators<"biggroup table offset generator", secp256r1::g1::affine_element, 1UL, 0UL> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr secp256r1::g1::affine_element generators[1] = {
        { uint256_t("0x12f1907bc0f7caa93716082e67e3466f525281c6a2cd95990b6d3582b5c1375f"),
          uint256_t("0x3111b47a8c982605786143f3d7b4f4c754a1b83aeaa81a7af6b90176b7328d08") }
    };
    static constexpr std::span<const secp256r1::g1::affine_element> get_generators() { return generators; };
};
template <> class PrecomputedGenerators<"biggroup offset generator", secp256r1::g1::affine_element, 1UL, 0UL> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr secp256r1::g1::affine_element generators[1] = {
        { uint256_t("0xb61bd0f5671bc04ec041799e87e735af4ed40920c6ca71e63c8010ff162bd90a"),
          uint256_t("0x338540b43f94cbfe32a1e62d192ea7d5827f4a4a66bb781a02321033110e492b") }
    };
    static constexpr std::span<const secp256r1::g1::affine_element> get_generators() { return generators; };
};

} // namespace bb::detail
