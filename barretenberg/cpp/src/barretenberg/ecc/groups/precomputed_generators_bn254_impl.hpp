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
        { { 7762086984941950370ULL, 10684025356749256500ULL, 13748198196038680396ULL, 707780873284498417ULL },
          { 1663243467983316955ULL, 16723259082508773207ULL, 9366176347284288152ULL, 650519917458561605ULL } }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
template <> class PrecomputedGenerators<"biggroup offset generator", g1::affine_element, 1, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[1] = {
        { { 3402697789448964667ULL, 12272641339941532534ULL, 3202222964502006468ULL, 3441049934705304460ULL },
          { 16574262713924055291ULL, 14022735779041100584ULL, 1168844528721575365ULL, 1598138279242208550ULL } }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
template <> class PrecomputedGenerators<"ECCVM_OFFSET_GENERATOR", g1::affine_element, 1, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[1] = {
        { { 7374687731202222564ULL, 8543745450152580123ULL, 2921030955956618589ULL, 2599641324373959496ULL },
          { 6960415070023996614ULL, 14053522495179787214ULL, 14517046433555033617ULL, 2415631830684294405ULL } }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
template <> class PrecomputedGenerators<"test generators", g1::affine_element, 2, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static constexpr g1::affine_element generators[2] = {
        { { 5298051746523815354ULL, 11125407385827321085ULL, 1378860999543571258ULL, 3214580318552177664ULL },
          { 10989126080144231302ULL, 3931925773460296875ULL, 15711120850424438078ULL, 1554456504451117922ULL } },
        { { 12331362496270503882ULL, 1777010271948225039ULL, 3688980372647118828ULL, 2183746658631232216ULL },
          { 2066093441324826568ULL, 18321081055934204294ULL, 4310268877597366290ULL, 3214757532116262013ULL } }
    };
    static constexpr std::span<const g1::affine_element> get_generators() { return generators; }
};
}; // namespace bb::detail
