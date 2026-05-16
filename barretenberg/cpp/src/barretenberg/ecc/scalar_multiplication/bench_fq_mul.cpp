// Minimal WASM entry point that runs a tight loop of BN254 Fq Montgomery
// multiplications for head-to-head comparison against constantine's 8x32
// CTT_32 Montgomery mul.
//
// Intentionally only uses the public bb::fq API (operator*=, constructor from
// uint256_t, from_montgomery_form_reduced) so the entire hot path goes through
// the same code the MSM bucket accumulation uses.
//
// Input encoding (LE non-Montgomery):
//   a_bytes: 32 bytes  (initial accumulator)
//   b_bytes: 32 bytes  (multiplier, held constant across the loop)
// Output encoding:
//   out_bytes: 32 bytes (final accumulator, LE non-Montgomery, canonical form)
//
// After `count` iterations:
//   out = a * b^count mod q
//
// Auto-picked up by barretenberg_module() (file(GLOB_RECURSE *.cpp)) so no
// CMakeLists.txt edit is required.

#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <cstdint>
#include <cstring>

namespace {

static inline uint64_t load_le_u64(uint8_t const* p) noexcept
{
    uint64_t v;
    std::memcpy(&v, p, sizeof(uint64_t));
    return v;
}

static inline void store_le_u64(uint8_t* p, uint64_t v) noexcept
{
    std::memcpy(p, &v, sizeof(uint64_t));
}

static inline bb::fq decode_fq_le(uint8_t const* p) noexcept
{
    // bb::fq(uint256_t) applies self_to_montgomery_form() internally.
    return bb::fq{ bb::numeric::uint256_t{
        load_le_u64(p), load_le_u64(p + 8), load_le_u64(p + 16), load_le_u64(p + 24) } };
}

static inline void encode_fq_le(const bb::fq& x, uint8_t* out) noexcept
{
    const bb::fq x_std = x.from_montgomery_form_reduced();
    store_le_u64(out, x_std.data[0]);
    store_le_u64(out + 8, x_std.data[1]);
    store_le_u64(out + 16, x_std.data[2]);
    store_le_u64(out + 24, x_std.data[3]);
}

} // namespace

/**
 * @brief Tight loop of `count` BN254 Fq Montgomery multiplications.
 * @details `a` and `b` are decoded once from LE non-Montgomery bytes (this pulls
 *          them through self_to_montgomery_form()). The hot loop then executes
 *          `a *= b` exactly `count` times, which on WASM dispatches to the
 *          9x29-limb Montgomery multiplication in field_impl_generic.hpp
 *          (montgomery_mul for BN254 Fq, whose top limb is < 2^62 so the
 *          small-top-limb variant is selected). On exit `a` is converted back
 *          to canonical LE non-Montgomery form and written to out_bytes.
 */
WASM_EXPORT void bench_fq_mul_bn254(uint32_t count,
                                    uint8_t const* a_bytes,
                                    uint8_t const* b_bytes,
                                    uint8_t* out_bytes)
{
    bb::fq a = decode_fq_le(a_bytes);
    const bb::fq b = decode_fq_le(b_bytes);

    for (uint32_t i = 0; i < count; ++i) {
        a *= b;
    }

    encode_fq_le(a, out_bytes);
}

/**
 * @brief Tight loop of `count` BN254 Fq Montgomery squarings.
 * @details Same shape as bench_fq_mul_bn254 but calls self_sqr() in the hot loop,
 *          which hits the dedicated Montgomery squaring path (montgomery_square
 *          in field_impl_generic.hpp). After `count` iterations, a = a_initial^(2^count).
 */
WASM_EXPORT void bench_fq_sqr_bn254(uint32_t count,
                                    uint8_t const* a_bytes,
                                    uint8_t* out_bytes)
{
    bb::fq a = decode_fq_le(a_bytes);

    for (uint32_t i = 0; i < count; ++i) {
        a.self_sqr();
    }

    encode_fq_le(a, out_bytes);
}
