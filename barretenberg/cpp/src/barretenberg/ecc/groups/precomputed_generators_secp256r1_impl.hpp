#pragma once
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "precomputed_generators.hpp"

// NOTE: Must be included before using get_precomputed_generators if using secp g1!
namespace bb::detail {

template <> class PrecomputedGenerators<"biggroup table offset generator", secp256r1::g1::affine_element, 1UL, 0UL> {
  public:
    static std::span<const secp256r1::g1::affine_element> get_generators()
    {
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        static const secp256r1::g1::affine_element generators[1] = {
            { { 17073107942961762201ULL, 2852173614226397194ULL, 13623573872280674322ULL, 749552761154020099ULL },
              { 5412407584077200717ULL, 8019793462306515478ULL, 16737294919534112339ULL, 1803602698978470415ULL } },
        };
        return generators;
    };
};
template <> class PrecomputedGenerators<"biggroup offset generator", secp256r1::g1::affine_element, 1UL, 0UL> {
  public:
    static std::span<const secp256r1::g1::affine_element> get_generators()
    {
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        static const secp256r1::g1::affine_element generators[1] = {
            { { 17073107942961762201ULL, 2852173614226397194ULL, 13623573872280674322ULL, 749552761154020099ULL },
              { 5412407584077200717ULL, 8019793462306515478ULL, 16737294919534112339ULL, 1803602698978470415ULL } },
        };
        return generators;
    };
};

} // namespace bb::detail
