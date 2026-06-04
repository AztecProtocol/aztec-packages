// Unit tests for the Constantine signed-Booth window recoder used by the
// round-parallel Pippenger MSM. Validates the scalar packed-digit recoder,
// the SIMD x4 specialisations (Localised / Bottom / Boundary), and the
// round-trip identity `Σ_w (-1)^sign_w · bucket_w · 2^{B_w} ≡ scalar`.

#include "pippenger_constantine.hpp"

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <array>
#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

namespace {

namespace cnst = bb::scalar_multiplication::round_parallel_detail;
using ScalarField = bb::fr;
auto& engine = bb::numeric::get_randomness();

constexpr size_t LIMB_BITS_U64 = 64;
constexpr size_t NUM_LIMBS_U64 = 4;
constexpr size_t NUM_LIMBS_U32 = 8;
constexpr size_t MAX_BITS = 256;

// =============================================================================
// Reference signed-window encoder. Reads `(window_bits + 1)` bits from the
// scalar starting at `bit_offset - 1` (with a synthetic 0 at bit -1 when
// bit_offset == 0), then applies the signed-Booth encode:
//
//   raw  = bits [bit_offset-1, bit_offset + window_bits)
//   neg  = raw >> window_bits           (top bit = sign indicator)
//   encode = (raw + 1) >> 1             (drop the lookback bit)
//   bucket = (encode - neg) ^ (-neg)    (conditional negate, branchless)
//   packed = (neg << 31) | bucket
//
// Same algebra as `get_constantine_packed_digit`, but implemented in the most
// obvious way against a flat `bit_at(i)` accessor so any error in the
// production path's limb-walking or branchless conditional negate will diverge.
// =============================================================================
uint32_t reference_packed_digit(const uint64_t* scalar_data, size_t bit_offset, size_t window_bits)
{
    auto bit_at = [&](int64_t i) -> uint64_t {
        if (i < 0 || static_cast<size_t>(i) >= MAX_BITS) {
            return 0;
        }
        return (scalar_data[static_cast<size_t>(i) / LIMB_BITS_U64] >> (static_cast<size_t>(i) % LIMB_BITS_U64)) &
               uint64_t{ 1 };
    };
    uint32_t raw = 0;
    for (size_t k = 0; k <= window_bits; ++k) {
        const int64_t bit_idx = static_cast<int64_t>(bit_offset) + static_cast<int64_t>(k) - 1;
        raw |= static_cast<uint32_t>(bit_at(bit_idx)) << k;
    }
    const uint32_t neg = (raw >> window_bits) & 1U;
    const uint32_t val_mask = (uint32_t{ 1 } << window_bits) - 1;
    const uint32_t encode = (raw + 1) >> 1;
    const uint32_t bucket = ((encode - neg) ^ (uint32_t{ 0 } - neg)) & val_mask;
    return (neg << 31) | bucket;
}

// Random non-Montgomery scalar — uniform over [0, modulus). We invoke the
// recoder against the raw limbs so the random_element form is irrelevant; what
// matters is that the limb bytes are arbitrary.
std::array<uint64_t, NUM_LIMBS_U64> random_scalar_limbs()
{
    std::array<uint64_t, NUM_LIMBS_U64> out{};
    for (size_t i = 0; i < NUM_LIMBS_U64; ++i) {
        out[i] = engine.get_random_uint64();
    }
    return out;
}

// View the same scalar as a uint32 limb array (little-endian: x86/ARM/WASM all
// agree). The SIMD x4 helpers index by uint32 limbs.
const uint32_t* as_u32(const std::array<uint64_t, NUM_LIMBS_U64>& s)
{
    return reinterpret_cast<const uint32_t*>(s.data());
}

// Drive `get_constantine_packed_digit` via the params returned by
// `compute_constantine_slice_params`. The hot loop in Stage 1 / Stage 4 unpacks
// the struct into scalar values; we mirror that call shape exactly so a future
// API change here would be caught.
uint32_t production_scalar_path(const uint64_t* scalar_data, size_t bit_offset, size_t window_bits)
{
    const auto sp = cnst::compute_constantine_slice_params(bit_offset, window_bits, NUM_LIMBS_U64);
    return cnst::get_constantine_packed_digit(scalar_data,
                                              sp.lo_limb,
                                              sp.hi_limb,
                                              sp.lo_off,
                                              sp.lo_bits,
                                              sp.lo_mask,
                                              sp.hi_mask,
                                              sp.slice_localised_to_one_u64,
                                              window_bits);
}

// Drive the 4-wide SIMD specialisations by classifying the slice path and
// calling the matching `store_constantine_packed_digits_x4_*` helper. Out[i]
// is the packed digit for the i-th scalar. Mirrors Stage 1's per-window
// dispatch loop in `scalar_multiplication.cpp`.
void production_simd_path(const std::array<uint64_t, NUM_LIMBS_U64> scalars[4],
                          size_t bit_offset,
                          size_t window_bits,
                          uint32_t out[4])
{
    const auto sp = cnst::compute_constantine_slice_params_u32(bit_offset, window_bits, NUM_LIMBS_U32);
    const cnst::SimdU32x4 lo_mask_v{ sp.lo_mask, sp.lo_mask, sp.lo_mask, sp.lo_mask };
    const cnst::SimdU32x4 hi_mask_v{ sp.hi_mask, sp.hi_mask, sp.hi_mask, sp.hi_mask };
    const cnst::SimdU32x4 one_v{ 1, 1, 1, 1 };
    const uint32_t val_mask_scalar = (uint32_t{ 1 } << window_bits) - 1;
    const cnst::SimdU32x4 val_mask{ val_mask_scalar, val_mask_scalar, val_mask_scalar, val_mask_scalar };

    const uint32_t* s0 = as_u32(scalars[0]);
    const uint32_t* s1 = as_u32(scalars[1]);
    const uint32_t* s2 = as_u32(scalars[2]);
    const uint32_t* s3 = as_u32(scalars[3]);

    const uint32_t wb_u32 = static_cast<uint32_t>(window_bits);
    switch (cnst::classify_slice_path_u32(sp)) {
    case cnst::ConstantineSlicePath::Localised:
        cnst::store_constantine_packed_digits_x4_localised(
            out, s0, s1, s2, s3, sp.lo_limb, sp.lo_off, lo_mask_v, one_v, val_mask, wb_u32);
        break;
    case cnst::ConstantineSlicePath::Bottom:
        cnst::store_constantine_packed_digits_x4_bottom(
            out, s0, s1, s2, s3, sp.hi_limb, sp.lo_bits, hi_mask_v, one_v, val_mask, wb_u32);
        break;
    case cnst::ConstantineSlicePath::Boundary:
        cnst::store_constantine_packed_digits_x4_boundary(out,
                                                          s0,
                                                          s1,
                                                          s2,
                                                          s3,
                                                          sp.lo_limb,
                                                          sp.hi_limb,
                                                          sp.lo_off,
                                                          sp.lo_bits,
                                                          lo_mask_v,
                                                          hi_mask_v,
                                                          one_v,
                                                          val_mask,
                                                          wb_u32);
        break;
    }
}

} // namespace

// =============================================================================
// Test 1 — Scalar packed-digit recoder matches the textbook reference oracle
// across all `(window_bits, bit_offset)` pairs the live pipeline ever issues.
// =============================================================================
TEST(PippengerConstantine, ScalarMatchesReferenceOracleAllWindowBits)
{
    constexpr size_t TRIALS_PER_SHAPE = 32;
    // window_bits range covers production: choose_window_bits returns 2..19,
    // build_var_window_schedule's final window can additionally be 1 bit wide
    // (e.g. wb=3 over 256 bits yields 85*3 + 1). bit_offset 255 covers the
    // above-modulus top edge where every read bit is structurally zero.
    for (size_t window_bits = 1; window_bits <= 19; ++window_bits) {
        for (size_t bit_offset = 0; bit_offset <= 255; ++bit_offset) {
            for (size_t t = 0; t < TRIALS_PER_SHAPE; ++t) {
                const auto s = random_scalar_limbs();
                const uint32_t got = production_scalar_path(s.data(), bit_offset, window_bits);
                const uint32_t want = reference_packed_digit(s.data(), bit_offset, window_bits);
                ASSERT_EQ(got, want) << "window_bits=" << window_bits << " bit_offset=" << bit_offset << " trial=" << t;
            }
        }
    }
}

// =============================================================================
// Test 2 — SIMD x4 path agrees with the scalar path lane-by-lane across all
// three specialisations (Localised / Bottom / Boundary). Each bit_offset
// implicitly selects which specialisation runs; we sweep every offset so all
// three are exercised.
// =============================================================================
TEST(PippengerConstantine, SimdX4MatchesScalarPathLanewise)
{
    constexpr size_t TRIALS_PER_SHAPE = 16;
    bool saw_localised = false;
    bool saw_bottom = false;
    bool saw_boundary = false;
    // window_bits range covers production: choose_window_bits returns 2..19,
    // build_var_window_schedule's final window can additionally be 1 bit wide
    // (e.g. wb=3 over 256 bits yields 85*3 + 1). bit_offset 255 covers the
    // above-modulus top edge where every read bit is structurally zero.
    for (size_t window_bits = 1; window_bits <= 19; ++window_bits) {
        for (size_t bit_offset = 0; bit_offset <= 255; ++bit_offset) {
            const auto sp_u32 = cnst::compute_constantine_slice_params_u32(bit_offset, window_bits, NUM_LIMBS_U32);
            switch (cnst::classify_slice_path_u32(sp_u32)) {
            case cnst::ConstantineSlicePath::Localised:
                saw_localised = true;
                break;
            case cnst::ConstantineSlicePath::Bottom:
                saw_bottom = true;
                break;
            case cnst::ConstantineSlicePath::Boundary:
                saw_boundary = true;
                break;
            }
            for (size_t t = 0; t < TRIALS_PER_SHAPE; ++t) {
                std::array<std::array<uint64_t, NUM_LIMBS_U64>, 4> scalars{
                    random_scalar_limbs(), random_scalar_limbs(), random_scalar_limbs(), random_scalar_limbs()
                };
                alignas(16) std::array<uint32_t, 4> got_simd{};
                production_simd_path(scalars.data(), bit_offset, window_bits, got_simd.data());
                for (size_t lane = 0; lane < 4; ++lane) {
                    const uint32_t want = production_scalar_path(scalars[lane].data(), bit_offset, window_bits);
                    ASSERT_EQ(got_simd[lane], want)
                        << "window_bits=" << window_bits << " bit_offset=" << bit_offset << " lane=" << lane;
                }
            }
        }
    }
    // The sweep must exercise all three specialisations or the SIMD coverage is
    // a no-op for a path. (Coverage check, not a behavioural claim.)
    EXPECT_TRUE(saw_localised);
    EXPECT_TRUE(saw_bottom);
    EXPECT_TRUE(saw_boundary);
}

// =============================================================================
// Test 3 — Round-trip identity. For any tiled window schedule covering
// [0, total_bits) bits, the sum `Σ_w (-1)^sign_w · bucket_w · 2^{B_w}` must
// equal the scalar value modulo 2^total_bits. This is the load-bearing
// algebraic invariant the whole MSM rests on; if it ever fails the rest of
// the pipeline silently mis-computes the result.
// =============================================================================
TEST(PippengerConstantine, RoundTripIdentityMatchesScalarMod2N)
{
    constexpr size_t TOTAL_BITS = 254;
    constexpr size_t TRIALS = 64;
    // Including window_bits == 1 because `build_var_window_schedule` truncates
    // the final window to whatever bits remain, which can be exactly 1.
    for (size_t window_bits = 1; window_bits <= 19; ++window_bits) {
        for (size_t t = 0; t < TRIALS; ++t) {
            const auto s = random_scalar_limbs();
            // Recover scalar value as a 256-bit big integer (4 × uint64).
            // We reconstruct it limb-by-limb using __int128 arithmetic so the
            // round-trip is plainly readable; production code uses field
            // arithmetic, which we deliberately avoid here.
            //
            // Tile windows of width `window_bits` until we cover TOTAL_BITS+2
            // bits. The +2 mirrors the `total_bits = num_bits + 2` budget used
            // by `build_var_window_schedule` to absorb the carry-less top bit.
            std::vector<std::pair<int32_t, size_t>> signed_digits; // (signed_value, bit_offset)
            size_t bit_offset = 0;
            size_t bits_remaining = TOTAL_BITS + 2;
            while (bits_remaining > 0) {
                const size_t wb = std::min(window_bits, bits_remaining);
                const uint32_t packed = production_scalar_path(s.data(), bit_offset, wb);
                const uint32_t neg = packed >> 31;
                const uint32_t bucket = packed & ((uint32_t{ 1 } << wb) - 1);
                const int32_t signed_val = (neg != 0U) ? -static_cast<int32_t>(bucket) : static_cast<int32_t>(bucket);
                signed_digits.emplace_back(signed_val, bit_offset);
                bit_offset += wb;
                bits_remaining -= wb;
            }

            // Reconstruct: Σ_w signed_val_w · 2^{bit_offset_w} mod 2^256, using
            // uint256_t arithmetic where signed subtraction is just `acc -= |v| << off`.
            bb::numeric::uint256_t acc(0);
            for (const auto& [v, off] : signed_digits) {
                const bb::numeric::uint256_t shifted = bb::numeric::uint256_t(static_cast<uint64_t>(v < 0 ? -v : v))
                                                       << bb::numeric::uint256_t(off);
                if (v < 0) {
                    acc -= shifted;
                } else {
                    acc += shifted;
                }
            }
            const bb::numeric::uint256_t scalar_val(s[0], s[1], s[2], s[3]);
            EXPECT_EQ(acc, scalar_val) << "window_bits=" << window_bits << " trial=" << t;
        }
    }
}

// =============================================================================
// Test 4 — Edge cases. Pin the structural boundaries explicitly so a regression
// at one of them (rather than at a random bit) shows up as a named failure.
// =============================================================================
TEST(PippengerConstantine, EdgeCases)
{
    // (a) Zero scalar — every packed digit must be 0 (sign 0, bucket 0).
    // Sweep includes wb=1 (final-window truncation) and bit_offset=255
    // (above-modulus top edge — every bit read is structurally zero).
    std::array<uint64_t, NUM_LIMBS_U64> zero{};
    for (size_t wb = 1; wb <= 19; ++wb) {
        for (size_t off = 0; off <= 255; ++off) {
            EXPECT_EQ(production_scalar_path(zero.data(), off, wb), uint32_t{ 0 })
                << "zero scalar wb=" << wb << " off=" << off;
        }
    }

    // (b) Bottom window — bit_offset == 0 must select the synthetic-zero
    // lookback path. The classifier flags it via `is_bottom_window`.
    const auto sp_bottom = cnst::compute_constantine_slice_params_u32(0, 12, NUM_LIMBS_U32);
    EXPECT_TRUE(sp_bottom.is_bottom_window);
    EXPECT_EQ(cnst::classify_slice_path_u32(sp_bottom), cnst::ConstantineSlicePath::Bottom);

    // (c) Top window — when the natural hi_limb read lands past the scalar's
    // storage, the production code clamps `hi_limb` and zeros `hi_mask`. The
    // packed digit must still match the reference oracle (which extends with
    // zeros above bit 256). Sweep all the way to bit_offset=255 to cover the
    // above-modulus case where every read bit is structurally zero.
    auto top_aligned = random_scalar_limbs();
    constexpr size_t window_bits = 12;
    for (size_t bit_offset = 240; bit_offset <= 255; ++bit_offset) {
        const uint32_t got = production_scalar_path(top_aligned.data(), bit_offset, window_bits);
        const uint32_t want = reference_packed_digit(top_aligned.data(), bit_offset, window_bits);
        EXPECT_EQ(got, want) << "top window bit_offset=" << bit_offset;
    }

    // (d) Localised fast path — the c+1-bit window must fit inside a single
    // uint64 limb for the localised path to be selected. With window_bits=12
    // and bit_offset=10, the lookback bit is at limb 0, bit 9; the window
    // spans bits 10..21 — all inside limb 0, so localised path fires.
    const auto sp_local = cnst::compute_constantine_slice_params(10, 12, NUM_LIMBS_U64);
    EXPECT_TRUE(sp_local.slice_localised_to_one_u64);

    // (e) Boundary case — when the window straddles a uint64 boundary the
    // localised flag must be false. With window_bits=12 and bit_offset=60,
    // the window spans bits 59..71 → crosses bit 63→64.
    const auto sp_boundary = cnst::compute_constantine_slice_params(60, 12, NUM_LIMBS_U64);
    EXPECT_FALSE(sp_boundary.slice_localised_to_one_u64);
}

// =============================================================================
// Test 5 — Named slice-shape table. Random sweeps probably hit every
// (limb_index, slice_path) combination, but a regression at one of these
// boundaries (e.g. "boundary across bit 31→32, lookback in lo half") shows up
// as a named failure here rather than an opaque "trial 17 of 32" log line.
//
// `bit_offset` here is the absolute bit position of the FIRST window bit; the
// lookback bit lives at `bit_offset - 1`. Each row pins the (bit_offset, wb)
// pair, the expected slice path under u32 indexing, and the expected
// localisation under u64 indexing.
// =============================================================================
TEST(PippengerConstantine, NamedSliceShapes)
{
    struct ShapeCase {
        const char* name;
        size_t bit_offset;
        size_t window_bits;
        cnst::ConstantineSlicePath u32_path;
        bool u64_localised; // expected `slice_localised_to_one_u64`
    };
    // Picked so each row exercises a structurally distinct shape:
    //   - bottom_*    : synthetic-lookback path
    //   - local_*     : c+1 bits fit inside a single u64 limb (and matching u32)
    //   - boundary_*  : window straddles a u64 or u32 limb boundary
    //   - top_clamped : hi_limb would land past scalar storage → clamp + zero mask
    const std::array<ShapeCase, 12> cases{ {
        // Bottom — bit_offset 0 across several wb.
        { "bottom_wb12", 0, 12, cnst::ConstantineSlicePath::Bottom, false },
        { "bottom_wb2", 0, 2, cnst::ConstantineSlicePath::Bottom, false },
        { "bottom_wb19", 0, 19, cnst::ConstantineSlicePath::Bottom, false },
        // Localised — lookback + window inside a single u32 (and therefore a single u64).
        { "local_lo_u32", 10, 12, cnst::ConstantineSlicePath::Localised, true },
        // Localised in u64 but boundary in u32 — lookback at bit 30 (u32 limb 0), window spans bits 30..42
        // (crosses u32 bit 31→32) but stays inside u64 limb 0.
        { "local_u64_boundary_u32", 31, 12, cnst::ConstantineSlicePath::Boundary, true },
        // Boundary across u64 bit 63→64.
        { "boundary_u64_at_63", 60, 12, cnst::ConstantineSlicePath::Boundary, false },
        { "boundary_u64_at_127", 124, 12, cnst::ConstantineSlicePath::Boundary, false },
        { "boundary_u64_at_191", 188, 12, cnst::ConstantineSlicePath::Boundary, false },
        // Boundary at u32 bit 31→32 with lookback in low half.
        { "boundary_u32_at_31", 30, 4, cnst::ConstantineSlicePath::Boundary, true },
        // Top window — clamp regime. With wb=12, bit_offset=246 reads bits 245..257; hi limb is past
        // the scalar's 256-bit storage in u32 view (limb_index 7 is the last).
        { "top_clamped_wb12", 246, 12, cnst::ConstantineSlicePath::Boundary, false },
        // wb=1 at the very top — the final-window case `build_var_window_schedule` can emit.
        { "top_wb1_final", 254, 1, cnst::ConstantineSlicePath::Localised, true },
        // Random mid-scalar localised case as a "happy path" anchor.
        { "local_mid_u64", 80, 12, cnst::ConstantineSlicePath::Localised, true },
    } };

    auto s = random_scalar_limbs();
    for (const auto& c : cases) {
        const auto sp_u32 = cnst::compute_constantine_slice_params_u32(c.bit_offset, c.window_bits, NUM_LIMBS_U32);
        const auto sp_u64 = cnst::compute_constantine_slice_params(c.bit_offset, c.window_bits, NUM_LIMBS_U64);
        EXPECT_EQ(cnst::classify_slice_path_u32(sp_u32), c.u32_path) << "case=" << c.name;
        EXPECT_EQ(sp_u64.slice_localised_to_one_u64, c.u64_localised) << "case=" << c.name;

        // The encoder must still produce the reference value at each named shape.
        const uint32_t got = production_scalar_path(s.data(), c.bit_offset, c.window_bits);
        const uint32_t want = reference_packed_digit(s.data(), c.bit_offset, c.window_bits);
        EXPECT_EQ(got, want) << "case=" << c.name;
    }
}

// =============================================================================
// Test 6 — u64 / u32 param classifier internal consistency.
//
// The scalar path uses `ConstantineSliceParams` (u64-indexed); the SIMD path
// uses `ConstantineSliceParamsU32` (u32-indexed). Comparing final packed
// digits (Test 1+2) catches END-to-END divergence, but a compensating bug
// across the two param computations could mask itself. This test asserts the
// param structs encode the SAME lookback bit position and the SAME read width
// where their definitions agree, so a bug in one classifier alone shows up
// even if the digits happen to round-trip.
// =============================================================================
TEST(PippengerConstantine, ParamClassifierU64U32Consistency)
{
    for (size_t wb = 1; wb <= 19; ++wb) {
        for (size_t bit_offset = 0; bit_offset <= 255; ++bit_offset) {
            const auto sp_u64 = cnst::compute_constantine_slice_params(bit_offset, wb, NUM_LIMBS_U64);
            const auto sp_u32 = cnst::compute_constantine_slice_params_u32(bit_offset, wb, NUM_LIMBS_U32);

            // Bottom-window classification: both must agree (u64 signals via lo_mask==0,
            // u32 via the explicit is_bottom_window flag).
            const bool u64_says_bottom = (sp_u64.lo_mask == 0);
            EXPECT_EQ(u64_says_bottom, sp_u32.is_bottom_window)
                << "bottom classification disagrees at bit_offset=" << bit_offset << " wb=" << wb;

            // Lookback bit absolute position: lo_limb·LIMB_BITS + lo_off. Both views must
            // identify the same absolute bit (skip bottom, where the lookback is synthetic
            // and the limb/offset encoding is intentionally not a real position).
            if (!sp_u32.is_bottom_window) {
                const size_t u64_lookback = sp_u64.lo_limb * 64 + sp_u64.lo_off;
                const size_t u32_lookback = sp_u32.lo_limb * 32 + sp_u32.lo_off;
                EXPECT_EQ(u64_lookback, u32_lookback)
                    << "lookback bit disagrees at bit_offset=" << bit_offset << " wb=" << wb;
                EXPECT_EQ(u64_lookback, bit_offset - 1)
                    << "lookback bit ≠ bit_offset-1 at bit_offset=" << bit_offset << " wb=" << wb;
            }

            // Localised-flag implication: u64-localised means the whole c+1 window lives in
            // one u64 limb. That does NOT imply u32-localised (window could still straddle
            // a u32 boundary inside the same u64), but it DOES imply the u32 view's slice
            // path is NOT Bottom (bit_offset > 0 cases only).
            if (sp_u64.slice_localised_to_one_u64 && bit_offset > 0) {
                EXPECT_NE(cnst::classify_slice_path_u32(sp_u32), cnst::ConstantineSlicePath::Bottom)
                    << "u64-localised but u32 classifier says Bottom at bit_offset=" << bit_offset << " wb=" << wb;
            }
        }
    }
}
