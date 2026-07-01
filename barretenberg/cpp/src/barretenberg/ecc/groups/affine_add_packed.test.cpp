#include "barretenberg/ecc/groups/affine_add_packed.hpp"

#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <span>
#include <utility>
#include <vector>

namespace {

using bb::fq;
using Element = bb::g1::element;
using Affine = bb::g1::affine_element;
using Params = bb::Bn254FqParams;
using VecFq = bb::VectorField<Params>;
using PushSpanFq = bb::VectorFieldPushSpan<Params>;
using AffinePushSpan = bb::VectorAffineElementPushSpan<Params>;
using AffineCols = bb::AffineColumnSpan<fq>;

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

// The indexed packed add gathers operands out of a bucket array by pair-index and scatters the sums
// back, so it must reproduce the scalar batch_affine_add_indexed_impl (the in-use Stage 6b kernel)
// bit-for-bit on the same buckets and pairs. dst indices are distinct and disjoint from src (the
// reduction's invariant); sizes straddle the wrapper's internal chunk boundary (capacity ~65) to
// exercise single- and multi-chunk dispatch.
TEST(BatchAffineAddPacked, IndexedAddMatchesScalar)
{
    constexpr size_t W = PushSpanFq::W;
    constexpr size_t CAP_VFS = (64 / W) + 1; // chunk capacity = CAP_VFS * W ~ 65 elements
    for (size_t np : { size_t{ 1 },
                       size_t{ 4 },
                       size_t{ 5 },
                       size_t{ 6 },
                       size_t{ 31 },
                       size_t{ 65 },
                       size_t{ 130 },
                       size_t{ 300 } }) {
        std::vector<Affine> base(2 * np);
        std::vector<std::pair<uint32_t, uint32_t>> pairs(np);
        for (size_t k = 0; k < np; ++k) {
            Affine a = Element::random_element(&engine);
            Affine b = Element::random_element(&engine);
            while (a.x == b.x) { // distinct x: the unsafe add's precondition, and what try_filter_pair guarantees
                b = Affine(Element::random_element(&engine));
            }
            base[k] = a;      // dst slot
            base[np + k] = b; // src slot (disjoint from the dst range)
            pairs[k] = { static_cast<uint32_t>(k), static_cast<uint32_t>(np + k) };
        }

        std::vector<Affine> scalar_buckets = base;
        std::vector<fq> scalar_scratch(np);
        bb::group_elements::batch_affine_add_indexed_impl<Affine, fq>(
            scalar_buckets.data(), pairs.data(), np, scalar_scratch.data());

        // packed path runs over the column (SoA) view of the same points
        std::vector<fq> col_x(base.size());
        std::vector<fq> col_y(base.size());
        for (size_t i = 0; i < base.size(); ++i) {
            col_x[i] = base[i].x;
            col_y[i] = base[i].y;
        }
        AffineCols cols{ std::span<fq>(col_x), std::span<fq>(col_y) };
        std::vector<VecFq> lx(CAP_VFS), ly(CAP_VFS), rx(CAP_VFS), ry(CAP_VFS), ox(CAP_VFS), oy(CAP_VFS);
        std::vector<VecFq> dx(CAP_VFS), dy(CAP_VFS), xsum(CAP_VFS), inv(CAP_VFS);
        AffinePushSpan lhs{ std::span<VecFq>(lx), std::span<VecFq>(ly) };
        AffinePushSpan rhs{ std::span<VecFq>(rx), std::span<VecFq>(ry) };
        AffinePushSpan out{ std::span<VecFq>(ox), std::span<VecFq>(oy) };
        bb::group_elements::BatchAffineAddScratch<Params> s{ PushSpanFq{ std::span<VecFq>(dx) },
                                                             PushSpanFq{ std::span<VecFq>(dy) },
                                                             PushSpanFq{ std::span<VecFq>(xsum) },
                                                             PushSpanFq{ std::span<VecFq>(inv) } };

        bb::group_elements::batch_affine_add_indexed_packed(cols, pairs.data(), np, lhs, rhs, out, s);

        for (size_t k = 0; k < np; ++k) {
            EXPECT_EQ(col_x[k], scalar_buckets[k].x) << "np=" << np << " k=" << k;
            EXPECT_EQ(col_y[k], scalar_buckets[k].y) << "np=" << np << " k=" << k;
        }
    }
}

// The indexed packed double gathers each point by index and scatters its double back, so it must
// reproduce the scalar batch_affine_double_indexed_impl bit-for-bit. Sizes straddle the chunk boundary.
TEST(BatchAffineAddPacked, IndexedDoubleMatchesScalar)
{
    constexpr size_t W = PushSpanFq::W;
    constexpr size_t CAP_VFS = (64 / W) + 1;
    for (size_t np :
         { size_t{ 1 }, size_t{ 5 }, size_t{ 6 }, size_t{ 31 }, size_t{ 65 }, size_t{ 130 }, size_t{ 300 } }) {
        std::vector<Affine> base(np);
        std::vector<uint32_t> indices(np);
        for (size_t k = 0; k < np; ++k) {
            base[k] = Affine(Element::random_element(&engine));
            indices[k] = static_cast<uint32_t>(k);
        }

        std::vector<Affine> scalar_buckets = base;
        std::vector<fq> scalar_scratch(np);
        bb::group_elements::batch_affine_double_indexed_impl<Affine, fq>(
            scalar_buckets.data(), indices.data(), np, scalar_scratch.data());

        std::vector<fq> col_x(np);
        std::vector<fq> col_y(np);
        for (size_t i = 0; i < np; ++i) {
            col_x[i] = base[i].x;
            col_y[i] = base[i].y;
        }
        AffineCols cols{ std::span<fq>(col_x), std::span<fq>(col_y) };
        std::vector<VecFq> px(CAP_VFS), py(CAP_VFS), ox(CAP_VFS), oy(CAP_VFS);
        std::vector<VecFq> den(CAP_VFS), num(CAP_VFS), inv(CAP_VFS);
        AffinePushSpan in{ std::span<VecFq>(px), std::span<VecFq>(py) };
        AffinePushSpan out{ std::span<VecFq>(ox), std::span<VecFq>(oy) };
        bb::group_elements::BatchAffineDoubleScratch<Params> s{ PushSpanFq{ std::span<VecFq>(den) },
                                                                PushSpanFq{ std::span<VecFq>(num) },
                                                                PushSpanFq{ std::span<VecFq>(inv) } };

        bb::group_elements::batch_affine_double_indexed_packed(cols, indices.data(), np, in, out, s);

        for (size_t k = 0; k < np; ++k) {
            EXPECT_EQ(col_x[k], scalar_buckets[k].x) << "np=" << np << " k=" << k;
            EXPECT_EQ(col_y[k], scalar_buckets[k].y) << "np=" << np << " k=" << k;
        }
    }
}

// The scalar SoA twins are the native path of the Stage 6b reduction, so they must reproduce the AoS
// scalar *_indexed_impl (the kernel they replace) bit-for-bit on the same points.
TEST(BatchAffineAddPacked, IndexedAddScalarSoaMatchesAos)
{
    for (size_t np : { size_t{ 1 }, size_t{ 5 }, size_t{ 31 }, size_t{ 130 }, size_t{ 300 } }) {
        std::vector<Affine> base(2 * np);
        std::vector<std::pair<uint32_t, uint32_t>> pairs(np);
        for (size_t k = 0; k < np; ++k) {
            Affine a = Element::random_element(&engine);
            Affine b = Element::random_element(&engine);
            while (a.x == b.x) {
                b = Affine(Element::random_element(&engine));
            }
            base[k] = a;
            base[np + k] = b;
            pairs[k] = { static_cast<uint32_t>(k), static_cast<uint32_t>(np + k) };
        }

        std::vector<Affine> aos = base;
        std::vector<fq> aos_scratch(np);
        bb::group_elements::batch_affine_add_indexed_impl<Affine, fq>(aos.data(), pairs.data(), np, aos_scratch.data());

        std::vector<fq> col_x(base.size());
        std::vector<fq> col_y(base.size());
        for (size_t i = 0; i < base.size(); ++i) {
            col_x[i] = base[i].x;
            col_y[i] = base[i].y;
        }
        AffineCols cols{ std::span<fq>(col_x), std::span<fq>(col_y) };
        std::vector<fq> soa_scratch(np);
        bb::group_elements::batch_affine_add_indexed_scalar(cols, pairs.data(), np, soa_scratch.data());

        for (size_t k = 0; k < np; ++k) {
            EXPECT_EQ(col_x[k], aos[k].x) << "np=" << np << " k=" << k;
            EXPECT_EQ(col_y[k], aos[k].y) << "np=" << np << " k=" << k;
        }
    }
}

TEST(BatchAffineAddPacked, IndexedDoubleScalarSoaMatchesAos)
{
    for (size_t np : { size_t{ 1 }, size_t{ 5 }, size_t{ 31 }, size_t{ 130 }, size_t{ 300 } }) {
        std::vector<Affine> base(np);
        std::vector<uint32_t> indices(np);
        for (size_t k = 0; k < np; ++k) {
            base[k] = Affine(Element::random_element(&engine));
            indices[k] = static_cast<uint32_t>(k);
        }

        std::vector<Affine> aos = base;
        std::vector<fq> aos_scratch(np);
        bb::group_elements::batch_affine_double_indexed_impl<Affine, fq>(
            aos.data(), indices.data(), np, aos_scratch.data());

        std::vector<fq> col_x(np);
        std::vector<fq> col_y(np);
        for (size_t i = 0; i < np; ++i) {
            col_x[i] = base[i].x;
            col_y[i] = base[i].y;
        }
        AffineCols cols{ std::span<fq>(col_x), std::span<fq>(col_y) };
        std::vector<fq> soa_scratch(np);
        bb::group_elements::batch_affine_double_indexed_scalar(cols, indices.data(), np, soa_scratch.data());

        for (size_t k = 0; k < np; ++k) {
            EXPECT_EQ(col_x[k], aos[k].x) << "np=" << np << " k=" << k;
            EXPECT_EQ(col_y[k], aos[k].y) << "np=" << np << " k=" << k;
        }
    }
}

} // namespace
