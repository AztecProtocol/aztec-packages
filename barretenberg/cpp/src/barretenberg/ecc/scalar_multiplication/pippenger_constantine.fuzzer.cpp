// libFuzzer target for the Constantine signed-Booth window recoder.
//
// Two-pronged differential check on each input:
//   1. Scalar path vs textbook reference oracle — catches encoder algebra bugs.
//   2. SIMD x4 path vs scalar path (lane-by-lane) — catches lane-mux / mask /
//      vector-shift bugs in the three slice-path specialisations.
//
// Input layout: 1 byte window_bits ∈ [2, 18], 1 byte bit_offset ∈ [0, 254],
// followed by 32 bytes × 4 = 128 bytes of scalar limb material. Total minimum
// input = 130 bytes; smaller inputs are zero-padded so libFuzzer's empty-seed
// kickoff still drives the encoder.
//
// Run:
//   cmake --preset fuzzing && cmake --build --preset fuzzing --target ecc_pippenger_constantine_fuzzer
//   ./build-fuzzing/bin/ecc_pippenger_constantine_fuzzer -max_total_time=60

#include "pippenger_constantine.hpp"

#include "barretenberg/numeric/uint256/uint256.hpp"

#include <array>
#include <cstdint>
#include <cstring>

namespace {

namespace cnst = bb::scalar_multiplication::round_parallel_detail;

constexpr size_t LIMB_BITS_U64 = 64;
constexpr size_t NUM_LIMBS_U64 = 4;
constexpr size_t NUM_LIMBS_U32 = 8;
constexpr size_t MAX_BITS = 256;
constexpr size_t SCALAR_BYTES = 32;

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

uint32_t production_scalar(const uint64_t* scalar_data, size_t bit_offset, size_t window_bits)
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

void production_simd(const std::array<std::array<uint64_t, NUM_LIMBS_U64>, 4>& scalars,
                     size_t bit_offset,
                     size_t window_bits,
                     std::array<uint32_t, 4>& out)
{
    const auto sp = cnst::compute_constantine_slice_params_u32(bit_offset, window_bits, NUM_LIMBS_U32);
    const cnst::SimdU32x4 lo_mask_v{ sp.lo_mask, sp.lo_mask, sp.lo_mask, sp.lo_mask };
    const cnst::SimdU32x4 hi_mask_v{ sp.hi_mask, sp.hi_mask, sp.hi_mask, sp.hi_mask };
    const cnst::SimdU32x4 one_v{ 1, 1, 1, 1 };
    const uint32_t val_mask_scalar = (uint32_t{ 1 } << window_bits) - 1;
    const cnst::SimdU32x4 val_mask{ val_mask_scalar, val_mask_scalar, val_mask_scalar, val_mask_scalar };
    const auto* s0 = reinterpret_cast<const uint32_t*>(scalars[0].data());
    const auto* s1 = reinterpret_cast<const uint32_t*>(scalars[1].data());
    const auto* s2 = reinterpret_cast<const uint32_t*>(scalars[2].data());
    const auto* s3 = reinterpret_cast<const uint32_t*>(scalars[3].data());
    const auto wb_u32 = static_cast<uint32_t>(window_bits);

    switch (cnst::classify_slice_path_u32(sp)) {
    case cnst::ConstantineSlicePath::Localised:
        cnst::store_constantine_packed_digits_x4_localised(
            out.data(), s0, s1, s2, s3, sp.lo_limb, sp.lo_off, lo_mask_v, one_v, val_mask, wb_u32);
        break;
    case cnst::ConstantineSlicePath::Bottom:
        cnst::store_constantine_packed_digits_x4_bottom(
            out.data(), s0, s1, s2, s3, sp.hi_limb, sp.lo_bits, hi_mask_v, one_v, val_mask, wb_u32);
        break;
    case cnst::ConstantineSlicePath::Boundary:
        cnst::store_constantine_packed_digits_x4_boundary(out.data(),
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

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    // Pad input to the minimum required length so empty / tiny seeds still
    // exercise the encoder against zero-extended scalars.
    constexpr size_t MIN_INPUT = 2 + (SCALAR_BYTES * 4);
    std::array<uint8_t, MIN_INPUT> buf{};
    std::memcpy(buf.data(), data, std::min(size, MIN_INPUT));

    // window_bits ∈ [1, 19] — `choose_window_bits` returns [2,19]; the final
    // window emitted by `build_var_window_schedule` can additionally be 1 bit
    // (e.g. wb=3 over 256 bits = 85*3+1). Outside this range the encoder has
    // no well-defined behavior in production.
    const size_t window_bits = 1 + (buf[0] % 19);
    // bit_offset ∈ [0, 255] — the live pipeline's range, including the top
    // edge where bit_offset+wb extends past the scalar's 256 bits (production
    // code clamps `hi_limb` and zeros `hi_mask`).
    const size_t bit_offset = buf[1] & 0xff;

    std::array<std::array<uint64_t, NUM_LIMBS_U64>, 4> scalars{};
    for (size_t lane = 0; lane < 4; ++lane) {
        std::memcpy(scalars[lane].data(), buf.data() + 2 + (lane * SCALAR_BYTES), SCALAR_BYTES);
    }

    // Check 1: scalar path matches the textbook reference oracle.
    for (size_t lane = 0; lane < 4; ++lane) {
        const uint32_t got = production_scalar(scalars[lane].data(), bit_offset, window_bits);
        const uint32_t want = reference_packed_digit(scalars[lane].data(), bit_offset, window_bits);
        if (got != want) {
            __builtin_trap();
        }
    }

    // Check 2: SIMD x4 path agrees with scalar path lane-by-lane.
    std::array<uint32_t, 4> simd_out{};
    production_simd(scalars, bit_offset, window_bits, simd_out);
    for (size_t lane = 0; lane < 4; ++lane) {
        const uint32_t want = production_scalar(scalars[lane].data(), bit_offset, window_bits);
        if (simd_out[lane] != want) {
            __builtin_trap();
        }
    }

    return 0;
}
