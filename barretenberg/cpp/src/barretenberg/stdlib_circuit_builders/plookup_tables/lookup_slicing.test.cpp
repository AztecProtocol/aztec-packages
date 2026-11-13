#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "plookup_tables.hpp"
#include <gtest/gtest.h>

namespace bb::plookup {
namespace {

using numeric::uint256_t;

// Each digit as a remainder followed by a separate quotient division.
std::vector<uint64_t> reference_slices(uint256_t target, const std::vector<uint64_t>& bases)
{
    std::vector<uint64_t> slices;
    for (const uint64_t base : bases) {
        slices.push_back((target % base).data[0]);
        target /= base;
    }
    return slices;
}

// The largest input the bases represent (their product minus one), saturated at 2^256 - 1.
uint256_t max_sliceable_input(const std::vector<uint64_t>& bases)
{
    const uint256_t all_ones = ~uint256_t(0);
    uint256_t product = 1;
    for (const uint64_t base : bases) {
        if (product > all_ones / base) {
            return all_ones;
        }
        product *= base;
    }
    return product - 1;
}

void check_slicing(const std::vector<uint64_t>& bases)
{
    auto& engine = numeric::get_debug_randomness();
    const uint256_t all_ones = ~uint256_t(0);
    const uint256_t max_input = max_sliceable_input(bases);

    std::vector<uint256_t> inputs{ 0, 1, max_input, max_input >> 1 };
    for (size_t i = 0; i < 64; ++i) {
        // Vary the bit length so that one-limb and multi-limb dividends both occur.
        uint256_t input = engine.get_random_uint256() >> (engine.get_random_uint64() & 255);
        if (max_input != all_ones) {
            input = input % (max_input + 1);
        }
        inputs.push_back(input);
    }
    for (const auto& input : inputs) {
        EXPECT_EQ(numeric::slice_input_using_variable_bases(input, bases), reference_slices(input, bases));
    }
    if (max_input != all_ones) {
        EXPECT_THROW(numeric::slice_input_using_variable_bases(max_input + 1, bases), std::runtime_error);
    }
}

} // namespace

TEST(LookupSlicing, MatchesReferenceForEveryMultiTable)
{
    for (size_t id = 0; id < static_cast<size_t>(MultiTableId::NUM_MULTI_TABLES); ++id) {
        const auto& bases = get_multitable(static_cast<MultiTableId>(id)).slice_sizes;
        if (bases.empty()) {
            continue;
        }
        SCOPED_TRACE("MultiTable id=" + std::to_string(id));
        check_slicing(bases);
    }
}

TEST(LookupSlicing, MatchesReferenceForEdgeBases)
{
    constexpr uint64_t max_u64 = ~uint64_t(0);
    constexpr uint64_t top_bit = uint64_t(1) << 63;
    const std::vector<std::vector<uint64_t>> base_lists{
        { 1, 3, 1 },
        { 784, 784, 784, 784 },
        { top_bit, top_bit, top_bit, top_bit, top_bit },
        { max_u64, max_u64, max_u64, max_u64, 5 },
        { top_bit + 1, 3, 7, top_bit + 1 },
    };
    for (const auto& bases : base_lists) {
        check_slicing(bases);
    }
}

} // namespace bb::plookup
