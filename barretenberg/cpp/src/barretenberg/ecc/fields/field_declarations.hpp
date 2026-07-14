// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <array>
#include <cstdint>
#include <iostream>
#include <random>
#include <span>

#ifndef DISABLE_ASM
#ifdef __BMI2__
#define BBERG_NO_ASM 0
#else
#define BBERG_NO_ASM 1
#endif
#else
#define BBERG_NO_ASM 1
#endif

namespace bb {

// Threshold for "large" moduli (>= 2^254). When the top limb of the modulus is >= 2^62,
// intermediate arithmetic results can overflow 256 bits, requiring different reduction strategies (enacted via
// constexpr branching).
//
// There is a further difference: internally, when limb[3] <MODULUS_TOP_LIMB_LARGE_THRESHOLD, we allow for coarse
// representation of the elements; this means that we assume the underlying unsigned integer to be in the range [0, 2p).
//
// On the other hand, for moduli with limb[3] > MODULUS_TOP_LIMB_LARGE_THRESHOLD, the uint256_t element
// derived from the limbs is arbitrary (and is in particular NOT guaranteed to be in the range [0, p)). In particular
// one sees this in the `add` functionality.

// To speed up multiplication, we internally represent all elements in MONTGOMERY form. This means that the underlying 4
// limbs represent a * R modulo p. (See the documentation in \ref field_docs["field documentation"]).
//
// In Barretenberg, the main workhorse fields are the base and scalar fields of BN-254, which are "small" moduli: they
// are each 254 bits. The field algorithms for them are constant-time.
//
// NOTE: For the 254-bit fields in Barretenberg, namely BN254 base and scalar fields, we also
// use this constexpr branching to capture another (conceptually unrelated) property: that
// the short basis of the lattice from the endomorphism is shorter than expected. See endomorphism_scalars.py for more
// information.
static constexpr uint64_t MODULUS_TOP_LIMB_LARGE_THRESHOLD = 0x4000000000000000ULL; // 2^62

/**
 * @brief General class for prime fields see \ref field_docs["field documentation"] for general implementation reference
 *
 * @tparam Params_
 */
template <class Params_> struct alignas(32) field {
  public:
    using View = field;
    using CoefficientAccumulator = field;
    using Params = Params_;
    using in_buf = const uint8_t*;
    using vec_in_buf = const uint8_t*;
    using out_buf = uint8_t*;
    using vec_out_buf = uint8_t**;

    // The number of element required to represent field<Params_> in the public inputs of a circuit
    static constexpr size_t PUBLIC_INPUTS_SIZE = Params::PUBLIC_INPUTS_SIZE;

#if defined(__wasm__) || !defined(__SIZEOF_INT128__)
// Limb layout for the WASM Montgomery backend.
#define WASM_NUM_LIMBS 9
#define WASM_LIMB_BITS 29
// Bits zeroed by the final Montgomery reduction step to complete R = 2^256.
#define WASM_FINAL_REDUCE_BITS 24
// Residue width left untouched by the final Montgomery reduction of the final lower limb.
#define WASM_FINAL_REMAINDER_BITS (WASM_LIMB_BITS - WASM_FINAL_REDUCE_BITS)

    static_assert(8 * WASM_LIMB_BITS + WASM_FINAL_REDUCE_BITS == 256, "WASM reduction widths must total 256 bits");

    // Typed bit masks derived from the widths above.
    static constexpr uint64_t WASM_LIMB_MASK = (1ULL << WASM_LIMB_BITS) - 1;
    static constexpr uint64_t WASM_FINAL_REDUCE_MASK = (1ULL << WASM_FINAL_REDUCE_BITS) - 1;
    static constexpr uint64_t WASM_FINAL_REMAINDER_MASK = (1ULL << WASM_FINAL_REMAINDER_BITS) - 1;
#endif

    // We don't initialize data in the default constructor since we'd lose a lot of time on huge array initializations.
    // Other alternatives have been noted, such as casting to get around constructors where they matter,
    // however it is felt that sanitizer tools (e.g. MSAN) can detect garbage well, whereas doing
    // hacky casts where needed would require rework to critical algos like MSM, FFT, Sumcheck.
    // Instead, the recommended solution is use an explicit {} where initialization is important:
    //  field f; // not initialized
    //  field f{}; // zero-initialized
    //  std::array<field, N> arr; // not initialized, good for huge N
    //  std::array<field, N> arr {}; // zero-initialized, preferable for moderate N
    field() = default;

    constexpr field(const numeric::uint256_t& input) noexcept
        : data{ input.data[0], input.data[1], input.data[2], input.data[3] }
    {
        self_to_montgomery_form();
    }

    constexpr field(const uint128_t& input) noexcept
        : field(static_cast<uint256_t>(input))
    {}

    // NOLINTNEXTLINE (unsigned long is platform dependent, which we want in this case)
    constexpr field(const unsigned long input) noexcept
        : data{ input, 0, 0, 0 }
    {
        self_to_montgomery_form();
    }

    constexpr field(const unsigned int input) noexcept
        : data{ input, 0, 0, 0 }
    {
        self_to_montgomery_form();
    }

    // NOLINTNEXTLINE (unsigned long long is platform dependent, which we want in this case)
    constexpr field(const unsigned long long input) noexcept
        : data{ input, 0, 0, 0 }
    {
        self_to_montgomery_form();
    }

    constexpr field(const int input) noexcept
        : data{ 0, 0, 0, 0 }
    {
        if (input < 0) {
            data[0] = static_cast<uint64_t>(-input);
            data[1] = 0;
            data[2] = 0;
            data[3] = 0;
            self_to_montgomery_form();
            self_neg();
            self_reduce_once();
        } else {
            data[0] = static_cast<uint64_t>(input);
            data[1] = 0;
            data[2] = 0;
            data[3] = 0;
            self_to_montgomery_form();
        }
    }
    /**
     * @brief cast four uint64_t as a field
     *
     * @warning this DOES NOT convert to montgomery form, in particular it is assumed that the element "is already" in
     * Montgomery form.
     *
     */
    constexpr field(const uint64_t a, const uint64_t b, const uint64_t c, const uint64_t d) noexcept
        : data{ a, b, c, d } {};

    /**
     * @brief Convert a 512-bit big integer into a field element.
     *
     * @details Used for deriving field elements from random values. 512-bits prevents biased output as 2^512>>modulus
     *
     */
    constexpr explicit field(const uint512_t& input) noexcept
    {
        uint256_t value = (input % modulus).lo;
        data[0] = value.data[0];
        data[1] = value.data[1];
        data[2] = value.data[2];
        data[3] = value.data[3];
        self_to_montgomery_form();
    }

    constexpr explicit field(std::string input) noexcept
    {
        uint256_t value(input);
        *this = field(value);
    }

    // Conversion operators to primitive types.
    // Note: from_montgomery_form() may return values bigger than p (in the range of [0, 2p) for 254-bit fields,
    // arbitrary 256-bit number for 256-bit fields.)
    // We call reduce_once() to ensure canonical [0, p) representation.

    constexpr explicit operator bool() const
    {
        field out = from_montgomery_form_reduced();
        if ((out.data[0] != 0 && out.data[0] != 1) || out.data[1] != 0 || out.data[2] != 0 || out.data[3] != 0) {
            bb::assert_failure("Cannot convert field element to bool unless it is 0 or 1");
        }
        return static_cast<bool>(out.data[0]);
    }

    constexpr explicit operator uint8_t() const
    {
        field out = from_montgomery_form_reduced();
        return static_cast<uint8_t>(out.data[0]);
    }

    constexpr explicit operator uint16_t() const
    {
        field out = from_montgomery_form_reduced();
        return static_cast<uint16_t>(out.data[0]);
    }

    constexpr explicit operator uint32_t() const
    {
        field out = from_montgomery_form_reduced();
        return static_cast<uint32_t>(out.data[0]);
    }

    constexpr explicit operator uint64_t() const
    {
        field out = from_montgomery_form_reduced();
        return out.data[0];
    }

    constexpr explicit operator uint128_t() const
    {
        field out = from_montgomery_form_reduced();
        uint128_t lo = out.data[0];
        uint128_t hi = out.data[1];
        return (hi << 64) | lo;
    }

    constexpr operator uint256_t() const noexcept
    {
        field out = from_montgomery_form_reduced();
        return uint256_t(out.data[0], out.data[1], out.data[2], out.data[3]);
    }

    [[nodiscard]] constexpr uint256_t uint256_t_no_montgomery_conversion() const noexcept
    {
        return { data[0], data[1], data[2], data[3] };
    }

    constexpr field(const field& other) noexcept = default;
    constexpr field(field&& other) noexcept = default;
    constexpr field& operator=(const field& other) & noexcept = default;
    constexpr field& operator=(field&& other) & noexcept = default;
    constexpr ~field() noexcept = default;
    alignas(32) uint64_t data[4]; // NOLINT

    static constexpr uint256_t modulus =
        uint256_t{ Params::modulus_0, Params::modulus_1, Params::modulus_2, Params::modulus_3 };
    static constexpr uint256_t r_squared_uint{
        Params_::r_squared_0, Params_::r_squared_1, Params_::r_squared_2, Params_::r_squared_3
    };
#if defined(__wasm__) || !defined(__SIZEOF_INT128__)
    static constexpr std::array<uint64_t, 9> wasm_modulus = { Params::modulus_wasm_0, Params::modulus_wasm_1,
                                                              Params::modulus_wasm_2, Params::modulus_wasm_3,
                                                              Params::modulus_wasm_4, Params::modulus_wasm_5,
                                                              Params::modulus_wasm_6, Params::modulus_wasm_7,
                                                              Params::modulus_wasm_8 };
    static constexpr std::array<uint64_t, 9> wasm_r_inv = {
        Params::r_inv_wasm_0, Params::r_inv_wasm_1, Params::r_inv_wasm_2, Params::r_inv_wasm_3, Params::r_inv_wasm_4,
        Params::r_inv_wasm_5, Params::r_inv_wasm_6, Params::r_inv_wasm_7, Params::r_inv_wasm_8
    };

#endif
    static constexpr field cube_root_of_unity()
    {
        // endomorphism i.e. lambda * [P] = (beta * x, y)
        if constexpr (Params::cube_root_0 != 0) {
            constexpr field result{
                Params::cube_root_0, Params::cube_root_1, Params::cube_root_2, Params::cube_root_3
            };
            return result;
        } else {
            constexpr field two_inv = field(2).invert();
            constexpr field numerator = (-field(3)).sqrt() - field(1);
            constexpr field result = two_inv * numerator;
            return result;
        }
    }

    static constexpr field zero() { return field(0, 0, 0, 0); }
    static constexpr field neg_one() { return -field(1); }
    static constexpr field one() { return field(1); }
    // R^2 mod p as a raw field literal (NOT Montgomery form). Used as the rhs of a Montgomery
    // multiplication to enter Montgomery form: mul(a, R^2) ≡ a*R (mod p).
    static constexpr field r_squared()
    {
        return field(r_squared_uint.data[0], r_squared_uint.data[1], r_squared_uint.data[2], r_squared_uint.data[3]);
    }
    // Raw integer 1 (NOT Montgomery form). Used as the rhs of a Montgomery multiplication
    // to strip the R factor, i.e. to leave Montgomery form: mul(a*R, 1) ≡ a (mod p).
    static constexpr field one_raw() { return field(1, 0, 0, 0); }

    static constexpr field coset_generator()
    {
        return field{
            Params::coset_generator_0,
            Params::coset_generator_1,
            Params::coset_generator_2,
            Params::coset_generator_3,
        };
    }

    BB_INLINE constexpr field operator*(const field& other) const noexcept;
    BB_INLINE static constexpr std::array<field, 2> paired_mul(const field& a,
                                                               const field& b,
                                                               const field& c,
                                                               const field& d) noexcept;
    BB_INLINE constexpr field operator+(const field& other) const noexcept;
    BB_INLINE constexpr field operator-(const field& other) const noexcept;
    BB_INLINE constexpr field operator-() const noexcept;
    constexpr field operator/(const field& other) const noexcept;

    // prefix increment (++x)
    BB_INLINE constexpr field operator++() noexcept;
    // postfix increment (x++)
    // NOLINTNEXTLINE
    BB_INLINE constexpr field operator++(int) noexcept;

    BB_INLINE constexpr field& operator*=(const field& other) & noexcept;
    BB_INLINE constexpr field& operator+=(const field& other) & noexcept;
    BB_INLINE constexpr field& operator-=(const field& other) & noexcept;
    constexpr field& operator/=(const field& other) & noexcept;

    // NOTE: comparison operators exist so that `field` is comparible with stl methods that require them.
    //       (e.g. std::sort)
    //       Finite fields do not have an explicit ordering, these should *NEVER* be used in algebraic algorithms.
    BB_INLINE constexpr bool operator>(const field& other) const noexcept;
    BB_INLINE constexpr bool operator<(const field& other) const noexcept;
    BB_INLINE constexpr bool operator==(const field& other) const noexcept;
    BB_INLINE constexpr bool operator!=(const field& other) const noexcept;

    BB_INLINE constexpr field to_montgomery_form() const noexcept;
    BB_INLINE static constexpr std::array<field, 2> paired_to_montgomery_form(const field& a, const field& b) noexcept;
    BB_INLINE constexpr field from_montgomery_form() const noexcept;
    BB_INLINE static constexpr std::array<field, 2> paired_from_montgomery_form(const field& a,
                                                                                const field& b) noexcept;
    // Reduced versions guarantee output is in canonical form [0, p)
    BB_INLINE constexpr field to_montgomery_form_reduced() const noexcept;
    BB_INLINE static constexpr std::array<field, 2> paired_to_montgomery_form_reduced(const field& a,
                                                                                      const field& b) noexcept;
    BB_INLINE constexpr field from_montgomery_form_reduced() const noexcept;
    BB_INLINE static constexpr std::array<field, 2> paired_from_montgomery_form_reduced(const field& a,
                                                                                        const field& b) noexcept;

    BB_INLINE constexpr field sqr() const noexcept;
    BB_INLINE static constexpr std::array<field, 2> paired_sqr(const field& a, const field& b) noexcept;
    BB_INLINE constexpr void self_sqr() & noexcept;

    BB_INLINE constexpr field pow(const uint256_t& exponent) const noexcept;
    BB_INLINE constexpr field pow(uint64_t exponent) const noexcept;
    // STARKNET: next line was commented as stark252 violates the assertion
    // static_assert(Params::modulus_0 != 1);
    static constexpr uint256_t modulus_minus_two =
        uint256_t(Params::modulus_0 - 2ULL, Params::modulus_1, Params::modulus_2, Params::modulus_3);
    constexpr field invert() const noexcept;
    constexpr field invert_const_time() const noexcept;
    template <typename C>
    // has size() and operator[].
        requires requires(C& c) {
            { c.size() } -> std::convertible_to<size_t>;
            { c[0] };
        }
    static void batch_invert(C& coeffs) noexcept;
    static void batch_invert(field* coeffs, size_t n) noexcept;
    static void batch_invert(std::span<field> coeffs) noexcept;
    /**
     * @brief Compute square root of the field element.
     *
     * @return <true, root> if the element is a quadratic remainder, <false, 0> if it's not
     */
    constexpr std::pair<bool, field> sqrt() const noexcept
        requires((Params_::modulus_0 & 0x3UL) == 0x3UL);
    constexpr std::pair<bool, field> sqrt() const noexcept
        requires((Params_::modulus_0 & 0x3UL) != 0x3UL);
    BB_INLINE constexpr void self_neg() & noexcept;

    BB_INLINE constexpr void self_to_montgomery_form() & noexcept;
    BB_INLINE constexpr void self_from_montgomery_form() & noexcept;
    // Reduced versions guarantee output is in canonical form [0, p)
    BB_INLINE constexpr void self_to_montgomery_form_reduced() & noexcept;
    BB_INLINE constexpr void self_from_montgomery_form_reduced() & noexcept;

    BB_INLINE constexpr void self_conditional_negate(uint64_t predicate) & noexcept;

    BB_INLINE constexpr field reduce_once() const noexcept;
    BB_INLINE constexpr void self_reduce_once() & noexcept;

    BB_INLINE constexpr void self_set_msb() & noexcept;
    [[nodiscard]] BB_INLINE constexpr bool is_msb_set() const noexcept;
    [[nodiscard]] BB_INLINE constexpr uint64_t is_msb_set_word() const noexcept;

    [[nodiscard]] BB_INLINE constexpr bool is_zero() const noexcept;

    static constexpr field get_root_of_unity(size_t subgroup_size) noexcept;

    static void serialize_to_buffer(const field& value, uint8_t* buffer) { write(buffer, value); }

    static field serialize_from_buffer(const uint8_t* buffer) { return from_buffer<field>(buffer); }

    template <class V> static field reconstruct_from_public(const std::span<const field<V>, PUBLIC_INPUTS_SIZE>& limbs);

    [[nodiscard]] BB_INLINE std::vector<uint8_t> to_buffer() const { return ::to_buffer(*this); }

    struct wide_array {
        uint64_t data[8]; // NOLINT
    };
    BB_INLINE constexpr wide_array mul_512(const field& other) const noexcept;

    /**
     * For short Weierstrass curves y^2 = x^3 + b mod r, if there exists a cube root of unity mod r,
     * we can take advantage of an enodmorphism to decompose a 254 bit scalar into 2 128 bit scalars.
     * \beta = cube root of 1, mod q (q = order of fq)
     * \lambda = cube root of 1, mod r (r = order of fr)
     *
     * For a point P1 = (X, Y), where Y^2 = X^3 + b, we know that
     * the point P2 = (X * \beta, Y) is also a point on the curve
     * We can represent P2 as a scalar multiplication of P1, where P2 = \lambda * P1
     *
     * For a generic multiplication of P1 by a 254 bit scalar k, we can decompose k
     * into 2 127 bit scalars (k1, k2), such that k = k1 - (k2 * \lambda)
     *
     * We can now represent (k * P1) as (k1 * P1) - (k2 * P2), where P2 = (X * \beta, Y).
     * As k1, k2 have half the bit length of k, we have reduced the number of loop iterations of our
     * scalar multiplication algorithm in half
     *
     * To find k1, k2, We use the extended euclidean algorithm to find 4 short scalars [a1, a2], [b1, b2] such that
     * modulus = (a1 * b2) - (b1 * a2)
     * We then compute scalars c1 = round(b2 * k / r), c2 = round(b1 * k / r), where
     * k1 = (c1 * a1) + (c2 * a2), k2 = -((c1 * b1) + (c2 * b2))
     * We pre-compute scalars g1 = (2^256 * b1) / n, g2 = (2^256 * b2) / n, to avoid having to perform long division
     * on 512-bit scalars
     **/
    /**
     * @brief Shared core of the endomorphism scalar decomposition.
     *
     * Computes k2 = round(b2·k/r)·(-b1) + round((-b1)·k/r)·b2, using the
     * 256-bit-shift approximation g = floor(b·2^256/r) for both BN254 and
     * secp256k1. See endomorphism_scalars.py §0 for the proof that the
     * approximation error is bounded to {0, -1} for any r < 2^256.
     *
     * The result is a raw (non-Montgomery) `field` whose low 128-or-129 bits
     * hold k2. This function will be called in either the BN254 base/scalar field
     * or the generic, secp256k1 branch.
     */
    static field compute_endomorphism_k2(const field& k)
    {
        // force into strict form.
        field input = k.reduce_once();

        constexpr field endo_g1 = { Params::endo_g1_lo, Params::endo_g1_mid, Params::endo_g1_hi, 0 };
        constexpr field endo_g2 = { Params::endo_g2_lo, Params::endo_g2_mid, 0, 0 };
        constexpr field endo_minus_b1 = { Params::endo_minus_b1_lo, Params::endo_minus_b1_mid, 0, 0 };
        constexpr field endo_b2 = { Params::endo_b2_lo, Params::endo_b2_mid, 0, 0 };

        // c1 = (g2 * k) >> 256,  c2 = (g1 * k) >> 256
        wide_array c1 = endo_g2.mul_512(input);
        wide_array c2 = endo_g1.mul_512(input);

        // extract high halves
        field c1_hi{ c1.data[4], c1.data[5], c1.data[6], c1.data[7] };
        field c2_hi{ c2.data[4], c2.data[5], c2.data[6], c2.data[7] };

        // q1 = c1 * (-b1),  q2 = c2 * b2
        wide_array q1 = c1_hi.mul_512(endo_minus_b1);
        wide_array q2 = c2_hi.mul_512(endo_b2);

        field q1_lo{ q1.data[0], q1.data[1], q1.data[2], q1.data[3] };
        field q2_lo{ q2.data[0], q2.data[1], q2.data[2], q2.data[3] };

        return (q2_lo - q1_lo).reduce_once();
    }

    /**
     * @brief Full-width endomorphism decomposition: k ≡ k1 - k2·λ (mod r).
     * Modifies the field elements k1 and k2.
     *
     * For BN254 base/scalar fields, delegates to the 128-bit pair
     * overload, which applies the negative-k2 fix. Returns k1, k2 in the low
     * 2 limbs (upper limbs zeroed). Both fit in 128 bits.
     *
     * For generic 256-bit fields: returns k1, k2 as full field elements
     * elements (non-Montgomery). k1 fits in ~128 bits; k2 fits in ~129 bits.
     * No negative-k2 fix — the caller (biggroup_nafs.hpp) handles signs by
     * inspecting the MSB of k2.
     */
    static void split_into_endomorphism_scalars(const field& k, field& k1, field& k2)
    {
        if constexpr (Params::modulus_3 < MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
            // BN254 base or scalar field: use path that corresponds to 128-bit outputs.
            auto ret = split_into_endomorphism_scalars(k);
            k1 = { ret.first[0], ret.first[1], 0, 0 };
            k2 = { ret.second[0], ret.second[1], 0, 0 };
        } else {
            // Large modulus (secp256k1): full-width path.
            field t1 = compute_endomorphism_k2(k);
            k2 = t1;
            k1 = ((t1 * cube_root_of_unity()) + k).reduce_once();
        }
    }

    /**
     * @brief 128-bit endomorphism decomposition: k ≡ k1 - k2·λ (mod r).
     *
     * Returns { {k1_lo, k1_hi}, {k2_lo, k2_hi} } — each scalar as a pair of
     * uint64_t representing its low 128 bits. Both k1 and k2 are guaranteed to
     * fit in 128 bits (the negative-k2 fix ensures this for the ~2^{-64} of
     * inputs where k2 would otherwise be slightly negative).
     *
     * Only valid for fields such that the splitting_scalars algorithm produces 128 bit outputs. In Barretenberg, these
     * are just the base and scalar fields of BN254. These are the only "small modulus" fields, so we use a static
     * assert to force this.
     *
     * Does NOT assume that the input is reduced
     */
    static std::pair<std::array<uint64_t, 2>, std::array<uint64_t, 2>> split_into_endomorphism_scalars(const field& k)
    {
        static_assert(Params::modulus_3 < MODULUS_TOP_LIMB_LARGE_THRESHOLD);

        // short-circuit the split if k is already small
        if (k.data[2] == 0 && k.data[3] == 0 && (k.data[1] >> 63) == 0) {
            return {
                { k.data[0], k.data[1] },
                { 0, 0 },
            };
        }

        field t1 = compute_endomorphism_k2(k);

        // k2 (= t1) can be slightly negative for ~2^{-64} of inputs.
        // When negative, t1 = k2 + r is 254 bits (upper limbs nonzero).
        // Fix: decrement c1 by 1, equivalent to adding |b1| to k2.
        // This shifts k2 by +|b1| (~127 bits, now positive) and k1 by -a1 (~64 bits),
        // keeping both within 128 bits. See endomorphism_scalars.py for more details.
        if (t1.data[2] != 0 || t1.data[3] != 0) {
            constexpr field endo_minus_b1 = { Params::endo_minus_b1_lo, Params::endo_minus_b1_mid, 0, 0 };
            t1 = (t1 + endo_minus_b1).reduce_once();
        }

        field t2 = ((t1 * cube_root_of_unity()) + k).reduce_once();
        return {
            { t2.data[0], t2.data[1] },
            { t1.data[0], t1.data[1] },
        };
    }

    friend std::ostream& operator<<(std::ostream& os, const field& a)
    {
        field out = a.from_montgomery_form_reduced();
        std::ios_base::fmtflags f(os.flags());
        os << std::hex << "0x" << std::setfill('0') << std::setw(16) << out.data[3] << std::setw(16) << out.data[2]
           << std::setw(16) << out.data[1] << std::setw(16) << out.data[0];
        os.flags(f);
        return os;
    }

    BB_INLINE static void __copy(const field& a, field& r) noexcept { r = a; } // NOLINT
    static field random_element(numeric::RNG* engine = nullptr) noexcept;

    // For serialization
    void msgpack_pack(auto& packer) const;
    void msgpack_unpack(auto o);
    void msgpack_schema(auto& packer) const { packer.pack_alias(Params::schema_name, "bin32"); }

    static constexpr uint256_t twice_modulus = modulus + modulus;
    static constexpr uint256_t not_modulus = -modulus;
    static constexpr uint256_t twice_not_modulus = -twice_modulus;

#if defined(__wasm__) || !defined(__SIZEOF_INT128__)
    BB_INLINE static constexpr void wasm_madd(uint64_t left_limb,
                                              const std::array<uint64_t, WASM_NUM_LIMBS>& right_limbs,
                                              std::span<uint64_t, WASM_NUM_LIMBS> result);
    BB_INLINE static constexpr void wasm_reduce_29(std::span<uint64_t, WASM_NUM_LIMBS> result);
    BB_INLINE static constexpr void wasm_reduce_24(std::span<uint64_t, WASM_NUM_LIMBS> result);
    BB_INLINE static constexpr void wasm_reduce_yuval(std::span<uint64_t, WASM_NUM_LIMBS + 1> result);
    BB_INLINE static constexpr std::array<uint64_t, 4> wasm_reduce_and_pack(
        std::array<uint64_t, 2 * WASM_NUM_LIMBS - 1>& temp);
    BB_INLINE static constexpr std::array<uint64_t, WASM_NUM_LIMBS> wasm_convert(const uint64_t* data);

    template <size_t N>
    BB_INLINE static constexpr std::array<uint64_t, 2 * N - 1> wasm_schoolbook_mul(const std::array<uint64_t, N>& a,
                                                                                   const std::array<uint64_t, N>& b);

    BB_INLINE static constexpr std::array<uint64_t, 2 * WASM_NUM_LIMBS - 1> wasm_karatsuba_mul(
        const std::array<uint64_t, WASM_NUM_LIMBS>& left, const std::array<uint64_t, WASM_NUM_LIMBS>& right);
#endif
    BB_INLINE static constexpr std::pair<uint64_t, uint64_t> mul_wide(uint64_t a, uint64_t b) noexcept;

    BB_INLINE static constexpr uint64_t mac(
        uint64_t a, uint64_t b, uint64_t c, uint64_t carry_in, uint64_t& carry_out) noexcept;

    BB_INLINE static constexpr void mac(
        uint64_t a, uint64_t b, uint64_t c, uint64_t carry_in, uint64_t& out, uint64_t& carry_out) noexcept;

    BB_INLINE static constexpr uint64_t mac_mini(uint64_t a, uint64_t b, uint64_t c, uint64_t& out) noexcept;

    BB_INLINE static constexpr void mac_mini(
        uint64_t a, uint64_t b, uint64_t c, uint64_t& out, uint64_t& carry_out) noexcept;

    BB_INLINE static constexpr uint64_t mac_discard_lo(uint64_t a, uint64_t b, uint64_t c) noexcept;

    BB_INLINE static constexpr uint64_t addc(uint64_t a, uint64_t b, uint64_t carry_in, uint64_t& carry_out) noexcept;

    BB_INLINE static constexpr uint64_t sbb(uint64_t a, uint64_t b, uint64_t borrow_in, uint64_t& borrow_out) noexcept;

    BB_INLINE static constexpr uint64_t square_accumulate(uint64_t a,
                                                          uint64_t b,
                                                          uint64_t c,
                                                          uint64_t carry_in_lo,
                                                          uint64_t carry_in_hi,
                                                          uint64_t& carry_lo,
                                                          uint64_t& carry_hi) noexcept;
    BB_INLINE constexpr field reduce() const noexcept;
    BB_INLINE constexpr field add(const field& other) const noexcept;
    BB_INLINE constexpr field subtract(const field& other) const noexcept;

    // Debug-only assertion: checks that the field element is in the strict coarse form [0, 2p).
    // Only meaningful for "small" moduli (<=254 bits) which use the coarse representation.
    // Not constexpr in debug builds (BB_ASSERT_DEBUG uses std::ostringstream).
    // Callers must guard with `if (!std::is_constant_evaluated())` in constexpr functions.
#ifdef NDEBUG
    constexpr void assert_coarse_form() const noexcept {}
#else
    void assert_coarse_form() const noexcept
    {
        if constexpr (modulus.data[3] < MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
            uint256_t val{ data[0], data[1], data[2], data[3] };
            BB_ASSERT_DEBUG(val < twice_modulus, "field element exceeds coarse form [0, 2p)");
        }
    }
#endif
    BB_INLINE constexpr field montgomery_mul(const field& other) const noexcept;
    BB_INLINE constexpr field montgomery_mul_big(const field& other) const noexcept;
    BB_INLINE constexpr field montgomery_square() const noexcept;

#if (BBERG_NO_ASM == 0)
    BB_INLINE static field asm_mul_with_coarse_reduction(const field& a, const field& b) noexcept;
    BB_INLINE static field asm_sqr_with_coarse_reduction(const field& a) noexcept;
    BB_INLINE static field asm_add_with_coarse_reduction(const field& a, const field& b) noexcept;
    BB_INLINE static field asm_sub_with_coarse_reduction(const field& a, const field& b) noexcept;
    BB_INLINE static void asm_self_mul_with_coarse_reduction(field& a, const field& b) noexcept;
    BB_INLINE static void asm_self_sqr_with_coarse_reduction(field& a) noexcept;
    BB_INLINE static void asm_self_add_with_coarse_reduction(field& a, const field& b) noexcept;
    BB_INLINE static void asm_self_sub_with_coarse_reduction(field& a, const field& b) noexcept;

    BB_INLINE static void asm_conditional_negate(field& r, uint64_t predicate) noexcept;
    BB_INLINE static field asm_reduce_once(const field& a) noexcept;
    BB_INLINE static void asm_self_reduce_once(field& a) noexcept;
    static constexpr uint64_t zero_reference = 0x00ULL;
#endif
    constexpr field tonelli_shanks_sqrt() const noexcept;
    static constexpr size_t primitive_root_log_size() noexcept;

#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    static constexpr uint128_t lo_mask = 0xffffffffffffffffUL;
#endif
};

template <typename B, typename Params> void read(B& it, field<Params>& value)
{
    using serialize::read;
    field<Params> result{ 0, 0, 0, 0 };
    read(it, result.data[3]);
    read(it, result.data[2]);
    read(it, result.data[1]);
    read(it, result.data[0]);
    value = result.to_montgomery_form();
}
template <typename B, typename Params> void write(B& buf, field<Params> const& value)
{
    using serialize::write;
    const field input = value.from_montgomery_form_reduced();
    write(buf, input.data[3]);
    write(buf, input.data[2]);
    write(buf, input.data[1]);
    write(buf, input.data[0]);
}

} // namespace bb

// Define hash function for field elements, e.g., so that it can be used in maps.
// See https://en.cppreference.com/w/cpp/utility/hash .
template <typename Params> struct std::hash<bb::field<Params>> {
    std::size_t operator()(const bb::field<Params>& ff) const noexcept
    {
        // Just like in equality, we need to reduce the field element before hashing.
        auto reduced = ff.reduce_once();
        return bb::utils::hash_as_tuple(reduced.data[0], reduced.data[1], reduced.data[2], reduced.data[3]);
    }
};
