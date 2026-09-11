#include "poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/numeric/general/general.hpp"
#include <algorithm>
#include <gtest/gtest.h>
#include <tuple>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

TEST(Poseidon2, HashBasicTests)
{

    fr a = fr::random_element(&engine);
    fr b = fr::random_element(&engine);
    fr c = fr::random_element(&engine);
    fr d = fr::random_element(&engine);

    std::vector<fr> input1{ a, b, c, d };
    std::vector<fr> input2{ d, c, b, a };

    auto r0 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(input1);
    auto r1 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(input1);
    auto r2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(input2);

    EXPECT_EQ(r0, r1);
    EXPECT_NE(r0, r2);
}

// Independent test vectors are validated via differential testing in stdlib/hash/poseidon2/poseidon2.test.cpp
TEST(Poseidon2, HashConsistencyCheck)
{
    fr a(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fr b(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fr c(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));
    fr d(std::string("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789"));

    std::vector<fr> input{ a, b, c, d };
    auto result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(input);

    fr expected(std::string("0x2f43a0f83b51a6f5fc839dea0ecec74947637802a579fa9841930a25a0bcec11"));

    EXPECT_EQ(result, expected);
}

TEST(Poseidon2, AbsorbBlocksMatchSequentialPermutations)
{
    using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
    using Permutation = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;
    const std::array<Poseidon2::Sponge::Block, 2> blocks = { { { fr(1), fr(2), fr(3) }, { fr(4), fr(5), fr(6) } } };
    Poseidon2::Sponge::State state = { fr(11), fr(12), fr(13), fr(14) };
    auto expected_state = state;

    for (const auto& block : blocks) {
        for (size_t i = 0; i < block.size(); ++i) {
            expected_state[i] += block[i];
        }
        expected_state = Permutation::permutation(expected_state);
    }
    EXPECT_EQ(Poseidon2::Sponge::absorb_blocks(state, blocks), expected_state);
}

TEST(Poseidon2, AbsorbBlocksMatchHashWithLengthIVAndPadding)
{
    using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
    constexpr size_t rate = std::tuple_size_v<Poseidon2::Sponge::Block>;
    for (size_t length = 0; length <= 10; ++length) {
        SCOPED_TRACE(length);
        std::vector<fr> fields(length);
        for (size_t i = 0; i < length; ++i) {
            fields[i] = fr(i + 1);
        }
        const auto expected = Poseidon2::hash(fields);
        fields.resize(std::max(rate, numeric::ceil_div(length, rate) * rate));

        std::vector<Poseidon2::Sponge::Block> blocks(fields.size() / rate);
        for (size_t i = 0; i < blocks.size(); ++i) {
            std::copy_n(fields.begin() + static_cast<std::ptrdiff_t>(i * rate), rate, blocks[i].begin());
        }
        const Poseidon2::Sponge::State initial_state = { fr(0), fr(0), fr(0), fr(uint256_t(length) << 64) };
        EXPECT_EQ(Poseidon2::Sponge::absorb_blocks(initial_state, blocks)[0], expected);
    }
}

TEST(Poseidon2, AbsorbBlocksPreserveStateAcrossChunkBoundaries)
{
    using Sponge = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::Sponge;
    const Sponge::State initial_state = { fr(11), fr(12), fr(13), fr(14) };
    const std::array<Sponge::Block, 2> blocks = { { { fr(1), fr(2), fr(3) }, { fr(4), fr(5), fr(6) } } };
    EXPECT_EQ(Sponge::absorb_blocks(initial_state, {}), initial_state);

    const auto expected = Sponge::absorb_blocks(initial_state, blocks);
    const std::span<const Sponge::Block> input(blocks);
    for (size_t split = 0; split <= blocks.size(); ++split) {
        SCOPED_TRACE(split);
        const auto first = Sponge::absorb_blocks(initial_state, input.first(split));
        EXPECT_EQ(Sponge::absorb_blocks(first, input.subspan(split)), expected);
    }
}
