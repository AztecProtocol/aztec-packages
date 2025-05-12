#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "group.hpp"
#include "precomputed_generators.hpp"

namespace bb::detail {

template <> class PrecomputedGenerators<"pedersen_hash_length", curve::Grumpkin::AffineElement, 1, 0> {
  public:
    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    static inline const curve::Grumpkin::AffineElement generators[1] = {
        { { 17073107942961762201ULL, 2852173614226397194ULL, 13623573872280674322ULL, 749552761154020099ULL },
          { 5412407584077200717ULL, 8019793462306515478ULL, 16737294919534112339ULL, 1803602698978470415ULL } },
    };
};

}; // namespace bb::detail
   // NOLINTEND(cppcoreguidelines-avoid-c-arrays)
