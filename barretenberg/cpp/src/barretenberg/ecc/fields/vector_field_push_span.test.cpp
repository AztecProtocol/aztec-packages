#include "barretenberg/ecc/fields/vector_field_push_span.hpp"

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>
#include <type_traits>
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

// A span always aliases itself. The tail-only case is the one shares_backing() alone
// misses (the tail lives in `partial`, not the backing), caught by the `this == &other` clause.
TEST(VectorFieldPushSpan, AliasesSelfAtEveryFillLevel)
{
    constexpr size_t W = PushSpanFq::W;
    for (size_t n : { size_t{ 0 }, W - 1, W, W + 1 }) { // empty, tail-only, exactly full, full+tail
        std::vector<VecFq> backing((n / W) + 1);
        PushSpanFq span{ std::span<VecFq>(backing) };
        for (size_t i = 0; i < n; ++i) {
            span.push(fq::random_element(&engine));
        }
        EXPECT_TRUE(span.aliases(span)) << "n=" << n;
    }
}

// Two distinct spans over one backing alias only once a full VectorField occupies it;
// while empty or tail-only, each span's elements live in its own `partial`.
TEST(VectorFieldPushSpan, AliasesDistinctSpansSharingBacking)
{
    constexpr size_t W = PushSpanFq::W;
    std::vector<VecFq> backing(4);
    PushSpanFq a{ std::span<VecFq>(backing) };
    PushSpanFq b{ std::span<VecFq>(backing) };

    EXPECT_TRUE(a.shares_backing(b));
    EXPECT_FALSE(a.aliases(b));

    for (size_t i = 0; i < W - 1; ++i) {
        a.push(fq::random_element(&engine));
    }
    EXPECT_FALSE(a.aliases(b)); // tail-only

    a.push(fq::random_element(&engine)); // completes the first VectorField
    EXPECT_TRUE(a.aliases(b));
}

TEST(VectorFieldPushSpan, SharesBackingDisjointVsSameStart)
{
    constexpr size_t W = PushSpanFq::W;
    std::vector<VecFq> backing_a(4), backing_b(4);
    PushSpanFq a{ std::span<VecFq>(backing_a) };
    PushSpanFq b{ std::span<VecFq>(backing_b) };
    PushSpanFq a_view{ std::span<VecFq>(backing_a) };

    EXPECT_FALSE(a.shares_backing(b));
    EXPECT_TRUE(a.shares_backing(a_view));

    for (size_t i = 0; i < W; ++i) {
        a.push(fq::random_element(&engine));
    }
    EXPECT_FALSE(a.aliases(b));
}

// F1: aliases()/shares_backing() compare only the start pointer, so spans over the same
// buffer at different offsets are reported non-aliasing even when their ranges overlap.
// TODO(pippenger-F1): switch to a range-overlap check if an offset-overlapping caller appears.
TEST(VectorFieldPushSpan, AliasesMissesOffsetOverlap)
{
    constexpr size_t W = PushSpanFq::W;
    std::vector<VecFq> backing(4);
    PushSpanFq a{ std::span<VecFq>(backing) };
    PushSpanFq b{ std::span<VecFq>(backing).subspan(1) };
    for (size_t i = 0; i < 4 * W; ++i) {
        a.push(fq::random_element(&engine));
    }
    EXPECT_FALSE(a.shares_backing(b));
    EXPECT_FALSE(a.aliases(b));
}

// zip_for_each must auto-adopt the output cursor; this test omits the manual adopt_cursor
// that the older ZipForEach test uses (which would mask a regression in the auto-adopt).
TEST(VectorFieldPushSpan, ZipForEachAutoAdoptsOutputCursor)
{
    constexpr size_t W = PushSpanFq::W;
    const size_t n = 2 * W + 3;
    std::vector<fq> a(n), b(n), ref(n);
    for (size_t i = 0; i < n; ++i) {
        a[i] = fq::random_element(&engine);
        b[i] = fq::random_element(&engine);
        ref[i] = a[i] * b[i] + a[i];
    }
    std::vector<VecFq> back_a((n / W) + 1), back_b((n / W) + 1), back_o((n / W) + 1);
    PushSpanFq sa{ std::span<VecFq>(back_a) };
    PushSpanFq sb{ std::span<VecFq>(back_b) };
    PushSpanFq so{ std::span<VecFq>(back_o) };
    for (size_t i = 0; i < n; ++i) {
        sa.push(a[i]);
        sb.push(b[i]);
    }

    bb::zip_for_each(sa, sb, so, [](const auto& x, const auto& y, auto& o) { o = x * y + x; });

    EXPECT_EQ(so.size(), n);
    EXPECT_EQ(so.num_full_vectors(), n / W);
    EXPECT_EQ(so.tail(), n % W);
    for (size_t i = 0; i < n; ++i) {
        const fq got = (i < so.num_full_vectors() * W) ? so[i / W].to_array()[i % W] : so.tail_data()[i % W];
        EXPECT_EQ(got, ref[i]) << "i=" << i;
    }
}

// Forward exclusive-prefix-product. Lane L of group g holds src[g*W + L], so for n = 2*W
// each lane is the stream {src[L], src[W+L]}: out[0] = 1, out[1] = src[L], acc = src[L]*src[W+L].
TEST(VectorFieldPushSpan, MapAccumulateForwardExclusivePrefixProduct)
{
    constexpr size_t W = PushSpanFq::W;
    const size_t n = 2 * W;
    std::vector<fq> src(n);
    std::vector<VecFq> in_b(n / W), out_b(n / W);
    PushSpanFq in{ std::span<VecFq>(in_b) };
    PushSpanFq out{ std::span<VecFq>(out_b) };
    for (size_t i = 0; i < n; ++i) {
        src[i] = fq::random_element(&engine);
        in.push(src[i]);
    }

    auto [bulk_acc, tail_acc] = bb::map_accumulate<bb::Direction::Forward>(
        in, out, VecFq::broadcast(fq::one()), fq::one(), [](auto& acc, const auto& in_e, auto& out_e) {
            out_e = acc;
            acc = acc * in_e;
        });

    ASSERT_EQ(out.size(), n);
    ASSERT_EQ(out.num_full_vectors(), 2u);
    for (size_t L = 0; L < W; ++L) {
        EXPECT_EQ(out[0].to_array()[L], fq::one()) << "L=" << L;
        EXPECT_EQ(out[1].to_array()[L], src[L]) << "L=" << L;
        EXPECT_EQ(bulk_acc.to_array()[L], src[L] * src[W + L]) << "L=" << L;
    }
    EXPECT_EQ(tail_acc, fq::one());
}

// Reverse mirrors the forward output: out[1] = 1, out[0] = src[W+L], acc = src[W+L]*src[L].
TEST(VectorFieldPushSpan, MapAccumulateReverseExclusivePrefixProduct)
{
    constexpr size_t W = PushSpanFq::W;
    const size_t n = 2 * W;
    std::vector<fq> src(n);
    std::vector<VecFq> in_b(n / W), out_b(n / W);
    PushSpanFq in{ std::span<VecFq>(in_b) };
    PushSpanFq out{ std::span<VecFq>(out_b) };
    for (size_t i = 0; i < n; ++i) {
        src[i] = fq::random_element(&engine);
        in.push(src[i]);
    }

    auto [bulk_acc, tail_acc] = bb::map_accumulate<bb::Direction::Backward>(
        in, out, VecFq::broadcast(fq::one()), fq::one(), [](auto& acc, const auto& in_e, auto& out_e) {
            out_e = acc;
            acc = acc * in_e;
        });

    ASSERT_EQ(out.size(), n);
    for (size_t L = 0; L < W; ++L) {
        EXPECT_EQ(out[1].to_array()[L], fq::one()) << "L=" << L;
        EXPECT_EQ(out[0].to_array()[L], src[W + L]) << "L=" << L;
        EXPECT_EQ(bulk_acc.to_array()[L], src[W + L] * src[L]) << "L=" << L;
    }
    EXPECT_EQ(tail_acc, fq::one());
}

// The tail threads its own accumulator. With n = W + 2: out_tail = {1, src[W]} and
// tail_acc = src[W]*src[W+1], independent of the bulk group.
TEST(VectorFieldPushSpan, MapAccumulateThreadsTailAccumulator)
{
    constexpr size_t W = PushSpanFq::W;
    const size_t n = W + 2;
    std::vector<fq> src(n);
    std::vector<VecFq> in_b((n / W) + 1), out_b((n / W) + 1);
    PushSpanFq in{ std::span<VecFq>(in_b) };
    PushSpanFq out{ std::span<VecFq>(out_b) };
    for (size_t i = 0; i < n; ++i) {
        src[i] = fq::random_element(&engine);
        in.push(src[i]);
    }

    auto [bulk_acc, tail_acc] = bb::map_accumulate<bb::Direction::Forward>(
        in, out, VecFq::broadcast(fq::one()), fq::one(), [](auto& acc, const auto& in_e, auto& out_e) {
            out_e = acc;
            acc = acc * in_e;
        });

    ASSERT_EQ(out.size(), n);
    ASSERT_EQ(out.tail(), 2u);
    for (size_t L = 0; L < W; ++L) {
        EXPECT_EQ(out[0].to_array()[L], fq::one()) << "L=" << L;
        EXPECT_EQ(bulk_acc.to_array()[L], src[L]) << "L=" << L;
    }
    EXPECT_EQ(out.tail_data()[0], fq::one());
    EXPECT_EQ(out.tail_data()[1], src[W]);
    EXPECT_EQ(tail_acc, src[W] * src[W + 1]);
}

// Move-only: a copy would duplicate the fill cursor while sharing the backing.
TEST(VectorFieldPushSpan, IsMoveOnly)
{
    using AffineSpan = bb::VectorAffineElementPushSpan<bb::Bn254FqParams>;
    static_assert(!std::is_copy_constructible_v<PushSpanFq>, "push-span must be move-only");
    static_assert(!std::is_copy_assignable_v<PushSpanFq>, "push-span must be move-only");
    static_assert(std::is_move_constructible_v<PushSpanFq>, "push-span must be movable");
    static_assert(std::is_move_assignable_v<PushSpanFq>, "push-span must be movable");
    static_assert(!std::is_copy_constructible_v<AffineSpan>, "affine push-span must be move-only");
    static_assert(!std::is_copy_assignable_v<AffineSpan>, "affine push-span must be move-only");
    static_assert(std::is_move_constructible_v<AffineSpan>, "affine push-span must be movable");
    static_assert(std::is_move_assignable_v<AffineSpan>, "affine push-span must be movable");
    SUCCEED();
}

} // namespace
