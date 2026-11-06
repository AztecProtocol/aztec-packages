#pragma once
// Field and point arithmetic for the CUDA MSM kernels in msm_cuda.cu: 256-bit integer and Montgomery field
// operations, Jacobian point addition and doubling, and the Pippenger bucket steps built on them. Supports BN254 G1
// and Grumpkin (short Weierstrass, a = 0); the two differ only in the field constants.
//
// The code is plain integer arithmetic on fixed-size local state: no __int128, exceptions or heap allocation, and
// no barretenberg field or group types. It works on the plain structs from msm_core.hpp (U256, AffinePoint), whose
// coordinates are Montgomery residues. On the device, mac64, raw_add and raw_sub use PTX carry-chain instructions;
// -DGPU_MSM_NO_PTX selects portable C++ for comparison.
#include "barretenberg/ecc/scalar_multiplication/gpu/msm_core.hpp"

#include <cstdint>

// GPU_MSM_HD ("host and device") marks a function that can be called from both kernels and host code, and always
// inlines it. Compiled as CUDA it expands to `__host__ __device__ __forceinline__`; otherwise it is plain `inline`.
#if defined(__CUDA__) || defined(__CUDACC__)
#define GPU_MSM_HD __host__ __device__ __forceinline__
#else
#define GPU_MSM_HD inline
#endif

namespace bb::gpu_msm::kernels {

// Portable carry and borrow helpers. sub_borrow64 and wide_mul64 are used only by the non-PTX paths of raw_sub and
// mac64. add_carry64 is used by the non-PTX path of raw_add and also called directly by mont_reduce on every build.
//
// a + b + carry_in, carry_in in {0, 1}. Returns the low 64 bits; *carry_out in {0, 1}.
GPU_MSM_HD uint64_t add_carry64(uint64_t a, uint64_t b, uint64_t carry_in, uint64_t* carry_out)
{
    uint64_t s1 = a + b;
    uint64_t c1 = (s1 < a) ? 1ULL : 0ULL;
    uint64_t s2 = s1 + carry_in;
    uint64_t c2 = (s2 < s1) ? 1ULL : 0ULL;
    *carry_out = c1 + c2;
    return s2;
}

// a - b - borrow_in, borrow_in in {0, 1}. Returns the low 64 bits; *borrow_out in {0, 1}.
GPU_MSM_HD uint64_t sub_borrow64(uint64_t a, uint64_t b, uint64_t borrow_in, uint64_t* borrow_out)
{
    uint64_t t1 = a - b;
    uint64_t b1 = (a < b) ? 1ULL : 0ULL;
    uint64_t t2 = t1 - borrow_in;
    uint64_t b2 = (t1 < borrow_in) ? 1ULL : 0ULL;
    *borrow_out = b1 + b2;
    return t2;
}

// Exact 64x64 -> 128-bit product, split into two 64-bit halves via 32-bit limb decomposition.
GPU_MSM_HD void wide_mul64(uint64_t a, uint64_t b, uint64_t* hi, uint64_t* lo)
{
    uint64_t a_lo = a & 0xffffffffULL;
    uint64_t a_hi = a >> 32;
    uint64_t b_lo = b & 0xffffffffULL;
    uint64_t b_hi = b >> 32;

    uint64_t lo_lo = a_lo * b_lo;
    uint64_t hi_lo = a_hi * b_lo;
    uint64_t lo_hi = a_lo * b_hi;
    uint64_t hi_hi = a_hi * b_hi;

    uint64_t cross = (lo_lo >> 32) + (hi_lo & 0xffffffffULL) + (lo_hi & 0xffffffffULL);
    *lo = (cross << 32) | (lo_lo & 0xffffffffULL);
    *hi = hi_hi + (hi_lo >> 32) + (lo_hi >> 32) + (cross >> 32);
}

// a + b*c + carry_in as an exact 128-bit value (always <= 2^128 - 1 for 64-bit a, b, c, carry_in):
// returns the low 64 bits, *carry_out gets the high 64 bits. The standard multiply-accumulate
// primitive used to build schoolbook multiplication and Montgomery reduction below.
GPU_MSM_HD uint64_t mac64(uint64_t a, uint64_t b, uint64_t c, uint64_t carry_in, uint64_t* carry_out)
{
#if defined(__CUDA_ARCH__) && !defined(GPU_MSM_NO_PTX)
    // Device build: one 64-bit multiply-add with the hardware carry flag instead of 32-bit partial products.
    uint64_t lo;
    uint64_t hi;
    asm("mad.lo.cc.u64 %0, %2, %3, %4;\n\t"
        "madc.hi.u64 %1, %2, %3, 0;\n\t"
        "add.cc.u64 %0, %0, %5;\n\t"
        "addc.u64 %1, %1, 0;"
        : "=&l"(lo), "=&l"(hi)
        : "l"(b), "l"(c), "l"(a), "l"(carry_in));
    *carry_out = hi;
    return lo;
#else
    uint64_t p_hi, p_lo;
    wide_mul64(b, c, &p_hi, &p_lo);
    uint64_t s1 = p_lo + a;
    uint64_t c1 = (s1 < p_lo) ? 1ULL : 0ULL;
    uint64_t s2 = s1 + carry_in;
    uint64_t c2 = (s2 < s1) ? 1ULL : 0ULL;
    *carry_out = p_hi + c1 + c2;
    return s2;
#endif
}

constexpr int kLimbs = 4;

GPU_MSM_HD bool is_zero(const U256& a)
{
    return (a.limb[0] | a.limb[1] | a.limb[2] | a.limb[3]) == 0;
}

GPU_MSM_HD bool is_equal(const U256& a, const U256& b)
{
    return a.limb[0] == b.limb[0] && a.limb[1] == b.limb[1] && a.limb[2] == b.limb[2] && a.limb[3] == b.limb[3];
}

// a >= b, as unsigned 256-bit integers.
GPU_MSM_HD bool is_geq(const U256& a, const U256& b)
{
    for (int i = kLimbs - 1; i >= 0; i--) {
        if (a.limb[i] != b.limb[i]) {
            return a.limb[i] > b.limb[i];
        }
    }
    return true;
}

GPU_MSM_HD U256 raw_add(const U256& a, const U256& b, uint64_t* carry_out)
{
#if defined(__CUDA_ARCH__) && !defined(GPU_MSM_NO_PTX)
    U256 r;
    uint64_t carry;
    asm("add.cc.u64 %0, %5, %9;\n\t"
        "addc.cc.u64 %1, %6, %10;\n\t"
        "addc.cc.u64 %2, %7, %11;\n\t"
        "addc.cc.u64 %3, %8, %12;\n\t"
        "addc.u64 %4, 0, 0;"
        : "=&l"(r.limb[0]), "=&l"(r.limb[1]), "=&l"(r.limb[2]), "=&l"(r.limb[3]), "=&l"(carry)
        : "l"(a.limb[0]),
          "l"(a.limb[1]),
          "l"(a.limb[2]),
          "l"(a.limb[3]),
          "l"(b.limb[0]),
          "l"(b.limb[1]),
          "l"(b.limb[2]),
          "l"(b.limb[3]));
    *carry_out = carry;
    return r;
#else
    U256 r{};
    uint64_t carry = 0;
    for (int i = 0; i < kLimbs; i++) {
        r.limb[i] = add_carry64(a.limb[i], b.limb[i], carry, &carry);
    }
    *carry_out = carry;
    return r;
#endif
}

GPU_MSM_HD U256 raw_sub(const U256& a, const U256& b, uint64_t* borrow_out)
{
#if defined(__CUDA_ARCH__) && !defined(GPU_MSM_NO_PTX)
    U256 r;
    uint64_t borrow;
    asm("sub.cc.u64 %0, %5, %9;\n\t"
        "subc.cc.u64 %1, %6, %10;\n\t"
        "subc.cc.u64 %2, %7, %11;\n\t"
        "subc.cc.u64 %3, %8, %12;\n\t"
        "subc.u64 %4, 0, 0;"
        : "=&l"(r.limb[0]), "=&l"(r.limb[1]), "=&l"(r.limb[2]), "=&l"(r.limb[3]), "=&l"(borrow)
        : "l"(a.limb[0]),
          "l"(a.limb[1]),
          "l"(a.limb[2]),
          "l"(a.limb[3]),
          "l"(b.limb[0]),
          "l"(b.limb[1]),
          "l"(b.limb[2]),
          "l"(b.limb[3]));
    *borrow_out = borrow & 1ULL;
    return r;
#else
    U256 r{};
    uint64_t borrow = 0;
    for (int i = 0; i < kLimbs; i++) {
        r.limb[i] = sub_borrow64(a.limb[i], b.limb[i], borrow, &borrow);
    }
    *borrow_out = borrow;
    return r;
#endif
}

// BN254 G1 (y^2 = x^3 + 3) and Grumpkin (y^2 = x^3 - 17) both have a = 0 and never use b, so only these constants
// differ.

// BN254 base field Fq: p = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
struct Bn254BaseField {
    static GPU_MSM_HD U256 modulus()
    {
        return U256{ { 0x3c208c16d87cfd47ULL, 0x97816a916871ca8dULL, 0xb85045b68181585dULL, 0x30644e72e131a029ULL } };
    }
    static GPU_MSM_HD U256 modulus_minus_2()
    {
        return U256{ { 0x3c208c16d87cfd45ULL, 0x97816a916871ca8dULL, 0xb85045b68181585dULL, 0x30644e72e131a029ULL } };
    }
    static GPU_MSM_HD U256 r_squared()
    {
        return U256{ { 0xf32cfc5b538afa89ULL, 0xb5e71911d44501fbULL, 0x47ab1eff0a417ff6ULL, 0x06d89f71cab8351fULL } };
    }
    static GPU_MSM_HD uint64_t n0() { return 0x87d20782e4866389ULL; }
    // R mod p: the number 1 in Montgomery form.
    static GPU_MSM_HD U256 one_mont()
    {
        return U256{ { 0xd35d438dc58f0d9dULL, 0x0a78eb28f5c70b3dULL, 0x666ea36f7879462cULL, 0x0e0a77c19a07df2fULL } };
    }
};

// Grumpkin base field, which is the BN254 scalar field Fr:
// p = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
struct GrumpkinBaseField {
    static GPU_MSM_HD U256 modulus()
    {
        return U256{ { 0x43e1f593f0000001ULL, 0x2833e84879b97091ULL, 0xb85045b68181585dULL, 0x30644e72e131a029ULL } };
    }
    static GPU_MSM_HD U256 modulus_minus_2()
    {
        return U256{ { 0x43e1f593efffffffULL, 0x2833e84879b97091ULL, 0xb85045b68181585dULL, 0x30644e72e131a029ULL } };
    }
    static GPU_MSM_HD U256 r_squared()
    {
        return U256{ { 0x1bb8e645ae216da7ULL, 0x53fe3ab1e35c59e3ULL, 0x8c49833d53bb8085ULL, 0x0216d0b17f4e44a5ULL } };
    }
    static GPU_MSM_HD uint64_t n0() { return 0xc2e1f593efffffffULL; }
    static GPU_MSM_HD U256 one_mont()
    {
        return U256{ { 0xac96341c4ffffffbULL, 0x36fc76959f60cd29ULL, 0x666ea36f7879462eULL, 0x0e0a77c19a07df2fULL } };
    }
};

template <class F> GPU_MSM_HD U256 add_mod_p(const U256& a, const U256& b)
{
    uint64_t carry;
    U256 s = raw_add(a, b, &carry);
    const U256 p = F::modulus();
    if (carry != 0 || is_geq(s, p)) {
        uint64_t borrow;
        s = raw_sub(s, p, &borrow);
    }
    return s;
}

template <class F> GPU_MSM_HD U256 sub_mod_p(const U256& a, const U256& b)
{
    uint64_t borrow;
    U256 d = raw_sub(a, b, &borrow);
    if (borrow != 0) {
        uint64_t c;
        d = raw_add(d, F::modulus(), &c);
    }
    return d;
}

template <class F> GPU_MSM_HD U256 double_mod_p(const U256& a)
{
    return add_mod_p<F>(a, a);
}

template <class F> GPU_MSM_HD U256 negate_mod_p(const U256& a)
{
    if (is_zero(a)) {
        return a;
    }
    return sub_mod_p<F>(F::modulus(), a);
}

GPU_MSM_HD void mul4(const U256& a, const U256& b, uint64_t out[8])
{
    for (int i = 0; i < 8; i++) {
        out[i] = 0;
    }
    for (int i = 0; i < kLimbs; i++) {
        uint64_t carry = 0;
        for (int j = 0; j < kLimbs; j++) {
            uint64_t c;
            out[i + j] = mac64(out[i + j], a.limb[i], b.limb[j], carry, &c);
            carry = c;
        }
        // Row i has not touched limb i + kLimbs yet, so the row's final carry is stored directly.
        out[i + kLimbs] = carry;
    }
}

// Separated-operand-scanning Montgomery reduction: reduces an 8-limb value t (destroyed) mod p,
// returning t * R^-1 mod p where R = 2^256.
template <class F> GPU_MSM_HD U256 mont_reduce(uint64_t t[8])
{
    const U256 p = F::modulus();
    const uint64_t n0 = F::n0();
    // Each row's carry is added into limb i + kLimbs together with the one-bit overflow of the previous row's
    // addition, so no data-dependent carry-propagation loop is needed.
    uint64_t overflow = 0;
    for (int i = 0; i < kLimbs; i++) {
        uint64_t m = t[i] * n0; // mod 2^64 automatically (plain 64-bit multiply truncates).
        uint64_t carry = 0;
        for (int j = 0; j < kLimbs; j++) {
            uint64_t c;
            t[i + j] = mac64(t[i + j], m, p.limb[j], carry, &c);
            carry = c;
        }
        uint64_t c1;
        uint64_t c2;
        const uint64_t partial = add_carry64(t[i + kLimbs], carry, 0, &c1);
        t[i + kLimbs] = add_carry64(partial, overflow, 0, &c2);
        overflow = c1 + c2;
    }
    U256 out{};
    for (int i = 0; i < kLimbs; i++) {
        out.limb[i] = t[kLimbs + i];
    }
    // The reduced value is below 2p; `overflow` set means it is at least 2^256, which is above p.
    if (overflow != 0 || is_geq(out, p)) {
        uint64_t borrow;
        out = raw_sub(out, p, &borrow);
    }
    return out;
}

// (a * b) / R mod p. If a, b are Montgomery representations of A, B (a = A*R mod p), the result
// is the Montgomery representation of A*B mod p.
template <class F> GPU_MSM_HD U256 mont_mul(const U256& a, const U256& b)
{
    uint64_t t[8];
    mul4(a, b, t);
    return mont_reduce<F>(t);
}

template <class F> GPU_MSM_HD U256 mont_sqr(const U256& a)
{
    return mont_mul<F>(a, a);
}

template <class F> GPU_MSM_HD U256 to_mont(const U256& a)
{
    return mont_mul<F>(a, F::r_squared());
}

// base_mont^exponent mod p, base_mont and the result in Montgomery form, by square-and-multiply
// over all 256 bits of exponent (MSB to LSB; leading zero bits just cost a few wasted squarings
// of the Montgomery representation of 1, which is harmless).
template <class F> GPU_MSM_HD U256 mont_pow(const U256& base_mont, const U256& exponent)
{
    U256 result = to_mont<F>(U256{ { 1, 0, 0, 0 } });
    for (int limb = kLimbs - 1; limb >= 0; limb--) {
        for (int bit = 63; bit >= 0; bit--) {
            result = mont_sqr<F>(result);
            if ((exponent.limb[limb] >> bit) & 1ULL) {
                result = mont_mul<F>(result, base_mont);
            }
        }
    }
    return result;
}

// Field inverse by Fermat's little theorem. Caller guarantees a_mont != 0.
template <class F> GPU_MSM_HD U256 field_inverse(const U256& a_mont)
{
    return mont_pow<F>(a_mont, F::modulus_minus_2());
}

struct JacobianPoint {
    U256 X;
    U256 Y;
    U256 Z;
};

template <class F> GPU_MSM_HD JacobianPoint jac_identity()
{
    const U256 zero{};
    const U256 one_mont = to_mont<F>(U256{ { 1, 0, 0, 0 } });
    return JacobianPoint{ one_mont, one_mont, zero };
}

GPU_MSM_HD bool jac_is_infinity(const JacobianPoint& p)
{
    return is_zero(p.Z);
}

template <class F> GPU_MSM_HD JacobianPoint affine_to_jacobian(const AffinePoint& p)
{
    if (p.infinity) {
        return jac_identity<F>();
    }
    return JacobianPoint{ p.x, p.y, F::one_mont() };
}

// Jacobian doubling, EFD "dbl-2007-bl" specialised to a = 0.
template <class F> GPU_MSM_HD JacobianPoint jacobian_double(const JacobianPoint& p)
{
    if (jac_is_infinity(p) || is_zero(p.Y)) {
        return jac_identity<F>();
    }
    const U256 XX = mont_sqr<F>(p.X);
    const U256 YY = mont_sqr<F>(p.Y);
    const U256 YYYY = mont_sqr<F>(YY);
    const U256 ZZ = mont_sqr<F>(p.Z);
    const U256 X_plus_YY = add_mod_p<F>(p.X, YY);
    const U256 S = double_mod_p<F>(sub_mod_p<F>(sub_mod_p<F>(mont_sqr<F>(X_plus_YY), XX), YYYY));
    const U256 M = add_mod_p<F>(add_mod_p<F>(XX, XX), XX); // 3*XX (a = 0)
    const U256 T = sub_mod_p<F>(mont_sqr<F>(M), double_mod_p<F>(S));
    const U256 X3 = T;
    const U256 eight_YYYY = double_mod_p<F>(double_mod_p<F>(double_mod_p<F>(YYYY)));
    const U256 Y3 = sub_mod_p<F>(mont_mul<F>(M, sub_mod_p<F>(S, T)), eight_YYYY);
    const U256 Y1_plus_Z1 = add_mod_p<F>(p.Y, p.Z);
    const U256 Z3 = sub_mod_p<F>(sub_mod_p<F>(mont_sqr<F>(Y1_plus_Z1), YY), ZZ);
    return JacobianPoint{ X3, Y3, Z3 };
}

// Jacobian addition, EFD "add-2007-bl", with explicit handling of: either operand at infinity,
// equal points (routed to the dedicated doubling formula) and mutually-cancelling opposite
// points (same x, negated y -> infinity).
template <class F> GPU_MSM_HD JacobianPoint jacobian_add(const JacobianPoint& p1, const JacobianPoint& p2)
{
    if (jac_is_infinity(p1)) {
        return p2;
    }
    if (jac_is_infinity(p2)) {
        return p1;
    }
    const U256 Z1Z1 = mont_sqr<F>(p1.Z);
    const U256 Z2Z2 = mont_sqr<F>(p2.Z);
    const U256 U1 = mont_mul<F>(p1.X, Z2Z2);
    const U256 U2 = mont_mul<F>(p2.X, Z1Z1);
    const U256 Z1_cubed = mont_mul<F>(p1.Z, Z1Z1);
    const U256 Z2_cubed = mont_mul<F>(p2.Z, Z2Z2);
    const U256 S1 = mont_mul<F>(p1.Y, Z2_cubed);
    const U256 S2 = mont_mul<F>(p2.Y, Z1_cubed);
    const U256 H = sub_mod_p<F>(U2, U1);
    const U256 diff_y = sub_mod_p<F>(S2, S1);
    if (is_zero(H)) {
        if (is_zero(diff_y)) {
            return jacobian_double<F>(p1);
        }
        return jac_identity<F>();
    }
    const U256 I = mont_sqr<F>(double_mod_p<F>(H));
    const U256 J = mont_mul<F>(H, I);
    const U256 r = double_mod_p<F>(diff_y);
    const U256 V = mont_mul<F>(U1, I);
    const U256 X3 = sub_mod_p<F>(sub_mod_p<F>(mont_sqr<F>(r), J), double_mod_p<F>(V));
    const U256 Y3 = sub_mod_p<F>(mont_mul<F>(r, sub_mod_p<F>(V, X3)), double_mod_p<F>(mont_mul<F>(S1, J)));
    const U256 Z1_plus_Z2 = add_mod_p<F>(p1.Z, p2.Z);
    const U256 Z3 = mont_mul<F>(sub_mod_p<F>(sub_mod_p<F>(mont_sqr<F>(Z1_plus_Z2), Z1Z1), Z2Z2), H);
    return JacobianPoint{ X3, Y3, Z3 };
}

// Highest bit index (0-based from the LSB) set anywhere in `a`, or -1 if `a` is zero. Used to
// bound the number of windows a batch needs: a batch whose scalars all fit in a few bits never
// touches the higher windows at all, regardless of window_bits.
GPU_MSM_HD int highest_set_bit(const U256& a)
{
    for (int limb = kLimbs - 1; limb >= 0; limb--) {
        if (a.limb[limb] != 0) {
            uint64_t v = a.limb[limb];
            int bit = 63;
            while (((v >> bit) & 1ULL) == 0) {
                bit--;
            }
            return limb * 64 + bit;
        }
    }
    return -1;
}

// Bucket-Pippenger digit extraction: returns the `window_bits`-wide digit of `scalar` covering
// bits [window*window_bits, window*window_bits + window_bits), correct even when that range
// straddles a 64-bit limb boundary. `window_bits` must be in (0, 64]; callers keep it
// within the supported range (2..16, see msm_cuda.cu). A digit of 0 means "this
// scalar contributes nothing to this window's buckets" -- bucket index 0 is never used.
GPU_MSM_HD uint32_t scalar_window_digit(const U256& scalar, uint32_t window, uint32_t window_bits)
{
    const uint64_t bit_offset = static_cast<uint64_t>(window) * static_cast<uint64_t>(window_bits);
    if (bit_offset >= 256) {
        return 0;
    }
    const uint32_t limb_index = static_cast<uint32_t>(bit_offset / 64);
    const uint32_t bit_in_limb = static_cast<uint32_t>(bit_offset % 64);
    const uint64_t mask = (window_bits >= 64) ? ~0ULL : ((1ULL << window_bits) - 1ULL);
    uint64_t lo = scalar.limb[limb_index] >> bit_in_limb;
    if (bit_in_limb + window_bits > 64 && limb_index + 1 < static_cast<uint32_t>(kLimbs)) {
        lo |= scalar.limb[limb_index + 1] << (64 - bit_in_limb);
    }
    return static_cast<uint32_t>(lo & mask);
}

// Signed-digit recoding of the digit `scalar_window_digit` returns: each window's value d is replaced by
// d + carry_in, and by d + carry_in - 2^window_bits (carry_out = 1) when that is at least
// half = 2^(window_bits - 1). Returns the magnitude in [0, half] and sets `negative`. The carry into
// `window` is decided by the nearest lower window whose digit is not half - 1 (a digit of half - 1
// passes its own carry through), so it is found by a short downward scan, not a pass over all windows.
// The caller must use enough windows that the top window never carries out (top window of at most
// window_bits - 2 bits).
GPU_MSM_HD uint32_t signed_window_digit(const U256& scalar, uint32_t window, uint32_t window_bits, bool& negative)
{
    const uint32_t half = 1u << (window_bits - 1);
    uint32_t carry = 0;
    for (uint32_t j = window; j > 0; j--) {
        const uint32_t lower = scalar_window_digit(scalar, j - 1, window_bits);
        if (lower >= half) {
            carry = 1;
            break;
        }
        if (lower + 1 < half) {
            break;
        }
    }
    const uint32_t value = scalar_window_digit(scalar, window, window_bits) + carry;
    negative = value >= half;
    return negative ? (1u << window_bits) - value : value;
}

// Reduces one window's buckets -- `buckets[1 .. num_buckets - 1]` (bucket 0 is unused: a digit of
// 0 never gets written) -- into that window's contribution to the result:
// sum_{k=1}^{num_buckets-1} k * buckets[k], computed by the standard running-sum technique in
// O(num_buckets) point additions and zero point-scalar multiplications. `buckets` is caller-owned
// storage (a plain pointer, so this performs no allocation of its own); `num_buckets` must be
// >= 1.
template <class F> GPU_MSM_HD JacobianPoint reduce_window_buckets(const JacobianPoint* buckets, uint32_t num_buckets)
{
    JacobianPoint running = jac_identity<F>();
    JacobianPoint total = jac_identity<F>();
    for (uint32_t k = num_buckets - 1; k > 0; k--) {
        running = jacobian_add<F>(running, buckets[k]);
        total = jacobian_add<F>(total, running);
    }
    return total;
}

// Segmented form of reduce_window_buckets, so the reduction of one (column, window) can be spread over
// many threads. Buckets 1 .. num_buckets - 1 are split into segments of `1 << segment_log2` buckets;
// segment s covers [1 + s * L, min(num_buckets, 1 + (s + 1) * L)) with L = 1 << segment_log2. Writing
// lo = 1 + s * L, a segment's running-sum pass yields
//   total_s   = sum_{k in segment} (k - lo + 1) * buckets[k]
//   running_s = sum_{k in segment} buckets[k]
// and sum_{k >= 1} k * buckets[k] = sum_s total_s + L * sum_s s * running_s, which
// combine_segment_reductions evaluates.
GPU_MSM_HD uint32_t reduce_segment_log2(uint32_t window_bits)
{
    return (window_bits + 1) / 2;
}

GPU_MSM_HD uint32_t reduce_segment_count(uint32_t num_buckets, uint32_t segment_log2)
{
    const uint32_t segment_size = 1u << segment_log2;
    return (num_buckets - 1 + segment_size - 1) / segment_size;
}

// Reduces segment `segment` of one window's buckets. Writes running_s through `running_out` and returns
// total_s. `num_buckets` must be >= 2 and `segment` below reduce_segment_count.
template <class F>
GPU_MSM_HD JacobianPoint reduce_bucket_segment(const JacobianPoint* buckets,
                                               uint32_t num_buckets,
                                               uint32_t segment_log2,
                                               uint32_t segment,
                                               JacobianPoint* running_out)
{
    const uint32_t lo = 1 + (segment << segment_log2);
    const uint32_t full_hi = lo + (1u << segment_log2);
    const uint32_t hi = full_hi < num_buckets ? full_hi : num_buckets;
    JacobianPoint running = jac_identity<F>();
    JacobianPoint total = jac_identity<F>();
    for (uint32_t k = hi; k > lo; k--) {
        running = jacobian_add<F>(running, buckets[k - 1]);
        total = jacobian_add<F>(total, running);
    }
    *running_out = running;
    return total;
}

// Combines the per-segment results of one (column, window) into that window's contribution:
// sum_s totals[s] + (1 << segment_log2) * sum_s s * runnings[s].
template <class F>
GPU_MSM_HD JacobianPoint combine_segment_reductions(const JacobianPoint* totals,
                                                    const JacobianPoint* runnings,
                                                    uint32_t num_segments,
                                                    uint32_t segment_log2)
{
    JacobianPoint sum_totals = jac_identity<F>();
    for (uint32_t s = 0; s < num_segments; s++) {
        sum_totals = jacobian_add<F>(sum_totals, totals[s]);
    }
    JacobianPoint running = jac_identity<F>();
    JacobianPoint weighted = jac_identity<F>();
    for (uint32_t s = num_segments - 1; s > 0; s--) {
        running = jacobian_add<F>(running, runnings[s]);
        weighted = jacobian_add<F>(weighted, running);
    }
    for (uint32_t i = 0; i < segment_log2; i++) {
        weighted = jacobian_double<F>(weighted);
    }
    return jacobian_add<F>(sum_totals, weighted);
}

// Combines `num_windows` per-window contributions (window 0 = least significant) into the final
// point: sum_w contributions[w] * 2^(w*window_bits), by Horner's rule from the most significant
// window down, using `window_bits` doublings per step. No per-item or per-window scalar
// multiplication: the 2^(w*window_bits) weighting is entirely repeated doubling of the running
// accumulator.
template <class F>
GPU_MSM_HD JacobianPoint combine_window_contributions(const JacobianPoint* contributions,
                                                      uint32_t num_windows,
                                                      uint32_t window_bits)
{
    JacobianPoint acc = jac_identity<F>();
    for (uint32_t i = 0; i < num_windows; i++) {
        const uint32_t w = num_windows - 1 - i;
        for (uint32_t s = 0; s < window_bits; s++) {
            acc = jacobian_double<F>(acc);
        }
        acc = jacobian_add<F>(acc, contributions[w]);
    }
    return acc;
}

template <class F> GPU_MSM_HD AffinePoint jacobian_to_affine(const JacobianPoint& p)
{
    if (jac_is_infinity(p)) {
        return AffinePoint{ U256{}, U256{}, true };
    }
    const U256 z_inv = field_inverse<F>(p.Z);
    const U256 z_inv2 = mont_sqr<F>(z_inv);
    const U256 z_inv3 = mont_mul<F>(z_inv2, z_inv);
    const U256 x_mont = mont_mul<F>(p.X, z_inv2);
    const U256 y_mont = mont_mul<F>(p.Y, z_inv3);
    return AffinePoint{ x_mont, y_mont, false };
}

template <class F> GPU_MSM_HD JacobianPoint kernel_bucket_term(const AffinePoint& point)
{
    return affine_to_jacobian<F>(point);
}

template <class F> GPU_MSM_HD JacobianPoint kernel_accumulate(const JacobianPoint& acc, const JacobianPoint& term)
{
    return jacobian_add<F>(acc, term);
}

template <class F> GPU_MSM_HD AffinePoint kernel_finalize(const JacobianPoint& acc)
{
    return jacobian_to_affine<F>(acc);
}

} // namespace bb::gpu_msm::kernels
