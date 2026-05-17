#pragma once
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "precomputed_generators.hpp"

// NOTE: Must be included before using get_precomputed_generators if using secp256k1 g1!
namespace bb::detail {

template <> class PrecomputedGenerators<"biggroup table offset generator", secp256k1::g1::affine_element, 1UL, 0UL> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr secp256k1::g1::affine_element generators[1] = {
        { uint256_t{ 0x7f69f995e77afc25UL, 0xbbfd2f60a9389f6bUL, 0x30886bcc3e112214UL, 0x574c230ce1832968UL },
          uint256_t{ 0x3c064192284766eeUL, 0x712f7e0ff7956229UL, 0xf903c8be0326fae6UL, 0xb0696caf104df357UL } }
    };
    static constexpr std::span<const secp256k1::g1::affine_element> get_generators() { return generators; };
};
template <> class PrecomputedGenerators<"biggroup offset generator", secp256k1::g1::affine_element, 1UL, 0UL> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr secp256k1::g1::affine_element generators[1] = {
        { uint256_t{ 0xce1b1ee6f0962a9fUL, 0x4e1e9e57ed9e554aUL, 0x64871af23b35a2c2UL, 0xa09161947fa2686bUL },
          uint256_t{ 0xb4875879bd146359UL, 0xcc86f6bf12dfc54cUL, 0x6d5320d31184c6afUL, 0xa70752750a286234UL } }
    };
    static constexpr std::span<const secp256k1::g1::affine_element> get_generators() { return generators; };
};

} // namespace bb::detail
