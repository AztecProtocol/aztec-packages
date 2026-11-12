#include "sparse_form.hpp"
#include <gtest/gtest.h>
#include <random>
#include <vector>

using namespace bb;
using numeric::uint256_t;

namespace {

// Tests every one of the low 32 bit positions in turn.
template <uint64_t base> uint256_t reference_sparse_form(const uint64_t input)
{
    const auto base_powers = numeric::get_base_powers<base, 32>();
    uint256_t out = 0;
    for (size_t i = 0; i < 32; ++i) {
        if (((input >> i) & 1U) != 0) {
            out += base_powers[i];
        }
    }
    return out;
}

template <uint64_t base> void check_sparse_form()
{
    // A local generator: tests in this program rely on the state of the shared debug engine.
    std::mt19937_64 engine(base);
    // Bits above the low 32 must be ignored.
    std::vector<uint64_t> inputs{ 0, 1, 0xffffffffULL, ~uint64_t(0), uint64_t(1) << 32 };
    for (size_t i = 0; i < 32; ++i) {
        inputs.push_back(uint64_t(1) << i);
    }
    for (size_t i = 0; i < 64; ++i) {
        inputs.push_back(engine());
    }
    for (const uint64_t input : inputs) {
        EXPECT_EQ(numeric::map_into_sparse_form<base>(input), reference_sparse_form<base>(input));
    }
}

} // namespace

TEST(SparseForm, MapIntoSparseFormMatchesBitwiseReference)
{
    static_assert(numeric::map_into_sparse_form<16>(0b101) == uint256_t(16 * 16 + 1));
    check_sparse_form<3>();
    check_sparse_form<9>();
    check_sparse_form<11>();
    check_sparse_form<16>();
    check_sparse_form<28>();
}
