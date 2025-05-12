#pragma once
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "group.hpp"
#include "precomputed_generators.hpp"
// NOTE: Must be included before using get_precomputed_generators if using bn254 g1!
namespace bb::detail {
template <> class PrecomputedGenerators<"biggroup table offset generator", g1::affine_element, 1, 0> {
  public:
    static std::span<const g1::affine_element> get_generators()
    {
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        static const g1::affine_element generators[1] = {
            { { 7762086984941950370ULL, 10684025356749256500ULL, 13748198196038680396ULL, 707780873284498417ULL },
              { 1663243467983316955ULL, 16723259082508773207ULL, 9366176347284288152ULL, 650519917458561605ULL } }
        };
        return generators;
    }
};
template <> class PrecomputedGenerators<"biggroup offset generator", g1::affine_element, 1, 0> {
  public:
    static std::span<const g1::affine_element> get_generators()
    {
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        static const g1::affine_element generators[1] = {
            { { 7762086984941950370ULL, 10684025356749256500ULL, 13748198196038680396ULL, 707780873284498417ULL },
              { 1663243467983316955ULL, 16723259082508773207ULL, 9366176347284288152ULL, 650519917458561605ULL } }
        };
        return generators;
    }
};
template <> class PrecomputedGenerators<"ECCVM_OFFSET_GENERATOR", g1::affine_element, 1, 0> {
  public:
    static std::span<const g1::affine_element> get_generators()
    {
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        static const g1::affine_element generators[1] = {
            { { 7374687731202222564ULL, 8543745450152580123ULL, 2921030955956618589ULL, 2599641324373959496ULL },
              { 6960415070023996614ULL, 14053522495179787214ULL, 14517046433555033617ULL, 2415631830684294405ULL } }
        };
        return generators;
    }
};
template <> class PrecomputedGenerators<"test generators", g1::affine_element, 2, 0> {
  public:
    static std::span<const g1::affine_element> get_generators()
    {
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        static const g1::affine_element generators[1] = {
            { { 7374687731202222564ULL, 8543745450152580123ULL, 2921030955956618589ULL, 2599641324373959496ULL },
              { 6960415070023996614ULL, 14053522495179787214ULL, 14517046433555033617ULL, 2415631830684294405ULL } }
        };
        return generators;
    }
};
}; // namespace bb::detail
