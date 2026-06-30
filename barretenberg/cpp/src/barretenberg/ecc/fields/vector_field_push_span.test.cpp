#include "barretenberg/ecc/fields/vector_field_push_span.hpp"

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace {

using bb::fq;
using bb::fr;
using PushSpanFq = bb::VectorFieldPushSpan<bb::Bn254FqParams>;
using PushSpanFr = bb::VectorFieldPushSpan<bb::Bn254FrParams>;
using VecFq = bb::VectorField<bb::Bn254FqParams>;

auto& engine = bb::numeric::get_debug_randomness();

// Boundary sizes around the lane width (SIZE=5): empty, partial, exact, and ragged multiples.
constexpr std::array<size_t, 9> kSizes{ 0, 1, 4, 5, 6, 9, 10, 25, 31 };

// push N field elements, then read every element back via the full-group operator[] (to_array) and
// the trailing tail buffer; assert the round-trip is the identity.
TEST(VectorFieldPushSpan, PushReadRoundTrip)
{
    constexpr size_t W = PushSpanFq::W;
    for (size_t n : kSizes) {
        std::vector<fq> src(n);
        for (auto& v : src) {
            v = fq::random_element(&engine);
        }
        std::vector<VecFq> backing((n / W) + 1);
        PushSpanFq span{ std::span<VecFq>(backing) };
        for (const auto& v : src) {
            span.push(v);
        }

        ASSERT_EQ(span.size(), n);
        ASSERT_EQ(span.num_full_vectors(), n / W);
        ASSERT_EQ(span.tail(), n % W);

        for (size_t i = 0; i < n; ++i) {
            fq got;
            if (i < span.num_full_vectors() * W) {
                got = span[i / W].to_array()[i % W];
            } else {
                got = span.tail_data()[i % W];
            }
            EXPECT_EQ(got, src[i]) << "n=" << n << " i=" << i;
        }
    }
}

// reset() rewinds the cursor so the same backing storage is refilled cleanly across drains.
TEST(VectorFieldPushSpan, ResetRefill)
{
    constexpr size_t W = PushSpanFq::W;
    std::vector<VecFq> backing(4);
    PushSpanFq span{ std::span<VecFq>(backing) };
    for (size_t i = 0; i < 7; ++i) {
        span.push(fq(i + 1));
    }
    span.reset();
    EXPECT_EQ(span.size(), 0u);
    EXPECT_EQ(span.tail(), 0u);

    std::vector<fq> src(2 * W);
    for (auto& v : src) {
        v = fq::random_element(&engine);
    }
    for (const auto& v : src) {
        span.push(v);
    }
    for (size_t i = 0; i < src.size(); ++i) {
        EXPECT_EQ(span[i / W].to_array()[i % W], src[i]);
    }
}

// Union-style check: the SAME elementwise expression run scalar vs over VectorFieldPushSpan groups
// (VectorField arithmetic) must agree bit-for-bit — the property that lets one kernel serve both
// canonical and packed backings.
TEST(VectorFieldPushSpan, GroupwiseMatchesScalar)
{
    constexpr size_t W = PushSpanFq::W;
    const size_t n = 4 * W; // exact multiple: all work in the full-group path
    std::vector<fq> a(n), b(n), c(n);
    for (size_t i = 0; i < n; ++i) {
        a[i] = fq::random_element(&engine);
        b[i] = fq::random_element(&engine);
        c[i] = a[i] * b[i] + a[i]; // reference
    }

    std::vector<VecFq> ga(n / W), gb(n / W), gc(n / W);
    PushSpanFq sa{ std::span<VecFq>(ga) };
    PushSpanFq sb{ std::span<VecFq>(gb) };
    PushSpanFq sc{ std::span<VecFq>(gc) };
    for (size_t i = 0; i < n; ++i) {
        sa.push(a[i]);
        sb.push(b[i]);
        sc.push(fq::zero());
    }
    for (size_t g = 0; g < sa.num_full_vectors(); ++g) {
        sc[g] = sa[g] * sb[g] + sa[g];
    }
    for (size_t i = 0; i < n; ++i) {
        EXPECT_EQ(sc[i / W].to_array()[i % W], c[i]) << "i=" << i;
    }
}

// zip_for_each applies a generic field-arithmetic kernel across spans in lockstep (bulk + tail),
// matching a scalar reference. The writer's kernel never mentions lanes, indices, or VectorField.
TEST(VectorFieldPushSpan, ZipForEach)
{
    constexpr size_t W = PushSpanFq::W;
    const size_t n = 2 * W + 3; // exercises full groups + a ragged tail
    std::vector<fq> a(n);
    std::vector<fq> b(n);
    std::vector<fq> ref(n);
    for (size_t i = 0; i < n; ++i) {
        a[i] = fq::random_element(&engine);
        b[i] = fq::random_element(&engine);
        ref[i] = a[i] * b[i] + a[i];
    }
    std::vector<VecFq> back_a((n / W) + 1);
    std::vector<VecFq> back_b((n / W) + 1);
    std::vector<VecFq> back_o((n / W) + 1);
    PushSpanFq sa{ std::span<VecFq>(back_a) };
    PushSpanFq sb{ std::span<VecFq>(back_b) };
    PushSpanFq so{ std::span<VecFq>(back_o) };
    for (size_t i = 0; i < n; ++i) {
        sa.push(a[i]);
        sb.push(b[i]);
    }

    bb::zip_for_each(sa, sb, so, [](const auto& x, const auto& y, auto& o) { o = x * y + x; });
    so.adopt_cursor(sa);

    ASSERT_EQ(so.size(), n);
    for (size_t i = 0; i < n; ++i) {
        const fq got = (i < so.num_full_vectors() * W) ? so[i / W].to_array()[i % W] : so.tail_data()[i % W];
        EXPECT_EQ(got, ref[i]) << "i=" << i;
    }
}

// VectorAffineElementPushSpan feeds two coordinate cursors in lockstep.
TEST(VectorAffineElementPushSpan, PushPointRoundTrip)
{
    using Packed = bb::VectorAffineElementPushSpan<bb::Bn254FqParams>;
    constexpr size_t W = PushSpanFq::W;
    const size_t n = 2 * W + 3;
    std::vector<fq> xs(n), ys(n);
    std::vector<VecFq> gx((n / W) + 1), gy((n / W) + 1);
    Packed packed{ std::span<VecFq>(gx), std::span<VecFq>(gy) };
    for (size_t i = 0; i < n; ++i) {
        xs[i] = fq::random_element(&engine);
        ys[i] = fq::random_element(&engine);
        packed.push_point(xs[i], ys[i]);
    }
    ASSERT_EQ(packed.size(), n);
    for (size_t i = 0; i < n; ++i) {
        fq gx_i = (i < packed.num_full_vectors() * W) ? packed.x[i / W].to_array()[i % W] : packed.x.tail_data()[i % W];
        fq gy_i = (i < packed.num_full_vectors() * W) ? packed.y[i / W].to_array()[i % W] : packed.y.tail_data()[i % W];
        EXPECT_EQ(gx_i, xs[i]);
        EXPECT_EQ(gy_i, ys[i]);
    }
}

// Same suite over the scalar field, exercising the Bn254FrParams VectorField specialization.
TEST(VectorFieldPushSpan, RoundTripFr)
{
    constexpr size_t W = PushSpanFr::W;
    const size_t n = 3 * W + 2;
    std::vector<fr> src(n);
    std::vector<bb::VectorField<bb::Bn254FrParams>> backing((n / W) + 1);
    PushSpanFr span{ std::span<bb::VectorField<bb::Bn254FrParams>>(backing) };
    for (auto& v : src) {
        v = fr::random_element(&engine);
        span.push(v);
    }
    for (size_t i = 0; i < n; ++i) {
        fr got = (i < span.num_full_vectors() * W) ? span[i / W].to_array()[i % W] : span.tail_data()[i % W];
        EXPECT_EQ(got, src[i]);
    }
}

} // namespace
