#pragma once
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "precomputed_generators.hpp"

// NOTE: Must be included before using get_precomputed_generators if using secp256k1 g1!
namespace bb::detail {

template <> class PrecomputedGenerators<"biggroup table offset generator", secp256k1::g1::affine_element, 1UL, 0UL> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr secp256k1::g1::affine_element generators[1] = {
        { uint256_t("0x574c230ce183296830886bcc3e112214bbfd2f60a9389f6b7f69f995e77afc25"),
          uint256_t("0xb0696caf104df357f903c8be0326fae6712f7e0ff79562293c064192284766ee") }
    };
    static constexpr std::span<const secp256k1::g1::affine_element> get_generators() { return generators; };
};
template <> class PrecomputedGenerators<"biggroup offset generator", secp256k1::g1::affine_element, 1UL, 0UL> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr secp256k1::g1::affine_element generators[1] = {
        { uint256_t("0xa09161947fa2686b64871af23b35a2c24e1e9e57ed9e554ace1b1ee6f0962a9f"),
          uint256_t("0xa70752750a2862346d5320d31184c6afcc86f6bf12dfc54cb4875879bd146359") }
    };
    static constexpr std::span<const secp256k1::g1::affine_element> get_generators() { return generators; };
};

} // namespace bb::detail
