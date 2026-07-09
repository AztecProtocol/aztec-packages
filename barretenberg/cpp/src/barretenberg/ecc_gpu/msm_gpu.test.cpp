// Correctness tests for the CUDA MSM backend: every result is compared against the CPU
// Pippenger (`scalar_multiplication::pippenger_unsafe` / `pippenger`), which is the
// reference implementation. All tests skip when no CUDA device is present.

#include "bb_msm_gpu.hpp"

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <cstring>
#include <gtest/gtest.h>
#include <vector>

namespace {

namespace gpu = bb::scalar_multiplication::gpu;
using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using AffineElement = Curve::AffineElement;
using Element = Curve::Element;

// Deterministic engine: GPU failures are input-dependent, so tests must be reproducible.
auto& engine = bb::numeric::get_debug_randomness();

std::vector<AffineElement> random_points(size_t n)
{
    std::vector<AffineElement> points(n);
    for (auto& p : points) {
        p = AffineElement(Element::random_element(&engine));
    }
    return points;
}

std::vector<Fr> random_scalars(size_t n)
{
    std::vector<Fr> scalars(n);
    for (auto& s : scalars) {
        s = Fr::random_element(&engine);
    }
    return scalars;
}

Element cpu_msm(bb::PolynomialSpan<const Fr> scalars, std::span<const AffineElement> points)
{
    return bb::scalar_multiplication::pippenger_unsafe<Curve>(scalars, points);
}

class MsmGpuTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        if (!gpu::msm_available()) {
            GTEST_SKIP() << "no CUDA device available";
        }
    }
};

} // namespace

// Temporary spike diagnostic: the deterministic n=13 full-scalar failure from
// DiagSizeSweep, run as the FIRST GPU work in the process (use --gtest_filter to run
// alone). DiagSizeSweep reaches this MSM only after ~280 prior GPU MSMs; if it passes
// here in isolation, failures depend on device allocation history, implicating reads of
// stale (assumed-zero) device memory in reused allocations.
TEST_F(MsmGpuTest, DiagN13FreshProcess)
{
    const size_t n = 13;
    auto points = random_points(n);
    auto scalars = random_scalars(n);
    bb::PolynomialSpan<const Fr> span{ 0, scalars };
    for (int rep = 0; rep < 5; rep++) {
        EXPECT_EQ(gpu::pippenger_bn254_oneshot(span, points), cpu_msm(span, points)) << "rep " << rep;
    }
}

// Temporary spike diagnostic: dissect the real failing scalar pair (captured from
// DiagSizeSweep with the debug seed). Tests whether the points matter (fresh random
// points here vs the sweep's) and truncates windows to find the minimal failing prefix.
TEST_F(MsmGpuTest, DiagRealPairDissection)
{
    using u256 = bb::numeric::uint256_t;
    const Fr sa(u256(0x25cbdc4336c05166UL, 0x032255120bd53758UL, 0xbcef538cc57341e2UL, 0x116dbce8fd2c6262UL));
    const Fr sb(u256(0x364d1ee7f0cc9bdaUL, 0xc2aa175779c60931UL, 0x4d42c9c9bbe2593eUL, 0x21fe7d2bcca71bf4UL));
    auto points = random_points(2);

    auto pair_matches = [&](const Fr& a, const Fr& b) {
        std::vector<Fr> scalars{ a, b };
        bb::PolynomialSpan<const Fr> span{ 0, scalars };
        return gpu::pippenger_bn254_oneshot(span, points) == cpu_msm(span, points);
    };

    bool full = pair_matches(sa, sb);
    std::cout << "DIAG realpair fresh_points " << (full ? "ok" : "MISMATCH") << std::endl;

    const u256 sa_int(0x25cbdc4336c05166UL, 0x032255120bd53758UL, 0xbcef538cc57341e2UL, 0x116dbce8fd2c6262UL);
    const u256 sb_int(0x364d1ee7f0cc9bdaUL, 0xc2aa175779c60931UL, 0x4d42c9c9bbe2593eUL, 0x21fe7d2bcca71bf4UL);
    for (size_t k = 1; k <= 26; k++) {
        u256 mask = (k >= 26) ? ~u256(0) : ((u256(1) << (10 * k)) - 1);
        bool ok = pair_matches(Fr(sa_int & mask), Fr(sb_int & mask));
        std::cout << "DIAG realpair windows_0_to_" << (k - 1) << " " << (ok ? "ok" : "MISMATCH") << std::endl;
        if (!ok) {
            break;
        }
    }
}

// Temporary spike diagnostic: 2-element MSMs whose booth digits collide in the same
// bucket. The real failing pair collides with OPPOSITE signs at (w=15, bucket 234) and
// (w=25, bucket 4); these synthetics isolate which collision structure breaks.
TEST_F(MsmGpuTest, DiagSyntheticCollisions)
{
    auto points = random_points(2);
    using u256 = bb::numeric::uint256_t;
    const Fr sA1(u256(234) << 150);          // digit +234 at w15 only
    const Fr sB1 = -sA1;                     // digit -234 at w15 only
    const Fr sA2 = sA1 + Fr(u256(4) << 250); // +234@w15, +4@w25
    const Fr sB2 = -sA2;                     // -234@w15, -4@w25
    const Fr sC2 = sA1 + Fr(u256(7) << 30);  // +234@w15 same sign, +7@w3
    struct PairCase {
        const char* name;
        Fr a;
        Fr b;
    };
    const PairCase cases[] = {
        { "opposite_1window", sA1, sB1 },
        { "opposite_2windows", sA2, sB2 },
        { "same_sign_1window", sA1, sC2 },
        { "identical", sA1, sA1 },
    };
    for (const auto& c : cases) {
        std::vector<Fr> scalars{ c.a, c.b };
        bb::PolynomialSpan<const Fr> span{ 0, scalars };
        bool ok = true;
        for (int rep = 0; rep < 3 && ok; rep++) {
            ok = gpu::pippenger_bn254_oneshot(span, points) == cpu_msm(span, points);
        }
        std::cout << "DIAG synth " << c.name << " " << (ok ? "ok" : "MISMATCH") << std::endl;
        EXPECT_TRUE(ok) << c.name;
    }
}

// Temporary spike diagnostic: single-scalar MSMs with adversarial values. Any failure
// here is a deterministic minimal reproducer (n=1: result = s * P).
TEST_F(MsmGpuTest, DiagAdversarialScalars)
{
    auto points = random_points(1);
    bb::numeric::uint256_t window_512 = 0;
    bb::numeric::uint256_t window_511 = 0;
    bb::numeric::uint256_t window_1023 = 0;
    for (size_t w = 0; w < 25; w++) {
        window_512 += bb::numeric::uint256_t(512) << (10 * w);
        window_511 += bb::numeric::uint256_t(511) << (10 * w);
        window_1023 += bb::numeric::uint256_t(1023) << (10 * w);
    }
    struct Case {
        const char* name;
        Fr value;
    };
    const Case cases[] = {
        { "one", Fr::one() },
        { "minus_one", -Fr::one() },
        { "r_minus_1_over_2", (-Fr::one()) * Fr(2).invert() },
        { "2^253", Fr(bb::numeric::uint256_t(1) << 253) },
        { "2^253-1", Fr((bb::numeric::uint256_t(1) << 253) - 1) },
        { "2^128", Fr(bb::numeric::uint256_t(1) << 128) },
        { "windows_512", Fr(window_512) },
        { "windows_511", Fr(window_511) },
        { "windows_1023", Fr(window_1023) },
        { "513", Fr(513) },
        { "512", Fr(512) },
        { "511", Fr(511) },
    };
    for (const auto& c : cases) {
        std::vector<Fr> scalar{ c.value };
        bb::PolynomialSpan<const Fr> span{ 0, scalar };
        Element gpu_result = gpu::pippenger_bn254_oneshot(span, points);
        Element cpu_result = cpu_msm(span, points);
        EXPECT_EQ(gpu_result, cpu_result) << "scalar case " << c.name;
        std::cout << "DIAG scalar=" << c.name << " " << (gpu_result == cpu_result ? "ok" : "MISMATCH") << std::endl;
    }
}

// Temporary spike diagnostic: locates the exact failure boundary over (size, scalar
// magnitude). Sizes 1-2 pass and 127+ fail in the initial GPU run; this pins down where
// and whether scalar bit-length matters.
TEST_F(MsmGpuTest, DiagSizeSweep)
{
    const size_t max_n = 260;
    auto points = random_points(max_n);
    auto full_scalars = random_scalars(max_n);
    std::vector<Fr> one_scalars(max_n, Fr::one());
    std::vector<Fr> small_scalars(max_n);
    for (auto& s : small_scalars) {
        s = Fr(static_cast<uint64_t>(engine.get_random_uint16()));
    }

    struct ScalarClass {
        const char* name;
        const std::vector<Fr>* scalars;
    };
    const ScalarClass classes[] = { { "ones", &one_scalars }, { "small", &small_scalars }, { "full", &full_scalars } };

    std::vector<size_t> sizes;
    for (size_t n = 1; n <= 129; n++) {
        sizes.push_back(n);
    }
    for (size_t n : { 160UL, 191UL, 192UL, 193UL, 224UL, 255UL, 256UL, 257UL }) {
        sizes.push_back(n);
    }

    for (const auto& cls : classes) {
        size_t first_fail = 0;
        size_t num_fail = 0;
        for (size_t n : sizes) {
            bb::PolynomialSpan<const Fr> span{ 0, { cls.scalars->data(), n } };
            bool match = gpu::pippenger_bn254_oneshot(span, points) == cpu_msm(span, points);
            if (!match) {
                num_fail++;
                if (first_fail == 0) {
                    first_fail = n;
                    // Bisect the culprit: mask each scalar to zero in turn; the ones
                    // whose removal makes the MSM match are implicated.
                    std::vector<size_t> culprits;
                    for (size_t i = 0; i < n; i++) {
                        std::vector<Fr> masked(cls.scalars->begin(),
                                               cls.scalars->begin() + static_cast<std::ptrdiff_t>(n));
                        masked[i] = Fr::zero();
                        bb::PolynomialSpan<const Fr> masked_span{ 0, masked };
                        if (gpu::pippenger_bn254_oneshot(masked_span, points) == cpu_msm(masked_span, points)) {
                            culprits.push_back(i);
                            const Fr canonical = (*cls.scalars)[i].from_montgomery_form_reduced();
                            std::cout << "DIAG culprit class=" << cls.name << " idx=" << i << " scalar=0x" << std::hex
                                      << canonical.data[3] << "_" << canonical.data[2] << "_" << canonical.data[1]
                                      << "_" << canonical.data[0] << std::dec << " (canonical)" << std::endl;
                        }
                    }
                    // Culprit pairs: test each implicated pair in a 2-element MSM with
                    // their own points — a minimal reproducer if it still mismatches.
                    for (size_t a = 0; a + 1 < culprits.size(); a++) {
                        for (size_t b = a + 1; b < culprits.size(); b++) {
                            std::vector<Fr> pair_s{ (*cls.scalars)[culprits[a]], (*cls.scalars)[culprits[b]] };
                            std::vector<AffineElement> pair_p{ points[culprits[a]], points[culprits[b]] };
                            bb::PolynomialSpan<const Fr> pair_span{ 0, pair_s };
                            for (int rep = 0; rep < 3; rep++) {
                                Element gpu_r = gpu::pippenger_bn254_oneshot(pair_span, pair_p);
                                Element cpu_r = cpu_msm(pair_span, pair_p);
                                std::cout << "DIAG pair (" << culprits[a] << "," << culprits[b] << ") rep" << rep << " "
                                          << (gpu_r == cpu_r ? "ok" : "MISMATCH") << std::endl;
                                if (gpu_r != cpu_r && rep == 0) {
                                    // Structural forensics: what did the GPU actually
                                    // compute? Test pairing/drop/sign hypotheses, then
                                    // per-window digit drops/duplications.
                                    const Fr& fa = pair_s[0];
                                    const Fr& fb = pair_s[1];
                                    Element pa(pair_p[0]);
                                    Element pb(pair_p[1]);
                                    struct Hyp {
                                        const char* name;
                                        Element value;
                                    };
                                    const Hyp hyps[] = {
                                        { "swapped: a*Pb + b*Pa", pa * fb + pb * fa },
                                        { "both on Pa", pa * (fa + fb) },
                                        { "both on Pb", pb * (fa + fb) },
                                        { "a*Pa only", pa * fa },
                                        { "b*Pb only", pb * fb },
                                        { "a*Pa - b*Pb", pa * fa - pb * fb },
                                        { "b*Pb - a*Pa", pb * fb - pa * fa },
                                        { "-(a*Pa + b*Pb)", -(pa * fa + pb * fb) },
                                    };
                                    for (const auto& h : hyps) {
                                        if (gpu_r == h.value) {
                                            std::cout << "DIAG structure: gpu == " << h.name << std::endl;
                                        }
                                    }
                                    Element delta = gpu_r - cpu_r;
                                    for (size_t w = 0; w < 26; w++) {
                                        Fr shift(bb::numeric::uint256_t(1) << (10 * w));
                                        for (size_t p = 0; p < 2; p++) {
                                            const Fr& s = p == 0 ? fa : fb;
                                            Element base = p == 0 ? pa : pb;
                                            bb::numeric::uint256_t s_int(s.from_montgomery_form_reduced().data[0],
                                                                         s.from_montgomery_form_reduced().data[1],
                                                                         s.from_montgomery_form_reduced().data[2],
                                                                         s.from_montgomery_form_reduced().data[3]);
                                            uint64_t win = ((s_int >> (10 * w)) & 0x3ff).data[0];
                                            // digit dropped: delta == -win*2^(10w)*P;
                                            // digit doubled: delta == +win*2^(10w)*P.
                                            Element contrib = base * (Fr(win) * shift);
                                            if (delta == -contrib && win != 0) {
                                                std::cout << "DIAG window " << w << " of " << (p == 0 ? "a" : "b")
                                                          << " dropped (raw win=" << win << ")" << std::endl;
                                            }
                                            if (delta == contrib && win != 0) {
                                                std::cout << "DIAG window " << w << " of " << (p == 0 ? "a" : "b")
                                                          << " doubled (raw win=" << win << ")" << std::endl;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        std::cout << "DIAG class=" << cls.name << " first_fail=" << first_fail << " num_fail=" << num_fail << "/"
                  << sizes.size() << std::endl;
        EXPECT_EQ(num_fail, 0U) << "scalar class " << cls.name;
    }
}

TEST_F(MsmGpuTest, OneshotMatchesCpuAcrossSizes)
{
    for (size_t n : { 1UL, 2UL, 127UL, 1UL << 10, 1UL << 16 }) {
        auto points = random_points(n);
        auto scalars = random_scalars(n);
        bb::PolynomialSpan<const Fr> span{ 0, scalars };

        Element expected = cpu_msm(span, points);
        Element result = gpu::pippenger_bn254_oneshot(span, points);
        EXPECT_EQ(result, expected) << "size " << n;
    }
}

TEST_F(MsmGpuTest, ZeroScalars)
{
    const size_t n = 1024;
    auto points = random_points(n);
    auto scalars = random_scalars(n);
    // Sprinkle zeros, including a leading and trailing run.
    for (size_t i = 0; i < 32; i++) {
        scalars[i] = Fr::zero();
        scalars[n - 1 - i] = Fr::zero();
        scalars[engine.get_random_uint32() % n] = Fr::zero();
    }
    bb::PolynomialSpan<const Fr> span{ 0, scalars };
    EXPECT_EQ(gpu::pippenger_bn254_oneshot(span, points), cpu_msm(span, points));
}

TEST_F(MsmGpuTest, AllZeroScalarsIsInfinity)
{
    const size_t n = 256;
    auto points = random_points(n);
    std::vector<Fr> scalars(n, Fr::zero());
    bb::PolynomialSpan<const Fr> span{ 0, scalars };
    Element result = gpu::pippenger_bn254_oneshot(span, points);
    EXPECT_TRUE(result.is_point_at_infinity());
}

TEST_F(MsmGpuTest, DuplicateAndRelatedPoints)
{
    // Duplicate points and P/-P pairs exercise the affine addition edge cases; the CPU
    // reference is the safe pippenger() since the unsafe contract excludes these.
    const size_t n = 512;
    auto points = random_points(n);
    for (size_t i = 0; i < n / 4; i++) {
        points[2 * i + 1] = points[2 * i];
    }
    points[7] = -points[6];
    auto scalars = random_scalars(n);
    bb::PolynomialSpan<const Fr> span{ 0, scalars };

    Element expected = bb::scalar_multiplication::pippenger<Curve>(span, points, /*handle_edge_cases=*/true);
    EXPECT_EQ(gpu::pippenger_bn254_oneshot(span, points), expected);
}

TEST_F(MsmGpuTest, StartIndexOffset)
{
    const size_t n = 2048;
    const size_t start = 173;
    auto points = random_points(n);
    auto scalars = random_scalars(n - start);
    bb::PolynomialSpan<const Fr> span{ start, scalars };

    Element expected = cpu_msm(span, points);
    EXPECT_EQ(gpu::pippenger_bn254_oneshot(span, points), expected);

    // Same span through the resident-context path (which pads leading zeros).
    Element out;
    ASSERT_TRUE(gpu::try_pippenger_bn254(out, span, points));
    EXPECT_EQ(out, expected);
}

TEST_F(MsmGpuTest, ResidentContextReuse)
{
    const size_t n = 1UL << 14;
    auto points = random_points(n);

    // Repeated calls against the same points span must hit the cached resident context
    // and stay correct for varying scalar lengths.
    for (size_t len : { n, n / 2, n / 3, n }) {
        auto scalars = random_scalars(len);
        bb::PolynomialSpan<const Fr> span{ 0, scalars };
        Element out;
        ASSERT_TRUE(gpu::try_pippenger_bn254(out, span, points));
        EXPECT_EQ(out, cpu_msm(span, points)) << "len " << len;
    }
}

TEST_F(MsmGpuTest, CoarseMontgomeryScalarsAreReduced)
{
    // Scalars in bb's coarse representation ([r, 2r)) must give the same result as
    // their canonical form: the GPU wrapper stages a reduced copy.
    const size_t n = 256;
    auto points = random_points(n);
    auto scalars = random_scalars(n);

    std::vector<Fr> coarse = scalars;
    for (auto& s : coarse) {
        // Adding the modulus to the raw limbs leaves the represented value unchanged but
        // produces the non-canonical encoding. Canonical values are < 2^254, so the sum
        // never overflows 256 bits.
        bb::numeric::uint256_t raw{ s.data[0], s.data[1], s.data[2], s.data[3] };
        raw += Fr::modulus;
        s.data[0] = raw.data[0];
        s.data[1] = raw.data[1];
        s.data[2] = raw.data[2];
        s.data[3] = raw.data[3];
    }

    bb::PolynomialSpan<const Fr> canonical_span{ 0, scalars };
    bb::PolynomialSpan<const Fr> coarse_span{ 0, coarse };
    Element expected = cpu_msm(canonical_span, points);
    EXPECT_EQ(gpu::pippenger_bn254_oneshot(coarse_span, points), expected);
}

TEST_F(MsmGpuTest, InputBuffersUntouched)
{
    const size_t n = 1024;
    auto points = random_points(n);
    auto scalars = random_scalars(n);
    auto scalars_copy = scalars;
    auto points_copy = points;

    bb::PolynomialSpan<const Fr> span{ 0, scalars };
    (void)gpu::pippenger_bn254_oneshot(span, points);

    EXPECT_EQ(0, std::memcmp(scalars.data(), scalars_copy.data(), n * sizeof(Fr)));
    EXPECT_EQ(0, std::memcmp(points.data(), points_copy.data(), n * sizeof(AffineElement)));
}
