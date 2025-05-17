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
        { uint256_t("0x240d420bc60418af2206bdf32238eee77a8c46772f2679881a1858aab7b8927f"),
          uint256_t("0x04ffcf276f8bc77315c2674207a3f55861b09acebd1ea9623883613f538e3822") }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
template <> class PrecomputedGenerators<"biggroup offset generator", g1::affine_element, 1, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[1] = {
        { uint256_t("0x169b33374f53b95f16edf369c34509da6485297ee10452a62af4bd2820d6fb33"),
          uint256_t("0x019d6e473e9b638cfe2b8f232288a075050a381b745cffaa9f9264121567315b") }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
template <> class PrecomputedGenerators<"ECCVM_OFFSET_GENERATOR", g1::affine_element, 1, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[1] = {
        { uint256_t("0x2728608c9bfb52035a3f2f1d18e4c604d4da7611b3e265566265e9b7d36642b2"),
          uint256_t("0x0451a4da5a6303859c4755dac222ae1d164db7ca52a19321f46a7b88a64f7742") }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
template <> class PrecomputedGenerators<"test generators", g1::affine_element, 2, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[2] = {
        { uint256_t("0x08777a8c0abf512ca2ddd6a1de3ff3c76788ceabefad95079784c425f260ea7d"),
          uint256_t("0x1172b72b11c4eb0e2be55499c03bd7fd92b4416c6bb286790018ae51d7e1a755") },
        { uint256_t("0x1a934324fa18c1d0ebc2f212a62813ae269ce204e44d1152f9b42190f23926d1"),
          uint256_t("0x1949167f938661c05783512d44d88e81da1edb8dc1923572880d861de2a65d39") }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
}; // namespace bb::detail
