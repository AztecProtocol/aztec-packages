// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
// clang-format off

/*
 * Clear all flags via xorq opcode
 **/
#define CLEAR_FLAGS(empty_reg)                                                                                          \
        "xorq " empty_reg ", " empty_reg "      \n\t"

/**
 * Load 4-limb field element, pointed to by a, into
 * registers (lolo, lohi, hilo, hihi)
 **/
#define LOAD_FIELD_ELEMENT(a, lolo, lohi, hilo, hihi)                                                                   \
        "movq 0(" a "), " lolo "                \n\t"                                                                   \
        "movq 8(" a "), " lohi "                \n\t"                                                                   \
        "movq 16(" a "), " hilo "               \n\t"                                                                   \
        "movq 24(" a "), " hihi "               \n\t"

/**
 * Store 4-limb field element located in
 * registers (lolo, lohi, hilo, hihi), into
 * memory pointed to by r
 **/
#define STORE_FIELD_ELEMENT(r, lolo, lohi, hilo, hihi)                                                                  \
        "movq " lolo ", 0(" r ")                \n\t"                                                                   \
        "movq " lohi ", 8(" r ")                \n\t"                                                                   \
        "movq " hilo ", 16(" r ")               \n\t"                                                                   \
        "movq " hihi ", 24(" r ")               \n\t"

#if !defined(__ADX__) || defined(DISABLE_ADX)
/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * and add 4-limb field element pointed to by b
 **/
#define ADD(b)                                                                                                          \
        "addq 0(" b "), %%r12                   \n\t"                                                                   \
        "adcq 8(" b "), %%r13                   \n\t"                                                                   \
        "adcq 16(" b "), %%r14                  \n\t"                                                                   \
        "adcq 24(" b "), %%r15                  \n\t"

/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * and subtract 4-limb field element pointed to by b
 **/
#define SUB(b)                                                                                                          \
        "subq 0(" b "), %%r12                   \n\t"                                                                   \
        "sbbq 8(" b "), %%r13                   \n\t"                                                                   \
        "sbbq 16(" b "), %%r14                  \n\t"                                                                   \
        "sbbq 24(" b "), %%r15                  \n\t"


/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * add 4-limb field element pointed to by b, and reduce modulo 2p
 * Works as follows: adds the number, moves the result, adds (twos complement
 * of 2p), conditionally restores.
 * @note the 2p is because for 254 bit fields, we use the _coarse_ representation.
 **/
#define ADD_REDUCE(b, twice_not_modulus_0, twice_not_modulus_1, twice_not_modulus_2, twice_not_modulus_3)               \
        "addq 0(" b "), %%r12                   \n\t"                                                                   \
        "adcq 8(" b "), %%r13                   \n\t"                                                                   \
        "adcq 16(" b "), %%r14                  \n\t"                                                                   \
        "adcq 24(" b "), %%r15                  \n\t"                                                                   \
        "movq  %%r12, %%r8                      \n\t"                                                                   \
        "movq %%r13, %%r9                       \n\t"                                                                   \
        "movq %%r14, %%r10                      \n\t"                                                                   \
        "movq %%r15, %%r11                      \n\t"                                                                   \
        "addq " twice_not_modulus_0 ", %%r12    \n\t" /* r'[0] += ~(2p)[0]+1  (subtract 2p via two's complement) */     \
        "adcq " twice_not_modulus_1 ", %%r13    \n\t" /* r'[1] += ~(2p)[1] */                                           \
        "adcq " twice_not_modulus_2 ", %%r14    \n\t" /* r'[2] += ~(2p)[2] */                                           \
        "adcq " twice_not_modulus_3 ", %%r15    \n\t" /* r'[3] += ~(2p)[3] */                                           \
        "cmovncq %%r8, %%r12                    \n\t"                                                                   \
        "cmovncq %%r9, %%r13                    \n\t"                                                                   \
        "cmovncq %%r10, %%r14                   \n\t"                                                                   \
        "cmovncq %%r11, %%r15                   \n\t"



/**
 * Takes a 4-limb integer, r in (%r12, %r13, %r14, %r15),
 * and conditionally adds (b_0, b_1, b_2, b_3).
 * Computes r' = r + b. If there is a carry, replace r with r';
 * otherwise leave r untouched.
 * Two use cases:
 *  1. `asm_reduce_once`: b = -p. If r >= p, return r - p.
 *  2. `asm_sub_with_coarse_reduction`: b = 2p. If r wrapped negative, return r + 2p.
 **/
#define CONDITIONAL_ADD(b_0, b_1, b_2, b_3)                                                                             \
        /* Duplicate `r` */                                                                                             \
        "movq %%r12, %%r8                       \n\t"                                                                   \
        "movq %%r13, %%r9                       \n\t"                                                                   \
        "movq %%r14, %%r10                      \n\t"                                                                   \
        "movq %%r15, %%r11                      \n\t"                                                                   \
        "addq " b_0 ", %%r12                    \n\t" /* r'[0] += b[0] */                                               \
        "adcq " b_1 ", %%r13                    \n\t" /* r'[1] += b[1] */                                               \
        "adcq " b_2 ", %%r14                    \n\t" /* r'[2] += b[2] */                                               \
        "adcq " b_3 ", %%r15                    \n\t" /* r'[3] += b[3] */                                               \
                                                                                                                        \
        /* if the addition did not carry, restore the original r */                                                     \
        "cmovncq %%r8, %%r12                    \n\t"                                                                   \
        "cmovncq %%r9, %%r13                    \n\t"                                                                   \
        "cmovncq %%r10, %%r14                   \n\t"                                                                   \
        "cmovncq %%r11, %%r15                   \n\t"

/**
 * We don't have a bespoke non-ADX SQR implementation. The former implementation had a rare bug, so
 * in practice we call MUL(a, a) instead.
 **/

/**
 * Montgomery multiplication (non-ADX): computes a * b * R^{-1} mod p, with output in [0, 2p).
 *
 * Algorithm: CIOS (Coarsely Integrated Operand Scanning).
 *   Set S = 0. For i = 0..3:
 *     S += a[i] * b                        (multiply-accumulate)
 *     k  = S[0] * (-p^{-1}) mod 2^64       (Montgomery quotient)
 *     S += k * p                            (cancel lowest limb: S[0] + k*p[0] = 0 mod 2^64)
 *     S >>= 64                              (shift out the zeroed limb)
 *   Output S = (a*b + K*p) / R, where K = sum(k_i * 2^{64i}), R = 2^{256}.
 *   Since a, b < 2p < 2^{255} and 4p < R, the output satisfies S < 2p.
 *
 * Modulus assumption: p < 2^{254}, so p[3] < 2^{62}. All bit-width bounds below rely on this.
 * (For BN254 and grumpkin, p[3] ~ 0x30644e72... < 2^{62}.)
 *
 * Registers:
 *   rdx = multiplier (a[i] during multiply, k during reduce; implicit source for mulxq)
 *   r8, r9, rdi, r11 = scratch (partial products from mulxq)
 *   r[0..4+] = accumulator limbs, rotating each round (see per-round maps below)
 *
 * Carry chain structure (same pattern each round):
 *   The reduction of k*p uses THREE separate addq/adcq chains (A, B, C) to add the 8 partial
 *   products (lo/hi of k*p[0..3]) into 5 limb positions. Each addq kills the previous CF, so
 *   the killed chain's terminal CF must be 0. This holds because the top limb stays < 2^64.
 *
 * mulxq is flag-preserving: it does NOT modify CF. This is critical because mulxq instructions
 * appear between addq (which starts a carry chain) and subsequent adcq instructions.
 *
 * Bit-width invariant: entering each round i >= 1, all limbs are < 2^{64} and the top limb
 * is <= 2^{63} + 2^{62} + 5. This ensures every chain-terminal CF = 0 (no carry is lost).
 *
 * Result is stored in (%%r12, %%r13, %%r14, %%r15) for STORE_FIELD_ELEMENT.
 **/
#define MUL(a1, a2, a3, a4, b)                                                                                          \
        /* ===================================================================================== */                     \
        /* ROUND 0: accumulate a[0]*b, then reduce by k0*p. Shift out r[0]. */                                          \
        /* Register map: r13=r[0]  r14=r[1]  r15=r[2]  r10=r[3]  r12=r[4] */                                            \
        /* ===================================================================================== */                     \
        "movq " a1 ", %%rdx                       \n\t" /* rdx = a[0] */                                                \
        "xorq %%r8, %%r8                          \n\t" /* clear r8; also clears CF for first addq */                   \
                                                                                                                        \
        /* --- a[0] * b: four independent multiplies ------------------------------------------- */                     \
        "mulxq 8(" b "), %%r8, %%r9               \n\t" /* (r8, r9)   = a[0] * b[1] */                                  \
        "mulxq 24(" b "), %%rdi, %%r12            \n\t" /* (rdi, r12) = a[0] * b[3] */                                  \
        "mulxq 0(" b "), %%r13, %%r14             \n\t" /* (r13, r14) = a[0] * b[0]  -> (r[0], r[1]) */                 \
        "mulxq 16(" b "), %%r15, %%r10            \n\t" /* (r15, r10) = a[0] * b[2]  -> (r[2], r[3]) */                 \
                                                                                                                        \
        /* --- k0 computation (before addition chain so mulxq can overlap) --------------------- */                     \
        "movq %%r13, %%rdx                        \n\t" /* rdx = r[0] */                                                \
        "mulxq %[r_inv], %%rdx, %%r11             \n\t" /* rdx = k0 = r[0] * r_inv mod 2^64 */                          \
                                                                                                                        \
        /* --- Chain 0A: assemble a[0]*b cross-terms into r[1..4] ------------------------------ */                     \
        /* Killed CF: from xorq (= 0). Safe. */                                                                         \
        "addq %%r8, %%r14                         \n\t" /* r[1] += lo(a0*b1) */                                         \
        "adcq %%r9, %%r15                         \n\t" /* r[2] += hi(a0*b1) + CF */                                    \
        "adcq %%rdi, %%r10                        \n\t" /* r[3] += lo(a0*b3) + CF */                                    \
        "adcq $0, %%r12                           \n\t" /* r[4] += CF               [max: < 2^63 + 1 (b[3]<2^63)] */    \
                                                                                                                        \
        /* --- k0 * p reduction ---------------------------------------------------------------- */                     \
        /* Per-limb totals of k0*p added to S (verified across chains A, B, C below): */                                \
        /* r[0] += lo(k0*p0)                                   -> zeroed mod 2^64 */                                    \
        /* r[1] += hi(k0*p0) + lo(k0*p1) */                                                                             \
        /* r[2] += hi(k0*p1) + lo(k0*p2) */                                                                             \
        /* r[3] += hi(k0*p2) + lo(k0*p3) */                                                                             \
        /* r[4] += hi(k0*p3) */                                                                                         \
        "mulxq %[modulus_0], %%r8, %%r9           \n\t" /* (r8, r9)   = k0 * p[0] */                                    \
        "mulxq %[modulus_1], %%rdi, %%r11         \n\t" /* (rdi, r11) = k0 * p[1] */                                    \
        /* Chain 0B: lo(k0*p0), lo(k0*p1), hi(k0*p1), 0, 0 */                                                           \
        /* Killed CF: terminal of chain 0A (r[4] < 2^63 + 1 < 2^64). Safe. */                                           \
        "addq %%r8, %%r13                         \n\t" /* r[0] += lo(k0*p0) -> 0 mod 2^64 */                           \
        "adcq %%rdi, %%r14                        \n\t" /* r[1] += lo(k0*p1) + CF */                                    \
        "adcq %%r11, %%r15                        \n\t" /* r[2] += hi(k0*p1) + CF */                                    \
        "adcq $0, %%r10                           \n\t" /* r[3] += CF */                                                \
        "adcq $0, %%r12                           \n\t" /* r[4] += CF               [max: <= 2^63 + 1] */               \
        /* Chain 0C: hi(k0*p0), lo(k0*p2), lo(k0*p3), hi(k0*p3) */                                                      \
        /* Killed CF: terminal of chain 0B (r[4] <= 2^63 + 1 < 2^64). Safe. */                                          \
        "addq %%r9, %%r14                         \n\t" /* r[1] += hi(k0*p0) */                                         \
        "mulxq %[modulus_2], %%r8, %%r9           \n\t" /* (r8, r9)   = k0 * p[2] */                                    \
        "mulxq %[modulus_3], %%rdi, %%r11         \n\t" /* (rdi, r11) = k0 * p[3] */                                    \
        "adcq %%r8, %%r15                         \n\t" /* r[2] += lo(k0*p2) + CF */                                    \
        "adcq %%rdi, %%r10                        \n\t" /* r[3] += lo(k0*p3) + CF */                                    \
        "adcq %%r11, %%r12                        \n\t" /* r[4] += hi(k0*p3) + CF   [max: <= 2^63 + 2^62 + 2] */        \
        /* Chain 0D: hi(k0*p2), 0 */                                                                                    \
        /* Killed CF: terminal of chain 0C (r[4] <= 2^63 + 2^62 + 2 < 2^64). Safe. */                                   \
        "addq %%r9, %%r10                         \n\t" /* r[3] += hi(k0*p2) */                                         \
        "adcq $0, %%r12                           \n\t" /* r[4] += CF               [max: <= 2^63 + 2^62 + 3] */        \
                                                                                                                        \
        /* Post-round 0: r[4] <= 2^63 + 2^62 + 3 < 2^64. No 5th limb needed. */                                         \
                                                                                                                        \
        /* ===================================================================================== */                     \
        /* ROUND 1: accumulate a[1]*b, then reduce by k1*p. Shift out r[1]. */                                          \
        /* Register map: r14=r[1]  r15=r[2]  r10=r[3]  r12=r[4]  r13=r[5] */                                            \
        /* ===================================================================================== */                     \
        "movq " a2 ", %%rdx                       \n\t" /* rdx = a[1] */                                                \
        "mulxq 0(" b "), %%r8, %%r9               \n\t" /* (r8, r9)   = a[1] * b[0] */                                  \
        "mulxq 8(" b "), %%rdi, %%r11             \n\t" /* (rdi, r11) = a[1] * b[1] */                                  \
        /* Chain 1A: lo(a1*b0), lo(a1*b1), hi(a1*b1), 0 */                                                              \
        /* Killed CF: terminal of chain 0D (r[4] <= 2^63 + 2^62 + 3 < 2^64). Safe. */                                   \
        "addq %%r8, %%r14                         \n\t" /* r[1] += lo(a1*b0) */                                         \
        "adcq %%rdi, %%r15                        \n\t" /* r[2] += lo(a1*b1) + CF */                                    \
        "adcq %%r11, %%r10                        \n\t" /* r[3] += hi(a1*b1) + CF */                                    \
        "adcq $0, %%r12                           \n\t" /* r[4] += CF               [max: <= 2^63 + 2^62 + 4] */        \
        /* Chain 1B: hi(a1*b0), lo(a1*b2), lo(a1*b3), 0 */                                                              \
        /* Killed CF: terminal of chain 1A (r[4] <= 2^63 + 2^62 + 4 < 2^64). Safe. */                                   \
        "addq %%r9, %%r15                         \n\t" /* r[2] += hi(a1*b0) */                                         \
        "mulxq 16(" b "), %%r8, %%r9              \n\t" /* (r8, r9)   = a[1] * b[2] */                                  \
        "mulxq 24(" b "), %%rdi, %%r13            \n\t" /* (rdi, r13) = a[1] * b[3]  -> r13 = r[5] = hi(a1*b3) */       \
        "adcq %%r8, %%r10                         \n\t" /* r[3] += lo(a1*b2) + CF */                                    \
        "adcq %%rdi, %%r12                        \n\t" /* r[4] += lo(a1*b3) + CF */                                    \
        "adcq $0, %%r13                           \n\t" /* r[5] += CF               [max: < 2^63 + 1] */                \
        /* Chain 1C: hi(a1*b2), 0 */                                                                                    \
        /* Killed CF: terminal of chain 1B (r[5] < 2^63 + 1). Safe. */                                                  \
        "addq %%r9, %%r12                         \n\t" /* r[4] += hi(a1*b2) */                                         \
        "adcq $0, %%r13                           \n\t" /* r[5] += CF               [max: < 2^63 + 2] */                \
                                                                                                                        \
        /* --- k1 * p reduction ---------------------------------------------------------------- */                     \
        /* Per-limb totals of k1*p added (same decomposition as round 0, shifted by one): */                            \
        /* r[1] += lo(k1*p0)                                   -> zeroed mod 2^64 */                                    \
        /* r[2] += hi(k1*p0) + lo(k1*p1) */                                                                             \
        /* r[3] += hi(k1*p1) + lo(k1*p2) */                                                                             \
        /* r[4] += hi(k1*p2) + lo(k1*p3) */                                                                             \
        /* r[5] += hi(k1*p3) */                                                                                         \
        "movq %%r14, %%rdx                        \n\t" /* rdx = r[1] */                                                \
        "mulxq %[r_inv], %%rdx, %%r8              \n\t" /* rdx = k1 = r[1] * r_inv mod 2^64 */                          \
        "mulxq %[modulus_0], %%r8, %%r9           \n\t" /* (r8, r9)   = k1 * p[0] */                                    \
        "mulxq %[modulus_1], %%rdi, %%r11         \n\t" /* (rdi, r11) = k1 * p[1] */                                    \
        /* Chain 1D: lo(k1*p0), lo(k1*p1), hi(k1*p1), 0, 0 */                                                           \
        /* Killed CF: terminal of chain 1C (r[5] < 2^63 + 2 < 2^64). Safe. */                                           \
        "addq %%r8, %%r14                         \n\t" /* r[1] += lo(k1*p0) -> 0 mod 2^64 */                           \
        "adcq %%rdi, %%r15                        \n\t" /* r[2] += lo(k1*p1) + CF */                                    \
        "adcq %%r11, %%r10                        \n\t" /* r[3] += hi(k1*p1) + CF */                                    \
        "adcq $0, %%r12                           \n\t" /* r[4] += CF */                                                \
        "adcq $0, %%r13                           \n\t" /* r[5] += CF               [max: < 2^63 + 3] */                \
        /* Chain 1E: hi(k1*p0), lo(k1*p2), hi(k1*p2), hi(k1*p3) */                                                      \
        /* Killed CF: terminal of chain 1D (r[5] < 2^63 + 3 < 2^64). Safe. */                                           \
        "addq %%r9, %%r15                         \n\t" /* r[2] += hi(k1*p0) */                                         \
        "mulxq %[modulus_2], %%r8, %%r9           \n\t" /* (r8, r9)   = k1 * p[2] */                                    \
        "mulxq %[modulus_3], %%rdi, %%r11         \n\t" /* (rdi, r11) = k1 * p[3] */                                    \
        "adcq %%r8, %%r10                         \n\t" /* r[3] += lo(k1*p2) + CF */                                    \
        "adcq %%r9, %%r12                         \n\t" /* r[4] += hi(k1*p2) + CF */                                    \
        "adcq %%r11, %%r13                        \n\t" /* r[5] += hi(k1*p3) + CF   [max: <= 2^63 + 2^62 + 5] */        \
        /* Chain 1F: lo(k1*p3), 0 */                                                                                    \
        /* Killed CF: terminal of chain 1E (r[5] <= 2^63 + 2^62 + 5 < 2^64). Safe. */                                   \
        "addq %%rdi, %%r12                        \n\t" /* r[4] += lo(k1*p3) */                                         \
        "adcq $0, %%r13                           \n\t" /* r[5] += CF               [max: <= 2^63 + 2^62 + 6] */        \
                                                                                                                        \
        /* Post-round 1: r[5] <= 2^63 + 2^62 + 6 < 2^64. Invariant holds. */                                            \
                                                                                                                        \
        /* ===================================================================================== */                     \
        /* ROUND 2: accumulate a[2]*b, then reduce by k2*p. Shift out r[2]. */                                          \
        /* Register map: r15=r[2]  r10=r[3]  r12=r[4]  r13=r[5]  r14=r[6] */                                            \
        /* ===================================================================================== */                     \
        "movq " a3 ", %%rdx                       \n\t" /* rdx = a[2] */                                                \
        "mulxq 0(" b "), %%r8, %%r9               \n\t" /* (r8, r9)   = a[2] * b[0] */                                  \
        "mulxq 8(" b "), %%rdi, %%r11             \n\t" /* (rdi, r11) = a[2] * b[1] */                                  \
        /* Chain 2A: lo(a2*b0), hi(a2*b0), hi(a2*b1), 0 */                                                              \
        /* Killed CF: terminal of chain 1F (r[5] <= 2^63 + 2^62 + 6 < 2^64). Safe. */                                   \
        "addq %%r8, %%r15                         \n\t" /* r[2] += lo(a2*b0) */                                         \
        "adcq %%r9, %%r10                         \n\t" /* r[3] += hi(a2*b0) + CF */                                    \
        "adcq %%r11, %%r12                        \n\t" /* r[4] += hi(a2*b1) + CF */                                    \
        "adcq $0, %%r13                           \n\t" /* r[5] += CF */                                                \
        /* Chain 2B: lo(a2*b1), lo(a2*b2), hi(a2*b2), 0 */                                                              \
        /* Killed CF: terminal of chain 2A (r[5] < 2^64). Safe. */                                                      \
        "addq %%rdi, %%r10                        \n\t" /* r[3] += lo(a2*b1) */                                         \
        "mulxq 16(" b "), %%r8, %%r9              \n\t" /* (r8, r9)   = a[2] * b[2] */                                  \
        "mulxq 24(" b "), %%rdi, %%r14            \n\t" /* (rdi, r14) = a[2] * b[3]  -> r14 = r[6] = hi(a2*b3) */       \
        "adcq %%r8, %%r12                         \n\t" /* r[4] += lo(a2*b2) + CF */                                    \
        "adcq %%r9, %%r13                         \n\t" /* r[5] += hi(a2*b2) + CF */                                    \
        "adcq $0, %%r14                           \n\t" /* r[6] += CF               [max: < 2^63 + 1] */                \
        /* Chain 2C: lo(a2*b3), 0 */                                                                                    \
        "addq %%rdi, %%r13                        \n\t" /* r[5] += lo(a2*b3) */                                         \
        "adcq $0, %%r14                           \n\t" /* r[6] += CF               [max: < 2^63 + 2] */                \
                                                                                                                        \
        /* --- k2 * p reduction ---------------------------------------------------------------- */                     \
        /* Per-limb totals of k2*p added: */                                                                            \
        /* r[2] += lo(k2*p0)                                   -> zeroed mod 2^64 */                                    \
        /* r[3] += hi(k2*p0) + lo(k2*p1) */                                                                             \
        /* r[4] += hi(k2*p1) + lo(k2*p2) */                                                                             \
        /* r[5] += hi(k2*p2) + lo(k2*p3) */                                                                             \
        /* r[6] += hi(k2*p3) */                                                                                         \
        "movq %%r15, %%rdx                        \n\t" /* rdx = r[2] */                                                \
        "mulxq %[r_inv], %%rdx, %%r8              \n\t" /* rdx = k2 = r[2] * r_inv mod 2^64 */                          \
        "mulxq %[modulus_0], %%r8, %%r9           \n\t" /* (r8, r9)   = k2 * p[0] */                                    \
        "mulxq %[modulus_1], %%rdi, %%r11         \n\t" /* (rdi, r11) = k2 * p[1] */                                    \
        /* Chain 2D: lo(k2*p0), hi(k2*p0), hi(k2*p1), 0, 0 */                                                           \
        /* Note: chain structure differs from rounds 0-1! Here adcq carries hi(k2*p0) at r[3], */                       \
        /* not lo(k2*p1). Both partial products reach the correct limb across chains D+E. */                            \
        /* Killed CF: terminal of chain 2C (r[6] < 2^63 + 2 < 2^64). Safe. */                                           \
        "addq %%r8, %%r15                         \n\t" /* r[2] += lo(k2*p0) -> 0 mod 2^64 */                           \
        "adcq %%r9, %%r10                         \n\t" /* r[3] += hi(k2*p0) + CF */                                    \
        "adcq %%r11, %%r12                        \n\t" /* r[4] += hi(k2*p1) + CF */                                    \
        "adcq $0, %%r13                           \n\t" /* r[5] += CF */                                                \
        "adcq $0, %%r14                           \n\t" /* r[6] += CF               [max: < 2^63 + 3] */                \
        /* Chain 2E: lo(k2*p1), lo(k2*p2), hi(k2*p2), hi(k2*p3) */                                                      \
        /* Killed CF: terminal of chain 2D (r[6] < 2^63 + 3 < 2^64). Safe. */                                           \
        "addq %%rdi, %%r10                        \n\t" /* r[3] += lo(k2*p1) */                                         \
        "mulxq %[modulus_2], %%r8, %%r9           \n\t" /* (r8, r9)   = k2 * p[2] */                                    \
        "mulxq %[modulus_3], %%rdi, %%r11         \n\t" /* (rdi, r11) = k2 * p[3] */                                    \
        "adcq %%r8, %%r12                         \n\t" /* r[4] += lo(k2*p2) + CF */                                    \
        "adcq %%r9, %%r13                         \n\t" /* r[5] += hi(k2*p2) + CF */                                    \
        "adcq %%r11, %%r14                        \n\t" /* r[6] += hi(k2*p3) + CF   [max: <= 2^63 + 2^62 + 5] */        \
        /* Chain 2F: lo(k2*p3), 0 */                                                                                    \
        /* Killed CF: terminal of chain 2E (r[6] <= 2^63 + 2^62 + 5 < 2^64). Safe. */                                   \
        "addq %%rdi, %%r13                        \n\t" /* r[5] += lo(k2*p3) */                                         \
        "adcq $0, %%r14                           \n\t" /* r[6] += CF               [max: <= 2^63 + 2^62 + 6] */        \
                                                                                                                        \
        /* Post-round 2: r[6] <= 2^63 + 2^62 + 6 < 2^64. Invariant holds. */                                            \
                                                                                                                        \
        /* ===================================================================================== */                     \
        /* ROUND 3: accumulate a[3]*b, then reduce by k3*p. Shift out r[3]. */                                          \
        /* Register map: r10=r[3]  r12=r[4]  r13=r[5]  r14=r[6]  r15=r[7] */                                            \
        /* Tighter bound: a[3] < 2^63 (not 2^64), so hi(a3*b3) < 2^62. */                                               \
        /* ===================================================================================== */                     \
        "movq " a4 ", %%rdx                       \n\t" /* rdx = a[3] (< 2^63) */                                       \
        "mulxq 0(" b "), %%r8, %%r9               \n\t" /* (r8, r9)   = a[3] * b[0] */                                  \
        "mulxq 8(" b "), %%rdi, %%r11             \n\t" /* (rdi, r11) = a[3] * b[1] */                                  \
        /* Chain 3A: lo(a3*b0), hi(a3*b0), hi(a3*b1), 0 */                                                              \
        /* Killed CF: terminal of chain 2F (r[6] <= 2^63 + 2^62 + 6 < 2^64). Safe. */                                   \
        "addq %%r8, %%r10                         \n\t" /* r[3] += lo(a3*b0) */                                         \
        "adcq %%r9, %%r12                         \n\t" /* r[4] += hi(a3*b0) + CF */                                    \
        "adcq %%r11, %%r13                        \n\t" /* r[5] += hi(a3*b1) + CF */                                    \
        "adcq $0, %%r14                           \n\t" /* r[6] += CF */                                                \
        /* Chain 3B: lo(a3*b1), lo(a3*b2), hi(a3*b2), 0 */                                                              \
        /* Killed CF: terminal of chain 3A (r[6] < 2^64). Safe. */                                                      \
        "addq %%rdi, %%r12                        \n\t" /* r[4] += lo(a3*b1) */                                         \
        "mulxq 16(" b "), %%r8, %%r9              \n\t" /* (r8, r9)   = a[3] * b[2] */                                  \
        "mulxq 24(" b "), %%rdi, %%r15            \n\t" /* (rdi, r15) = a[3] * b[3]  -> r15 = r[7] = hi(a3*b3) */       \
        "adcq %%r8, %%r13                         \n\t" /* r[5] += lo(a3*b2) + CF */                                    \
        "adcq %%r9, %%r14                         \n\t" /* r[6] += hi(a3*b2) + CF */                                    \
        "adcq $0, %%r15                           \n\t" /* r[7] += CF               [max: < 2^62 + 1] */                \
        /* Chain 3C: lo(a3*b3), 0 */                                                                                    \
        "addq %%rdi, %%r14                        \n\t" /* r[6] += lo(a3*b3) */                                         \
        "adcq $0, %%r15                           \n\t" /* r[7] += CF               [max: < 2^62 + 2] */                \
                                                                                                                        \
        /* --- k3 * p reduction ---------------------------------------------------------------- */                     \
        /* Per-limb totals of k3*p added: */                                                                            \
        /* r[3] += lo(k3*p0)                                   -> zeroed mod 2^64 */                                    \
        /* r[4] += hi(k3*p0) + lo(k3*p1) */                                                                             \
        /* r[5] += hi(k3*p1) + lo(k3*p2) */                                                                             \
        /* r[6] += hi(k3*p2) + lo(k3*p3) */                                                                             \
        /* r[7] += hi(k3*p3) */                                                                                         \
        "movq %%r10, %%rdx                        \n\t" /* rdx = r[3] */                                                \
        "mulxq %[r_inv], %%rdx, %%r8              \n\t" /* rdx = k3 = r[3] * r_inv mod 2^64 */                          \
        "mulxq %[modulus_0], %%r8, %%r9           \n\t" /* (r8, r9)   = k3 * p[0] */                                    \
        "mulxq %[modulus_1], %%rdi, %%r11         \n\t" /* (rdi, r11) = k3 * p[1] */                                    \
        /* Chain 3D: lo(k3*p0), hi(k3*p0), hi(k3*p1), 0, 0 */                                                           \
        /* Killed CF: terminal of chain 3C (r[7] < 2^62 + 2 < 2^64). Safe. */                                           \
        "addq %%r8, %%r10                         \n\t" /* r[3] += lo(k3*p0) -> 0 mod 2^64 */                           \
        "adcq %%r9, %%r12                         \n\t" /* r[4] += hi(k3*p0) + CF */                                    \
        "adcq %%r11, %%r13                        \n\t" /* r[5] += hi(k3*p1) + CF */                                    \
        "adcq $0, %%r14                           \n\t" /* r[6] += CF */                                                \
        "adcq $0, %%r15                           \n\t" /* r[7] += CF               [max: < 2^62 + 3] */                \
        /* Chain 3E: lo(k3*p1), lo(k3*p2), hi(k3*p2), hi(k3*p3) */                                                      \
        /* Killed CF: terminal of chain 3D (r[7] < 2^62 + 3 < 2^64). Safe. */                                           \
        "addq %%rdi, %%r12                        \n\t" /* r[4] += lo(k3*p1) */                                         \
        "mulxq %[modulus_2], %%r8, %%r9           \n\t" /* (r8, r9)   = k3 * p[2] */                                    \
        "mulxq %[modulus_3], %%rdi, %%rdx         \n\t" /* (rdi, rdx) = k3 * p[3]  (overwrites rdx; last mulxq) */      \
        "adcq %%r8, %%r13                         \n\t" /* r[5] += lo(k3*p2) + CF */                                    \
        "adcq %%r9, %%r14                         \n\t" /* r[6] += hi(k3*p2) + CF */                                    \
        "adcq %%rdx, %%r15                        \n\t" /* r[7] += hi(k3*p3) + CF   [max: < 2^63 + 5] */                \
        /* Chain 3F: lo(k3*p3), 0 */                                                                                    \
        /* Killed CF: terminal of chain 3E (r[7] < 2^63 + 5 < 2^64). Safe. */                                           \
        "addq %%rdi, %%r14                        \n\t" /* r[6] += lo(k3*p3) */                                         \
        "adcq $0, %%r15                           \n\t" /* r[7] += CF               [max: < 2^63 + 6] */                \
                                                                                                                        \
        /* Output in (r12, r13, r14, r15) = (r[4], r[5], r[6], r[7]). */                                                \
        /* Since S < 2p < 2^255, the top limb r[7] < 2^63. Valid input for another MUL. */


#else // 6047895us
/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * and add 4-limb field element pointed to by b
 **/
#define ADD(b)                                                                                                          \
        "adcxq 0(" b "), %%r12                  \n\t"                                                                   \
        "adcxq 8(" b "), %%r13                  \n\t"                                                                   \
        "adcxq 16(" b "), %%r14                 \n\t"                                                                   \
        "adcxq 24(" b "), %%r15                 \n\t"

/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * and subtract 4-limb field element pointed to by b
 **/
#define SUB(b)                                                                                                          \
        "subq 0(" b "), %%r12                   \n\t"                                                                   \
        "sbbq 8(" b "), %%r13                   \n\t"                                                                   \
        "sbbq 16(" b "), %%r14                  \n\t"                                                                   \
        "sbbq 24(" b "), %%r15                  \n\t"

/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * add 4-limb field element pointed to by b, and reduce modulo 2p
 **/
#define ADD_REDUCE(b, twice_not_modulus_0, twice_not_modulus_1, twice_not_modulus_2, twice_not_modulus_3)               \
        "adcxq 0(" b "), %%r12                  \n\t"                                                                   \
        "movq  %%r12, %%r8                      \n\t"                                                                   \
        "adoxq " twice_not_modulus_0 ", %%r12   \n\t"                                                                   \
        "adcxq 8(" b "), %%r13                  \n\t"                                                                   \
        "movq %%r13, %%r9                       \n\t"                                                                   \
        "adoxq " twice_not_modulus_1 ", %%r13   \n\t"                                                                   \
        "adcxq 16(" b "), %%r14                 \n\t"                                                                   \
        "movq %%r14, %%r10                      \n\t"                                                                   \
        "adoxq " twice_not_modulus_2 ", %%r14   \n\t"                                                                   \
        "adcxq 24(" b "), %%r15                 \n\t"                                                                   \
        "movq %%r15, %%r11                      \n\t"                                                                   \
        "adoxq " twice_not_modulus_3 ", %%r15   \n\t"                                                                   \
        "cmovnoq %%r8, %%r12                    \n\t"                                                                   \
        "cmovnoq %%r9, %%r13                    \n\t"                                                                   \
        "cmovnoq %%r10, %%r14                   \n\t"                                                                   \
        "cmovnoq %%r11, %%r15                   \n\t"


/**
 * Takes a 4-limb integer, r in (%r12, %r13, %r14, %r15),
 * and conditionally adds (b_0, b_1, b_2, b_3).
 * Computes r' = r + b. If there is a carry (overflow), replace r with r';
 * otherwise leave r untouched.
 * Uses `adoxq` instead of `addq` so that only the overflow flag is affected,
 * leaving the carry flag free for simultaneous `adcxq` chains.
 **/
#define CONDITIONAL_ADD(b_0, b_1, b_2, b_3)                                                                             \
        /* Duplicate `r` */                                                                                             \
        "movq %%r12, %%r8                          \n\t"                                                                \
        "movq %%r13, %%r9                          \n\t"                                                                \
        "movq %%r14, %%r10                         \n\t"                                                                \
        "movq %%r15, %%r11                         \n\t"                                                                \
        "adoxq " b_0 ", %%r12                      \n\t" /* r'[0] += b[0] */                                            \
        "adoxq " b_1 ", %%r13                      \n\t" /* r'[1] += b[1] */                                            \
        "adoxq " b_2 ", %%r14                      \n\t" /* r'[2] += b[2] */                                            \
        "adoxq " b_3 ", %%r15                      \n\t" /* r'[3] += b[3] */                                            \
                                                                                                                        \
        /* if the addition did not overflow, restore the original r */                                                  \
        "cmovnoq %%r8, %%r12                       \n\t"                                                                \
        "cmovnoq %%r9, %%r13                       \n\t"                                                                \
        "cmovnoq %%r10, %%r14                      \n\t"                                                                \
        "cmovnoq %%r11, %%r15                      \n\t"


/**
 * One Montgomery reduction step (ADX) on a 4-limb accumulator (u0, u1, u2, u3): k = u0 * r_inv mod 2^64, then
 * u = (u + k * p) / 2^64. The new top limb is written into u0's register (u0 is zero after adding lo(k * p0)), so
 * the accumulator becomes (u1, u2, u3, u0).
 *
 * k is computed with imulq, which clobbers the flags: no carry may be pending when this step starts. Both chains
 * restart from a zeroing xor. Bounds: u < 2^256 on entry, so u + k * p < 2^256 + 2^64 * p < 2^320; neither chain
 * carries out of the top limb, both flags are 0 on exit, and the new u < 2^192 + p.
 * Uses rdi, rcx as scratch.
 **/
#define SQR_REDUCE_STEP(u0, u1, u2, u3)                                                                                 \
        "movq " u0 ", %%rdx                         \n\t" /* rdx = u[0] */                                              \
        "imulq %[r_inv], %%rdx                      \n\t" /* rdx = k = u[0] * r_inv mod 2^64 */                         \
        "xorl %%edi, %%edi                          \n\t" /* CF = OF = 0 */                                             \
        "mulxq %[modulus_0], %%rdi, %%rcx           \n\t" /* (rdi, rcx) = k * p[0] */                                   \
        "adcxq %%rdi, " u0 "                        \n\t" /* u[0] += lo(k*p0) -> 0 mod 2^64 */                          \
        "adoxq %%rcx, " u1 "                        \n\t" /* u[1] += hi(k*p0) */                                        \
        "mulxq %[modulus_1], %%rdi, %%rcx           \n\t" /* (rdi, rcx) = k * p[1] */                                   \
        "adcxq %%rdi, " u1 "                        \n\t" /* u[1] += lo(k*p1) + CF */                                   \
        "adoxq %%rcx, " u2 "                        \n\t" /* u[2] += hi(k*p1) + OF */                                   \
        "mulxq %[modulus_2], %%rdi, %%rcx           \n\t" /* (rdi, rcx) = k * p[2] */                                   \
        "adcxq %%rdi, " u2 "                        \n\t" /* u[2] += lo(k*p2) + CF */                                   \
        "adoxq %%rcx, " u3 "                        \n\t" /* u[3] += hi(k*p2) + OF */                                   \
        "mulxq %[modulus_3], %%rdi, " u0 "          \n\t" /* (rdi, top) = k * p[3]; top replaces the zeroed u[0] */     \
        "adcxq %%rdi, " u3 "                        \n\t" /* u[3] += lo(k*p3) + CF */                                   \
        "adoxq %[zero_reference], " u0 "            \n\t" /* top += OF  (OF -> 0) */                                    \
        "adcxq %[zero_reference], " u0 "            \n\t" /* top += CF  (CF -> 0) */

/**
 * Montgomery squaring (ADX): computes a^2 * R^{-1} mod p, with output in [0, 2p).
 *
 * Uses the identity a^2 = 2 * sum_{i<j} a[i]*a[j] + sum_i a[i]^2 to halve the multiplies.
 *
 * Phase 1: Compute the 6 cross-products a[i]*a[j] (i<j), accumulate into r[1..6].
 * Phase 2: Double r[1..6] via self-addition (two interleaved 3-limb carry chains).
 * Phase 3: Add the 4 squared terms a[i]^2 into r[0..7], completing a^2 = T = T_hi * R + T_lo.
 * Phase 4: Montgomery-reduce the low half only: four SQR_REDUCE_STEPs turn T_lo into U = (T_lo + K*p) / R, where
 *          K < R is the unique value with T_lo + K*p = 0 mod R. Since T + K*p = 0 mod R as well,
 *          (T + K*p) / R = T_hi + U, so the result is U + T_hi. K, and hence every output bit, is the same as for
 *          the interleaved reduction of the whole of T.
 *
 * The reduction of T_lo only needs r[0..3], so it does not wait for the high half of the product; T_hi is
 * added at the very end.
 *
 * Input: a < 2p < 2^{255}, so a[3] < 2^{63}, p[3] < 2^{62}.
 * Bounds: U < (R + R*p) / R = p + 1, and T_hi + U = (T + K*p) / R < (4p^2 + R*p) / R < 2p since 4p < R, so the
 * final addition does not carry out.
 * Output: a^2 * R^{-1} mod p in [0, 2p), stored in (r12, r13, r14, r15).
 **/
#define SQR(a)                                                                                                          \
        /* ===================================================================================== */                     \
        /* PHASE 1: Cross-products. Compute sum_{i<j} a[i]*a[j] into r[1..6]. */                                        \
        /*  */                                                                                                          \
        /* The 6 products and their limb positions (lo, hi): */                                                         \
        /* a[0]*a[1] -> (r[1], r[2])     a[0]*a[2] -> (r[2], r[3])     a[0]*a[3] -> (r[3], r[4]) */                     \
        /* a[1]*a[2] -> (r[3], r[4])     a[1]*a[3] -> (r[4], r[5])     a[2]*a[3] -> (r[5], r[6]) */                     \
        /*  */                                                                                                          \
        /* Per-limb totals (cross-products only, before doubling): */                                                   \
        /* r[1] = lo(a0*a1) */                                                                                          \
        /* r[2] = hi(a0*a1) + lo(a0*a2) */                                                                              \
        /* r[3] = hi(a0*a2) + lo(a0*a3) + lo(a1*a2) */                                                                  \
        /* r[4] = hi(a0*a3) + hi(a1*a2) + lo(a1*a3) */                                                                  \
        /* r[5] = hi(a1*a3) + lo(a2*a3) */                                                                              \
        /* r[6] = hi(a2*a3) */                                                                                          \
        /*  */                                                                                                          \
        /* adcx sequence (CF): adds into r[3], r[4], r[5], r[6] (hi cross-terms + flushes) */                           \
        /* adox sequence (OF): adds into r[2], r[3], r[4], r[5], r[6] (lo cross-terms + flushes) */                     \
        /* ===================================================================================== */                     \
        "movq 0(" a "), %%rdx                      \n\t" /* rdx = a[0] */                                               \
        "xorq %%r8, %%r8                           \n\t" /* clear r8; sets CF=0, OF=0 */                                \
                                                                                                                        \
        /* --- a[0] * a[1..3] ------------------------------------------------------------------ */                     \
        "mulxq 8(" a "), %%r9, %%r10               \n\t" /* (r9, r10)  = a[0]*a[1]  -> (r[1], r[2]) */                  \
        "mulxq 16(" a "), %%r8, %%r15              \n\t" /* (r8, r15)  = a[0]*a[2]  -> needs r[2], r[3] */              \
        "mulxq 24(" a "), %%r11, %%r12             \n\t" /* (r11, r12) = a[0]*a[3]  -> (r[3], r[4]) */                  \
                                                                                                                        \
        /* {CF=0, OF=0} */                                                                                              \
        "adoxq %%r8, %%r10                         \n\t" /* r[2] += lo(a0*a2)         {OF->OF1} */                      \
        "adcxq %%r15, %%r11                        \n\t" /* r[3] += hi(a0*a2) + CF=0  {CF->CF1} */                      \
                                                                                                                        \
        /* --- a[1] * a[2..3] ------------------------------------------------------------------ */                     \
        "movq 8(" a "), %%rdx                      \n\t" /* rdx = a[1] */                                               \
        "mulxq 16(" a "), %%r8, %%r15              \n\t" /* (r8, r15)  = a[1]*a[2] */                                   \
        "mulxq 24(" a "), %%rdi, %%rcx             \n\t" /* (rdi, rcx) = a[1]*a[3] */                                   \
                                                                                                                        \
        /* --- a[2] * a[3] -------------------------------------------------------------------- */                      \
        "movq 24(" a "), %%rdx                     \n\t" /* rdx = a[3] */                                               \
        "mulxq 16(" a "), %%r13, %%r14             \n\t" /* (r13, r14) = a[2]*a[3]  -> (r[5], r[6]) */                  \
                                                                                                                        \
        /* --- Accumulate remaining cross-terms ------------------------------------------------ */                     \
        "adoxq %%r8, %%r11                         \n\t" /* r[3] += lo(a1*a2) + OF1   {OF->OF2} */                      \
        "adcxq %%rdi, %%r12                        \n\t" /* r[4] += lo(a1*a3) + CF1   {CF->CF2} */                      \
        "adoxq %%r15, %%r12                        \n\t" /* r[4] += hi(a1*a2) + OF2   {OF->OF3} */                      \
        "adcxq %%rcx, %%r13                        \n\t" /* r[5] += hi(a1*a3) + CF2   {CF->CF3} */                      \
        "adoxq %[zero_reference], %%r13            \n\t" /* r[5] += OF3               {OF->OF4} */                      \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += CF3               {CF->CF4} */                      \
        /* r[6] = hi(a2*a3) + CF3. Since a[2],a[3] < 2^{63}: hi(a2*a3) < 2^{62}, */                                     \
        /* so r[6] < 2^{62} + 1 < 2^{64}. CF4 = 0. */                                                                   \
        "adoxq %[zero_reference], %%r14            \n\t" /* r[6] += OF4               {OF->OF5} */                      \
        /* r[6] < 2^{62} + 2 < 2^{64}. OF5 = 0. */                                                                      \
                                                                                                                        \
        /* Post-phase 1: r[1..6] hold cross-products. */                                                                \
        /* After flushing both chains into r[6], no further carry is possible because */                                \
        /* r[6] = hi(a2*a3) + CF3 + OF4 < 2^{62} + 2 < 2^{64}. So CF4 = OF5 = 0, */                                     \
        /* meaning Phase 2 doubling starts with zero incoming carry on both chains. */                                  \
                                                                                                                        \
        /* ===================================================================================== */                     \
        /* PHASE 2: Double r[1..6] via self-addition. */                                                                \
        /*  */                                                                                                          \
        /* Two independent 3-limb self-additions (doubling): */                                                         \
        /* adox: r[1], r[2], r[3]   (low half, entering with OF5=0) */                                                  \
        /* adcx: r[4], r[5], r[6]   (high half, entering with CF4=0) */                                                 \
        /*  */                                                                                                          \
        /* OF=0 and CF=0 entering are critical: doubling via r += r requires no incoming carry. */                      \
        /* ===================================================================================== */                     \
        "adoxq %%r9, %%r9                          \n\t" /* r[1] = 2*r[1]             {OF->OF6} */                      \
        "adcxq %%r12, %%r12                        \n\t" /* r[4] = 2*r[4]             {CF->CF5} */                      \
        "adoxq %%r10, %%r10                        \n\t" /* r[2] = 2*r[2] + OF6       {OF->OF7} */                      \
        "adcxq %%r13, %%r13                        \n\t" /* r[5] = 2*r[5] + CF5       {CF->CF6} */                      \
        "adoxq %%r11, %%r11                        \n\t" /* r[3] = 2*r[3] + OF7       {OF->OF8} */                      \
        "adcxq %%r14, %%r14                        \n\t" /* r[6] = 2*r[6] + CF6       {CF->CF7} */                      \
        /* r[6]_old < 2^{62}+2, so 2*r[6]+CF6 < 2^{63}+5 < 2^{64}. CF7 = 0. */                                          \
                                                                                                                        \
        /* Post-phase 2: r[1..6] = 2 * cross_products. */                                                               \
        /* OF8 (from low-half doubling) is pending — consumed by the first adox in Phase 3. */                          \
        /* CF7 (from high-half doubling) is pending — consumed by the first adcx in Phase 3. */                         \
                                                                                                                        \
        /* ===================================================================================== */                     \
        /* PHASE 3: Add squared terms a[i]^2 to complete a^2 = 2*cross + squares. */                                    \
        /*  */                                                                                                          \
        /* The pending CF7 from Phase 2's high-half doubling is consumed first when adding */                           \
        /* hi(a0^2) into r[1] via adcx. The pending OF8 from low-half doubling is consumed */                           \
        /* first when adding lo(a2^2) into r[4] via adox. */                                                            \
        /*  */                                                                                                          \
        /* Each a[i]^2 splits into (lo, hi) at positions (r[2i], r[2i+1]): */                                           \
        /* a[0]^2 -> (r[0], r[1]),  a[1]^2 -> (r[2], r[3]) */                                                           \
        /* a[2]^2 -> (r[4], r[5]),  a[3]^2 -> (r[6], r[7]) */                                                           \
        /* ===================================================================================== */                     \
        "movq 0(" a "), %%rdx                      \n\t" /* rdx = a[0] */                                               \
        "mulxq %%rdx, %%r8, %%rcx                  \n\t" /* (r8, rcx) = a[0]^2  -> r[0] = r8, hi goes to r[1] */        \
        "movq 16(" a "), %%rdx                     \n\t" /* rdx = a[2] */                                               \
        "mulxq %%rdx, %%rdx, %%rdi                 \n\t" /* (rdx, rdi) = a[2]^2 -> lo to r[4], hi to r[5] */            \
                                                                                                                        \
        /* {CF=CF7 from Phase 2, OF=OF8 from Phase 2} */                                                                \
        "adcxq %%rcx, %%r9                         \n\t" /* r[1] += hi(a0^2) + CF7    {CF->CF8} (consumes Phase 2 CF) */\
        "adoxq %%rdx, %%r12                        \n\t" /* r[4] += lo(a2^2) + OF8    {OF->OF9} (consumes Phase 2 OF) */\
        "adoxq %%rdi, %%r13                        \n\t" /* r[5] += hi(a2^2) + OF9    {OF->OF10} */                     \
        "movq 24(" a "), %%rdx                     \n\t" /* rdx = a[3] */                                               \
        "mulxq %%rdx, %%rcx, %%r15                 \n\t" /* (rcx, r15) = a[3]^2 -> lo to r[6], r[7] = hi(a3^2) */       \
        "movq 8(" a "), %%rdx                      \n\t" /* rdx = a[1] */                                               \
        "mulxq %%rdx, %%rdi, %%rdx                 \n\t" /* (rdi, rdx) = a[1]^2 -> lo to r[2], hi to r[3] */            \
        "adcxq %%rdi, %%r10                        \n\t" /* r[2] += lo(a1^2) + CF8    {CF->CF9} */                      \
        "adcxq %%rdx, %%r11                        \n\t" /* r[3] += hi(a1^2) + CF9    {CF->CF10} */                     \
        "adoxq %%rcx, %%r14                        \n\t" /* r[6] += lo(a3^2) + OF10   {OF->OF11} */                     \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += OF11              {OF->OF12} */                     \
        /* r[7] = hi(a3^2) + OF11. Since a[3] < 2^{63}: hi(a3^2) < 2^{62}. */                                           \
        /* So r[7] < 2^{62} + 1 < 2^{64}. OF12 = 0. */                                                                  \
                                                                                                                        \
        /* Post-phase 3: (r8,r9,..,r15) = a^2 as 8-limb number. OF12 = 0. CF10 pending. */                              \
                                                                                                                        \
                                                                                                                        \
        /* Post-phase 3: CF10 is still pending into r[4]; propagate it through T_hi = (r12, r13, r14, r15). */          \
        "adcxq %[zero_reference], %%r12             \n\t" /* r[4] += CF10 */                                            \
        "adcxq %[zero_reference], %%r13             \n\t" /* r[5] += CF */                                              \
        "adcxq %[zero_reference], %%r14             \n\t" /* r[6] += CF */                                              \
        "adcxq %[zero_reference], %%r15             \n\t" /* r[7] += CF  (r[7] < 2^62 + 3: CF -> 0) */                  \
                                                                                                                        \
        /* ====================================================================================  */                     \
        /* PHASE 4: U = (T_lo + K*p) / R with T_lo = (r8, r9, r10, r11); result = T_hi + U. */                          \
        /* ====================================================================================  */                     \
        SQR_REDUCE_STEP("%%r8", "%%r9", "%%r10", "%%r11")                                                               \
        SQR_REDUCE_STEP("%%r9", "%%r10", "%%r11", "%%r8")                                                               \
        SQR_REDUCE_STEP("%%r10", "%%r11", "%%r8", "%%r9")                                                               \
        SQR_REDUCE_STEP("%%r11", "%%r8", "%%r9", "%%r10")                                                               \
        /* U = (r8, r9, r10, r11) <= p. Add T_hi: the sum is < 2p < 2^{255}, no carry out. */                           \
        "addq %%r8, %%r12                           \n\t" /* r[0] = U[0] + T_hi[0] */                                   \
        "adcq %%r9, %%r13                           \n\t" /* r[1] = U[1] + T_hi[1] + CF */                              \
        "adcq %%r10, %%r14                          \n\t" /* r[2] = U[2] + T_hi[2] + CF */                              \
        "adcq %%r11, %%r15                          \n\t" /* r[3] = U[3] + T_hi[3] + CF */                              \
                                                                                                                        \
        /* Output in (r12, r13, r14, r15). Top limb < 2^{63}: valid input for another SQR/MUL. */

/**
 * One CIOS product row (ADX): (t0, t1, t2, t3, t4) = (t0, t1, t2, t3) + ai * b, where t4 is a fresh top limb.
 *
 * The low halves of ai * b[j] are added on the CF chain, the high halves on the OF chain. Both chains start from a
 * zeroing xor, so the row depends only on the register values of t and not on flags produced by earlier rows.
 * Bounds: the accumulator is < 2^256 on entry and b[3] < 2^63, so t4 = hi(ai * b[3]) + CF + OF < 2^63 + 2 and
 * neither chain carries out of t4; both flags are 0 on exit.
 * Uses r8, r9 as scratch and r11 as a zero register.
 **/
#define MUL_ROW(ai, b, t0, t1, t2, t3, t4)                                                                              \
        "xorl %%r11d, %%r11d                        \n\t" /* r11 = 0; CF = OF = 0 */                                    \
        "movq " ai ", %%rdx                         \n\t" /* rdx = a[i] */                                              \
        "mulxq 0(" b "), %%r8, %%r9                 \n\t" /* (r8, r9) = a[i] * b[0] */                                  \
        "adcxq %%r8, " t0 "                         \n\t" /* t[0] += lo(ai*b0) */                                       \
        "adoxq %%r9, " t1 "                         \n\t" /* t[1] += hi(ai*b0) */                                       \
        "mulxq 8(" b "), %%r8, %%r9                 \n\t" /* (r8, r9) = a[i] * b[1] */                                  \
        "adcxq %%r8, " t1 "                         \n\t" /* t[1] += lo(ai*b1) + CF */                                  \
        "adoxq %%r9, " t2 "                         \n\t" /* t[2] += hi(ai*b1) + OF */                                  \
        "mulxq 16(" b "), %%r8, %%r9                \n\t" /* (r8, r9) = a[i] * b[2] */                                  \
        "adcxq %%r8, " t2 "                         \n\t" /* t[2] += lo(ai*b2) + CF */                                  \
        "adoxq %%r9, " t3 "                         \n\t" /* t[3] += hi(ai*b2) + OF */                                  \
        "mulxq 24(" b "), %%r8, " t4 "              \n\t" /* (r8, t[4]) = a[i] * b[3] */                                \
        "adcxq %%r8, " t3 "                         \n\t" /* t[3] += lo(ai*b3) + CF */                                  \
        "adoxq %%r11, " t4 "                        \n\t" /* t[4] += OF  (OF -> 0) */                                   \
        "adcxq %%r11, " t4 "                        \n\t" /* t[4] += CF  (CF -> 0) */

/**
 * One CIOS reduction step (ADX) on (t0, t1, t2, t3, t4): k = t0 * r_inv mod 2^64, t += k * p. Afterwards t0 = 0 and
 * the caller drops it, so the accumulator becomes (t1, t2, t3, t4).
 *
 * k is computed with imulq (lower latency than mulxq and only the low half is needed). imulq clobbers the flags, so
 * no carry may be pending when this step starts; the step then restarts both chains from a zeroing xor.
 * Bounds: t < 2^256 + 2^64 * 2p on entry (see MUL), so t + k * p < 2^64 * (2^256 / 2^64 + 3p) < 2^320: neither chain
 * carries out of t4 and both flags are 0 on exit.
 * Uses r8, r9 as scratch and r11 as a zero register.
 **/
#define MUL_REDUCE_STEP(t0, t1, t2, t3, t4)                                                                             \
        "movq " t0 ", %%rdx                         \n\t" /* rdx = t[0] */                                              \
        "imulq %[r_inv], %%rdx                      \n\t" /* rdx = k = t[0] * r_inv mod 2^64 */                         \
        "xorl %%r11d, %%r11d                        \n\t" /* r11 = 0; CF = OF = 0 */                                    \
        "mulxq %[modulus_0], %%r8, %%r9             \n\t" /* (r8, r9) = k * p[0] */                                     \
        "adcxq %%r8, " t0 "                         \n\t" /* t[0] += lo(k*p0) -> 0 mod 2^64 */                          \
        "adoxq %%r9, " t1 "                         \n\t" /* t[1] += hi(k*p0) */                                        \
        "mulxq %[modulus_1], %%r8, %%r9             \n\t" /* (r8, r9) = k * p[1] */                                     \
        "adcxq %%r8, " t1 "                         \n\t" /* t[1] += lo(k*p1) + CF */                                   \
        "adoxq %%r9, " t2 "                         \n\t" /* t[2] += hi(k*p1) + OF */                                   \
        "mulxq %[modulus_2], %%r8, %%r9             \n\t" /* (r8, r9) = k * p[2] */                                     \
        "adcxq %%r8, " t2 "                         \n\t" /* t[2] += lo(k*p2) + CF */                                   \
        "adoxq %%r9, " t3 "                         \n\t" /* t[3] += hi(k*p2) + OF */                                   \
        "mulxq %[modulus_3], %%r8, %%r9             \n\t" /* (r8, r9) = k * p[3] */                                     \
        "adcxq %%r8, " t3 "                         \n\t" /* t[3] += lo(k*p3) + CF */                                   \
        "adoxq %%r9, " t4 "                         \n\t" /* t[4] += hi(k*p3) + OF  (OF -> 0) */                        \
        "adcxq %%r11, " t4 "                        \n\t" /* t[4] += CF  (CF -> 0) */

/**
 * Montgomery multiplication (ADX): computes a * b * R^{-1} mod p, with output in [0, 2p).
 *
 * CIOS: for i = 0..3, t += a[i] * b (MUL_ROW), then t += k_i * p with k_i = t[i] * r_inv mod 2^64 and the zeroed
 * low limb is dropped (MUL_REDUCE_STEP). Uses the ADX extension to run two independent carry chains:
 *   - adcxq reads/writes only CF (carry flag)
 *   - adoxq reads/writes only OF (overflow flag)
 *   - mulxq, movq preserve both CF and OF
 *   - xorl reg, reg clears both CF and OF and is a zeroing idiom, so it breaks the dependency on earlier flags
 *
 * Every row and reduction step ends with both chains flushed into its top limb (each top limb provably does not
 * overflow), and the next one restarts them with a zeroing xor. The only dependencies between steps are therefore
 * the limb registers themselves, and the serial path of each round is t[i] -> k_i -> k_i * p[0..1] -> t[i+1].
 *
 * The k_i are the unique digits of K < R with a*b + K*p = 0 mod R, so the result (a*b + K*p) / R is bit-identical
 * to any other CIOS/SOS schedule.
 *
 * Modulus assumption: p < 2^{254}, so p[3] < 2^{62}; inputs a, b < 2p < 2^{255}.
 * Bounds: before row i the accumulator is < 2p (4 limbs); after the row it is < 2p + 2^64 * 2p, after the reduction
 * step (before the shift) < 2^64 * 2^256, so the 5-limb accumulator never overflows. The result is < 2p.
 *
 * Register map (rotating): round 0 uses t = (r13, r14, r15, r10, r12); round i uses the same registers rotated by
 * i, and the result ends up in (r12, r13, r14, r15) for STORE_FIELD_ELEMENT.
 **/
#define MUL(a1, a2, a3, a4, b)                                                                                          \
        /* Round 0, row: (r13, r14, r15, r10, r12) = a[0] * b. A single carry chain suffices. */                        \
        "xorl %%r11d, %%r11d                        \n\t" /* r11 = 0; CF = OF = 0 */                                    \
        "movq " a1 ", %%rdx                         \n\t" /* rdx = a[0] */                                              \
        "mulxq 0(" b "), %%r13, %%r14               \n\t" /* (t[0], t[1]) = a[0] * b[0] */                              \
        "mulxq 8(" b "), %%r8, %%r15                \n\t" /* (r8, t[2]) = a[0] * b[1] */                                \
        "adcxq %%r8, %%r14                          \n\t" /* t[1] += lo(a0*b1) */                                       \
        "mulxq 16(" b "), %%r8, %%r10               \n\t" /* (r8, t[3]) = a[0] * b[2] */                                \
        "adcxq %%r8, %%r15                          \n\t" /* t[2] += lo(a0*b2) + CF */                                  \
        "mulxq 24(" b "), %%r8, %%r12               \n\t" /* (r8, t[4]) = a[0] * b[3] */                                \
        "adcxq %%r8, %%r10                          \n\t" /* t[3] += lo(a0*b3) + CF */                                  \
        "adcxq %%r11, %%r12                         \n\t" /* t[4] += CF  (t[4] < 2^63 + 1: CF -> 0) */                  \
        MUL_REDUCE_STEP("%%r13", "%%r14", "%%r15", "%%r10", "%%r12")                                                    \
        /* Round 1: t = (r14, r15, r10, r12, r13) */                                                                    \
        MUL_ROW(a2, b, "%%r14", "%%r15", "%%r10", "%%r12", "%%r13")                                                     \
        MUL_REDUCE_STEP("%%r14", "%%r15", "%%r10", "%%r12", "%%r13")                                                    \
        /* Round 2: t = (r15, r10, r12, r13, r14) */                                                                    \
        MUL_ROW(a3, b, "%%r15", "%%r10", "%%r12", "%%r13", "%%r14")                                                     \
        MUL_REDUCE_STEP("%%r15", "%%r10", "%%r12", "%%r13", "%%r14")                                                    \
        /* Round 3: t = (r10, r12, r13, r14, r15) */                                                                    \
        MUL_ROW(a4, b, "%%r10", "%%r12", "%%r13", "%%r14", "%%r15")                                                     \
        MUL_REDUCE_STEP("%%r10", "%%r12", "%%r13", "%%r14", "%%r15")                                                    \
                                                                                                                        \
        /* Output in (r12, r13, r14, r15) < 2p < 2^{255}: valid input for another MUL. */

#endif
