#include "barretenberg/ecc/fields/batch_inversion.hpp"

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <array>
#include <gtest/gtest.h>
#include <vector>

namespace {

using bb::fq;
using VecFq = bb::VectorField<bb::Bn254FqParams>;
using PushSpanFq = bb::VectorFieldPushSpan<bb::Bn254FqParams>;

auto& engine = bb::numeric::get_debug_randomness();

fq random_nonzero()
{
    fq v;
    do {
        v = fq::random_element(&engine);
    } while (v.is_zero());
    return v;
}

// Invert the product once, recover each element's inverse, and check against a direct per-element
// invert(). Exercised across a few widths to confirm the helper is width-generic.
template <size_t W> void check_compute_lane_inverses()
{
    std::array<fq, W> a;
    fq product = fq::one();
    for (auto& v : a) {
        v = fq::random_element(&engine);
        product *= v;
    }
    const fq inv_product = product.invert();
    const std::array<fq, W> inv = bb::compute_lane_inverses<fq, W>(a, inv_product);
    for (size_t k = 0; k < W; ++k) {
        EXPECT_EQ(inv[k], a[k].invert());
        EXPECT_EQ(inv[k] * a[k], fq::one());
    }
}

TEST(BatchInversion, ComputeLaneInversesWidth5)
{
    check_compute_lane_inverses<5>();
}

TEST(BatchInversion, ComputeLaneInversesWidth1)
{
    check_compute_lane_inverses<1>();
}

TEST(BatchInversion, ComputeLaneInversesWidth8)
{
    check_compute_lane_inverses<8>();
}

// batch_invert over a VectorFieldPushSpan: every element's inverse, computed with one field inversion,
// must equal a direct per-element invert(). Checked across boundary sizes (empty, partial, ragged).
TEST(BatchInversion, BatchInvertSpan)
{
    constexpr size_t W = PushSpanFq::W;
    for (size_t n :
         { size_t{ 0 }, size_t{ 1 }, size_t{ 4 }, size_t{ 5 }, size_t{ 6 }, size_t{ 9 }, size_t{ 25 }, size_t{ 31 } }) {
        std::vector<fq> src(n);
        for (auto& v : src) {
            v = random_nonzero();
        }
        std::vector<VecFq> in_backing((n / W) + 1);
        std::vector<VecFq> out_backing((n / W) + 1);
        PushSpanFq in{ std::span<VecFq>(in_backing) };
        PushSpanFq out{ std::span<VecFq>(out_backing) };
        for (const auto& v : src) {
            in.push(v);
        }

        bb::batch_invert(in, out);

        ASSERT_EQ(out.size(), n);
        for (size_t i = 0; i < n; ++i) {
            const fq got = (i < out.num_full_vectors() * W) ? out[i / W].to_array()[i % W] : out.tail_data()[i % W];
            EXPECT_EQ(got, src[i].invert()) << "n=" << n << " i=" << i;
            EXPECT_EQ(got * src[i], fq::one());
            // in is read again in the backward pass, so it must come back unchanged.
            const fq in_i = (i < in.num_full_vectors() * W) ? in[i / W].to_array()[i % W] : in.tail_data()[i % W];
            EXPECT_EQ(in_i, src[i]) << "in mutated at n=" << n << " i=" << i;
        }
    }
}

// A zero anywhere makes the whole product zero, which batch_invert must refuse rather than feed to
// invert(). Checked with the zero in a full VectorField and in the tail.
// Skipped in WASM builds: death tests (EXPECT_DEATH) aren't supported under WASI.
#ifndef __wasm__
TEST(BatchInversionDeath, ZeroInputAborts)
{
    constexpr size_t W = PushSpanFq::W;
    for (size_t zero_at : { size_t{ 2 }, size_t{ 6 } }) { // full-vector lane, then tail
        const size_t n = 7;
        std::vector<VecFq> in_backing((n / W) + 1);
        std::vector<VecFq> out_backing((n / W) + 1);
        PushSpanFq in{ std::span<VecFq>(in_backing) };
        PushSpanFq out{ std::span<VecFq>(out_backing) };
        for (size_t i = 0; i < n; ++i) {
            in.push(i == zero_at ? fq::zero() : random_nonzero());
        }
        EXPECT_DEATH(bb::batch_invert(in, out), "invert zero");
    }
}

// out must not alias in (batch_invert reads in while writing prefixes into out); passing
// one span as both must trip the BB_ASSERT(!in.aliases(out)) guard.
TEST(BatchInversionDeath, AliasedOutputAborts)
{
    constexpr size_t W = PushSpanFq::W;
    const size_t n = 7;
    std::vector<VecFq> backing((n / W) + 1);
    PushSpanFq span{ std::span<VecFq>(backing) };
    for (size_t i = 0; i < n; ++i) {
        span.push(random_nonzero());
    }
    EXPECT_DEATH(bb::batch_invert(span, span), "aliases");
}
#endif

} // namespace
