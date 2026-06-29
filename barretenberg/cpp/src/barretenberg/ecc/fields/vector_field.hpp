#pragma once

// VectorField: holds 5 field elements and processes them per call with a
// batched kernel that interleaves one scalar stream (1 field) with one
// quad-packed SIMD stream (4 fields in i32x4 / i64x2 lanes).
//
// This is a direct C++ port of the `q1s1` / `mix_s1q1` WAT kernels from
//   https://gist.github.com/AztecBot/b8e2e1d5c85d54e10fb34b48461361e0 (Mont-mul)
//   https://gist.github.com/AztecBot/2ad5f310fd0e8a3badda33487f4536ff (add/sub/eq/iz)
//
// Two critical constraints from the gist:
//
// 1. Karatsuba, not schoolbook.
//    Mont-mul splits 9 limbs into 5 (lo) + 4 (hi) and uses three schoolbook
//    products: 5x5 P_lo (25), 4x4 P_hi (16), 5x5 P_cross (25). Total 66 muls
//    in the product phase, NOT 81. Combined with 9 Yuval reductions × 9
//    madConst = 81, total is 66+81 = 147. Schoolbook would have been 81+81 =
//    162. The gist: "it's ~25% of the total runtime."
//
// 2. Op-by-op interleaving.
//    Scalar statement, then equivalent quad statement, then next scalar, etc.
//    Clang preserves source order through its WASM backend, V8 TurboFan sees
//    adjacent different-opcode ops with independent operands, dispatches to
//    separate INT / SIMD pipes.
//
// Storage layout (WASM SIMD path): 9 × 29-bit limbs (R = 2^261)
//
//   alignas(16) uint32_t scalar_data[9];    // one field, 9 × 29-bit limbs in u32.
//                                           // Top 3 bits of each u32 are always 0.
//                                           // Each read zero-extends to u64 at use
//                                           // site (mirroring the gist's
//                                           // `i64.extend_i32_u (i32.load …)`).
//   alignas(16) v128_t   quad_data[9];      // 4 fields × 9 × 29-bit limbs,
//                                           // transposed: lane L of quad_data[k]
//                                           // = field L's u32 limb k
//
// Coarse invariant: each logical field is in [0, 2p) throughout.
//
// Storage layout (fallback): alignas(32) Field elts[5];

#include "barretenberg/ecc/fields/field.hpp"
#include "barretenberg/ecc/fields/field_impl.hpp"
#include "barretenberg/ecc/fields/field_impl_generic.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <type_traits>

#if defined(__wasm_simd128__)
#include <wasm_simd128.h>
#define BB_VECTOR_FIELD_SIMD 1
#else
#define BB_VECTOR_FIELD_SIMD 0
#endif

namespace bb {

// ---------------------------------------------------------------------------
// Compile-time constants derived from Params.
// ---------------------------------------------------------------------------
//
// BN254 Fr's 9 × 29-bit wasm modulus (already in Params::modulus_wasm_*):
//   0x10000001, 0x1f0fac9f, 0x0e5c2450, 0x07d090f3,
//   0x1585d283, 0x02db40c0, 0x00a6e141, 0x0e5c2634, 0x0030644e
//
// twice_modulus_wasm[i] = 2 * modulus_wasm[i], propagated as 29-bit limbs.
// Used for sub's r+2p blend and the TNM trick on add.

template <class Params> inline constexpr std::array<uint64_t, 9> compute_twice_modulus_wasm() noexcept
{
    const std::array<uint64_t, 9> p = { Params::modulus_wasm_0, Params::modulus_wasm_1, Params::modulus_wasm_2,
                                        Params::modulus_wasm_3, Params::modulus_wasm_4, Params::modulus_wasm_5,
                                        Params::modulus_wasm_6, Params::modulus_wasm_7, Params::modulus_wasm_8 };
    std::array<uint64_t, 9> twop{};
    uint64_t carry = 0;
    for (size_t i = 0; i < 9; ++i) {
        uint64_t v = (p[i] << 1) + carry;
        twop[i] = v & 0x1fffffff;
        carry = v >> 29;
    }
    // No carry-out beyond limb 8 for BN254 Fr (2p fits in 9 × 29 bits easily).
    return twop;
}

// 2^261 - 2p (mod 2^261), as 9 × 29-bit limbs. The "TNM" constant for add's
// TNM-blend trick: a + b + TNM overflows 2^261 iff a + b >= 2p, which is the
// exact condition under which we should reduce.
template <class Params> inline constexpr std::array<uint64_t, 9> compute_tnm_wasm() noexcept
{
    const auto twop = compute_twice_modulus_wasm<Params>();
    std::array<uint64_t, 9> tnm{};
    uint64_t carry = 1;
    for (size_t i = 0; i < 9; ++i) {
        uint64_t v = ((~twop[i]) & 0x1fffffff) + carry;
        tnm[i] = v & 0x1fffffff;
        carry = v >> 29;
    }
    return tnm;
}

// Marker trait: specialized to true for each Params whose VectorField has a
// SIMD operator* body (an explicit specialization defined in
// vector_field_wasm.cpp). vectorized_for / vectorized_for_if read this to
// decide whether to take the bulk path. Add a new specialization (below)
// when adding the corresponding operator* body so the gate and the body
// stay in lockstep.
template <class Params> struct has_simd_mont_mul : std::false_type {};
template <class Params> inline constexpr bool has_simd_mont_mul_v = has_simd_mont_mul<Params>::value;

// Per-Params specializations. Forward-declared rather than #include'd so
// vector_field.hpp stays Params-agnostic at the type level; the trait body
// has no member access, only `: std::true_type`.
class Bn254FrParams;
template <> struct has_simd_mont_mul<Bn254FrParams> : std::true_type {};

template <class Params> struct alignas(32) VectorField {
    using Field = field<Params>;
    using scalar_type = Field;
    static constexpr size_t SIZE = 5;

    // load_contiguous, store_contiguous, and the linear-memory ctor read/write
    // raw Field bytes at fixed offsets (+32, +48, ...). Catch any future drift
    // in field<Params>'s layout at compile time instead of as silent corruption
    // at runtime.
    static_assert(sizeof(field<Params>) == 32, "VectorField raw-byte transpose assumes sizeof(field<Params>) == 32");
    static_assert(offsetof(field<Params>, data) == 0,
                  "VectorField raw-byte transpose assumes field::data is at offset 0");

    static constexpr std::array<uint64_t, 9> P_WASM = { Params::modulus_wasm_0, Params::modulus_wasm_1,
                                                        Params::modulus_wasm_2, Params::modulus_wasm_3,
                                                        Params::modulus_wasm_4, Params::modulus_wasm_5,
                                                        Params::modulus_wasm_6, Params::modulus_wasm_7,
                                                        Params::modulus_wasm_8 };
    static constexpr std::array<uint64_t, 9> TWOP_WASM = compute_twice_modulus_wasm<Params>();
    static constexpr std::array<uint64_t, 9> TNM_WASM = compute_tnm_wasm<Params>();
    // -(modulus)^-1 mod 2^29.
    static constexpr uint64_t R_INV_MOD_2_29 = Params::r_inv & 0x1fffffffULL;
    static constexpr std::array<uint64_t, 9> R_INV_WASM = {
        Params::r_inv_wasm_0, Params::r_inv_wasm_1, Params::r_inv_wasm_2, Params::r_inv_wasm_3, Params::r_inv_wasm_4,
        Params::r_inv_wasm_5, Params::r_inv_wasm_6, Params::r_inv_wasm_7, Params::r_inv_wasm_8
    };

    // ---- Storage ----
#if BB_VECTOR_FIELD_SIMD
    // 9 × 29-bit limbs, stored in u32 slots (top 3 bits zero). This matches
    // bb::fr's internal WASM limb layout and compiles scalar-lane reads to the
    // gist's `(i64.extend_i32_u (i32.load offset=… …))` pattern directly.
    alignas(16) uint32_t scalar_data[9];
    // 9 × v128; each v128 holds four u32 slots carrying one limb from each of
    // 4 fields. Top 3 bits of each u32 are zero.
    alignas(16) v128_t quad_data[9];
#else
    alignas(32) Field elts[5];
#endif

    constexpr VectorField() noexcept = default;

    // Construct from 5 field<Params> values. Each is expected to be in the
    // field's internal Montgomery form (R = 2^261 on WASM, R = 2^256 on
    // native).
    explicit VectorField(const std::array<Field, 5>& in) noexcept { store_from_array(in); }

    // Construct from 5 fields linear in memory (lane L = base[L] for L in
    // 0..4). This is the canonical construction path used by the
    // vectorised loop abstraction in place of `gather` — no random-access
    // load, no scalar-pack staging, just a direct AoS→interleaved
    // transpose driven by SIMD shuffles. See the out-of-class definition
    // for the full SIMD pack chain.
    explicit VectorField(const Field* base) noexcept;

    // Write the 5 lanes back to 5 contiguous Fields in memory: base[L] =
    // this->get(L) for L in 0..4. The matching write half of the linear-
    // memory ctor — the loop abstraction calls this in place of `scatter`.
    void store_to(Field* base) const noexcept;

    std::array<Field, 5> to_array() const noexcept
    {
        std::array<Field, 5> out;
        load_to_array(out);
        return out;
    }

    // Test/debug helpers — both pack/unpack the full 5-lane payload. Do not
    // use in hot code. For element-wise access use `to_array()` once and read
    // the result; for write-back use `load_contiguous` / `store_contiguous`.
    Field get(size_t i) const noexcept
    {
        auto a = to_array();
        return a[i];
    }
    void set(size_t i, const Field& v) noexcept
    {
        auto a = to_array();
        a[i] = v;
        store_from_array(a);
    }

    VectorField operator+(const VectorField& other) const noexcept;
    VectorField operator-(const VectorField& other) const noexcept;
    // Under WASM SIMD, operator* is only specialized for Bn254FrParams (see
    // vector_field_wasm.cpp). Instantiating with any other Params under SIMD
    // is a link-time error; gating it at compile time via a requires clause
    // would change the symbol mangling and break the explicit specialization
    // match, so we keep the declaration unconstrained and rely on callers
    // (e.g. `vectorized_for<N, Fr>`) to route non-Bn254 Fr through the
    // scalar path.
    VectorField operator*(const VectorField& other) const noexcept;

    // SLOW PATH — for random-access patterns only. For contiguous loads/stores
    // use `load_contiguous` / `store_contiguous`, which avoid the per-lane
    // scalar pack/unpack and dispatch a single SIMD shuffle.
    //
    // Gather: returns a VectorField whose lane L equals base[idx[L] - offset]. `offset` rebases absolute
    // indices onto `base` (e.g. a polynomial's start_index), applied per-lane rather than as `base - offset`
    // because forming that intermediate pointer is UB ([expr.add]/4) -- it lands before the array even though
    // each base[idx[L] - offset] lands inside it.
    static VectorField gather(const Field* base, std::array<size_t, 5> idx, size_t offset = 0) noexcept
    {
        std::array<Field, 5> tmp{ base[idx[0] - offset],
                                  base[idx[1] - offset],
                                  base[idx[2] - offset],
                                  base[idx[3] - offset],
                                  base[idx[4] - offset] };
        return VectorField(tmp);
    }

    // SLOW PATH — see gather. Writes base[idx[L] - offset] = this->get(L) for L in 0..4.
    void scatter(Field* base, std::array<size_t, 5> idx, size_t offset = 0) const noexcept
    {
        auto a = to_array();
        base[idx[0] - offset] = a[0];
        base[idx[1] - offset] = a[1];
        base[idx[2] - offset] = a[2];
        base[idx[3] - offset] = a[3];
        base[idx[4] - offset] = a[4];
    }

    // Contiguous load: lane L = base[L] for L in 0..4.
    // This is the fast path for vectorized_for<5>(...) bulk iterations where
    // the 5 lanes are always consecutive addresses.
    //
    // Implementation (WASM SIMD, see out-of-class definition below): hand-
    // fused 10 × wasm_v128_load on the raw Fr limb bytes, staged into an
    // aligned 20 × u64 buffer, then pack_4u64_to_9x29 per lane. This beats
    // gather's 20 × scalar random-access loads because V8 coalesces v128
    // loads but not scalar loads at arbitrary addresses.
    //
    // Implementation (fallback): byte-for-byte copy into elts[5].
    static VectorField load_contiguous(const Field* base) noexcept;

    // Contiguous store: writes base[L] = this->get(L) for L in 0..4.
    //
    // Implementation (WASM SIMD, see out-of-class definition below): unpack
    // into a 20 × u64 staging buffer, then emit 10 × wasm_v128_store. Same
    // reasoning as load_contiguous — v128 stores coalesce, scalar stores at
    // gather-scatter addresses don't.
    void store_contiguous(Field* base) const noexcept;

    // Broadcast a single Field to all 5 lanes. Much cheaper than the
    // std::array-of-5 constructor, which re-packs the same value 5 times;
    // this packs once and splats the 9 limbs across the 4 quad lanes.
    static VectorField broadcast(const Field& s) noexcept;

    // Mixed-type operators: broadcast scalar into a VectorField and delegate.
    // [[gnu::always_inline]] is load-bearing under -Oz so the broadcast(s)
    // call hoists out of the caller loop when s is loop-invariant.
    [[gnu::always_inline]] friend VectorField operator+(VectorField v, const Field& s) noexcept
    {
        return v + broadcast(s);
    }
    [[gnu::always_inline]] friend VectorField operator+(const Field& s, VectorField v) noexcept
    {
        return broadcast(s) + v;
    }
    [[gnu::always_inline]] friend VectorField operator-(VectorField v, const Field& s) noexcept
    {
        return v - broadcast(s);
    }
    [[gnu::always_inline]] friend VectorField operator-(const Field& s, VectorField v) noexcept
    {
        return broadcast(s) - v;
    }
    [[gnu::always_inline]] friend VectorField operator*(VectorField v, const Field& s) noexcept
    {
        return v * broadcast(s);
    }
    [[gnu::always_inline]] friend VectorField operator*(const Field& s, VectorField v) noexcept
    {
        return broadcast(s) * v;
    }

    // Returns a 5-bit mask: bit 0 = scalar, bits 1..4 = quad lanes 0..3.
    uint32_t eq(const VectorField& other) const noexcept;
    uint32_t is_zero() const noexcept;

  private:
    void store_from_array(const std::array<Field, 5>& in) noexcept;
    void load_to_array(std::array<Field, 5>& out) const noexcept;
};

// =====================================================================
// Implementation
// =====================================================================

#if BB_VECTOR_FIELD_SIMD

namespace vector_field_detail {

// Joint scalar+quad scheduling barriers. The gist's schedule requires
// per-statement scalar/quad adjacency in the compiled WAT — V8 keeps v128
// live-ranges short only when it sees scalar i64 ops interleaved with v128
// ops on the issue queue. LLVM's WASM backend sees no dependency between
// the two streams and will hoist one before the other absent a barrier.
//
// The "+r" inout form (not input-only) is load-bearing: it makes LLVM treat
// each value as used AND re-defined, which breaks two specific opts:
//   1. Stream-clumping by the instruction scheduler (all i64.mul first,
//      then all i64x2.extmul).
//   2. CSE on `extend_low_u32x4(splat_const)` in the Yuval reductions,
//      which would otherwise collapse 9× fast extmul_low/high_u32x4 to
//      9× slow i64x2.mul.
// Input-only barriers (`asm volatile("" :: "r"(x) : "memory")`) don't force
// re-definition and don't reliably break either. Measured: "+r" → ~30 ns/f,
// input-only → ~33 ns/f.
[[gnu::always_inline]] inline void bb_vf_barrier_sq(uint64_t& s, v128_t& q) noexcept
{
    asm volatile("" : "+r"(s), "+r"(q));
}

[[gnu::always_inline]] inline void bb_vf_barrier_sqq(uint64_t& s, v128_t& q_lo, v128_t& q_hi) noexcept
{
    asm volatile("" : "+r"(s), "+r"(q_lo), "+r"(q_hi));
}

// Pack 4 × u64 (little-endian 256-bit value) into 9 × 29-bit limbs, each stored
// in a u32 slot.
//
// [[gnu::always_inline]] is load-bearing under -Oz: without it, the compiler
// leaves pack/unpack as standalone calls, and the add_scaled hot loop pays
// ~11 call overheads per block.
[[gnu::always_inline]] inline void pack_4u64_to_9x29(const uint64_t in[4], uint32_t out[9]) noexcept
{
    out[0] = static_cast<uint32_t>(in[0] & 0x1fffffff);
    out[1] = static_cast<uint32_t>((in[0] >> 29) & 0x1fffffff);
    out[2] = static_cast<uint32_t>(((in[0] >> 58) & 0x3f) | ((in[1] & 0x7fffff) << 6));
    out[3] = static_cast<uint32_t>((in[1] >> 23) & 0x1fffffff);
    out[4] = static_cast<uint32_t>(((in[1] >> 52) & 0xfff) | ((in[2] & 0x1ffff) << 12));
    out[5] = static_cast<uint32_t>((in[2] >> 17) & 0x1fffffff);
    out[6] = static_cast<uint32_t>(((in[2] >> 46) & 0x3ffff) | ((in[3] & 0x7ff) << 18));
    out[7] = static_cast<uint32_t>((in[3] >> 11) & 0x1fffffff);
    out[8] = static_cast<uint32_t>((in[3] >> 40) & 0x1fffffff);
}

// Unpack 9 × 29-bit limbs (stored in u32 slots) back to 4 × u64. Each input
// lane is zero-extended to u64 before shifting. [[gnu::always_inline]]
// rationale: same as pack_4u64_to_9x29.
[[gnu::always_inline]] inline void unpack_9x29_to_4u64(const uint32_t in[9], uint64_t out[4]) noexcept
{
    const uint64_t i0 = in[0], i1 = in[1], i2 = in[2], i3 = in[3], i4 = in[4];
    const uint64_t i5 = in[5], i6 = in[6], i7 = in[7], i8 = in[8];
    out[0] = i0 | (i1 << 29) | (i2 << 58);
    out[1] = (i2 >> 6) | (i3 << 23) | (i4 << 52);
    out[2] = (i4 >> 12) | (i5 << 17) | (i6 << 46);
    out[3] = (i6 >> 18) | (i7 << 11) | (i8 << 40);
}

} // namespace vector_field_detail

// -------------------- store/load --------------------

template <class Params> inline void VectorField<Params>::store_from_array(const std::array<Field, 5>& in) noexcept
{
    // Scalar lane.
    vector_field_detail::pack_4u64_to_9x29(in[0].data, scalar_data);
    // Quad lanes: transpose 4 fields' 9-limb forms into 9 v128s.
    uint32_t limbs[4][9];
    vector_field_detail::pack_4u64_to_9x29(in[1].data, limbs[0]);
    vector_field_detail::pack_4u64_to_9x29(in[2].data, limbs[1]);
    vector_field_detail::pack_4u64_to_9x29(in[3].data, limbs[2]);
    vector_field_detail::pack_4u64_to_9x29(in[4].data, limbs[3]);
    for (size_t k = 0; k < 9; ++k) {
        quad_data[k] = wasm_i32x4_make(static_cast<int32_t>(limbs[0][k]),
                                       static_cast<int32_t>(limbs[1][k]),
                                       static_cast<int32_t>(limbs[2][k]),
                                       static_cast<int32_t>(limbs[3][k]));
    }
}

template <class Params> inline void VectorField<Params>::load_to_array(std::array<Field, 5>& out) const noexcept
{
    vector_field_detail::unpack_9x29_to_4u64(scalar_data, out[0].data);
    uint32_t limbs[4][9];
    for (size_t k = 0; k < 9; ++k) {
        limbs[0][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 0));
        limbs[1][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 1));
        limbs[2][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 2));
        limbs[3][k] = static_cast<uint32_t>(wasm_i32x4_extract_lane(quad_data[k], 3));
    }
    vector_field_detail::unpack_9x29_to_4u64(limbs[0], out[1].data);
    vector_field_detail::unpack_9x29_to_4u64(limbs[1], out[2].data);
    vector_field_detail::unpack_9x29_to_4u64(limbs[2], out[3].data);
    vector_field_detail::unpack_9x29_to_4u64(limbs[3], out[4].data);
}

// -------------------- broadcast --------------------
//
// Pack once, splat 9 times. Used by VectorField op Field mixed-type ops to
// avoid the 5× pack the std::array constructor would do.

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::broadcast(const Field& s) noexcept
{
    VectorField result;
    vector_field_detail::pack_4u64_to_9x29(s.data, result.scalar_data);
    for (size_t k = 0; k < 9; ++k) {
        result.quad_data[k] = wasm_i32x4_splat(static_cast<int32_t>(result.scalar_data[k]));
    }
    return result;
}

// -------------------- load_contiguous / store_contiguous --------------------
//
// Fast path for `vectorized_for<5>` bulk iterations: the 5 lanes always live
// at consecutive Fr addresses, so we can transpose AoS → 9×29 interleaved
// using only SIMD ops — no scalar pack and no staging round-trip through
// memory.
//
// AoS layout (each Fr is 8 × u32 LE = 32 B): load 8 v128 (4 fields × 2 v128
// per Fr), run two 4×4 i32 transposes (one over the four `lo` halves, one
// over the four `hi` halves) so lane L of IN[m] = field (L+1)'s u32 chunk
// m. Each 29-bit limb is then assembled in pure i32x4 ops (limbs 1..7 cost
// 4 ops each, limbs 0 and 8 one each). Field 0 → scalar slot via the
// standard scalar pack.
//
// i32x4 (current) beats an i64x2 pair-pack: one transpose covers all 4
// quad fields, and no i64x2→i32x4 lane-merging at the end.

namespace vector_field_detail {

// 4×4 i32 transpose. Given 4 i32x4 vectors with logical layout:
//   row0 = { a0, a1, a2, a3 }
//   row1 = { b0, b1, b2, b3 }
//   row2 = { c0, c1, c2, c3 }
//   row3 = { d0, d1, d2, d3 }
// produce:
//   col0 = { a0, b0, c0, d0 }   col1 = { a1, b1, c1, d1 }
//   col2 = { a2, b2, c2, d2 }   col3 = { a3, b3, c3, d3 }
// in 8 i32x4 shuffles.
[[gnu::always_inline]] inline void transpose_4x4_i32x4(
    v128_t r0, v128_t r1, v128_t r2, v128_t r3, v128_t& c0, v128_t& c1, v128_t& c2, v128_t& c3) noexcept
{
    const v128_t t0 = wasm_i32x4_shuffle(r0, r1, 0, 4, 1, 5); // {a0,b0,a1,b1}
    const v128_t t1 = wasm_i32x4_shuffle(r0, r1, 2, 6, 3, 7); // {a2,b2,a3,b3}
    const v128_t t2 = wasm_i32x4_shuffle(r2, r3, 0, 4, 1, 5); // {c0,d0,c1,d1}
    const v128_t t3 = wasm_i32x4_shuffle(r2, r3, 2, 6, 3, 7); // {c2,d2,c3,d3}
    c0 = wasm_i32x4_shuffle(t0, t2, 0, 1, 4, 5);              // {a0,b0,c0,d0}
    c1 = wasm_i32x4_shuffle(t0, t2, 2, 3, 6, 7);              // {a1,b1,c1,d1}
    c2 = wasm_i32x4_shuffle(t1, t3, 0, 1, 4, 5);              // {a2,b2,c2,d2}
    c3 = wasm_i32x4_shuffle(t1, t3, 2, 3, 6, 7);              // {a3,b3,c3,d3}
}

} // namespace vector_field_detail

template <class Params> [[gnu::always_inline]] inline VectorField<Params>::VectorField(const Field* base) noexcept
{
    // Field 0 → scalar slot (plain scalar pack on the raw u64 limbs).
    vector_field_detail::pack_4u64_to_9x29(base[0].data, scalar_data);

    // Fields 1..4 → quad lanes via a single i32x4 transpose-then-pack chain.
    const uint8_t* p = reinterpret_cast<const uint8_t*>(base);
    const v128_t f1_lo = wasm_v128_load(p + 32);
    const v128_t f1_hi = wasm_v128_load(p + 48);
    const v128_t f2_lo = wasm_v128_load(p + 64);
    const v128_t f2_hi = wasm_v128_load(p + 80);
    const v128_t f3_lo = wasm_v128_load(p + 96);
    const v128_t f3_hi = wasm_v128_load(p + 112);
    const v128_t f4_lo = wasm_v128_load(p + 128);
    const v128_t f4_hi = wasm_v128_load(p + 144);

    // Two 4×4 transposes (8 + 8 shuffles). After this, lane L of IN[m]
    // holds field (L+1)'s u32 chunk m for m in 0..7.
    v128_t IN0, IN1, IN2, IN3, IN4, IN5, IN6, IN7;
    vector_field_detail::transpose_4x4_i32x4(f1_lo, f2_lo, f3_lo, f4_lo, IN0, IN1, IN2, IN3);
    vector_field_detail::transpose_4x4_i32x4(f1_hi, f2_hi, f3_hi, f4_hi, IN4, IN5, IN6, IN7);

    // 29-bit limb assembly. Each 29-bit limb k spans bits [29k .. 29k+28] of
    // the 256-bit number. Within an 8 × u32 representation the boundary
    // 29k mod 32 / 29k / 32 lookup is:
    //
    //   limb   bit-range        u32 chunk   lo-shift   hi-shift   bits-from-hi
    //     0    [  0 ..  28]     IN0          0          —         0
    //     1    [ 29 ..  57]     IN0/IN1     29           3        26
    //     2    [ 58 ..  86]     IN1/IN2     26           6        23
    //     3    [ 87 .. 115]     IN2/IN3     23           9        20
    //     4    [116 .. 144]     IN3/IN4     20          12        17
    //     5    [145 .. 173]     IN4/IN5     17          15        14
    //     6    [174 .. 202]     IN5/IN6     14          18        11
    //     7    [203 .. 231]     IN6/IN7     11          21         8
    //     8    [232 .. 260]     IN7          8          —         0  (24-bit max)
    //
    // For limbs 1..7 we compute `((lo >> lo_shift) | (hi << hi_shift)) & MASK29`.
    // The trailing AND lets us skip masking the source `hi`.
    const v128_t MASK29 = wasm_i32x4_splat(0x1fffffff);
    quad_data[0] = wasm_v128_and(IN0, MASK29);
    quad_data[1] = wasm_v128_and(wasm_v128_or(wasm_u32x4_shr(IN0, 29), wasm_i32x4_shl(IN1, 3)), MASK29);
    quad_data[2] = wasm_v128_and(wasm_v128_or(wasm_u32x4_shr(IN1, 26), wasm_i32x4_shl(IN2, 6)), MASK29);
    quad_data[3] = wasm_v128_and(wasm_v128_or(wasm_u32x4_shr(IN2, 23), wasm_i32x4_shl(IN3, 9)), MASK29);
    quad_data[4] = wasm_v128_and(wasm_v128_or(wasm_u32x4_shr(IN3, 20), wasm_i32x4_shl(IN4, 12)), MASK29);
    quad_data[5] = wasm_v128_and(wasm_v128_or(wasm_u32x4_shr(IN4, 17), wasm_i32x4_shl(IN5, 15)), MASK29);
    quad_data[6] = wasm_v128_and(wasm_v128_or(wasm_u32x4_shr(IN5, 14), wasm_i32x4_shl(IN6, 18)), MASK29);
    quad_data[7] = wasm_v128_and(wasm_v128_or(wasm_u32x4_shr(IN6, 11), wasm_i32x4_shl(IN7, 21)), MASK29);
    // limb 8: top 24 bits of IN7, no mask needed (BN254 Fr coarse form is
    // < 2 * p < 2^255, so the top u32 has at most 23 set bits and bits
    // 24..31 are zero; shifting right by 8 leaves at most 24 bits set).
    quad_data[8] = wasm_u32x4_shr(IN7, 8);
}

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::load_contiguous(const Field* base) noexcept
{
    return VectorField(base);
}

template <class Params>
[[gnu::always_inline]] inline void VectorField<Params>::store_contiguous(Field* base) const noexcept
{
    // Field 0 ← scalar slot.
    vector_field_detail::unpack_9x29_to_4u64(scalar_data, base[0].data);

    // Fields 1..4 ← quad lanes. Inverse of the load:
    //   1. Reassemble each output u32 chunk as i32x4 (lane L = field (L+1)'s
    //      chunk m), splicing two adjacent 29-bit limbs.
    //   2. Run two 4×4 i32 transposes to demux the 8 chunks back into one
    //      lo + hi v128 per Fr.
    //
    // u32 chunk → 29-bit limb mapping (inverse of the load table):
    //
    //   chunk   bit-range      from limbs   lo>>shift   hi<<shift
    //     0     [  0 ..  31]   l0/l1          0           29
    //     1     [ 32 ..  63]   l1/l2          3           26
    //     2     [ 64 ..  95]   l2/l3          6           23
    //     3     [ 96 .. 127]   l3/l4          9           20
    //     4     [128 .. 159]   l4/l5         12           17
    //     5     [160 .. 191]   l5/l6         15           14
    //     6     [192 .. 223]   l6/l7         18           11
    //     7     [224 .. 255]   l7/l8         21            8
    //
    // No mask needed on the result: each (limb >> hi_shift) << shift_lo cannot
    // exceed 32 bits because we shift the incoming 29-bit limb left by ≤21
    // and OR it on top of bits ≤21 of the running u32 — bit 32 is never set.

    const v128_t l0 = quad_data[0], l1 = quad_data[1], l2 = quad_data[2];
    const v128_t l3 = quad_data[3], l4 = quad_data[4], l5 = quad_data[5];
    const v128_t l6 = quad_data[6], l7 = quad_data[7], l8 = quad_data[8];

    const v128_t OUT0 = wasm_v128_or(l0, wasm_i32x4_shl(l1, 29));
    const v128_t OUT1 = wasm_v128_or(wasm_u32x4_shr(l1, 3), wasm_i32x4_shl(l2, 26));
    const v128_t OUT2 = wasm_v128_or(wasm_u32x4_shr(l2, 6), wasm_i32x4_shl(l3, 23));
    const v128_t OUT3 = wasm_v128_or(wasm_u32x4_shr(l3, 9), wasm_i32x4_shl(l4, 20));
    const v128_t OUT4 = wasm_v128_or(wasm_u32x4_shr(l4, 12), wasm_i32x4_shl(l5, 17));
    const v128_t OUT5 = wasm_v128_or(wasm_u32x4_shr(l5, 15), wasm_i32x4_shl(l6, 14));
    const v128_t OUT6 = wasm_v128_or(wasm_u32x4_shr(l6, 18), wasm_i32x4_shl(l7, 11));
    const v128_t OUT7 = wasm_v128_or(wasm_u32x4_shr(l7, 21), wasm_i32x4_shl(l8, 8));

    // 4×4 transpose of (OUT0..3) → (f1_lo, f2_lo, f3_lo, f4_lo).
    // 4×4 transpose of (OUT4..7) → (f1_hi, f2_hi, f3_hi, f4_hi).
    v128_t f1_lo, f2_lo, f3_lo, f4_lo, f1_hi, f2_hi, f3_hi, f4_hi;
    vector_field_detail::transpose_4x4_i32x4(OUT0, OUT1, OUT2, OUT3, f1_lo, f2_lo, f3_lo, f4_lo);
    vector_field_detail::transpose_4x4_i32x4(OUT4, OUT5, OUT6, OUT7, f1_hi, f2_hi, f3_hi, f4_hi);

    uint8_t* dst = reinterpret_cast<uint8_t*>(base);
    wasm_v128_store(dst + 32, f1_lo);
    wasm_v128_store(dst + 48, f1_hi);
    wasm_v128_store(dst + 64, f2_lo);
    wasm_v128_store(dst + 80, f2_hi);
    wasm_v128_store(dst + 96, f3_lo);
    wasm_v128_store(dst + 112, f3_hi);
    wasm_v128_store(dst + 128, f4_lo);
    wasm_v128_store(dst + 144, f4_hi);
}

// Linear-memory store paired with the linear-memory ctor above.
// `store_contiguous` is the canonical writer; `store_to` is the matching
// member-named entry point used by the loop abstraction.
template <class Params> [[gnu::always_inline]] inline void VectorField<Params>::store_to(Field* base) const noexcept
{
    store_contiguous(base);
}

// -------------------- operator+ (coarse form, 9x29 limbs) --------------------
//
// Two independent chains (the "TNM trick"):
//   r[k]  = a[k] + b[k] (+ carry from r[k-1])                ; raw add
//   t[k]  = r[k] + TNM[k] (+ carry from t[k-1])              ; independent chain
//   if t produces a final carry (i.e., a+b >= 2p) use t, else use r.
//
// Interleaved scalar / quad. Each 29-bit limb + 29-bit limb + 1 <= 30 bits so
// carries fit in bit 29.

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator+(
    const VectorField& other) const noexcept
{
    constexpr uint64_t MASK = 0x1fffffffULL;
    const v128_t mask_splat = wasm_i32x4_splat(MASK);

    VectorField result;

    // --- r chain: r = a + b with carry, limbs 0..8 ---
    uint64_t sr0 = scalar_data[0] + other.scalar_data[0];
    v128_t qr0 = wasm_i32x4_add(quad_data[0], other.quad_data[0]);
    uint64_t scarry = sr0 >> 29;
    v128_t qcarry = wasm_u32x4_shr(qr0, 29);
    sr0 &= MASK;
    qr0 = wasm_v128_and(qr0, mask_splat);

    uint64_t sr1 = scalar_data[1] + other.scalar_data[1] + scarry;
    v128_t qr1 = wasm_i32x4_add(wasm_i32x4_add(quad_data[1], other.quad_data[1]), qcarry);
    scarry = sr1 >> 29;
    qcarry = wasm_u32x4_shr(qr1, 29);
    sr1 &= MASK;
    qr1 = wasm_v128_and(qr1, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr1, qr1, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr2 = scalar_data[2] + other.scalar_data[2] + scarry;
    v128_t qr2 = wasm_i32x4_add(wasm_i32x4_add(quad_data[2], other.quad_data[2]), qcarry);
    scarry = sr2 >> 29;
    qcarry = wasm_u32x4_shr(qr2, 29);
    sr2 &= MASK;
    qr2 = wasm_v128_and(qr2, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr2, qr2, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr3 = scalar_data[3] + other.scalar_data[3] + scarry;
    v128_t qr3 = wasm_i32x4_add(wasm_i32x4_add(quad_data[3], other.quad_data[3]), qcarry);
    scarry = sr3 >> 29;
    qcarry = wasm_u32x4_shr(qr3, 29);
    sr3 &= MASK;
    qr3 = wasm_v128_and(qr3, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr3, qr3, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr4 = scalar_data[4] + other.scalar_data[4] + scarry;
    v128_t qr4 = wasm_i32x4_add(wasm_i32x4_add(quad_data[4], other.quad_data[4]), qcarry);
    scarry = sr4 >> 29;
    qcarry = wasm_u32x4_shr(qr4, 29);
    sr4 &= MASK;
    qr4 = wasm_v128_and(qr4, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr4, qr4, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr5 = scalar_data[5] + other.scalar_data[5] + scarry;
    v128_t qr5 = wasm_i32x4_add(wasm_i32x4_add(quad_data[5], other.quad_data[5]), qcarry);
    scarry = sr5 >> 29;
    qcarry = wasm_u32x4_shr(qr5, 29);
    sr5 &= MASK;
    qr5 = wasm_v128_and(qr5, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr5, qr5, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr6 = scalar_data[6] + other.scalar_data[6] + scarry;
    v128_t qr6 = wasm_i32x4_add(wasm_i32x4_add(quad_data[6], other.quad_data[6]), qcarry);
    scarry = sr6 >> 29;
    qcarry = wasm_u32x4_shr(qr6, 29);
    sr6 &= MASK;
    qr6 = wasm_v128_and(qr6, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr6, qr6, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr7 = scalar_data[7] + other.scalar_data[7] + scarry;
    v128_t qr7 = wasm_i32x4_add(wasm_i32x4_add(quad_data[7], other.quad_data[7]), qcarry);
    scarry = sr7 >> 29;
    qcarry = wasm_u32x4_shr(qr7, 29);
    sr7 &= MASK;
    qr7 = wasm_v128_and(qr7, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(sr7, qr7, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t sr8 = scalar_data[8] + other.scalar_data[8] + scarry;
    v128_t qr8 = wasm_i32x4_add(wasm_i32x4_add(quad_data[8], other.quad_data[8]), qcarry);
    // No carry out of limb 8 for coarse inputs + add (result < 2 * 2p < 2^261).

    // --- t chain: t = r + TNM with carry, limbs 0..8 ---
    uint64_t st0 = sr0 + TNM_WASM[0];
    v128_t qt0 = wasm_i32x4_add(qr0, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[0])));
    scarry = st0 >> 29;
    qcarry = wasm_u32x4_shr(qt0, 29);
    st0 &= MASK;
    qt0 = wasm_v128_and(qt0, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st0, qt0, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st1 = sr1 + TNM_WASM[1] + scarry;
    v128_t qt1 = wasm_i32x4_add(wasm_i32x4_add(qr1, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[1]))), qcarry);
    scarry = st1 >> 29;
    qcarry = wasm_u32x4_shr(qt1, 29);
    st1 &= MASK;
    qt1 = wasm_v128_and(qt1, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st1, qt1, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st2 = sr2 + TNM_WASM[2] + scarry;
    v128_t qt2 = wasm_i32x4_add(wasm_i32x4_add(qr2, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[2]))), qcarry);
    scarry = st2 >> 29;
    qcarry = wasm_u32x4_shr(qt2, 29);
    st2 &= MASK;
    qt2 = wasm_v128_and(qt2, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st2, qt2, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st3 = sr3 + TNM_WASM[3] + scarry;
    v128_t qt3 = wasm_i32x4_add(wasm_i32x4_add(qr3, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[3]))), qcarry);
    scarry = st3 >> 29;
    qcarry = wasm_u32x4_shr(qt3, 29);
    st3 &= MASK;
    qt3 = wasm_v128_and(qt3, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st3, qt3, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st4 = sr4 + TNM_WASM[4] + scarry;
    v128_t qt4 = wasm_i32x4_add(wasm_i32x4_add(qr4, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[4]))), qcarry);
    scarry = st4 >> 29;
    qcarry = wasm_u32x4_shr(qt4, 29);
    st4 &= MASK;
    qt4 = wasm_v128_and(qt4, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st4, qt4, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st5 = sr5 + TNM_WASM[5] + scarry;
    v128_t qt5 = wasm_i32x4_add(wasm_i32x4_add(qr5, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[5]))), qcarry);
    scarry = st5 >> 29;
    qcarry = wasm_u32x4_shr(qt5, 29);
    st5 &= MASK;
    qt5 = wasm_v128_and(qt5, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st5, qt5, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st6 = sr6 + TNM_WASM[6] + scarry;
    v128_t qt6 = wasm_i32x4_add(wasm_i32x4_add(qr6, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[6]))), qcarry);
    scarry = st6 >> 29;
    qcarry = wasm_u32x4_shr(qt6, 29);
    st6 &= MASK;
    qt6 = wasm_v128_and(qt6, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st6, qt6, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st7 = sr7 + TNM_WASM[7] + scarry;
    v128_t qt7 = wasm_i32x4_add(wasm_i32x4_add(qr7, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[7]))), qcarry);
    scarry = st7 >> 29;
    qcarry = wasm_u32x4_shr(qt7, 29);
    st7 &= MASK;
    qt7 = wasm_v128_and(qt7, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(st7, qt7, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t st8 = sr8 + TNM_WASM[8] + scarry;
    v128_t qt8 = wasm_i32x4_add(wasm_i32x4_add(qr8, wasm_i32x4_splat(static_cast<int32_t>(TNM_WASM[8]))), qcarry);
    // Top-limb carry: if t8 >= 2^29, a+b >= 2p — pick t (reduced). Else pick r.
    const uint64_t sc_final = st8 >> 29;
    const v128_t qc_final = wasm_u32x4_shr(qt8, 29);
    st8 &= MASK;
    qt8 = wasm_v128_and(qt8, mask_splat);

    // Blend: sc_final nonzero => pick t.
    const uint64_t smask = 0ULL - sc_final;
    // qc_final is 0/1 per lane; turn into 0 / all-ones via compare-not-equal-0.
    // Using i32x4_eq (qc_final, 1) = all-ones if lane is 1, which is correct.
    const v128_t qmask = wasm_i32x4_eq(qc_final, wasm_i32x4_splat(1));
    const uint64_t simask = ~smask;

    result.scalar_data[0] = static_cast<uint32_t>((sr0 & simask) | (st0 & smask));
    result.quad_data[0] = wasm_v128_bitselect(qt0, qr0, qmask);
    result.scalar_data[1] = static_cast<uint32_t>((sr1 & simask) | (st1 & smask));
    result.quad_data[1] = wasm_v128_bitselect(qt1, qr1, qmask);
    result.scalar_data[2] = static_cast<uint32_t>((sr2 & simask) | (st2 & smask));
    result.quad_data[2] = wasm_v128_bitselect(qt2, qr2, qmask);
    result.scalar_data[3] = static_cast<uint32_t>((sr3 & simask) | (st3 & smask));
    result.quad_data[3] = wasm_v128_bitselect(qt3, qr3, qmask);
    result.scalar_data[4] = static_cast<uint32_t>((sr4 & simask) | (st4 & smask));
    result.quad_data[4] = wasm_v128_bitselect(qt4, qr4, qmask);
    result.scalar_data[5] = static_cast<uint32_t>((sr5 & simask) | (st5 & smask));
    result.quad_data[5] = wasm_v128_bitselect(qt5, qr5, qmask);
    result.scalar_data[6] = static_cast<uint32_t>((sr6 & simask) | (st6 & smask));
    result.quad_data[6] = wasm_v128_bitselect(qt6, qr6, qmask);
    result.scalar_data[7] = static_cast<uint32_t>((sr7 & simask) | (st7 & smask));
    result.quad_data[7] = wasm_v128_bitselect(qt7, qr7, qmask);
    result.scalar_data[8] = static_cast<uint32_t>((sr8 & simask) | (st8 & smask));
    result.quad_data[8] = wasm_v128_bitselect(qt8, qr8, qmask);

    return result;
}

// -------------------- operator- (coarse form, 9x29 limbs) --------------------
//
// Two chains:
//   r = a - b    (may go negative)
//   s = r + 2p   (always in [0, 4p))
// If final borrow from r is set, pick s; else pick r.

template <class Params>
[[gnu::always_inline]] inline VectorField<Params> VectorField<Params>::operator-(
    const VectorField& other) const noexcept
{
    constexpr uint64_t MASK = 0x1fffffffULL;
    const v128_t mask_splat = wasm_i32x4_splat(MASK);

    VectorField result;

    // Strategy: keep the r chain fully in i32x4 space (no i64x2 transitions).
    // - For limb 0, compute sub and borrow from underflow.
    // - Represent quad borrow as an i32x4 "0 or 1" value.
    // - Subsequent limbs: r[k] = a[k] - b[k] - borrow, mask to 29 bits,
    //   borrow_out = 1 iff underflow. Detect underflow via the top bit (bit 31)
    //   of the raw subtract result, since 29-bit values keep bits 29..31 clear
    //   and underflow sets them.

    // Limb 0.
    int64_t sdiff0 = static_cast<int64_t>(scalar_data[0]) - static_cast<int64_t>(other.scalar_data[0]);
    v128_t qdiff0 = wasm_i32x4_sub(quad_data[0], other.quad_data[0]);
    uint64_t sr0 = static_cast<uint64_t>(sdiff0) & MASK;
    v128_t qr0 = wasm_v128_and(qdiff0, mask_splat);
    // Borrow: scalar 0 or 1; quad: 1 per lane if underflow (top bit of i32 set).
    int64_t sborrow = (sdiff0 < 0) ? 1 : 0;
    v128_t qborrow = wasm_u32x4_shr(qdiff0, 31);

    // Limb 1.
    int64_t sdiff1 = static_cast<int64_t>(scalar_data[1]) - static_cast<int64_t>(other.scalar_data[1]) - sborrow;
    v128_t qdiff1 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[1], other.quad_data[1]), qborrow);
    uint64_t sr1 = static_cast<uint64_t>(sdiff1) & MASK;
    v128_t qr1 = wasm_v128_and(qdiff1, mask_splat);
    sborrow = (sdiff1 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff1, 31);
    vector_field_detail::bb_vf_barrier_sq(sr1, qr1);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff2 = static_cast<int64_t>(scalar_data[2]) - static_cast<int64_t>(other.scalar_data[2]) - sborrow;
    v128_t qdiff2 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[2], other.quad_data[2]), qborrow);
    uint64_t sr2 = static_cast<uint64_t>(sdiff2) & MASK;
    v128_t qr2 = wasm_v128_and(qdiff2, mask_splat);
    sborrow = (sdiff2 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff2, 31);
    vector_field_detail::bb_vf_barrier_sq(sr2, qr2);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff3 = static_cast<int64_t>(scalar_data[3]) - static_cast<int64_t>(other.scalar_data[3]) - sborrow;
    v128_t qdiff3 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[3], other.quad_data[3]), qborrow);
    uint64_t sr3 = static_cast<uint64_t>(sdiff3) & MASK;
    v128_t qr3 = wasm_v128_and(qdiff3, mask_splat);
    sborrow = (sdiff3 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff3, 31);
    vector_field_detail::bb_vf_barrier_sq(sr3, qr3);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff4 = static_cast<int64_t>(scalar_data[4]) - static_cast<int64_t>(other.scalar_data[4]) - sborrow;
    v128_t qdiff4 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[4], other.quad_data[4]), qborrow);
    uint64_t sr4 = static_cast<uint64_t>(sdiff4) & MASK;
    v128_t qr4 = wasm_v128_and(qdiff4, mask_splat);
    sborrow = (sdiff4 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff4, 31);
    vector_field_detail::bb_vf_barrier_sq(sr4, qr4);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff5 = static_cast<int64_t>(scalar_data[5]) - static_cast<int64_t>(other.scalar_data[5]) - sborrow;
    v128_t qdiff5 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[5], other.quad_data[5]), qborrow);
    uint64_t sr5 = static_cast<uint64_t>(sdiff5) & MASK;
    v128_t qr5 = wasm_v128_and(qdiff5, mask_splat);
    sborrow = (sdiff5 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff5, 31);
    vector_field_detail::bb_vf_barrier_sq(sr5, qr5);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff6 = static_cast<int64_t>(scalar_data[6]) - static_cast<int64_t>(other.scalar_data[6]) - sborrow;
    v128_t qdiff6 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[6], other.quad_data[6]), qborrow);
    uint64_t sr6 = static_cast<uint64_t>(sdiff6) & MASK;
    v128_t qr6 = wasm_v128_and(qdiff6, mask_splat);
    sborrow = (sdiff6 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff6, 31);
    vector_field_detail::bb_vf_barrier_sq(sr6, qr6);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff7 = static_cast<int64_t>(scalar_data[7]) - static_cast<int64_t>(other.scalar_data[7]) - sborrow;
    v128_t qdiff7 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[7], other.quad_data[7]), qborrow);
    uint64_t sr7 = static_cast<uint64_t>(sdiff7) & MASK;
    v128_t qr7 = wasm_v128_and(qdiff7, mask_splat);
    sborrow = (sdiff7 < 0) ? 1 : 0;
    qborrow = wasm_u32x4_shr(qdiff7, 31);
    vector_field_detail::bb_vf_barrier_sq(sr7, qr7);
    asm volatile("" : "+r"(sborrow), "+r"(qborrow));

    int64_t sdiff8 = static_cast<int64_t>(scalar_data[8]) - static_cast<int64_t>(other.scalar_data[8]) - sborrow;
    v128_t qdiff8 = wasm_i32x4_sub(wasm_i32x4_sub(quad_data[8], other.quad_data[8]), qborrow);
    uint64_t sr8 = static_cast<uint64_t>(sdiff8) & MASK;
    v128_t qr8 = wasm_v128_and(qdiff8, mask_splat);
    // Final borrow — this is what decides whether to add 2p.
    const uint64_t s_final_borrow = (sdiff8 < 0) ? 1 : 0;
    const v128_t q_final_borrow_i32 = wasm_u32x4_shr(qdiff8, 31); // 0 or 1 per lane
    // q_final_borrow_mask: all-ones per lane if borrow set, else 0.
    const v128_t q_final_borrow_mask = wasm_i32x4_eq(q_final_borrow_i32, wasm_i32x4_splat(1));

    // s = r + 2p chain (scalar + quad interleaved).
    uint64_t ss0 = sr0 + TWOP_WASM[0];
    v128_t qs0 = wasm_i32x4_add(qr0, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[0])));
    uint64_t scarry = ss0 >> 29;
    v128_t qcarry = wasm_u32x4_shr(qs0, 29);
    ss0 &= MASK;
    qs0 = wasm_v128_and(qs0, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss0, qs0, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss1 = sr1 + TWOP_WASM[1] + scarry;
    v128_t qs1 = wasm_i32x4_add(wasm_i32x4_add(qr1, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[1]))), qcarry);
    scarry = ss1 >> 29;
    qcarry = wasm_u32x4_shr(qs1, 29);
    ss1 &= MASK;
    qs1 = wasm_v128_and(qs1, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss1, qs1, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss2 = sr2 + TWOP_WASM[2] + scarry;
    v128_t qs2 = wasm_i32x4_add(wasm_i32x4_add(qr2, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[2]))), qcarry);
    scarry = ss2 >> 29;
    qcarry = wasm_u32x4_shr(qs2, 29);
    ss2 &= MASK;
    qs2 = wasm_v128_and(qs2, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss2, qs2, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss3 = sr3 + TWOP_WASM[3] + scarry;
    v128_t qs3 = wasm_i32x4_add(wasm_i32x4_add(qr3, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[3]))), qcarry);
    scarry = ss3 >> 29;
    qcarry = wasm_u32x4_shr(qs3, 29);
    ss3 &= MASK;
    qs3 = wasm_v128_and(qs3, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss3, qs3, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss4 = sr4 + TWOP_WASM[4] + scarry;
    v128_t qs4 = wasm_i32x4_add(wasm_i32x4_add(qr4, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[4]))), qcarry);
    scarry = ss4 >> 29;
    qcarry = wasm_u32x4_shr(qs4, 29);
    ss4 &= MASK;
    qs4 = wasm_v128_and(qs4, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss4, qs4, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss5 = sr5 + TWOP_WASM[5] + scarry;
    v128_t qs5 = wasm_i32x4_add(wasm_i32x4_add(qr5, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[5]))), qcarry);
    scarry = ss5 >> 29;
    qcarry = wasm_u32x4_shr(qs5, 29);
    ss5 &= MASK;
    qs5 = wasm_v128_and(qs5, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss5, qs5, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss6 = sr6 + TWOP_WASM[6] + scarry;
    v128_t qs6 = wasm_i32x4_add(wasm_i32x4_add(qr6, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[6]))), qcarry);
    scarry = ss6 >> 29;
    qcarry = wasm_u32x4_shr(qs6, 29);
    ss6 &= MASK;
    qs6 = wasm_v128_and(qs6, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss6, qs6, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss7 = sr7 + TWOP_WASM[7] + scarry;
    v128_t qs7 = wasm_i32x4_add(wasm_i32x4_add(qr7, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[7]))), qcarry);
    scarry = ss7 >> 29;
    qcarry = wasm_u32x4_shr(qs7, 29);
    ss7 &= MASK;
    qs7 = wasm_v128_and(qs7, mask_splat);
    vector_field_detail::bb_vf_barrier_sqq(ss7, qs7, qcarry);
    asm volatile("" : "+r"(scarry));

    uint64_t ss8 = sr8 + TWOP_WASM[8] + scarry;
    v128_t qs8 = wasm_i32x4_add(wasm_i32x4_add(qr8, wasm_i32x4_splat(static_cast<int32_t>(TWOP_WASM[8]))), qcarry);
    ss8 &= MASK;
    qs8 = wasm_v128_and(qs8, mask_splat);

    // Blend on final borrow: borrow set => pick s.
    const uint64_t smask = 0ULL - s_final_borrow;
    const uint64_t simask = ~smask;
    const v128_t qmask = q_final_borrow_mask;

    result.scalar_data[0] = static_cast<uint32_t>((sr0 & simask) | (ss0 & smask));
    result.quad_data[0] = wasm_v128_bitselect(qs0, qr0, qmask);
    result.scalar_data[1] = static_cast<uint32_t>((sr1 & simask) | (ss1 & smask));
    result.quad_data[1] = wasm_v128_bitselect(qs1, qr1, qmask);
    result.scalar_data[2] = static_cast<uint32_t>((sr2 & simask) | (ss2 & smask));
    result.quad_data[2] = wasm_v128_bitselect(qs2, qr2, qmask);
    result.scalar_data[3] = static_cast<uint32_t>((sr3 & simask) | (ss3 & smask));
    result.quad_data[3] = wasm_v128_bitselect(qs3, qr3, qmask);
    result.scalar_data[4] = static_cast<uint32_t>((sr4 & simask) | (ss4 & smask));
    result.quad_data[4] = wasm_v128_bitselect(qs4, qr4, qmask);
    result.scalar_data[5] = static_cast<uint32_t>((sr5 & simask) | (ss5 & smask));
    result.quad_data[5] = wasm_v128_bitselect(qs5, qr5, qmask);
    result.scalar_data[6] = static_cast<uint32_t>((sr6 & simask) | (ss6 & smask));
    result.quad_data[6] = wasm_v128_bitselect(qs6, qr6, qmask);
    result.scalar_data[7] = static_cast<uint32_t>((sr7 & simask) | (ss7 & smask));
    result.quad_data[7] = wasm_v128_bitselect(qs7, qr7, qmask);
    result.scalar_data[8] = static_cast<uint32_t>((sr8 & simask) | (ss8 & smask));
    result.quad_data[8] = wasm_v128_bitselect(qs8, qr8, qmask);

    return result;
}

// -------------------- eq / is_zero (coarse form, 9x29 limbs) --------------------
//
// Coarse-form equality trick: two elements are equal iff their difference d
// satisfies d == 0 or d == p (in 9 x 29-bit form). We compute d = a - b and
// OR-reduce the limbs both as-is (for d == 0) and XOR'd with p (for d == p).
//
// To avoid slow per-lane extract_lane calls, we use wasm_i32x4_bitmask to turn
// a 4-lane all-ones/zero compare into a 4-bit integer mask in one instruction.

template <class Params>
[[gnu::always_inline]] inline uint32_t VectorField<Params>::eq(const VectorField& other) const noexcept
{
    const VectorField d = (*this) - other;

    // Scalar + quad OR-reductions interleaved. Two parallel accumulators per
    // stream: one for (d == 0), one for (d ^ p == 0 i.e. d == p).
    uint64_t sacc_z = d.scalar_data[0];
    v128_t qacc_z = d.quad_data[0];
    uint64_t sacc_p = d.scalar_data[0] ^ P_WASM[0];
    v128_t qacc_p = wasm_v128_xor(d.quad_data[0], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[0])));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[1];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[1]);
    sacc_p |= d.scalar_data[1] ^ P_WASM[1];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[1], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[1]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[2];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[2]);
    sacc_p |= d.scalar_data[2] ^ P_WASM[2];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[2], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[2]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[3];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[3]);
    sacc_p |= d.scalar_data[3] ^ P_WASM[3];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[3], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[3]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[4];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[4]);
    sacc_p |= d.scalar_data[4] ^ P_WASM[4];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[4], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[4]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[5];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[5]);
    sacc_p |= d.scalar_data[5] ^ P_WASM[5];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[5], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[5]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[6];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[6]);
    sacc_p |= d.scalar_data[6] ^ P_WASM[6];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[6], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[6]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[7];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[7]);
    sacc_p |= d.scalar_data[7] ^ P_WASM[7];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[7], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[7]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= d.scalar_data[8];
    qacc_z = wasm_v128_or(qacc_z, d.quad_data[8]);
    sacc_p |= d.scalar_data[8] ^ P_WASM[8];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(d.quad_data[8], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[8]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    // For the quad stream, we want a 4-bit lane-equal mask. bitmask extracts
    // the top bit of each i32 lane. To make "acc == 0" produce top-bit-set,
    // compare to 0 with i32x4_eq → all-ones/0 per lane → bitmask extracts.
    // One i32x4_eq + one bitmask per accumulator — much cheaper than 4 extracts.
    const v128_t qzero = wasm_i32x4_splat(0);
    const uint32_t lanes_z = wasm_i32x4_bitmask(wasm_i32x4_eq(qacc_z, qzero));
    const uint32_t lanes_p = wasm_i32x4_bitmask(wasm_i32x4_eq(qacc_p, qzero));
    const uint32_t lanes_eq = lanes_z | lanes_p; // bits 0..3 per lane

    const uint32_t scalar_eq = ((sacc_z == 0) || (sacc_p == 0)) ? 1u : 0u;

    // Result: bit 0 = scalar, bits 1..4 = lanes 0..3. Shift lanes_eq left by 1.
    return scalar_eq | (lanes_eq << 1);
}

template <class Params> [[gnu::always_inline]] inline uint32_t VectorField<Params>::is_zero() const noexcept
{
    // Same pattern as eq, but on (*this) directly (no subtract).
    uint64_t sacc_z = scalar_data[0];
    v128_t qacc_z = quad_data[0];
    uint64_t sacc_p = scalar_data[0] ^ P_WASM[0];
    v128_t qacc_p = wasm_v128_xor(quad_data[0], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[0])));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[1];
    qacc_z = wasm_v128_or(qacc_z, quad_data[1]);
    sacc_p |= scalar_data[1] ^ P_WASM[1];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[1], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[1]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[2];
    qacc_z = wasm_v128_or(qacc_z, quad_data[2]);
    sacc_p |= scalar_data[2] ^ P_WASM[2];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[2], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[2]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[3];
    qacc_z = wasm_v128_or(qacc_z, quad_data[3]);
    sacc_p |= scalar_data[3] ^ P_WASM[3];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[3], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[3]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[4];
    qacc_z = wasm_v128_or(qacc_z, quad_data[4]);
    sacc_p |= scalar_data[4] ^ P_WASM[4];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[4], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[4]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[5];
    qacc_z = wasm_v128_or(qacc_z, quad_data[5]);
    sacc_p |= scalar_data[5] ^ P_WASM[5];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[5], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[5]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[6];
    qacc_z = wasm_v128_or(qacc_z, quad_data[6]);
    sacc_p |= scalar_data[6] ^ P_WASM[6];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[6], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[6]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[7];
    qacc_z = wasm_v128_or(qacc_z, quad_data[7]);
    sacc_p |= scalar_data[7] ^ P_WASM[7];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[7], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[7]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    sacc_z |= scalar_data[8];
    qacc_z = wasm_v128_or(qacc_z, quad_data[8]);
    sacc_p |= scalar_data[8] ^ P_WASM[8];
    qacc_p = wasm_v128_or(qacc_p, wasm_v128_xor(quad_data[8], wasm_i32x4_splat(static_cast<int32_t>(P_WASM[8]))));
    vector_field_detail::bb_vf_barrier_sq(sacc_z, qacc_z);
    vector_field_detail::bb_vf_barrier_sq(sacc_p, qacc_p);

    const v128_t qzero = wasm_i32x4_splat(0);
    const uint32_t lanes_z = wasm_i32x4_bitmask(wasm_i32x4_eq(qacc_z, qzero));
    const uint32_t lanes_p = wasm_i32x4_bitmask(wasm_i32x4_eq(qacc_p, qzero));
    const uint32_t lanes_iz = lanes_z | lanes_p;

    const uint32_t scalar_iz = ((sacc_z == 0) || (sacc_p == 0)) ? 1u : 0u;

    return scalar_iz | (lanes_iz << 1);
}

// -------------------- operator* (Mont-mul via Karatsuba, 9x29 limbs) --------------------
//
// Follows the authoritative OPS[] schedule from
// https://gist.github.com/AztecBot/b8e2e1d5c85d54e10fb34b48461361e0.
//
// Stages:
//   1. P_lo   = left[0..4] * right[0..4]       (25 muls in pl0..pl8)
//   2. P_hi   = left[5..8] * right[5..8]       (16 muls in ph0..ph6)
//   3. Sums   sl_i = l_i + l_{5+i} for i=0..3, sl4 = l4, same for sr (i32x4 add)
//   4. P_cross= sl * sr                        (25 muls in pc0..pc8)
//   5. Combine into temp_0..temp_16
//   6. 8 x Yuval reductions over (temp_lo..temp_{lo+9})
//   7. 1 x wasm_reduce over (temp_8..temp_16)
//   8. Carry-propagate temp_9..temp_17
//   9. Branch-free conditional subtract
//   10. Store output
//
// Scalar stream uses i64 arithmetic (29*29 -> 58-bit products fit in u64 with
// 6 bits of accumulator headroom for 9 partial products).
//
// Quad stream uses paired i64x2 accumulators: lane L holds field L's limb k.
// Two i64x2 slots per logical limb cover 4 fields (tlo = lanes 0/1 = fields
// 0,1; thi = lanes 2/3 = fields 2,3). Partial products use
// `i64x2.extmul_low/high_u32x4` to do 2 x (32x32->64) per v128 op.
//
// Source order: scalar op, then equivalent quad op(s), then next scalar op, etc.
// Clang preserves source order in WASM codegen; V8 sees independent scalar /
// SIMD ops and schedules them on separate pipes.
//
// Total muls in the product phase: 25 + 16 + 25 = 66 (NOT 81). This is the
// whole point of Karatsuba — schoolbook 9x9 would need 81.

// The body of VectorField<Bn254FrParams>::operator* lives out-of-line in
// vector_field_wasm.cpp (see header there for the TU-boundary rationale).
// The primary template below has no body in the SIMD path; new Params
// specializations must be added there too. The non-SIMD fallback uses the
// generic template below.

#else // !BB_VECTOR_FIELD_SIMD

// ======================== Portable fallback ========================
// No SIMD: store 5 fields side-by-side, apply scalar field ops one at a time.
// Used on native x86/ARM builds.

template <class Params> inline void VectorField<Params>::store_from_array(const std::array<Field, 5>& in) noexcept
{
    for (size_t i = 0; i < 5; ++i) {
        elts[i] = in[i];
    }
}

template <class Params> inline void VectorField<Params>::load_to_array(std::array<Field, 5>& out) const noexcept
{
    for (size_t i = 0; i < 5; ++i) {
        out[i] = elts[i];
    }
}

template <class Params> inline VectorField<Params>::VectorField(const Field* base) noexcept
{
    for (size_t i = 0; i < 5; ++i) {
        elts[i] = base[i];
    }
}

template <class Params> inline VectorField<Params> VectorField<Params>::load_contiguous(const Field* base) noexcept
{
    return VectorField(base);
}

template <class Params> inline void VectorField<Params>::store_contiguous(Field* base) const noexcept
{
    for (size_t i = 0; i < 5; ++i) {
        base[i] = elts[i];
    }
}

template <class Params> inline void VectorField<Params>::store_to(Field* base) const noexcept
{
    store_contiguous(base);
}

template <class Params> inline VectorField<Params> VectorField<Params>::broadcast(const Field& s) noexcept
{
    VectorField r;
    for (size_t i = 0; i < 5; ++i) {
        r.elts[i] = s;
    }
    return r;
}

template <class Params>
inline VectorField<Params> VectorField<Params>::operator+(const VectorField& other) const noexcept
{
    VectorField r;
    for (size_t i = 0; i < 5; ++i) {
        r.elts[i] = elts[i] + other.elts[i];
    }
    return r;
}

template <class Params>
inline VectorField<Params> VectorField<Params>::operator-(const VectorField& other) const noexcept
{
    VectorField r;
    for (size_t i = 0; i < 5; ++i) {
        r.elts[i] = elts[i] - other.elts[i];
    }
    return r;
}

template <class Params>
inline VectorField<Params> VectorField<Params>::operator*(const VectorField& other) const noexcept
{
    VectorField r;
    for (size_t i = 0; i < 5; ++i) {
        r.elts[i] = elts[i] * other.elts[i];
    }
    return r;
}

template <class Params> inline uint32_t VectorField<Params>::eq(const VectorField& other) const noexcept
{
    uint32_t m = 0;
    for (size_t i = 0; i < 5; ++i) {
        if (elts[i] == other.elts[i]) {
            m |= (1u << i);
        }
    }
    return m;
}

template <class Params> inline uint32_t VectorField<Params>::is_zero() const noexcept
{
    uint32_t m = 0;
    for (size_t i = 0; i < 5; ++i) {
        if (elts[i].is_zero()) {
            m |= (1u << i);
        }
    }
    return m;
}

#endif // BB_VECTOR_FIELD_SIMD

} // namespace bb
