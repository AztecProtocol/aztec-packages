#include "barretenberg/ecc/groups/affine_add_packed.hpp"

#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>
#include <span>
#include <vector>

namespace {

using bb::fq;
using Element = bb::g1::element;
using Affine = bb::g1::affine_element;
using Params = bb::Bn254FqParams;
using VecFq = bb::VectorField<Params>;
using PushSpanFq = bb::VectorFieldPushSpan<Params>;
using AffinePushSpan = bb::VectorAffineElementPushSpan<Params>;

auto& engine = bb::numeric::get_debug_randomness();

// Packed batch_affine_add must reproduce the curve's own affine addition for every pair. Field
// arithmetic is exact, so a correct add yields identical coordinates. Checked across boundary sizes.
TEST(BatchAffineAddPacked, MatchesCurveAffineAdd)
{
    constexpr size_t W = PushSpanFq::W;
    for (size_t n : { size_t{ 1 }, size_t{ 4 }, size_t{ 5 }, size_t{ 6 }, size_t{ 9 }, size_t{ 25 }, size_t{ 31 } }) {
        std::vector<Affine> L(n);
        std::vector<Affine> R(n);
        std::vector<Affine> ref(n);
        for (size_t i = 0; i < n; ++i) {
            Affine a = Element::random_element(&engine);
            Affine b = Element::random_element(&engine);
            while (a.x == b.x) { // the unsafe add needs distinct x (dx != 0); independent points satisfy this
                b = Affine(Element::random_element(&engine));
            }
            L[i] = a;
            R[i] = b;
            ref[i] = a + b; // ground-truth affine add
        }

        std::vector<VecFq> lx((n / W) + 1), ly((n / W) + 1), rx((n / W) + 1), ry((n / W) + 1);
        std::vector<VecFq> ox((n / W) + 1), oy((n / W) + 1);
        std::vector<VecFq> dx((n / W) + 1), dy((n / W) + 1), xsum((n / W) + 1), inv((n / W) + 1);
        AffinePushSpan lhs{ std::span<VecFq>(lx), std::span<VecFq>(ly) };
        AffinePushSpan rhs{ std::span<VecFq>(rx), std::span<VecFq>(ry) };
        AffinePushSpan out{ std::span<VecFq>(ox), std::span<VecFq>(oy) };
        for (size_t i = 0; i < n; ++i) {
            lhs.push_point(L[i].x, L[i].y);
            rhs.push_point(R[i].x, R[i].y);
        }
        bb::group_elements::BatchAffineAddScratch<Params> s{ PushSpanFq{ std::span<VecFq>(dx) },
                                                             PushSpanFq{ std::span<VecFq>(dy) },
                                                             PushSpanFq{ std::span<VecFq>(xsum) },
                                                             PushSpanFq{ std::span<VecFq>(inv) } };

        bb::group_elements::batch_affine_add(lhs, rhs, out, s);

        ASSERT_EQ(out.size(), n);
        for (size_t i = 0; i < n; ++i) {
            const bool full = i < out.num_full_vectors() * W;
            const fq gx = full ? out.x[i / W].to_array()[i % W] : out.x.tail_data()[i % W];
            const fq gy = full ? out.y[i / W].to_array()[i % W] : out.y.tail_data()[i % W];
            EXPECT_EQ(gx, ref[i].x) << "n=" << n << " i=" << i;
            EXPECT_EQ(gy, ref[i].y) << "n=" << n << " i=" << i;
        }
    }
}

// The fast-Pippenger drain runs batch_affine_add in place: out shares lhs's backing, so each result
// overwrites its own input. finish computes x3/y3 before writing either, so this must still match the
// curve's affine add. Constructs out over lhs's coordinate spans and checks bit-exactness.
TEST(BatchAffineAddPacked, OutAliasesLhs)
{
    constexpr size_t W = PushSpanFq::W;
    for (size_t n : { size_t{ 1 }, size_t{ 5 }, size_t{ 6 }, size_t{ 25 }, size_t{ 31 } }) {
        std::vector<Affine> L(n);
        std::vector<Affine> R(n);
        std::vector<Affine> ref(n);
        for (size_t i = 0; i < n; ++i) {
            Affine a = Element::random_element(&engine);
            Affine b = Element::random_element(&engine);
            while (a.x == b.x) {
                b = Affine(Element::random_element(&engine));
            }
            L[i] = a;
            R[i] = b;
            ref[i] = a + b;
        }

        std::vector<VecFq> lx((n / W) + 1), ly((n / W) + 1), rx((n / W) + 1), ry((n / W) + 1);
        std::vector<VecFq> dx((n / W) + 1), dy((n / W) + 1), xsum((n / W) + 1), inv((n / W) + 1);
        AffinePushSpan lhs{ std::span<VecFq>(lx), std::span<VecFq>(ly) };
        AffinePushSpan rhs{ std::span<VecFq>(rx), std::span<VecFq>(ry) };
        AffinePushSpan out{ std::span<VecFq>(lx), std::span<VecFq>(ly) }; // shares lhs's backing
        for (size_t i = 0; i < n; ++i) {
            lhs.push_point(L[i].x, L[i].y);
            rhs.push_point(R[i].x, R[i].y);
        }
        bb::group_elements::BatchAffineAddScratch<Params> s{ PushSpanFq{ std::span<VecFq>(dx) },
                                                             PushSpanFq{ std::span<VecFq>(dy) },
                                                             PushSpanFq{ std::span<VecFq>(xsum) },
                                                             PushSpanFq{ std::span<VecFq>(inv) } };

        bb::group_elements::batch_affine_add(lhs, rhs, out, s);

        ASSERT_EQ(out.size(), n);
        for (size_t i = 0; i < n; ++i) {
            const bool full = i < out.num_full_vectors() * W;
            const fq gx = full ? out.x[i / W].to_array()[i % W] : out.x.tail_data()[i % W];
            const fq gy = full ? out.y[i / W].to_array()[i % W] : out.y.tail_data()[i % W];
            EXPECT_EQ(gx, ref[i].x) << "n=" << n << " i=" << i;
            EXPECT_EQ(gy, ref[i].y) << "n=" << n << " i=" << i;
        }
    }
}

// Packed batch_affine_double must reproduce the curve's own affine doubling for every point. Checked
// across boundary sizes.
TEST(BatchAffineAddPacked, MatchesCurveDouble)
{
    constexpr size_t W = PushSpanFq::W;
    for (size_t n : { size_t{ 1 }, size_t{ 4 }, size_t{ 5 }, size_t{ 6 }, size_t{ 9 }, size_t{ 25 }, size_t{ 31 } }) {
        std::vector<Affine> P(n);
        std::vector<Affine> ref(n);
        for (size_t i = 0; i < n; ++i) {
            Affine a = Element::random_element(&engine);
            P[i] = a;
            Element d(a);
            d.self_dbl();
            ref[i] = Affine(d); // ground-truth doubling
        }

        std::vector<VecFq> px((n / W) + 1), py((n / W) + 1);
        std::vector<VecFq> ox((n / W) + 1), oy((n / W) + 1);
        std::vector<VecFq> den((n / W) + 1), num((n / W) + 1), inv((n / W) + 1);
        AffinePushSpan in{ std::span<VecFq>(px), std::span<VecFq>(py) };
        AffinePushSpan out{ std::span<VecFq>(ox), std::span<VecFq>(oy) };
        for (size_t i = 0; i < n; ++i) {
            in.push_point(P[i].x, P[i].y);
        }
        bb::group_elements::BatchAffineDoubleScratch<Params> s{ PushSpanFq{ std::span<VecFq>(den) },
                                                                PushSpanFq{ std::span<VecFq>(num) },
                                                                PushSpanFq{ std::span<VecFq>(inv) } };

        bb::group_elements::batch_affine_double(in, out, s);

        ASSERT_EQ(out.size(), n);
        for (size_t i = 0; i < n; ++i) {
            const bool full = i < out.num_full_vectors() * W;
            const fq gx = full ? out.x[i / W].to_array()[i % W] : out.x.tail_data()[i % W];
            const fq gy = full ? out.y[i / W].to_array()[i % W] : out.y.tail_data()[i % W];
            EXPECT_EQ(gx, ref[i].x) << "n=" << n << " i=" << i;
            EXPECT_EQ(gy, ref[i].y) << "n=" << n << " i=" << i;
        }
    }
}

} // namespace
