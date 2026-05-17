#pragma once
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "group.hpp"
#include "precomputed_generators.hpp"
// NOTE: Must be included before using get_precomputed_generators if using bn254 g1!
namespace bb::detail {
template <> class PrecomputedGenerators<"biggroup table offset generator", g1::affine_element, 1, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[1] = {
        { uint256_t{ 0x1a1858aab7b8927fUL, 0x7a8c46772f267988UL, 0x2206bdf32238eee7UL, 0x240d420bc60418afUL },
          uint256_t{ 0x3883613f538e3822UL, 0x61b09acebd1ea962UL, 0x15c2674207a3f558UL, 0x04ffcf276f8bc773UL } }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
template <> class PrecomputedGenerators<"biggroup offset generator", g1::affine_element, 1, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[1] = {
        { uint256_t{ 0x2af4bd2820d6fb33UL, 0x6485297ee10452a6UL, 0x16edf369c34509daUL, 0x169b33374f53b95fUL },
          uint256_t{ 0x9f9264121567315bUL, 0x050a381b745cffaaUL, 0xfe2b8f232288a075UL, 0x019d6e473e9b638cUL } }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
template <> class PrecomputedGenerators<"ECCVM_OFFSET_GENERATOR", g1::affine_element, 1, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[1] = {
        { uint256_t{ 0x6265e9b7d36642b2UL, 0xd4da7611b3e26556UL, 0x5a3f2f1d18e4c604UL, 0x2728608c9bfb5203UL },
          uint256_t{ 0xf46a7b88a64f7742UL, 0x164db7ca52a19321UL, 0x9c4755dac222ae1dUL, 0x0451a4da5a630385UL } }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
template <> class PrecomputedGenerators<"test generators", g1::affine_element, 2, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[2] = {
        { uint256_t{ 0x9784c425f260ea7dUL, 0x6788ceabefad9507UL, 0xa2ddd6a1de3ff3c7UL, 0x08777a8c0abf512cUL },
          uint256_t{ 0x0018ae51d7e1a755UL, 0x92b4416c6bb28679UL, 0x2be55499c03bd7fdUL, 0x1172b72b11c4eb0eUL } },
        { uint256_t{ 0xf9b42190f23926d1UL, 0x269ce204e44d1152UL, 0xebc2f212a62813aeUL, 0x1a934324fa18c1d0UL },
          uint256_t{ 0x880d861de2a65d39UL, 0xda1edb8dc1923572UL, 0x5783512d44d88e81UL, 0x1949167f938661c0UL } }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
}; // namespace bb::detail
