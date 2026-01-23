#include "barretenberg/vm2/common/to_radix.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <vector>

namespace bb::avm2 {
namespace {

TEST(ToRadixTest, CheckPlimbsPerRadixSize)
{
    std::vector<size_t> hardcoded_sizes;
    std::vector<size_t> computed_sizes;

    hardcoded_sizes.reserve(257);
    computed_sizes.reserve(257);

    for (size_t radix = 0; radix < 257; ++radix) {
        hardcoded_sizes.push_back(get_p_limbs_per_radix_size(radix));
        computed_sizes.push_back(get_p_limbs_per_radix()[radix].size());
    }

    EXPECT_THAT(hardcoded_sizes, ::testing::ElementsAreArray(computed_sizes));
}

} // namespace
} // namespace bb::avm2
