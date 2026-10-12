#include "barretenberg/ecc/fields/ifma_field.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>

#include <array>
#include <vector>

#ifdef BB_FIELD_IFMA

using namespace bb;

namespace {

auto& engine = numeric::get_debug_randomness();

// A random element, sometimes an edge value (0, 1, p - 1) and sometimes in coarse form (value + p < 2p).
fr edge_or_random(size_t i)
{
    switch (i % 11) {
    case 0:
        return fr::zero();
    case 1:
        return fr::one();
    case 2:
        return -fr::one();
    case 3: {
        // p - 1 + p: the largest coarse representative of -1 below 2p.
        fr r = -fr::one();
        const uint256_t v = uint256_t{ r.data[0], r.data[1], r.data[2], r.data[3] } + fr::modulus;
        r.data[0] = v.data[0];
        r.data[1] = v.data[1];
        r.data[2] = v.data[2];
        r.data[3] = v.data[3];
        return r;
    }
    default:
        break;
    }
    // random_element is coarse ([0, 2p)); reduce it so that adding p stays below 2p.
    fr r = fr::random_element(&engine).reduce_once();
    if (i % 3 == 0) {
        const uint256_t v = uint256_t{ r.data[0], r.data[1], r.data[2], r.data[3] } + fr::modulus;
        r.data[0] = v.data[0];
        r.data[1] = v.data[1];
        r.data[2] = v.data[2];
        r.data[3] = v.data[3];
    }
    return r;
}

// Same field value, and a valid bb representative (below 2p).
void expect_reduced_equal(const fr& expected, const fr& actual)
{
    EXPECT_EQ(expected, actual);
    EXPECT_LT((uint256_t{ actual.data[0], actual.data[1], actual.data[2], actual.data[3] }), fr::modulus + fr::modulus);
}

class FieldIfma : public ::testing::Test {
  protected:
    void SetUp() override
    {
        if (!field_ifma::available()) {
            GTEST_SKIP() << "no AVX-512 IFMA on this CPU (or BB_FIELD_NO_IFMA set)";
        }
    }
};

} // namespace

TEST_F(FieldIfma, FoldStride2MatchesScalar)
{
    constexpr size_t N = 8 * 64;
    std::vector<fr> src(2 * N);
    for (size_t i = 0; i < src.size(); ++i) {
        src[i] = edge_or_random(i);
    }
    // A block of bit-identical pairs and a block with a single differing pair.
    for (size_t i = 64; i < 80; i += 2) {
        src[i + 1] = src[i];
    }
    for (size_t i = 96; i < 112; i += 2) {
        src[i + 1] = src[i];
    }
    src[105] = src[105] + fr::one();
    for (const fr& u : { fr::zero(), fr::one(), -fr::one(), fr::random_element(&engine) }) {
        std::vector<fr> dst(N);
        field_ifma::fold_stride2<fr::Params>(&src[0].data[0], &dst[0].data[0], N, &u.data[0]);
        for (size_t k = 0; k < N; ++k) {
            expect_reduced_equal(src[2 * k] + u * (src[2 * k + 1] - src[2 * k]), dst[k]);
        }
        // In place.
        std::vector<fr> inplace = src;
        field_ifma::fold_stride2<fr::Params>(&inplace[0].data[0], &inplace[0].data[0], N, &u.data[0]);
        for (size_t k = 0; k < N; ++k) {
            EXPECT_EQ(dst[k], inplace[k]);
        }
    }
}

TEST_F(FieldIfma, EvaluateMatchesHorner)
{
    for (const size_t n : { size_t{ 16 }, size_t{ 160 }, size_t{ 1024 } }) {
        std::vector<fr> coeffs(n);
        for (size_t i = 0; i < n; ++i) {
            coeffs[i] = edge_or_random(i);
        }
        for (const fr& z : { fr::zero(), fr::one(), -fr::one(), fr::random_element(&engine) }) {
            fr expected = fr::zero();
            for (size_t i = n; i > 0; --i) {
                expected = (expected * z) + coeffs[i - 1];
            }
            std::array<fr, 8> z_pows;
            z_pows[0] = fr::one();
            for (size_t j = 1; j < 8; ++j) {
                z_pows[j] = z_pows[j - 1] * z;
            }
            const fr z8 = z_pows[7] * z;
            const fr z16 = z8.sqr();
            std::array<fr, 8> terms;
            field_ifma::evaluate<fr::Params>(
                &coeffs[0].data[0], n, &z_pows[0].data[0], &z8.data[0], &z16.data[0], &terms[0].data[0]);
            fr sum = fr::zero();
            for (const fr& t : terms) {
                EXPECT_LT((uint256_t{ t.data[0], t.data[1], t.data[2], t.data[3] }), fr::modulus);
                sum += t;
            }
            EXPECT_EQ(sum, expected);
        }
    }
}

TEST_F(FieldIfma, AddScaledBatchTileMatchesScalar)
{
    constexpr size_t TILE = field_ifma::MAX_TILE;
    constexpr size_t NUM_SOURCES = 23;
    std::vector<std::vector<fr>> sources(NUM_SOURCES, std::vector<fr>(TILE));
    std::vector<fr> scalars(NUM_SOURCES);
    std::vector<size_t> begins(NUM_SOURCES);
    std::vector<size_t> ends(NUM_SOURCES);
    for (size_t k = 0; k < NUM_SOURCES; ++k) {
        for (size_t i = 0; i < TILE; ++i) {
            // Every fourth source is zero over most of the tile (selector-like), exercising the zero-block skip.
            sources[k][i] = (k % 4 == 0 && i < 200) ? fr::zero() : edge_or_random(i + k);
        }
        scalars[k] = (k % 5 == 0) ? fr::one() : edge_or_random(k);
        // Ranges with unaligned and empty-tail ends, including the full tile.
        begins[k] = (k == 0) ? 0 : (k * 13) % 61;
        ends[k] = (k == 1) ? TILE : TILE - ((k * 7) % 53);
    }
    std::vector<fr> dst(TILE);
    for (size_t i = 0; i < TILE; ++i) {
        dst[i] = edge_or_random(i + 3);
    }
    std::vector<fr> expected = dst;
    std::vector<field_ifma::ScaledSource> scaled;
    for (size_t k = 0; k < NUM_SOURCES; ++k) {
        for (size_t i = begins[k]; i < ends[k]; ++i) {
            expected[i] += scalars[k] * sources[k][i];
        }
        scaled.push_back({ .data = &sources[k][begins[k]].data[0],
                           .begin = begins[k],
                           .end = ends[k],
                           .scalar = &scalars[k].data[0],
                           .unit = scalars[k] == fr::one() });
    }
    field_ifma::add_scaled_batch_tile<fr::Params>(&dst[0].data[0], TILE, scaled.data(), scaled.size());
    for (size_t i = 0; i < TILE; ++i) {
        expect_reduced_equal(expected[i], dst[i]);
    }
}

#endif // BB_FIELD_IFMA
