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
            { { 4276204512574362068ULL, 15519856476823794700ULL, 1003492150554369224ULL, 6520230211306527808ULL },
              { 15249479393120843651ULL, 17442822883200906305ULL, 18139010248036547465ULL, 13476915261577728122ULL } },
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
            { { 11378980334173647181ULL, 7273379636130967587ULL, 17237467963710413828ULL, 15760383832955581035ULL },
              { 12250615173581878547ULL, 2537831554260848516ULL, 3366408450925420470ULL, 8544096919766069810ULL } },
        };
        return generators;
    };
};

} // namespace bb::detail
