# `straus_msm` source extraction — reference for WebGPU port (P0 output)

All extracts from `AztecProtocol/barretenberg-claude` @
`pippenger-refactor-full-11-may`, HEAD `a37943e537`. Paths are relative to the
repo root.

Function names: `straus_msm` is the inner routine in `element_impl.hpp`.
`trivial_msm(_threaded)` in `scalar_multiplication.hpp` are single-/multi-
threaded drivers that call `straus_msm` per worker. The user's original task
referred to "trivial_msm"; the actual algorithm of interest is `straus_msm`.

---

## 1. Endo-Booth constants — `BoothSliceParams`, slice generator, digit reader

`barretenberg/cpp/src/barretenberg/ecc/groups/element_impl.hpp`, namespace
`detail`, lines 531-650.

### 1.1 `BoothSliceParams` (lines 541-548)

```cpp
struct BoothSliceParams {
    uint32_t lo_mask;
    uint32_t hi_mask;
    uint32_t lo_limb;
    uint32_t hi_limb;
    uint32_t lo_off;
    uint32_t lo_bits;
};
```

### 1.2 `compute_booth_slice_params(bit_offset, window_bits, num_uint64_limbs)` (lines 550-581)

```cpp
[[nodiscard]] constexpr BoothSliceParams compute_booth_slice_params(
    size_t bit_offset, size_t window_bits, size_t num_uint64_limbs) noexcept
{
    constexpr size_t LIMB_BITS = 64;
    BoothSliceParams sp{};
    if (bit_offset == 0) {
        sp.lo_limb = 0;
        sp.hi_limb = 0;
        sp.lo_off  = LIMB_BITS - 1;
        sp.lo_bits = 1;
        sp.lo_mask = 0;
        sp.hi_mask = (uint32_t{ 1 } << window_bits) - 1;
    } else {
        const size_t lookback_bit = bit_offset - 1;
        const size_t bits_to_read = window_bits + 1;
        sp.lo_limb = static_cast<uint32_t>(lookback_bit / LIMB_BITS);
        sp.lo_off  = static_cast<uint32_t>(lookback_bit & (LIMB_BITS - 1));
        sp.lo_bits = static_cast<uint32_t>(LIMB_BITS - sp.lo_off < bits_to_read
                                             ? LIMB_BITS - sp.lo_off
                                             : bits_to_read);
        const uint32_t hi_bits = static_cast<uint32_t>(bits_to_read) - sp.lo_bits;
        sp.lo_mask = (uint32_t{ 1 } << sp.lo_bits) - 1;
        if (static_cast<size_t>(sp.lo_limb) + 1 >= num_uint64_limbs) {
            sp.hi_limb = sp.lo_limb;
            sp.hi_mask = 0;
        } else {
            sp.hi_limb = sp.lo_limb + 1;
            sp.hi_mask = (uint32_t{ 1 } << hi_bits) - 1;
        }
    }
    return sp;
}
```

### 1.3 `booth_packed_digit` (lines 592-607)

```cpp
[[nodiscard]] [[gnu::always_inline]] inline uint32_t booth_packed_digit(
    const uint64_t* s, const BoothSliceParams& sp, size_t window_bits) noexcept
{
    const uint64_t s_lo = s[sp.lo_limb];
    const uint64_t s_hi = s[sp.hi_limb];
    const uint64_t lo_part = (s_lo >> sp.lo_off) & sp.lo_mask;
    const uint64_t hi_part = (s_hi & sp.hi_mask) << sp.lo_bits;
    const uint32_t raw      = static_cast<uint32_t>(lo_part | hi_part);
    const uint32_t neg      = (raw >> window_bits) & uint32_t{ 1 };
    const uint32_t neg_mask = uint32_t{ 0 } - neg;
    const uint32_t val_mask = (uint32_t{ 1 } << window_bits) - 1;
    const uint32_t encode   = (raw + 1) >> 1;
    const uint32_t magnitude= ((encode + neg_mask) ^ neg_mask) & val_mask;
    return (neg << 31) | magnitude;
}
```

Layout of return value: bit 31 = sign (1 = negative); bits 0..30 = magnitude
in [0, 2^(window_bits−1)]. Magnitude 0 = window contributes nothing.

### 1.4 Endo-Booth constants (lines 611-617)

```cpp
inline constexpr size_t BOOTH_ENDO_WINDOW_BITS    = 4;
inline constexpr size_t BOOTH_ENDO_NUM_WINDOWS    = 32;
inline constexpr size_t BOOTH_ENDO_LOOKUP_SIZE    = 1U << (BOOTH_ENDO_WINDOW_BITS - 1);  // = 8
inline constexpr size_t BOOTH_ENDO_NUM_LIMBS_U64  = 2;                                    // 128-bit halves
```

### 1.5 `make_endo_booth_slice_params()` (lines 619-626)

```cpp
[[nodiscard]] constexpr std::array<BoothSliceParams, BOOTH_ENDO_NUM_WINDOWS>
make_endo_booth_slice_params() noexcept
{
    std::array<BoothSliceParams, BOOTH_ENDO_NUM_WINDOWS> sp{};
    for (size_t w = 0; w < BOOTH_ENDO_NUM_WINDOWS; ++w) {
        sp[w] = compute_booth_slice_params(
            w * BOOTH_ENDO_WINDOW_BITS,
            BOOTH_ENDO_WINDOW_BITS,
            BOOTH_ENDO_NUM_LIMBS_U64);
    }
    return sp;
}
```

For the WebGPU port: materialize this table at TS build time (32 rows × 6 u32
fields = 192 u32) and mustache-inject into the shader as a `const` array of
structs, OR pre-pack into per-window `(lo_off, lo_bits, lo_mask, hi_mask,
limb_select)` u32 quintuples.

### 1.6 (Not used by `straus_msm`, but adjacent): K2-asymmetric variant

`BOOTH_ENDO_K2_LOW_WINDOW_BITS = 2`, `BOOTH_ENDO_K2_NUM_WINDOWS = 33`,
`make_endo_booth_k2_slice_params()` — only relevant for the `mul_with_endomorphism`
single-scalar path that the `straus_msm` algorithm explicitly does NOT use
(`straus_msm` uses the symmetric layout: identical slice_params for k1 and k2).
Skip for the port unless we later port `mul_with_endomorphism`.

---

## 2. GLV split — `Fr::split_into_endomorphism_scalars`

`barretenberg/cpp/src/barretenberg/ecc/fields/field_declarations.hpp`,
class template `field<Params>`, lines 431-530.

### 2.1 `compute_endomorphism_k2(k)` (lines 431-457)

```cpp
static field compute_endomorphism_k2(const field& k)
{
    field input = k.reduce_once();

    constexpr field endo_g1       = { Params::endo_g1_lo,       Params::endo_g1_mid,       Params::endo_g1_hi, 0 };
    constexpr field endo_g2       = { Params::endo_g2_lo,       Params::endo_g2_mid,       0, 0 };
    constexpr field endo_minus_b1 = { Params::endo_minus_b1_lo, Params::endo_minus_b1_mid, 0, 0 };
    constexpr field endo_b2       = { Params::endo_b2_lo,       Params::endo_b2_mid,       0, 0 };

    // c1 = (g2 * k) >> 256,  c2 = (g1 * k) >> 256
    wide_array c1 = endo_g2.mul_512(input);
    wide_array c2 = endo_g1.mul_512(input);

    field c1_hi{ c1.data[4], c1.data[5], c1.data[6], c1.data[7] };
    field c2_hi{ c2.data[4], c2.data[5], c2.data[6], c2.data[7] };

    // q1 = c1_hi * (-b1),  q2 = c2_hi * b2
    wide_array q1 = c1_hi.mul_512(endo_minus_b1);
    wide_array q2 = c2_hi.mul_512(endo_b2);

    field q1_lo{ q1.data[0], q1.data[1], q1.data[2], q1.data[3] };
    field q2_lo{ q2.data[0], q2.data[1], q2.data[2], q2.data[3] };

    return (q2_lo - q1_lo).reduce_once();
}
```

`field` here is `Fr` (BN254 scalar field). `mul_512(other)` returns the full
512-bit (8×u64) product. `wide_array.data[4..8]` is the high 256 bits (i.e.
the floor-div-by-2^256 of the wide product). `reduce_once()` is one
conditional subtraction by the modulus.

### 2.2 `split_into_endomorphism_scalars(k) → (k1, k2)` (lines 501-530)

```cpp
static std::pair<std::array<uint64_t, 2>, std::array<uint64_t, 2>>
split_into_endomorphism_scalars(const field& k)
{
    static_assert(Params::modulus_3 < MODULUS_TOP_LIMB_LARGE_THRESHOLD);

    // short-circuit: k already fits in 127 bits → (k, 0)
    if (k.data[2] == 0 && k.data[3] == 0 && (k.data[1] >> 63) == 0) {
        return { { k.data[0], k.data[1] }, { 0, 0 } };
    }

    field t1 = compute_endomorphism_k2(k);

    // Negative-k2 correction: ~2^{-64} of inputs need this. Detect via
    // nonzero upper limbs of t1 (= k2 + r when k2 was negative).
    if (t1.data[2] != 0 || t1.data[3] != 0) {
        constexpr field endo_minus_b1 = { Params::endo_minus_b1_lo, Params::endo_minus_b1_mid, 0, 0 };
        t1 = (t1 + endo_minus_b1).reduce_once();
    }

    field t2 = ((t1 * cube_root_of_unity()) + k).reduce_once();
    return {
        { t2.data[0], t2.data[1] },  // k1 (128-bit)
        { t1.data[0], t1.data[1] },  // k2 (128-bit)
    };
}
```

**Identity it guarantees** (after Mont-form conversion): `k ≡ k1 − k2·λ (mod r)`,
where `λ = Fr::cube_root_of_unity()`. Both halves fit in 128 bits.

`cube_root_of_unity` here is **Fr's** cube root (the GLV eigenvalue λ in the
scalar field), NOT Fq's β.

### 2.3 BN254 Fr constants — for the GLV split

`barretenberg/cpp/src/barretenberg/ecc/curves/bn254/fr.hpp`:

```cpp
// modulus r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
static constexpr uint64_t modulus_0 = 0x43E1F593F0000001UL;
static constexpr uint64_t modulus_1 = 0x2833E84879B97091UL;
static constexpr uint64_t modulus_2 = 0xB85045B68181585DUL;
static constexpr uint64_t modulus_3 = 0x30644E72E131A029UL;

// Fr cube root of unity (the GLV eigenvalue λ in the scalar field), Montgomery form
static constexpr uint64_t cube_root_0 = 0x93e7cede4a0329b3UL;
static constexpr uint64_t cube_root_1 = 0x7d4fdca77a96c167UL;
static constexpr uint64_t cube_root_2 = 0x8be4ba08b19a750aUL;
static constexpr uint64_t cube_root_3 = 0x1cbd5653a5661c25UL;

// GLV lattice constants for compute_endomorphism_k2 (all non-Montgomery)
static constexpr uint64_t endo_g1_lo       = 0x7a7bd9d4391eb18dUL;
static constexpr uint64_t endo_g1_mid      = 0x4ccef014a773d2cfUL;
static constexpr uint64_t endo_g1_hi       = 0x0000000000000002UL;
static constexpr uint64_t endo_g2_lo       = 0xd91d232ec7e0b3d7UL;
static constexpr uint64_t endo_g2_mid      = 0x0000000000000002UL;
static constexpr uint64_t endo_minus_b1_lo = 0x8211bbeb7d4f1128UL;
static constexpr uint64_t endo_minus_b1_mid= 0x6f4d8248eeb859fcUL;
static constexpr uint64_t endo_b2_lo       = 0x89d3256894d213e3UL;
static constexpr uint64_t endo_b2_mid      = 0UL;
```

For the WebGPU port: GLV split runs **host-side in TypeScript** (one-shot per
upload, trivial CPU cost). Port to bigint arithmetic in JS, validate against
the noble bn254 + the identity `k ≡ k1 − k2·λ (mod r)`. The TS helper
needs only these BN254 Fr constants — no need to port the generic `field`
template.

---

## 3. β — `Fq::cube_root_of_unity()` (the endomorphism eigenvalue on the curve)

`barretenberg/cpp/src/barretenberg/ecc/curves/bn254/fq.hpp`:

```cpp
// Fq cube root of unity (the on-curve endomorphism β), Montgomery form
static constexpr uint64_t cube_root_0 = 0x71930c11d782e155UL;
static constexpr uint64_t cube_root_1 = 0xa6bb947cffbe3323UL;
static constexpr uint64_t cube_root_2 = 0xaa303344d4741444UL;
static constexpr uint64_t cube_root_3 = 0x2c3b3f0d26594943UL;
```

These limbs are in **Montgomery form** (R = 2^256 mod q for Fq). In the
straus_msm `to_add.x *= beta` step, both `x` and `beta` are in Mont form so
`montgomery_product(x, beta)` lands at Mont form output — exactly the
existing `mont_pro_product_karat_yuval.template.wgsl` shape.

For the WGSL port: emit β as a 20-limb (13-bit limb width, as used elsewhere
in the msm_webgpu tree) `BigInt` constant via a mustache helper that converts
the four 64-bit Mont-form words into 20 × 13-bit limbs.

---

## 4. The full `straus_msm` source

`barretenberg/cpp/src/barretenberg/ecc/groups/element_impl.hpp`, lines 712-794.
(BN254 G1's `T::USE_ENDOMORPHISM = true`, so only the endo branch is reached.)

```cpp
template <class Fq, class Fr, class T>
element<Fq, Fr, T> element<Fq, Fr, T>::straus_msm(std::span<const affine_element<Fq, Fr, T>> points,
                                                  std::span<const Fr> scalars) noexcept
{
    BB_BENCH_NAME("Element::straus_msm");
    const size_t n = std::min(points.size(), scalars.size());
    if (n == 0) return element::infinity();

    if constexpr (T::USE_ENDOMORPHISM) {
        constexpr size_t LOOKUP_SIZE = detail::BOOTH_ENDO_LOOKUP_SIZE; // 8
        constexpr size_t NUM_WINDOWS = detail::BOOTH_ENDO_NUM_WINDOWS; // 32
        constexpr size_t WINDOW_BITS = detail::BOOTH_ENDO_WINDOW_BITS; // 4
        constexpr auto slice_params  = detail::make_endo_booth_slice_params();

        struct ActiveScalar {
            std::array<element, LOOKUP_SIZE> lookup;            // [1·P, 2·P, ..., 8·P] Jacobian
            std::array<uint64_t, detail::BOOTH_ENDO_NUM_LIMBS_U64> k1{};  // 2 × u64 = 128 bits
            std::array<uint64_t, detail::BOOTH_ENDO_NUM_LIMBS_U64> k2{};  // 2 × u64
        };

        std::vector<ActiveScalar> active;
        active.reserve(n);
        for (size_t i = 0; i < n; ++i) {
            if (points[i].is_point_at_infinity()) continue;
            const Fr converted = scalars[i].from_montgomery_form();
            if (converted.is_zero()) continue;
            ActiveScalar e;
            const element pt(points[i]);
            e.lookup[0] = pt;
            for (size_t k = 1; k < LOOKUP_SIZE; ++k) {
                e.lookup[k] = e.lookup[k - 1] + pt;             // lookup[1] is the P+P collision (= 2P)
            }
            const detail::EndoScalars endo = Fr::split_into_endomorphism_scalars(converted);
            e.k1 = endo.first;
            e.k2 = endo.second;
            active.push_back(std::move(e));
        }
        if (active.empty()) return element::infinity();

        element accumulator{ T::one_x, T::one_y, Fq::one() };
        accumulator.self_set_infinity();
        const Fq beta = Fq::cube_root_of_unity();

        for (size_t w = NUM_WINDOWS; w-- > 0;) {                 // 31 → 0, high → low
            for (size_t h = 0; h < 2; ++h) {                     // 0 = k1·P, 1 = k2·φ(P)
                for (auto& a : active) {
                    const uint64_t* s = (h == 0) ? a.k1.data() : a.k2.data();
                    const uint32_t digit = detail::booth_packed_digit(s, slice_params[w], WINDOW_BITS);
                    const uint32_t magnitude = digit & 0x7FFFFFFFU;
                    if (magnitude == 0) continue;
                    const bool sign = (digit >> 31) != 0;
                    element to_add = a.lookup[magnitude - 1];
                    to_add.y.self_conditional_negate(sign ^ (h == 1));
                    if (h == 1) to_add.x *= beta;
                    accumulator += to_add;                       // full Jacobian add (handles acc==∞)
                }
            }
            if (w != 0) {
                for (size_t d = 0; d < WINDOW_BITS; ++d) {       // 4 doublings between windows
                    accumulator.self_dbl();
                }
            }
        }
        return accumulator;
    } else {
        /* bit-by-bit fallback for curves without endomorphism support — not reachable for BN254 G1 */
    }
}
```

---

## 5. Reference tests to mirror

`barretenberg/cpp/src/barretenberg/ecc/groups/element.test.cpp`, lines 299-339:

```cpp
static void test_straus_msm_matches_naive_sum()
{
    for (size_t n = 1; n <= 16; ++n) {
        std::vector<affine_element> points(n);
        std::vector<Fr> scalars(n);
        for (size_t i = 0; i < n; ++i) {
            points[i] = affine_element(element::random_element());
            scalars[i] = Fr::random_element();
        }
        element naive = element::infinity();
        for (size_t i = 0; i < n; ++i) naive += points[i] * scalars[i];
        element strauss = element::straus_msm(points, scalars);
        EXPECT_EQ(strauss == naive, true) << "straus_msm mismatch at n=" << n;
    }
}

static void test_straus_msm_edge_cases()
{
    EXPECT_EQ(element::straus_msm({}, {}).is_point_at_infinity(), true);

    std::vector<affine_element> points = {
        affine_element(element::random_element()), affine_element(element::random_element())
    };
    std::vector<Fr> zeros = { Fr::zero(), Fr::zero() };
    EXPECT_EQ(element::straus_msm(points, zeros).is_point_at_infinity(), true);

    const Fr s0 = Fr::random_element();
    const Fr s2 = Fr::random_element();
    std::vector<affine_element> mixed_points = {
        affine_element(element::random_element()),
        affine_element::infinity(),
        affine_element(element::random_element()),
    };
    std::vector<Fr> mixed_scalars = { s0, Fr::random_element(), s2 };
    element expected = mixed_points[0] * s0 + mixed_points[2] * s2;
    EXPECT_EQ(element::straus_msm(mixed_points, mixed_scalars) == expected, true);
}
```

Port these as vitest tests in TS against the JS-port `referenceStrausMsm`, then
mirror them as WGSL unit tests against the GPU kernel.

---

## 6. WebGPU port checklist (P1 inputs ready)

Port these to TypeScript host-side (P1):

- `splitIntoEndomorphismScalars(s: bigint) → {k1: bigint; k2: bigint}` using
  §2.1+§2.2 with the §2.3 constants. Output as 4×u32 LE per half for upload.
- `boothPackedDigit(scalar: [bigint, bigint], w: number) → number` using §1.3,
  with the slice_params from §1.5 materialized as a 32-row table.
- `referenceStrausMsm(points, scalars, k)` per §4 (full algorithm).

Inject into WGSL templates at shader-render time (P2/P3):

- `BETA_LIMBS` (β from §3, converted to the 20×13-bit Mont BigInt representation
  the existing tree uses).
- `SLICE_PARAMS_*` (the 32-row table from §1.5; emit as `const` u32 fields).
- `NUM_THREAD_MULS` per render call (compile-time, per the sweep).

WGSL kernels (P2/P3):

- `straus_lookup_precompute_bn254.template.wgsl`: one thread per active point,
  builds `[1·P, …, 8·P]` Jacobian into a global storage buffer of size 8·N.
  First add (`lookup[1] = pt + pt`) hits the collision-→-double fallback in the
  existing `add_points_mixed`.
- `straus_main_bn254.template.wgsl`: one thread per chunk; counted inner loop
  (not unrolled); reads the lookup buffer; uses `add_points` for `acc += to_add`
  (full Jacobian, handles `acc=∞`); uses `montgomery_product` with `BETA_LIMBS`
  when `h==1`; uses `double_point` for the 4 between-window doublings.
- `straus_combine_bn254.template.wgsl`: tree-fold `T = ceil(N/k)` partials with
  `add_points`, then one `fr_inv_by` + 1 `montgomery_product` to affine.

All five reference items now in hand. P0 done. Ready for P1.
