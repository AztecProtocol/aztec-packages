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
 * Montgomery squaring (ADX): computes a^2 * R^{-1} mod p, with output in [0, 2p).
 *
 * Uses the identity a^2 = 2 * sum_{i<j} a[i]*a[j] + sum_i a[i]^2 to halve the multiplies.
 * Then applies 4 rounds of Montgomery reduction, identical to MUL.
 *
 * Phase 1: Compute the 6 cross-products a[i]*a[j] (i<j), accumulate into r[1..6].
 * Phase 2: Double r[1..6] via self-addition (two interleaved 3-limb carry chains).
 * Phase 3: Add the 4 squared terms a[i]^2 into r[0..7], completing a^2.
 * Phase 4: Four rounds of Montgomery reduction (same as MUL), shifting out r[0..3].
 *
 * Flag management: the macro intentionally reuses CF/OF across phases rather than
 * explicitly clearing them. However, the effective carry structure is local to specific
 * adcx/adox chains and should be understood instruction-by-instruction. Each flag is
 * simply consumed by the next adcx (for CF) or adox (for OF) instruction — flags do
 * not "belong to" registers or phases in any deeper sense.
 *
 * Input: a < 2p < 2^{255}, so a[3] < 2^{63}, p[3] < 2^{62}.
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
        /* ===================================================================================== */                     \
        /* PHASE 4: Montgomery reduction — 4 rounds, identical structure to MUL. */                                     \
        /*  */                                                                                                          \
        /* Each round i: k_i = r[i] * (-p^{-1}) mod 2^{64}, add k_i*p, shift out r[i]. */                               \
        /* The total is (a^2 + K*p) / R where K = sum(k_i * 2^{64i}). */                                                \
        /* Since a < 2p: a^2 < 4p^2, K < R, and 4p < R, so output < 2p. */                                              \
        /*  */                                                                                                          \
        /* CF and OF from Phase 3 are reused (not reset). Each round's adcx/adox */                                     \
        /* instructions consume and produce flags in interleaved order — understand the */                              \
        /* flag state instruction-by-instruction. Per-limb totals for k_i*p: */                                         \
        /* r[i] += lo(ki*p0)  -> zeroed mod 2^{64} */                                                                   \
        /* r[i+1] += hi(ki*p0) + lo(ki*p1) */                                                                           \
        /* r[i+2] += hi(ki*p1) + lo(ki*p2) */                                                                           \
        /* r[i+3] += hi(ki*p2) + lo(ki*p3) */                                                                           \
        /* r[i+4] += hi(ki*p3) */                                                                                       \
        /* ===================================================================================== */                     \
                                                                                                                        \
        /* --- Reduction round 0: reduce r[0] (r8) -------------------------------------------- */                      \
        /* Register map: r8=r[0] r9=r[1] r10=r[2] r11=r[3] r12=r[4] r13=r[5] r14=r[6] r15=r[7] */                       \
        /*  */                                                                                                          \
        /* Per-limb totals for k0*p: */                                                                                 \
        /* r[0] += lo(k0*p0)  -> zeroed mod 2^{64} */                                                                   \
        /* r[1] += hi(k0*p0) + lo(k0*p1) */                                                                             \
        /* r[2] += hi(k0*p1) + lo(k0*p2) */                                                                             \
        /* r[3] += hi(k0*p2) + lo(k0*p3) */                                                                             \
        /* r[4] += hi(k0*p3) */                                                                                         \
        /*  */                                                                                                          \
        /* adcx sequence (CF): r[4], r[5], r[6], r[7], then r[1], r[2], r[3] */                                         \
        /* adox sequence (OF): r[0], r[1], r[2], r[3] */                                                                \
        /* {CF=CF10 from Phase 3, OF=OF12=0} */                                                                         \
        "movq %%r8, %%rdx                          \n\t" /* rdx = r[0] */                                               \
        "mulxq %[r_inv], %%rdx, %%rdi              \n\t" /* rdx = k0 = r[0] * r_inv */                                  \
        "mulxq %[modulus_0], %%rdi, %%rcx          \n\t" /* (rdi, rcx) = k0 * p[0] */                                   \
        "adoxq %%rdi, %%r8                         \n\t" /* r[0] += lo(k0*p0) + OF12=0 -> 0 mod 2^64 {OF->OF1} */       \
        "mulxq %[modulus_3], %%r8, %%rdi           \n\t" /* (r8, rdi) = k0 * p[3] */                                    \
        "adcxq %%rdi, %%r12                        \n\t" /* r[4] += hi(k0*p3) + CF10  {CF->CF1} */                      \
        "adoxq %%rcx, %%r9                         \n\t" /* r[1] += hi(k0*p0) + OF1   {OF->OF2} */                      \
        "adcxq %[zero_reference], %%r13            \n\t" /* r[5] += CF1               {CF->CF2} */                      \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += CF2               {CF->CF3} */                      \
        "mulxq %[modulus_1], %%rdi, %%rcx          \n\t" /* (rdi, rcx) = k0 * p[1] */                                   \
        "adcxq %[zero_reference], %%r15            \n\t" /* r[7] += CF3               {CF->CF4} */                      \
        /* adcx flushes CF through r[5..7]; CF4=0 since r[7] < 2^{62}+2+1 < 2^{64}. */                                  \
        "adoxq %%rcx, %%r10                        \n\t" /* r[2] += hi(k0*p1) + OF2   {OF->OF3} */                      \
        "adcxq %%rdi, %%r9                         \n\t" /* r[1] += lo(k0*p1) + CF4=0 {CF->CF5}  (CF4=0: safe) */       \
        "adoxq %%r8, %%r11                         \n\t" /* r[3] += lo(k0*p3) + OF3   {OF->OF4} */                      \
        "mulxq %[modulus_2], %%rdi, %%rcx          \n\t" /* (rdi, rcx) = k0 * p[2] */                                   \
        "adcxq %%rdi, %%r10                        \n\t" /* r[2] += lo(k0*p2) + CF5   {CF->CF6} */                      \
        "adcxq %%rcx, %%r11                        \n\t" /* r[3] += hi(k0*p2) + CF6   {CF->CF7} */                      \
                                                                                                                        \
        /* --- Reduction round 1: reduce r[1] (r9) -------------------------------------------- */                      \
        /* Per-limb totals for k1*p: */                                                                                 \
        /* r[1] += lo(k1*p0)  -> zeroed mod 2^{64} */                                                                   \
        /* r[2] += hi(k1*p0) + lo(k1*p1) */                                                                             \
        /* r[3] += hi(k1*p1) + lo(k1*p2) */                                                                             \
        /* r[4] += hi(k1*p2) + lo(k1*p3) */                                                                             \
        /* r[5] += hi(k1*p3) */                                                                                         \
        /*  */                                                                                                          \
        /* adcx sequence (CF): r[4], r[5], r[6], r[7], then r[1], r[2], r[3] */                                         \
        /* adox sequence (OF): r[4], r[5], r[6], r[7], then r[2], r[3] */                                               \
        /* {CF=CF7, OF=OF4} */                                                                                          \
        "movq %%r9, %%rdx                          \n\t" /* rdx = r[1] */                                               \
        "mulxq %[r_inv], %%rdx, %%rdi              \n\t" /* rdx = k1 = r[1] * r_inv */                                  \
        "mulxq %[modulus_2], %%rdi, %%rcx          \n\t" /* (rdi, rcx) = k1 * p[2] */                                   \
        "adoxq %%rcx, %%r12                        \n\t" /* r[4] += hi(k1*p2) + OF4   {OF->OF5} */                      \
        "mulxq %[modulus_3], %%r8, %%rcx           \n\t" /* (r8, rcx)  = k1 * p[3] */                                   \
        "adcxq %%r8, %%r12                         \n\t" /* r[4] += lo(k1*p3) + CF7   {CF->CF8} */                      \
        "adoxq %%rcx, %%r13                        \n\t" /* r[5] += hi(k1*p3) + OF5   {OF->OF6} */                      \
        "adcxq %[zero_reference], %%r13            \n\t" /* r[5] += CF8               {CF->CF9} */                      \
        "adoxq %[zero_reference], %%r14            \n\t" /* r[6] += OF6               {OF->OF7} */                      \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += CF9               {CF->CF10} */                     \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += OF7               {OF->OF8} */                      \
        "adcxq %[zero_reference], %%r15            \n\t" /* r[7] += CF10              {CF->CF11} */                     \
        /* adcx/adox flush CF/OF through r[5..7]. CF11=0 and OF8=0 because each */                                      \
        /* flush adds at most 1 to r[5..7], and r[7] < 2^{62}+2+4 < 2^{64}. */                                          \
        "mulxq %[modulus_0], %%r8, %%rcx           \n\t" /* (r8, rcx)  = k1 * p[0] */                                   \
        "adcxq %%r8, %%r9                          \n\t" /* r[1] += lo(k1*p0) + CF11=0 -> 0 mod 2^64 {CF->CF12} */      \
        "adoxq %%rcx, %%r10                        \n\t" /* r[2] += hi(k1*p0) + OF8=0 {OF->OF9}  (OF8=0: safe) */       \
        "mulxq %[modulus_1], %%r8, %%rcx           \n\t" /* (r8, rcx)  = k1 * p[1] */                                   \
        "adcxq %%r8, %%r10                         \n\t" /* r[2] += lo(k1*p1) + CF12  {CF->CF13} */                     \
        "adoxq %%rcx, %%r11                        \n\t" /* r[3] += hi(k1*p1) + OF9   {OF->OF10} */                     \
        "adcxq %%rdi, %%r11                        \n\t" /* r[3] += lo(k1*p2) + CF13  {CF->CF14} */                     \
                                                                                                                        \
        /* --- Reduction round 2: reduce r[2] (r10) ------------------------------------------- */                      \
        /* Per-limb totals for k2*p: */                                                                                 \
        /* r[2] += lo(k2*p0)  -> zeroed mod 2^{64} */                                                                   \
        /* r[3] += hi(k2*p0) + lo(k2*p1) */                                                                             \
        /* r[4] += hi(k2*p1) + lo(k2*p2) */                                                                             \
        /* r[5] += hi(k2*p2) + lo(k2*p3) */                                                                             \
        /* r[6] += hi(k2*p3) */                                                                                         \
        /*  */                                                                                                          \
        /* adcx sequence (CF): r[4], r[5], r[6], r[7], then r[2], r[3] */                                               \
        /* adox sequence (OF): r[4], r[5], r[6], r[7], then r[3], r[4], r[5] */                                         \
        /* {CF=CF14, OF=OF10} */                                                                                        \
        "movq %%r10, %%rdx                         \n\t" /* rdx = r[2] */                                               \
        "mulxq %[r_inv], %%rdx, %%rdi              \n\t" /* rdx = k2 = r[2] * r_inv */                                  \
        "mulxq %[modulus_1], %%rdi, %%rcx          \n\t" /* (rdi, rcx) = k2 * p[1] */                                   \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (r8, r9)   = k2 * p[2] */                                   \
        "adoxq %%rcx, %%r12                        \n\t" /* r[4] += hi(k2*p1) + OF10  {OF->OF11} */                     \
        "adcxq %%r8, %%r12                         \n\t" /* r[4] += lo(k2*p2) + CF14  {CF->CF15} */                     \
        "adoxq %%r9, %%r13                         \n\t" /* r[5] += hi(k2*p2) + OF11  {OF->OF12} */                     \
        "mulxq %[modulus_3], %%r8, %%r9            \n\t" /* (r8, r9)   = k2 * p[3] */                                   \
        "adcxq %%r8, %%r13                         \n\t" /* r[5] += lo(k2*p3) + CF15  {CF->CF16} */                     \
        "adoxq %%r9, %%r14                         \n\t" /* r[6] += hi(k2*p3) + OF12  {OF->OF13} */                     \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += CF16              {CF->CF17} */                     \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += OF13              {OF->OF14} */                     \
        "adcxq %[zero_reference], %%r15            \n\t" /* r[7] += CF17              {CF->CF18} */                     \
        /* adcx/adox flush CF/OF through r[6..7]. CF18=0 and OF14=0 because each */                                     \
        /* flush adds at most 1, and r[7] < 2^{62}+2+4+2 < 2^{64}. */                                                   \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t" /* (r8, r9)   = k2 * p[0] */                                   \
        "adcxq %%r8, %%r10                         \n\t" /* r[2] += lo(k2*p0) + CF18=0 -> 0 mod 2^64 {CF->CF19} */      \
        "adoxq %%r9, %%r11                         \n\t" /* r[3] += hi(k2*p0) + OF14=0 {OF->OF15}  (OF14=0: safe) */    \
        "adcxq %%rdi, %%r11                        \n\t" /* r[3] += lo(k2*p1) + CF19  {CF->CF20} */                     \
        "adoxq %[zero_reference], %%r12            \n\t" /* r[4] += OF15              {OF->OF16} */                     \
        "adoxq %[zero_reference], %%r13            \n\t" /* r[5] += OF16              {OF->OF17} */                     \
                                                                                                                        \
        /* --- Reduction round 3: reduce r[3] (r11) ------------------------------------------- */                      \
        /* Per-limb totals for k3*p: */                                                                                 \
        /* r[3] += lo(k3*p0)  -> zeroed mod 2^{64} */                                                                   \
        /* r[4] += hi(k3*p0) + lo(k3*p1) */                                                                             \
        /* r[5] += hi(k3*p1) + lo(k3*p2) */                                                                             \
        /* r[6] += hi(k3*p2) + lo(k3*p3) */                                                                             \
        /* r[7] += hi(k3*p3) */                                                                                         \
        /*  */                                                                                                          \
        /* adcx sequence (CF): r[4], r[5], r[6], r[7] */                                                                \
        /* adox sequence (OF): r[3], r[4], r[5], r[6], r[7] */                                                          \
        /* {CF=CF20, OF=OF17} */                                                                                        \
        /* OF17=0: OF15 (from r[3] += hi(k2*p0)) flushes through r[4] and r[5] at lines above, */                       \
        /* dissipating to 0 since neither limb is near 2^64. */                                                         \
        "movq %%r11, %%rdx                         \n\t" /* rdx = r[3] */                                               \
        "mulxq %[r_inv], %%rdx, %%rdi              \n\t" /* rdx = k3 = r[3] * r_inv */                                  \
        "mulxq %[modulus_0], %%rdi, %%rcx          \n\t" /* (rdi, rcx) = k3 * p[0] */                                   \
        "mulxq %[modulus_1], %%r8, %%r9            \n\t" /* (r8, r9)   = k3 * p[1] */                                   \
        "adoxq %%rdi, %%r11                        \n\t" /* r[3] += lo(k3*p0) + OF17 -> 0 mod 2^64 {OF->OF18} */        \
        "adcxq %%r8, %%r12                         \n\t" /* r[4] += lo(k3*p1) + CF20  {CF->CF21} */                     \
        "adoxq %%rcx, %%r12                        \n\t" /* r[4] += hi(k3*p0) + OF18  {OF->OF19} */                     \
        "adcxq %%r9, %%r13                         \n\t" /* r[5] += hi(k3*p1) + CF21  {CF->CF22} */                     \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (r8, r9)   = k3 * p[2] */                                   \
        "mulxq %[modulus_3], %%r10, %%r11          \n\t" /* (r10, r11) = k3 * p[3] */                                   \
        "adoxq %%r8, %%r13                         \n\t" /* r[5] += lo(k3*p2) + OF19  {OF->OF20} */                     \
        "adcxq %%r10, %%r14                        \n\t" /* r[6] += lo(k3*p3) + CF22  {CF->CF23} */                     \
        "adoxq %%r9, %%r14                         \n\t" /* r[6] += hi(k3*p2) + OF20  {OF->OF21} */                     \
        "adcxq %%r11, %%r15                        \n\t" /* r[7] += hi(k3*p3) + CF23  {CF->CF24} */                     \
        /* Result = (a^2 + K*p)/R < 2p < 2^{255}, so r[7] < 2^{63}. */                                                  \
        /* Since r[7] + hi(k3*p3) + CF23 < 2^{63} + 2^{62} + 1 < 2^{64}, CF24 = 0. */                                   \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += OF21              {OF->OF22} */                     \
        /* r[7] < 2^{63} + 1 < 2^{64}, so OF22 = 0. Both terminal flags are zero. */                                    \
                                                                                                                        \
        /* Output in (r12, r13, r14, r15) = (r[4], r[5], r[6], r[7]). */                                                \
        /* Since S < 2p < 2^{255}, the top limb r[7] < 2^{63}. Valid input for another SQR/MUL. */

/**
 * Montgomery multiplication (ADX): computes a * b * R^{-1} mod p, with output in [0, 2p).
 *
 * Same CIOS algorithm as the non-ADX variant (see above), but uses the ADX extension to run
 * two independent carry chains simultaneously:
 *   - adcxq reads/writes only CF (carry flag)
 *   - adoxq reads/writes only OF (overflow flag)
 *   - mulxq, movq preserve both CF and OF
 *   - xorq clears both CF and OF to 0
 *
 * This eliminates the need for addq resets between cross-terms, enabling better ILP.
 * The partial products are computed in a different order than non-ADX (for parallelism),
 * but the per-limb totals are identical.
 *
 * Flag management: within each round, adcx and adox instructions are interleaved to add
 * partial products into accumulator limbs. The instruction order is chosen for ILP, not
 * algebraic order — understand the flag state instruction-by-instruction. Each flag is
 * simply consumed by the next adcx (CF) or adox (OF); flags do not "belong to" limbs.
 *
 * Modulus assumption: p < 2^{254}, so p[3] < 2^{62}. All bit-width bounds below rely on this.
 *
 * At certain points the top limb is known to be < 2^64, so the outgoing flag = 0;
 * this is annotated inline and is critical for correctness of the subsequent additions.
 *
 * Cross-round flag propagation: rounds are NOT flag-independent. Each round's terminal
 * (CF, OF) are consumed by the first (adcxq, adoxq) of the next round. Between rounds,
 * only movq and mulxq appear, which preserve flags.
 *
 * Notation in flag trace comments: {CF=n, OF=n} tracks the flag state entering each
 * instruction. "CF_i" / "OF_i" denotes the i-th flag value produced within the current round.
 *
 * Result is stored in (%%r12, %%r13, %%r14, %%r15) for STORE_FIELD_ELEMENT.
 **/
#define MUL(a1, a2, a3, a4, b)                                                                                          \
        /* ===================================================================================== */                     \
        /* ROUND 0: accumulate a[0]*b, then reduce by k0*p. Shift out r[0]. */                                          \
        /* Register map: r13=r[0]  r14=r[1]  r15=r[2]  r10=r[3]  r12=r[4] */                                            \
        /* ===================================================================================== */                     \
        "movq " a1 ", %%rdx                        \n\t" /* rdx = a[0] */                                               \
        "xorq %%r8, %%r8                           \n\t" /* clear r8; sets CF=0, OF=0 */                                \
                                                                                                                        \
        /* --- a[0] * b: four independent multiplies ------------------------------------------- */                     \
        "mulxq 0(" b "), %%r13, %%r14              \n\t" /* (r13, r14) = a[0] * b[0]  -> (r[0], r[1]) */                \
        "mulxq 8(" b "), %%r8, %%r9                \n\t" /* (r8, r9)   = a[0] * b[1] */                                 \
        "mulxq 16(" b "), %%r15, %%r10             \n\t" /* (r15, r10) = a[0] * b[2]  -> (r[2], r[3]) */                \
        "mulxq 24(" b "), %%rdi, %%r12             \n\t" /* (rdi, r12) = a[0] * b[3]  -> r12 = r[4] = hi(a0*b3) */      \
                                                                                                                        \
        /* --- k0 computation ------------------------------------------------------------------ */                     \
        "movq %%r13, %%rdx                         \n\t" /* rdx = r[0] */                                               \
        "mulxq %[r_inv], %%rdx, %%r11              \n\t" /* rdx = k0 = r[0] * r_inv mod 2^64 */                         \
                                                                                                                        \
        /* --- Assemble a[0]*b cross-terms + k0*p reduction ------------------------------------ */                     \
        /*  */                                                                                                          \
        /* Per-limb totals for a[0]*b (from cross-terms added by adcxq/adoxq): */                                       \
        /* r[1] += lo(a0*b1),   r[2] += hi(a0*b1),   r[3] += lo(a0*b3) */                                               \
        /* (hi(a0*b0), lo(a0*b2), hi(a0*b2), hi(a0*b3) already in r[1..4] from mulxq outputs) */                        \
        /*  */                                                                                                          \
        /* Per-limb totals for k0*p: */                                                                                 \
        /* r[0] += lo(k0*p0)  -> zeroed mod 2^64 */                                                                     \
        /* r[1] += hi(k0*p0) + lo(k0*p1) */                                                                             \
        /* r[2] += hi(k0*p1) + lo(k0*p2) */                                                                             \
        /* r[3] += hi(k0*p2) + lo(k0*p3) */                                                                             \
        /* r[4] += hi(k0*p3) */                                                                                         \
        /*  */                                                                                                          \
        /* adcx sequence (CF): r[1], r[2], r[3], r[4], then r[1], r[2], r[3] */                                         \
        /* adox sequence (OF): r[3], r[4], r[0], r[1], r[2] */                                                          \
        /*  */                                                                                                          \
        /* {CF=0, OF=0} */                                                                                              \
        "adcxq %%r8, %%r14                         \n\t" /* r[1] += lo(a0*b1)         {CF->CF1} */                      \
        "adoxq %%rdi, %%r10                        \n\t" /* r[3] += lo(a0*b3)         {OF->OF1} */                      \
        "adcxq %%r9, %%r15                         \n\t" /* r[2] += hi(a0*b1) + CF1   {CF->CF2} */                      \
                                                                                                                        \
        "mulxq %[modulus_3], %%rdi, %%r11          \n\t" /* (rdi, r11) = k0 * p[3] */                                   \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t" /* (r8, r9)   = k0 * p[0] */                                   \
        "adcxq %%rdi, %%r10                        \n\t" /* r[3] += lo(k0*p3) + CF2   {CF->CF3} */                      \
        "adoxq %%r11, %%r12                        \n\t" /* r[4] += hi(k0*p3) + OF1   {OF->OF2} */                      \
        /* r[4] = hi(a0*b3) + hi(k0*p3) + OF1 < 2^63 + 2^62 + 1 < 2^64  (b[3],p[3]<2^63) */                             \
        /* OF2 = 0. */                                                                                                  \
        "adcxq %[zero_reference], %%r12            \n\t" /* r[4] += CF3               {CF->CF4} */                      \
        /* r[4] < 2^63 + 2^62 + 2 < 2^64, so CF4 = 0 */                                                                 \
        "adoxq %%r8, %%r13                         \n\t" /* r[0] += lo(k0*p0) + OF2=0 -> 0 mod 2^64  {OF->OF3} */       \
        "adcxq %%r9, %%r14                         \n\t" /* r[1] += hi(k0*p0) + CF4=0 {CF->CF5}  (CF4=0: safe) */       \
        "mulxq %[modulus_1], %%rdi, %%r11          \n\t" /* (rdi, r11) = k0 * p[1] */                                   \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (r8, r9)   = k0 * p[2] */                                   \
        "adoxq %%rdi, %%r14                        \n\t" /* r[1] += lo(k0*p1) + OF3   {OF->OF4} */                      \
        "adcxq %%r11, %%r15                        \n\t" /* r[2] += hi(k0*p1) + CF5   {CF->CF6} */                      \
        "adoxq %%r8, %%r15                         \n\t" /* r[2] += lo(k0*p2) + OF4   {OF->OF5} */                      \
        "adcxq %%r9, %%r10                         \n\t" /* r[3] += hi(k0*p2) + CF6   {CF->CF7} */                      \
                                                                                                                        \
        /* Post-round 0: terminal flags (CF7, OF5) flow into round 1. */                                                \
        /* Top limb r[4] <= 2^63 + 2^62 + 2 < 2^64 (same as non-ADX). */                                                \
                                                                                                                        \
        /* ===================================================================================== */                     \
        /* ROUND 1: accumulate a[1]*b, then reduce by k1*p. Shift out r[1]. */                                          \
        /* Register map: r14=r[1]  r15=r[2]  r10=r[3]  r12=r[4]  r13=r[5] */                                            \
        /*  */                                                                                                          \
        /* Per-limb totals for a[1]*b: */                                                                               \
        /* r[1] += lo(a1*b0),   r[2] += hi(a1*b0) + lo(a1*b1) */                                                        \
        /* r[3] += hi(a1*b1) + lo(a1*b2),   r[4] += hi(a1*b2) + lo(a1*b3) */                                            \
        /* r[5]  = hi(a1*b3) */                                                                                         \
        /*  */                                                                                                          \
        /* Per-limb totals for k1*p (same decomposition, shifted by one): */                                            \
        /* r[1] += lo(k1*p0)  -> zeroed mod 2^64 */                                                                     \
        /* r[2] += hi(k1*p0) + lo(k1*p1) */                                                                             \
        /* r[3] += hi(k1*p1) + lo(k1*p2) */                                                                             \
        /* r[4] += hi(k1*p2) + lo(k1*p3) */                                                                             \
        /* r[5] += hi(k1*p3) */                                                                                         \
        /*  */                                                                                                          \
        /* adcx sequence (CF): r[4], r[5], r[1], r[2], r[3], r[4], r[5], r[2], r[3] */                                  \
        /* adox sequence (OF): r[3], r[4], r[5], r[2], r[3], r[4], r[5], r[1], r[2] */                                  \
        /* ===================================================================================== */                     \
        "movq " a2 ", %%rdx                        \n\t" /* rdx = a[1] */                                               \
        "mulxq 16(" b "), %%r8, %%r9               \n\t" /* (r8, r9)   = a[1] * b[2] */                                 \
        "mulxq 24(" b "), %%rdi, %%r13             \n\t" /* (rdi, r13) = a[1] * b[3]  -> r13 = r[5] = hi(a1*b3) */      \
        /* {CF=CF7 from R0, OF=OF5 from R0} */                                                                          \
        "adoxq %%r8, %%r10                         \n\t" /* r[3] += lo(a1*b2) + OF    {OF->OF1} */                      \
        "adcxq %%rdi, %%r12                        \n\t" /* r[4] += lo(a1*b3) + CF    {CF->CF1} */                      \
        "adoxq %%r9, %%r12                         \n\t" /* r[4] += hi(a1*b2) + OF1   {OF->OF2} */                      \
        "adcxq %[zero_reference], %%r13            \n\t" /* r[5] += CF1               {CF->CF2} */                      \
        /* r[5] = hi(a1*b3) + CF1 < 2^63 + 1 < 2^64, so CF2 = 0 */                                                      \
        "adoxq %[zero_reference], %%r13            \n\t" /* r[5] += OF2               {OF->OF3} */                      \
        /* r[5] < 2^63 + 2 < 2^64, so OF3 = 0. Wrap-around is safe. */                                                  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t" /* (r8, r9)   = a[1] * b[0] */                                 \
        "mulxq 8(" b "), %%rdi, %%r11              \n\t" /* (rdi, r11) = a[1] * b[1] */                                 \
        "adcxq %%r8, %%r14                         \n\t" /* r[1] += lo(a1*b0) + CF2=0 {CF->CF3}  (CF2=0: safe) */       \
        "adoxq %%r9, %%r15                         \n\t" /* r[2] += hi(a1*b0) + OF3=0 {OF->OF4}  (OF3=0: safe) */       \
        "adcxq %%rdi, %%r15                        \n\t" /* r[2] += lo(a1*b1) + CF3   {CF->CF4} */                      \
        "adoxq %%r11, %%r10                        \n\t" /* r[3] += hi(a1*b1) + OF4   {OF->OF5} */                      \
                                                                                                                        \
        /* --- k1 * p reduction ---------------------------------------------------------------- */                     \
        "movq %%r14, %%rdx                         \n\t" /* rdx = r[1] */                                               \
        "mulxq %[r_inv], %%rdx, %%r8               \n\t" /* rdx = k1 = r[1] * r_inv mod 2^64 */                         \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (r8, r9)   = k1 * p[2] */                                   \
        "mulxq %[modulus_3], %%rdi, %%r11          \n\t" /* (rdi, r11) = k1 * p[3] */                                   \
        "adcxq %%r8, %%r10                         \n\t" /* r[3] += lo(k1*p2) + CF4   {CF->CF5} */                      \
        "adoxq %%r9, %%r12                         \n\t" /* r[4] += hi(k1*p2) + OF5   {OF->OF6} */                      \
        "adcxq %%rdi, %%r12                        \n\t" /* r[4] += lo(k1*p3) + CF5   {CF->CF6} */                      \
        "adoxq %%r11, %%r13                        \n\t" /* r[5] += hi(k1*p3) + OF6   {OF->OF7} */                      \
        "adcxq %[zero_reference], %%r13            \n\t" /* r[5] += CF6               {CF->CF7} */                      \
        /* r[5] <= 2^63 + 2^62 + 4 < 2^64, so CF7 = 0. Wrap safe. */                                                    \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t" /* (r8, r9)   = k1 * p[0] */                                   \
        "mulxq %[modulus_1], %%rdi, %%r11          \n\t" /* (rdi, r11) = k1 * p[1] */                                   \
        "adoxq %%r8, %%r14                         \n\t" /* r[1] += lo(k1*p0) + OF7   {OF->OF8}  -> 0 mod 2^64 */       \
        "adcxq %%rdi, %%r15                        \n\t" /* r[2] += lo(k1*p1) + CF7=0 {CF->CF8}  (CF7=0: safe) */       \
        "adoxq %%r9, %%r15                         \n\t" /* r[2] += hi(k1*p0) + OF8   {OF->OF9} */                      \
        "adcxq %%r11, %%r10                        \n\t" /* r[3] += hi(k1*p1) + CF8   {CF->CF9} */                      \
                                                                                                                        \
        /* Post-round 1: terminal (CF9, OF9) flow into round 2. */                                                      \
        /* Top limb r[5] <= 2^63 + 2^62 + 4 < 2^64. Invariant holds. */                                                 \
                                                                                                                        \
        /* ===================================================================================== */                     \
        /* ROUND 2: accumulate a[2]*b, then reduce by k2*p. Shift out r[2]. */                                          \
        /* Register map: r15=r[2]  r10=r[3]  r12=r[4]  r13=r[5]  r14=r[6] */                                            \
        /*  */                                                                                                          \
        /* Per-limb totals for a[2]*b: */                                                                               \
        /* r[2] += lo(a2*b0),   r[3] += hi(a2*b0) + lo(a2*b1) */                                                        \
        /* r[4] += hi(a2*b1) + lo(a2*b2),   r[5] += hi(a2*b2) + lo(a2*b3) */                                            \
        /* r[6]  = hi(a2*b3) */                                                                                         \
        /*  */                                                                                                          \
        /* Per-limb totals for k2*p: */                                                                                 \
        /* r[2] += lo(k2*p0)  -> zeroed mod 2^64 */                                                                     \
        /* r[3] += hi(k2*p0) + lo(k2*p1) */                                                                             \
        /* r[4] += hi(k2*p1) + lo(k2*p2) */                                                                             \
        /* r[5] += hi(k2*p2) + lo(k2*p3) */                                                                             \
        /* r[6] += hi(k2*p3) */                                                                                         \
        /*  */                                                                                                          \
        /* adcx sequence (CF): r[4], r[5], r[6], r[2], r[3], r[4], r[5], r[6], r[3] */                                  \
        /* adox sequence (OF): r[3], r[4], r[5], r[6], r[3], r[4], r[5], r[6], r[2] */                                  \
        /* ===================================================================================== */                     \
        "movq " a3 ", %%rdx                        \n\t" /* rdx = a[2] */                                               \
        "mulxq 8(" b "), %%rdi, %%r11              \n\t" /* (rdi, r11) = a[2] * b[1] */                                 \
        "mulxq 16(" b "), %%r8, %%r9               \n\t" /* (r8, r9)   = a[2] * b[2] */                                 \
        /* {CF=CF9 from R1, OF=OF9 from R1} */                                                                          \
        "adoxq %%rdi, %%r10                        \n\t" /* r[3] += lo(a2*b1) + OF    {OF->OF1} */                      \
        "adcxq %%r11, %%r12                        \n\t" /* r[4] += hi(a2*b1) + CF    {CF->CF1} */                      \
        "adoxq %%r8, %%r12                         \n\t" /* r[4] += lo(a2*b2) + OF1   {OF->OF2} */                      \
        "adcxq %%r9, %%r13                         \n\t" /* r[5] += hi(a2*b2) + CF1   {CF->CF2} */                      \
        "mulxq 24(" b "), %%rdi, %%r14             \n\t" /* (rdi, r14) = a[2] * b[3]  -> r14 = r[6] = hi(a2*b3) */      \
        "mulxq 0(" b "), %%r8, %%r9                \n\t" /* (r8, r9)   = a[2] * b[0] */                                 \
        "adoxq %%rdi, %%r13                        \n\t" /* r[5] += lo(a2*b3) + OF2   {OF->OF3} */                      \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += CF2               {CF->CF3} */                      \
        /* r[6] = hi(a2*b3) + CF2 < 2^63 + 1 < 2^64, so CF3 = 0 */                                                      \
        "adoxq %[zero_reference], %%r14            \n\t" /* r[6] += OF3               {OF->OF4} */                      \
        /* r[6] < 2^63 + 2 < 2^64, so OF4 = 0. Wrap-around is safe. */                                                  \
        "adcxq %%r8, %%r15                         \n\t" /* r[2] += lo(a2*b0) + CF3=0 {CF->CF4}  (CF3=0: safe) */       \
        "adoxq %%r9, %%r10                         \n\t" /* r[3] += hi(a2*b0) + OF4=0 {OF->OF5}  (OF4=0: safe) */       \
                                                                                                                        \
        /* --- k2 * p reduction ---------------------------------------------------------------- */                     \
        "movq %%r15, %%rdx                         \n\t" /* rdx = r[2] */                                               \
        "mulxq %[r_inv], %%rdx, %%r8               \n\t" /* rdx = k2 = r[2] * r_inv mod 2^64 */                         \
        "mulxq %[modulus_1], %%rdi, %%r11          \n\t" /* (rdi, r11) = k2 * p[1] */                                   \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (r8, r9)   = k2 * p[2] */                                   \
        "adcxq %%rdi, %%r10                        \n\t" /* r[3] += lo(k2*p1) + CF4   {CF->CF5} */                      \
        "adoxq %%r11, %%r12                        \n\t" /* r[4] += hi(k2*p1) + OF5   {OF->OF6} */                      \
        "adcxq %%r8, %%r12                         \n\t" /* r[4] += lo(k2*p2) + CF5   {CF->CF6} */                      \
        "adoxq %%r9, %%r13                         \n\t" /* r[5] += hi(k2*p2) + OF6   {OF->OF7} */                      \
        "mulxq %[modulus_3], %%rdi, %%r11          \n\t" /* (rdi, r11) = k2 * p[3] */                                   \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t" /* (r8, r9)   = k2 * p[0] */                                   \
        "adcxq %%rdi, %%r13                        \n\t" /* r[5] += lo(k2*p3) + CF6   {CF->CF7} */                      \
        "adoxq %%r11, %%r14                        \n\t" /* r[6] += hi(k2*p3) + OF7   {OF->OF8} */                      \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += CF7               {CF->CF8} */                      \
        /* r[6] <= 2^63 + 2^62 + 4 < 2^64, so CF8 = 0. Wrap safe. */                                                    \
        "adoxq %%r8, %%r15                         \n\t" /* r[2] += lo(k2*p0) + OF8   {OF->OF9}  -> 0 mod 2^64 */       \
        "adcxq %%r9, %%r10                         \n\t" /* r[3] += hi(k2*p0) + CF8=0 {CF->CF9}  (CF8=0: safe) */       \
                                                                                                                        \
        /* Post-round 2: terminal (CF9, OF9) flow into round 3. */                                                      \
        /* Top limb r[6] <= 2^63 + 2^62 + 4 < 2^64. Invariant holds. */                                                 \
                                                                                                                        \
        /* ===================================================================================== */                     \
        /* ROUND 3: accumulate a[3]*b, then reduce by k3*p. Shift out r[3]. */                                          \
        /* Register map: r10=r[3]  r12=r[4]  r13=r[5]  r14=r[6]  r15=r[7] */                                            \
        /* Tighter bound: a[3] < 2^63 (not 2^64), so hi(a3*b3) < 2^62. */                                               \
        /* ===================================================================================== */                     \
        "movq " a4 ", %%rdx                        \n\t" /* rdx = a[3] (< 2^63) */                                      \
        "mulxq 0(" b "), %%r8, %%r9                \n\t" /* (r8, r9)   = a[3] * b[0] */                                 \
        "mulxq 8(" b "), %%rdi, %%r11              \n\t" /* (rdi, r11) = a[3] * b[1] */                                 \
        /* {CF=CF9 from R2, OF=OF9 from R2} */                                                                          \
        "adoxq %%r8, %%r10                         \n\t" /* r[3] += lo(a3*b0) + OF    {OF->OF1} */                      \
        "adcxq %%r9, %%r12                         \n\t" /* r[4] += hi(a3*b0) + CF    {CF->CF1} */                      \
        "adoxq %%rdi, %%r12                        \n\t" /* r[4] += lo(a3*b1) + OF1   {OF->OF2} */                      \
        "adcxq %%r11, %%r13                        \n\t" /* r[5] += hi(a3*b1) + CF1   {CF->CF2} */                      \
                                                                                                                        \
        "mulxq 16(" b "), %%r8, %%r9               \n\t" /* (r8, r9)   = a[3] * b[2] */                                 \
        "mulxq 24(" b "), %%rdi, %%r15             \n\t" /* (rdi, r15) = a[3] * b[3]  -> r15 = r[7] = hi(a3*b3) */      \
        "adoxq %%r8, %%r13                         \n\t" /* r[5] += lo(a3*b2) + OF2   {OF->OF3} */                      \
        "adcxq %%r9, %%r14                         \n\t" /* r[6] += hi(a3*b2) + CF2   {CF->CF3} */                      \
        "adoxq %%rdi, %%r14                        \n\t" /* r[6] += lo(a3*b3) + OF3   {OF->OF4} */                      \
        "adcxq %[zero_reference], %%r15            \n\t" /* r[7] += CF3               {CF->CF4} */                      \
        /* r[7] = hi(a3*b3) + CF3 < 2^62 + 1 < 2^64, so CF4 = 0 */                                                      \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += OF4               {OF->OF5} */                      \
        /* r[7] < 2^62 + 2 < 2^64, so OF5 = 0. Wrap-around is safe. */                                                  \
                                                                                                                        \
        /* --- k3 * p reduction ---------------------------------------------------------------- */                     \
        /*  */                                                                                                          \
        /* Per-limb totals for k3*p: */                                                                                 \
        /* r[3] += lo(k3*p0)  -> zeroed mod 2^64 */                                                                     \
        /* r[4] += hi(k3*p0) + lo(k3*p1) */                                                                             \
        /* r[5] += hi(k3*p1) + lo(k3*p2) */                                                                             \
        /* r[6] += hi(k3*p2) + lo(k3*p3) */                                                                             \
        /* r[7] += hi(k3*p3) */                                                                                         \
        "movq %%r10, %%rdx                         \n\t" /* rdx = r[3] */                                               \
        "mulxq %[r_inv], %%rdx, %%r8               \n\t" /* rdx = k3 = r[3] * r_inv mod 2^64 */                         \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t" /* (r8, r9)   = k3 * p[0] */                                   \
        "mulxq %[modulus_1], %%rdi, %%r11          \n\t" /* (rdi, r11) = k3 * p[1] */                                   \
        /* {CF=CF4=0, OF=OF5=0} (both zero — see bounds on r[7] above) */                                               \
        "adoxq %%r8, %%r10                         \n\t" /* r[3] += lo(k3*p0) + OF5=0 {OF->OF6}  -> 0 mod 2^64 */       \
        "adcxq %%r9, %%r12                         \n\t" /* r[4] += hi(k3*p0) + CF4=0 {CF->CF5} */                      \
        "adoxq %%rdi, %%r12                        \n\t" /* r[4] += lo(k3*p1) + OF6   {OF->OF7} */                      \
        "adcxq %%r11, %%r13                        \n\t" /* r[5] += hi(k3*p1) + CF5   {CF->CF6} */                      \
                                                                                                                        \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (r8, r9)   = k3 * p[2] */                                   \
        "mulxq %[modulus_3], %%rdi, %%rdx          \n\t" /* (rdi, rdx) = k3 * p[3]  (overwrites rdx; last mulxq) */     \
        "adoxq %%r8, %%r13                         \n\t" /* r[5] += lo(k3*p2) + OF7   {OF->OF8} */                      \
        "adcxq %%r9, %%r14                         \n\t" /* r[6] += hi(k3*p2) + CF6   {CF->CF7} */                      \
        "adoxq %%rdi, %%r14                        \n\t" /* r[6] += lo(k3*p3) + OF8   {OF->OF9} */                      \
        "adcxq %%rdx, %%r15                        \n\t" /* r[7] += hi(k3*p3) + CF7   {CF->CF8} */                      \
        /* r[7] < (2^62 + 2) + 2^62 + 1 = 2^63 + 3 < 2^64, so CF8 = 0  (p[3]<2^62) */                                   \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += OF9               {OF->OF10} */                     \
        /* r[7] < 2^63 + 4 < 2^64, so OF10 = 0. Terminal flags are both 0. */                                           \
                                                                                                                        \
        /* Output in (r12, r13, r14, r15) = (r[4], r[5], r[6], r[7]). */                                                \
        /* Since S < 2p < 2^255, the top limb r[7] < 2^63. Valid input for another MUL. */

#endif
