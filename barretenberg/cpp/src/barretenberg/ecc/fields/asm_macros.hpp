// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
// clang-format off

/*
 * Clear all flags via xorq opcode
 **/
#define CLEAR_FLAGS(empty_reg)                                                                                           \
        "xorq " empty_reg ", " empty_reg "      \n\t"

/**
 * Load 4-limb field element, pointed to by a, into
 * registers (lolo, lohi, hilo, hihi)
 **/
#define LOAD_FIELD_ELEMENT(a, lolo, lohi, hilo, hihi)                                                                    \
        "movq 0(" a "), " lolo "                \n\t"                                                                    \
        "movq 8(" a "), " lohi "                \n\t"                                                                    \
        "movq 16(" a "), " hilo "               \n\t"                                                                    \
        "movq 24(" a "), " hihi "               \n\t"

/**
 * Store 4-limb field element located in
 * registers (lolo, lohi, hilo, hihi), into
 * memory pointed to by r
 **/
#define STORE_FIELD_ELEMENT(r, lolo, lohi, hilo, hihi)                                                                   \
        "movq " lolo ", 0(" r ")                \n\t"                                                                    \
        "movq " lohi ", 8(" r ")                \n\t"                                                                    \
        "movq " hilo ", 16(" r ")               \n\t"                                                                    \
        "movq " hihi ", 24(" r ")               \n\t"

#if !defined(__ADX__) || defined(DISABLE_ADX)
/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * and add 4-limb field element pointed to by b
 **/
#define ADD(b)                                                                                                           \
        "addq 0(" b "), %%r12                   \n\t"                                                                    \
        "adcq 8(" b "), %%r13                   \n\t"                                                                    \
        "adcq 16(" b "), %%r14                  \n\t"                                                                    \
        "adcq 24(" b "), %%r15                  \n\t"

/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * and subtract 4-limb field element pointed to by b
 **/
#define SUB(b)                                                                                                           \
        "subq 0(" b "), %%r12                   \n\t"                                                                    \
        "sbbq 8(" b "), %%r13                   \n\t"                                                                    \
        "sbbq 16(" b "), %%r14                  \n\t"                                                                    \
        "sbbq 24(" b "), %%r15                  \n\t"


/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * add 4-limb field element pointed to by b, and reduce modulo 2p
 * Works as follows: adds the number, moves the result, adds (twos complement
 * of 2p), conditionally restores.
 * @note the 2p is because for 254 bit fields, we use the _coarse_ representation.
 **/
#define ADD_REDUCE(b, twice_not_modulus_0, twice_not_modulus_1, twice_not_modulus_2, twice_not_modulus_3)                \
        "addq 0(" b "), %%r12                   \n\t"                                                                    \
        "adcq 8(" b "), %%r13                   \n\t"                                                                    \
        "adcq 16(" b "), %%r14                  \n\t"                                                                    \
        "adcq 24(" b "), %%r15                  \n\t"                                                                    \
        "movq  %%r12, %%r8                      \n\t"                                                                    \
        "movq %%r13, %%r9                       \n\t"                                                                    \
        "movq %%r14, %%r10                      \n\t"                                                                    \
        "movq %%r15, %%r11                      \n\t"                                                                    \
        "addq " twice_not_modulus_0 ", %%r12    \n\t" /* r'[0] -= twice_not_modulus.data[0] */                           \
        "adcq " twice_not_modulus_1 ", %%r13    \n\t" /* r'[1] -= twice_not_modulus.data[1] */                           \
        "adcq " twice_not_modulus_2 ", %%r14    \n\t" /* r'[2] -= twice_not_modulus.data[2] */                           \
        "adcq " twice_not_modulus_3 ", %%r15    \n\t" /* r'[3] -= twice_not_modulus.data[3] */                           \
        "cmovncq %%r8, %%r12                    \n\t"                                                                    \
        "cmovncq %%r9, %%r13                    \n\t"                                                                    \
        "cmovncq %%r10, %%r14                   \n\t"                                                                    \
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
        /* Duplicate `r` */                                                                                              \
        "movq %%r12, %%r8                       \n\t"                                                                    \
        "movq %%r13, %%r9                       \n\t"                                                                    \
        "movq %%r14, %%r10                      \n\t"                                                                    \
        "movq %%r15, %%r11                      \n\t"                                                                    \
        "addq " b_0 ", %%r12                    \n\t" /* r'[0] += b[0]                                             */   \
        "adcq " b_1 ", %%r13                    \n\t" /* r'[1] += b[1]                                             */   \
        "adcq " b_2 ", %%r14                    \n\t" /* r'[2] += b[2]                                             */   \
        "adcq " b_3 ", %%r15                    \n\t" /* r'[3] += b[3]                                             */   \
                                                                                                                         \
        /* if the addition did not carry, restore the original r                                                    */   \
        "cmovncq %%r8, %%r12                    \n\t"                                                                    \
        "cmovncq %%r9, %%r13                    \n\t"                                                                    \
        "cmovncq %%r10, %%r14                   \n\t"                                                                    \
        "cmovncq %%r11, %%r15                   \n\t"

/**
 * We don't have a bespoke non-ADX SQR implementation. The former implementation had a rare bug, we
 * in practice we call MUL(a, a) instead.
 **/

/**
 * Compute Montgomery multiplication of a, b.
 * Result is stored, in (%%r12, %%r13, %%r14, %%r15), in preparation for being stored in "r"
 **/
#define MUL(a1, a2, a3, a4, b)     \
        /*                                                                                                              */  \
        /* Register conventions (stable across all rounds):                                                             */  \
        /*   rdx = multiplier: a[i] during multiply, k during reduce (implicit source for mulxq)                       */  \
        /*   t[] = scratch from each mulxq pair: r8=t[0], r9=t[1], rdi=t[2], r11=t[3]                                  */  \
        /*   r[] = accumulator limbs, rotate each round (see per-block comment). After round i,                         */  \
        /*         r[i] is eliminated and its register is recycled as the new highest limb.                             */  \
        /*   Each round does: a[i]*b accumulation, then reduce r[i] via k = r[i]*r_inv.                                */  \
        /*   adcq consumes carry from previous add/adc; addq starts a new carry chain.                                  */  \
        /*                                                                                                              */  \
        /* round 0: r13=r[0] r14=r[1] r15=r[2] r10=r[3] r12=r[4]                                                      */  \
        "movq " a1 ", %%rdx                     \n\t" /* load a[0] into %rdx                                      */  \
        "xorq %%r8, %%r8                          \n\t" /* clear r8 register, we use this when we need 0           */  \
        /* front-load mul ops, can parallelize 4 of these but latency is 4 cycles */                                    \
        "mulxq 8(" b "), %%r8, %%r9               \n\t" /* (t[0], t[1]) <- a[0] * b[1]                              */  \
        "mulxq 24(" b "), %%rdi, %%r12            \n\t" /* (t[2], r[4]) <- a[0] * b[3]  .                           */  \
        "mulxq 0(" b "), %%r13, %%r14             \n\t" /* (r[0], r[1]) <- a[0] * b[0]                              */  \
        "mulxq 16(" b "), %%r15, %%r10            \n\t" /* (r[2] , r[3]) <- a[0] * b[2]                             */  \
        /* zero flags */                                                                                                \
                                                                                                                        \
        /* start computing modular reduction */                                                                         \
        "movq %%r13, %%rdx                        \n\t" /* move r[0] into %rdx                                      */  \
        "mulxq %[r_inv], %%rdx, %%r11             \n\t" /* (%rdx, _) <- k = r[0] * r_inv                            */  \
                                                                                                                        \
        /* start first addition chain */                                                                                \
        "addq %%r8, %%r14                         \n\t" /* r[1] += t[0]                                             */  \
        "adcq %%r9, %%r15                         \n\t" /* r[2] += t[1] + flag_c                                    */  \
        "adcq %%rdi, %%r10                        \n\t" /* r[3] += t[2] + flag_c                                    */  \
        "adcq $0, %%r12                           \n\t" /* r[4] += flag_c                                           */  \
                                                                                                                        \
        /* reduce by r[0] s k */                                                                                        \
        "mulxq %[modulus_0], %%r8, %%r9           \n\t" /* (t[0], t[1]) <- (modulus.data[0] * k)                    */  \
        "mulxq %[modulus_1], %%rdi, %%r11         \n\t" /* (t[2], t[3]) <- (modulus.data[1] * k)                    */  \
        "addq %%r8, %%r13                         \n\t" /* r[0] += t[0] (%r13 now free)                             */  \
        "adcq %%rdi, %%r14                        \n\t" /* r[1] += t[2] + flag_c                                    */  \
        "adcq %%r11, %%r15                        \n\t" /* r[2] += t[3] + flag_c                                    */  \
        "adcq $0, %%r10                           \n\t" /* r[3] += flag_c                                           */  \
        "adcq $0, %%r12                           \n\t" /* r[4] += flag_c                                           */  \
        "addq %%r9, %%r14                         \n\t" /* r[1] += t[1]                                             */  \
        "mulxq %[modulus_2], %%r8, %%r9           \n\t" /* (t[0], t[1]) <- (modulus.data[2] * k)                    */  \
        "mulxq %[modulus_3], %%rdi, %%r11         \n\t" /* (t[2], t[3]) <- (modulus.data[3] * k)                    */  \
        "adcq %%r8, %%r15                         \n\t" /* r[2] += t[0] + flag_c                                    */  \
        "adcq %%rdi, %%r10                        \n\t" /* r[3] += t[2] + flag_c                                    */  \
        "adcq %%r11, %%r12                        \n\t" /* r[4] += t[3] + flag_c                                    */  \
        "addq %%r9, %%r10                         \n\t" /* r[3] += t[1]                                             */  \
        "adcq $0, %%r12                           \n\t" /* r[4] += flag_c                                           */  \
                                                                                                                        \
        /* modulus = 254 bits, so max(t[3])  = 62 bits                                                              */  \
        /* b also 254 bits, so (a[0] * b[3]) = 62 bits                                                              */  \
        /* i.e. carry flag here is always 0 if b is in mont form, no need to update r[5]                            */  \
        /* (which is very convenient because we're out of registers!)                                               */  \
        /* N.B. the value of r[4] now has a max of 63 bits and can accept another 62 bit value before overflowing   */  \
                                                                                                                        \
        /* round 1: r14=r[1] r15=r[2] r10=r[3] r12=r[4] r13=r[5]                                                       */  \
        /* a[1] * b */                                                                                                  \
        "movq " a2 ", %%rdx                     \n\t" /* load a[1] into %rdx                                      */  \
        "mulxq 0(" b "), %%r8, %%r9               \n\t" /* (t[0], t[1]) <- (a[1] * b[0])                            */  \
        "mulxq 8(" b "), %%rdi, %%r11             \n\t" /* (t[4], t[5]) <- (a[1] * b[1])                            */  \
        "addq %%r8, %%r14                         \n\t" /* r[1] += t[0]                                             */  \
        "adcq %%rdi, %%r15                        \n\t" /* r[2] += t[4] + flag_c                                    */  \
        "adcq %%r11, %%r10                        \n\t" /* r[3] += t[5] + flag_c                                    */  \
        "adcq $0, %%r12                           \n\t" /* r[4] += flag_c                                           */  \
        "addq %%r9, %%r15                         \n\t" /* r[2] += t[1]                                             */  \
                                                                                                                        \
        "mulxq 16(" b "), %%r8, %%r9              \n\t" /* (t[2], t[3]) <- (a[1] * b[2])                            */  \
        "mulxq 24(" b "), %%rdi, %%r13            \n\t" /* (t[6], r[5]) <- (a[1] * b[3])                            */  \
        "adcq %%r8, %%r10                         \n\t" /* r[3] += t[2] + flag_c                                    */  \
        "adcq %%rdi, %%r12                        \n\t" /* r[4] += t[6] + flag_c                                    */  \
        "adcq $0, %%r13                           \n\t" /* r[5] += flag_c                                           */  \
        "addq %%r9, %%r12                         \n\t" /* r[4] += t[3]                                             */  \
        "adcq $0, %%r13                           \n\t" /* r[5] += flag_c                                           */  \
                                                                                                                        \
        /* reduce by r[1] * k */                                                                                        \
        "movq %%r14, %%rdx                        \n\t"  /* move r[1] into %rdx                                     */  \
        "mulxq %[r_inv], %%rdx, %%r8              \n\t"  /* (%rdx, _) <- k = r[1] * r_inv                           */  \
        "mulxq %[modulus_0], %%r8, %%r9           \n\t"  /* (t[0], t[1]) <- (modulus.data[0] * k)                   */  \
        "mulxq %[modulus_1], %%rdi, %%r11         \n\t"  /* (t[2], t[3]) <- (modulus.data[1] * k)                   */  \
        "addq %%r8, %%r14                         \n\t"  /* r[1] += t[0] (%r14 now free)                            */  \
        "adcq %%rdi, %%r15                        \n\t"  /* r[2] += t[2] + flag_c                                   */  \
        "adcq %%r11, %%r10                        \n\t"  /* r[3] += t[3] + flag_c                                   */  \
        "adcq $0, %%r12                           \n\t"  /* r[4] += flag_c                                          */  \
        "adcq $0, %%r13                           \n\t"  /* r[5] += flag_c                                          */  \
        "addq %%r9, %%r15                         \n\t"  /* r[2] += t[1]                                            */  \
        "mulxq %[modulus_2], %%r8, %%r9           \n\t"  /* (t[0], t[1]) <- (modulus.data[2] * k)                   */  \
        "mulxq %[modulus_3], %%rdi, %%r11         \n\t"  /* (t[2], t[3]) <- (modulus.data[3] * k)                   */  \
        "adcq %%r8, %%r10                         \n\t"  /* r[3] += t[0] + flag_c                                   */  \
        "adcq %%r9, %%r12                         \n\t"  /* r[4] += t[1] + flag_c                                   */  \
        "adcq %%r11, %%r13                        \n\t"  /* r[5] += t[3] + flag_c                                   */  \
        "addq %%rdi, %%r12                        \n\t"  /* r[4] += t[2]                                            */  \
        "adcq $0, %%r13                           \n\t"  /* r[5] += flag_c                                          */  \
                                                                                                                        \
        /* round 2: r15=r[2] r10=r[3] r12=r[4] r13=r[5] r14=r[6]                                                       */  \
        /* a[2] * b */                                                                                                  \
        "movq " a3 ", %%rdx                    \n\t" /* load a[2] into %rdx                                      */  \
        "mulxq 0(" b "), %%r8, %%r9               \n\t" /* (t[0], t[1]) <- (a[2] * b[0])                            */  \
        "mulxq 8(" b "), %%rdi, %%r11             \n\t" /* (t[2], t[3]) <- (a[2] * b[1])                            */  \
        "addq %%r8, %%r15                         \n\t" /* r[2] += t[0]                                             */  \
        "adcq %%r9, %%r10                         \n\t" /* r[3] += t[1] + flag_c                                    */  \
        "adcq %%r11, %%r12                        \n\t" /* r[4] += t[3] + flag_c                                    */  \
        "adcq $0, %%r13                           \n\t" /* r[5] += flag_c                                           */  \
        "addq %%rdi, %%r10                        \n\t" /* r[3] += t[2]                                             */  \
        "mulxq 16(" b "), %%r8, %%r9              \n\t" /* (t[0], t[1]) <- (a[2] * b[2])                            */  \
        "mulxq 24(" b "), %%rdi, %%r14            \n\t" /* (t[2], r[6]) <- (a[2] * b[3])                            */  \
        "adcq %%r8, %%r12                         \n\t" /* r[4] += t[0] + flag_c                                    */  \
        "adcq %%r9, %%r13                         \n\t" /* r[5] += t[1] + flag_c                                    */  \
        "adcq $0, %%r14                           \n\t" /* r[6] += flag_c                                           */  \
        "addq %%rdi, %%r13                        \n\t" /* r[5] += t[2]                                             */  \
        "adcq $0, %%r14                           \n\t" /* r[6] += flag_c                                           */  \
                                                                                                                        \
        /* reduce by r[2] * k */                                                                                        \
        "movq %%r15, %%rdx                        \n\t"  /* move r[2] into %rdx                                     */  \
        "mulxq %[r_inv], %%rdx, %%r8              \n\t"  /* (%rdx, _) <- k = r[2] * r_inv                           */  \
        "mulxq %[modulus_0], %%r8, %%r9           \n\t"  /* (t[0], t[1]) <- (modulus.data[0] * k)                   */  \
        "mulxq %[modulus_1], %%rdi, %%r11         \n\t"  /* (t[2], t[3]) <- (modulus.data[1] * k)                   */  \
        "addq %%r8, %%r15                         \n\t"  /* r[2] += t[0] (%r15 now free)                            */  \
        "adcq %%r9, %%r10                         \n\t"  /* r[3] += t[1] + flag_c                                   */  \
        "adcq %%r11, %%r12                        \n\t"  /* r[4] += t[3] + flag_c                                   */  \
        "adcq $0, %%r13                           \n\t"  /* r[5] += flag_c                                          */  \
        "adcq $0, %%r14                           \n\t"  /* r[6] += flag_c                                          */  \
        "addq %%rdi, %%r10                        \n\t"  /* r[3] += t[2]                                            */  \
        "mulxq %[modulus_2], %%r8, %%r9           \n\t"  /* (t[0], t[1]) <- (modulus.data[2] * k)                   */  \
        "mulxq %[modulus_3], %%rdi, %%r11         \n\t"  /* (t[2], t[3]) <- (modulus.data[3] * k)                   */  \
        "adcq %%r8, %%r12                         \n\t"  /* r[4] += t[0] + flag_c                                   */  \
        "adcq %%r9, %%r13                         \n\t"  /* r[5] += t[1] + flag_c                                   */  \
        "adcq %%r11, %%r14                        \n\t"  /* r[6] += t[3] + flag_c                                   */  \
        "addq %%rdi, %%r13                        \n\t"  /* r[5] += t[2]                                            */  \
        "adcq $0, %%r14                           \n\t"  /* r[6] += flag_c                                          */  \
                                                                                                                        \
        /* round 3: r10=r[3] r12=r[4] r13=r[5] r14=r[6] r15=r[7]                                                       */  \
        /* a[3] * b */                                                                                                  \
        "movq " a4 ", %%rdx                    \n\t"  /* load a[3] into %rdx                                     */  \
        "mulxq 0(" b "), %%r8, %%r9               \n\t"  /* (t[0], t[1]) <- (a[3] * b[0])                           */  \
        "mulxq 8(" b "), %%rdi, %%r11             \n\t"  /* (t[2], t[3]) <- (a[3] * b[1])                           */  \
        "addq %%r8, %%r10                         \n\t"  /* r[3] += t[0]                                            */  \
        "adcq %%r9, %%r12                         \n\t"  /* r[4] += t[1] + flag_c                                   */  \
        "adcq %%r11, %%r13                        \n\t"  /* r[5] += t[3] + flag_c                                   */  \
        "adcq $0, %%r14                           \n\t"  /* r[6] += flag_c                                          */  \
        "addq %%rdi, %%r12                        \n\t"  /* r[4] += t[2]                                            */  \
                                                                                                                        \
        "mulxq 16(" b "), %%r8, %%r9              \n\t"  /* (t[4], t[5]) <- (a[3] * b[2])                           */  \
        "mulxq 24(" b "), %%rdi, %%r15            \n\t"  /* (t[6], r[7]) <- (a[3] * b[3])                           */  \
        "adcq %%r8, %%r13                         \n\t"  /* r[5] += t[4] + flag_c                                   */  \
        "adcq %%r9, %%r14                         \n\t"  /* r[6] += t[5] + flag_c                                   */  \
        "adcq $0, %%r15                           \n\t"  /* r[7] += flag_c                                          */  \
        "addq %%rdi, %%r14                        \n\t"  /* r[6] += t[6]                                            */  \
        "adcq $0, %%r15                           \n\t"  /* r[7] += flag_c                                          */  \
                                                                                                                        \
        /* reduce by r[3] * k */                                                                                        \
        "movq %%r10, %%rdx                        \n\t" /* move r[3] into %rdx                                      */  \
        "mulxq %[r_inv], %%rdx, %%r8              \n\t" /* (%rdx, _) <- k = r[3] * r_inv                            */  \
        "mulxq %[modulus_0], %%r8, %%r9           \n\t" /* (t[0], t[1]) <- (modulus.data[0] * k)                    */  \
        "mulxq %[modulus_1], %%rdi, %%r11         \n\t" /* (t[2], t[3]) <- (modulus.data[1] * k)                    */  \
        "addq %%r8, %%r10                         \n\t" /* r[3] += t[0] (%r10 now free)                             */  \
        "adcq %%r9, %%r12                         \n\t" /* r[4] += t[1] + flag_c                                    */  \
        "adcq %%r11, %%r13                        \n\t" /* r[5] += t[3] + flag_c                                    */  \
        "adcq $0, %%r14                           \n\t" /* r[6] += flag_c                                           */  \
        "adcq $0, %%r15                           \n\t" /* r[7] += flag_c                                           */  \
        "addq %%rdi, %%r12                        \n\t" /* r[4] += t[2]                                             */  \
                                                                                                                        \
        "mulxq %[modulus_2], %%r8, %%r9           \n\t" /* (t[0], t[1]) <- (modulus.data[2] * k)                    */  \
        "mulxq %[modulus_3], %%rdi, %%rdx         \n\t" /* (t[2], t[3]) <- (modulus.data[3] * k)                    */  \
        "adcq %%r8, %%r13                         \n\t" /* r[5] += t[0] + flag_c                                    */  \
        "adcq %%r9, %%r14                         \n\t" /* r[6] += t[1] + flag_c                                    */  \
        "adcq %%rdx, %%r15                        \n\t" /* r[7] += t[3] + flag_c                                    */  \
        "addq %%rdi, %%r14                        \n\t" /* r[6] += t[2]                                             */  \
        "adcq $0, %%r15                           \n\t" /* r[7] += flag_c                                           */


/**
 * Compute 256-bit multiplication of a, b.
 * Result is stored, r. // in (%%r12, %%r13, %%r14, %%r15), in preparation for being stored in "r"
 **/
#define MUL_256(a, b, r)                                                                                                \
        "movq 0(" a "), %%rdx                       \n\t" /* load a[0] into %rdx                                    */  \
                                                                                                                        \
        /* front-load mul ops, can parallelize 4 of these but latency is 4 cycles */                                    \
        "mulxq 8(" b "), %%r8, %%r9                 \n\t" /* (t[0], t[1]) <- a[0] * b[1]                            */  \
        "mulxq 24(" b "), %%rdi, %%r12              \n\t" /* (t[2], r[4]) <- a[0] * b[3] (overwrite a[0])           */  \
        "mulxq 0(" b "), %%r13, %%r14               \n\t" /* (r[0], r[1]) <- a[0] * b[0]                            */  \
        "mulxq 16(" b "), %%r15, %%rax              \n\t" /* (r[2] , r[3]) <- a[0] * b[2]                           */  \
        /* zero flags */                                                                                                \
        "xorq %%r10, %%r10                          \n\t" /* clear r10 register, we use this when we need 0         */  \
                                                                                                                        \
                                                                                                                        \
        /* start first addition chain */                                                                                \
        "addq %%r8, %%r14                          \n\t" /* r[1] += t[0]                                            */  \
        "adcq %%r9, %%r15                          \n\t" /* r[2] += t[1] + flag_c                                   */  \
        "adcq %%r10, %%rax                         \n\t" /* r[3] += flag_c                                          */  \
        "addq %%rdi, %%rax                         \n\t" /* r[3] += t[2]                                             */  \
                                                                                                                        \
        /* a[1] * b */                                                                                                  \
        "movq 8(" a "), %%rdx                      \n\t" /* load a[1] into %rdx                                     */  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t" /* (t[0], t[1]) <- (a[1] * b[0])                           */  \
        "mulxq 8(" b "), %%rdi, %%rsi              \n\t" /* (t[4], t[5]) <- (a[1] * b[1])                           */  \
        "addq %%r8, %%r14                          \n\t" /* r[1] += t[0]                                            */  \
        "adcq %%r9, %%r15                          \n\t" /* r[2] += t[1] + flag_c                                   */  \
        "adcq %%rsi, %%rax                         \n\t" /* r[3] += t[5] + flag_c                                   */  \
        "addq %%rdi, %%r15                         \n\t" /* r[2] += t[4]                                            */  \
                                                                                                                        \
        "mulxq 16(" b "), %%r8, %%r9               \n\t" /* (t[2], t[3]) <- (a[1] * b[2])                           */  \
        "adcq %%r8, %%rax                          \n\t" /* r[3] += t[2] + flag_c                                   */  \
                                                                                                                        \
        /* a[2] * b */                                                                                                  \
        "movq 16(" a "), %%rdx                     \n\t" /* load a[2] into %rdx                                     */  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t" /* (t[0], t[1]) <- (a[2] * b[0])                           */  \
        "mulxq 8(" b "), %%rdi, %%rsi              \n\t" /* (t[4], t[5]) <- (a[2] * b[1])                           */  \
        "addq %%r8, %%r15                          \n\t" /* r[2] += t[0]                                            */  \
        "adcq %%r9, %%rax                          \n\t" /* r[3] += t[1] + flag_c                                   */  \
        "addq %%rdi, %%rax                         \n\t" /* r[3] += t[4]                                            */  \
                                                                                                                        \
                                                                                                                        \
        /* a[3] * b */                                                                                                  \
        "movq 24(" a "), %%rdx                     \n\t"  /* load a[3] into %rdx                                    */  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t"  /* (t[0], t[1]) <- (a[3] * b[0])                          */  \
        "adcq %%r8, %%rax                          \n\t"  /* r[3] += t[0] + flag_c                                  */  \
        "movq %%r13, 0(" r ")                      \n\t"                                                                \
        "movq %%r14, 8(" r ")                      \n\t"                                                                \
        "movq %%r15, 16(" r ")                     \n\t"                                                                \
        "movq %%rax, 24(" r ")                     \n\t"


#else // 6047895us
/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * and add 4-limb field element pointed to by a
 **/
#define ADD(b)                                                                                                           \
        "adcxq 0(" b "), %%r12                  \n\t"                                                                    \
        "adcxq 8(" b "), %%r13                  \n\t"                                                                    \
        "adcxq 16(" b "), %%r14                 \n\t"                                                                    \
        "adcxq 24(" b "), %%r15                 \n\t"

/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * and subtract 4-limb field element pointed to by b
 **/
#define SUB(b)                                                                                                           \
        "subq 0(" b "), %%r12                   \n\t"                                                                    \
        "sbbq 8(" b "), %%r13                   \n\t"                                                                    \
        "sbbq 16(" b "), %%r14                  \n\t"                                                                    \
        "sbbq 24(" b "), %%r15                  \n\t"

/**
 * Take a 4-limb field element, in (%r12, %r13, %r14, %r15),
 * add 4-limb field element pointed to by b, and reduce modulo 2p
 **/
#define ADD_REDUCE(b, twice_not_modulus_0, twice_not_modulus_1, twice_not_modulus_2, twice_not_modulus_3)                  \
        "adcxq 0(" b "), %%r12                  \n\t"                                                                    \
        "movq  %%r12, %%r8                      \n\t"                                                                    \
        "adoxq " twice_not_modulus_0 ", %%r12   \n\t"                                                                    \
        "adcxq 8(" b "), %%r13                  \n\t"                                                                    \
        "movq %%r13, %%r9                       \n\t"                                                                    \
        "adoxq " twice_not_modulus_1 ", %%r13   \n\t"                                                                    \
        "adcxq 16(" b "), %%r14                 \n\t"                                                                    \
        "movq %%r14, %%r10                      \n\t"                                                                    \
        "adoxq " twice_not_modulus_2 ", %%r14   \n\t"                                                                    \
        "adcxq 24(" b "), %%r15                 \n\t"                                                                    \
        "movq %%r15, %%r11                      \n\t"                                                                    \
        "adoxq " twice_not_modulus_3 ", %%r15   \n\t"                                                                    \
        "cmovnoq %%r8, %%r12                    \n\t"                                                                    \
        "cmovnoq %%r9, %%r13                    \n\t"                                                                    \
        "cmovnoq %%r10, %%r14                   \n\t"                                                                    \
        "cmovnoq %%r11, %%r15                   \n\t"


/**
 * Takes a 4-limb integer, r in (%r12, %r13, %r14, %r15),
 * and conditionally adds (b_0, b_1, b_2, b_3).
 * Computes r' = r + b. If there is a carry (overflow), replace r with r';
 * otherwise leave r untouched.
 * Uses `adoxq` instead of `addq` so that only the overflow flag is affected,
 * leaving the carry flag free for simultaneous `adcxq` chains.
 **/
#define CONDITIONAL_ADD(b_0, b_1, b_2, b_3)                                                                            \
        /* Duplicate `r` */                                                                                             \
        "movq %%r12, %%r8                          \n\t"                                                                \
        "movq %%r13, %%r9                          \n\t"                                                                \
        "movq %%r14, %%r10                         \n\t"                                                                \
        "movq %%r15, %%r11                         \n\t"                                                                \
        "adoxq " b_0 ", %%r12                      \n\t" /* r'[0] += b[0]                                          */  \
        "adoxq " b_1 ", %%r13                      \n\t" /* r'[1] += b[1]                                          */  \
        "adoxq " b_2 ", %%r14                      \n\t" /* r'[2] += b[2]                                          */  \
        "adoxq " b_3 ", %%r15                      \n\t" /* r'[3] += b[3]                                          */  \
                                                                                                                        \
        /* if the addition did not overflow, restore the original r                                                 */  \
        "cmovnoq %%r8, %%r12                       \n\t"                                                                \
        "cmovnoq %%r9, %%r13                       \n\t"                                                                \
        "cmovnoq %%r10, %%r14                      \n\t"                                                                \
        "cmovnoq %%r11, %%r15                      \n\t"


/**
 * Compute Montgomery squaring of a
 * Result is stored, in (%%r12, %%r13, %%r14, %%r15), in preparation for being stored in "r"
 **/
#define SQR(a)                                                                                                          \
        "movq 0(" a "), %%rdx                      \n\t" /* load a[0] into %rdx */                                      \
                                                                                                                        \
        "xorq %%r8, %%r8                           \n\t" /* clear flags                                             */  \
        /* compute a[0] *a[1], a[0]*a[2], a[0]*a[3], a[1]*a[2], a[1]*a[3], a[2]*a[3]                                */  \
        "mulxq 8(" a "), %%r9, %%r10               \n\t" /* (r[1], r[2]) <- a[0] * a[1]                             */  \
        "mulxq 16(" a "), %%r8, %%r15              \n\t" /* (t[1], t[2]) <- a[0] * a[2]                             */  \
        "mulxq 24(" a "), %%r11, %%r12             \n\t" /* (r[3], r[4]) <- a[0] * a[3]                             */  \
                                                                                                                        \
                                                                                                                        \
        /* accumulate products into result registers */                                                                 \
        "adoxq %%r8, %%r10                         \n\t" /* r[2] += t[1]                                            */  \
        "adcxq %%r15, %%r11                        \n\t" /* r[3] += t[2]                                            */  \
        "movq 8(" a "), %%rdx                      \n\t" /* load a[1] into %r%dx                                    */  \
        "mulxq 16(" a "), %%r8, %%r15              \n\t" /* (t[5], t[6]) <- a[1] * a[2]                             */  \
        "mulxq 24(" a "), %%rdi, %%rcx             \n\t" /* (t[3], t[4]) <- a[1] * a[3]                             */  \
        "movq 24(" a "), %%rdx                     \n\t" /* load a[3] into %%rdx                                    */  \
        "mulxq 16(" a "), %%r13, %%r14             \n\t" /* (r[5], r[6]) <- a[3] * a[2]                             */  \
        "adoxq %%r8, %%r11                         \n\t" /* r[3] += t[5]                                            */  \
        "adcxq %%rdi, %%r12                        \n\t" /* r[4] += t[3]                                            */  \
        "adoxq %%r15, %%r12                        \n\t" /* r[4] += t[6]                                            */  \
        "adcxq %%rcx, %%r13                        \n\t" /* r[5] += t[4] + flag_o                                   */  \
        "adoxq %[zero_reference], %%r13            \n\t" /* r[5] += flag_o                                          */  \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += flag_c                                          */  \
        "adoxq %[zero_reference], %%r14            \n\t" /* r[6] += flag_o                                          */  \
                                                                                                                        \
        /* double result registers  */                                                                                  \
        "adoxq %%r9, %%r9                          \n\t" /* r[1] = 2r[1]                                            */  \
        "adcxq %%r12, %%r12                        \n\t" /* r[4] = 2r[4]                                            */  \
        "adoxq %%r10, %%r10                        \n\t" /* r[2] = 2r[2]                                            */  \
        "adcxq %%r13, %%r13                        \n\t" /* r[5] = 2r[5]                                            */  \
        "adoxq %%r11, %%r11                        \n\t" /* r[3] = 2r[3]                                            */  \
        "adcxq %%r14, %%r14                        \n\t" /* r[6] = 2r[6]                                            */  \
                                                                                                                        \
        /* compute a[3]*a[3], a[2]*a[2], a[1]*a[1], a[0]*a[0] */                                                        \
        "movq 0(" a "), %%rdx                      \n\t" /* load a[0] into %rdx                                     */  \
        "mulxq %%rdx, %%r8, %%rcx                  \n\t" /* (r[0], t[4]) <- a[0] * a[0]                             */  \
        "movq 16(" a "), %%rdx                     \n\t" /* load a[2] into %rdx                                     */  \
        "mulxq %%rdx, %%rdx, %%rdi                 \n\t" /* (t[7], t[8]) <- a[2] * a[2]                             */  \
        /* add squares into result registers */                                                                         \
        "adcxq %%rcx, %%r9                         \n\t" /* r[1] += t[4]                                            */  \
        "adoxq %%rdx, %%r12                        \n\t" /* r[4] += t[7]                                            */  \
        "adoxq %%rdi, %%r13                        \n\t" /* r[5] += t[8]                                            */  \
        "movq 24(" a "), %%rdx                     \n\t" /* load a[3] into %rdx                                     */  \
        "mulxq %%rdx, %%rcx, %%r15                 \n\t" /* (t[5], r[7]) <- a[3] * a[3]                             */  \
        "movq 8(" a "), %%rdx                      \n\t" /* load a[1] into %rdx                                     */  \
        "mulxq %%rdx, %%rdi, %%rdx                 \n\t" /* (t[3], t[6]) <- a[1] * a[1]                             */  \
        "adcxq %%rdi, %%r10                        \n\t" /* r[2] += t[3]                                            */  \
        "adcxq %%rdx, %%r11                        \n\t" /* r[3] += t[6]                                            */  \
        "adoxq %%rcx, %%r14                        \n\t" /* r[6] += t[5]                                            */  \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += flag_o                                          */  \
                                                                                                                        \
        /* perform modular reduction: r[0] */                                                                           \
        "movq %%r8, %%rdx                          \n\t" /* move r8 into %rdx                                       */  \
        "mulxq %[r_inv], %%rdx, %%rdi              \n\t" /* (%rdx, _) <- k = r[0] * r_inv                           */  \
        "mulxq %[modulus_0], %%rdi, %%rcx          \n\t" /* (t[0], t[1]) <- (modulus[0] * k)                        */  \
        "adoxq %%rdi, %%r8                         \n\t" /* r[0] += t[0] (%r8 now free)                             */  \
        "mulxq %[modulus_3], %%r8, %%rdi           \n\t" /* (t[2], t[3]) <- (modulus[3] * k)                        */  \
        "adcxq %%rdi, %%r12                        \n\t" /* r[4] += t[3] + flag_c                                   */  \
        "adoxq %%rcx, %%r9                         \n\t" /* r[1] += t[1] + flag_o                                   */  \
        "adcxq %[zero_reference], %%r13            \n\t" /* r[5] += flag_c                                          */  \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += flag_c                                          */  \
        "mulxq %[modulus_1], %%rdi, %%rcx          \n\t" /* (t[4], t[5]) <- (modulus[1] * k)                        */  \
        "adcxq %[zero_reference], %%r15            \n\t" /* r[7] += flag_c                                          */  \
        "adoxq %%rcx, %%r10                        \n\t" /* r[2] += t[5] + flag_o                                   */  \
        "adcxq %%rdi, %%r9                         \n\t" /* r[1] += t[4] + flag_c                                   */  \
        "adoxq %%r8, %%r11                         \n\t" /* r[3] += t[2] + flag_o                                   */  \
        "mulxq %[modulus_2], %%rdi, %%rcx          \n\t" /* (t[6], t[7]) <- (modulus[2] * k)                        */  \
        "adcxq %%rdi, %%r10                        \n\t" /* r[2] += t[6] + flag_c                                   */  \
        "adcxq %%rcx, %%r11                        \n\t" /* r[3] += t[7] + flag_c                                   */  \
                                                                                                                        \
        /* perform modular reduction: r[1] */                                                                           \
        "movq %%r9, %%rdx                          \n\t" /* move r9 into %rdx                                       */  \
        "mulxq %[r_inv], %%rdx, %%rdi              \n\t" /* (%rdx, _) <- k = r[1] * r_inv                           */  \
        "mulxq %[modulus_2], %%rdi, %%rcx          \n\t" /* (t[0], t[1]) <- (modulus[2] * k)                        */  \
        "adoxq %%rcx, %%r12                        \n\t" /* r[4] += t[1] + flag_o                                   */  \
        "mulxq %[modulus_3], %%r8, %%rcx           \n\t" /* (t[2], t[3]) <- (modulus[3] * k)                        */  \
        "adcxq %%r8, %%r12                         \n\t" /* r[4] += t[2] + flag_c                                   */  \
        "adoxq %%rcx, %%r13                        \n\t" /* r[5] += t[3] + flag_o                                   */  \
        "adcxq %[zero_reference], %%r13            \n\t" /* r[5] += flag_c                                          */  \
        "adoxq %[zero_reference], %%r14            \n\t" /* r[6] += flag_o                                          */  \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += flag_c                                          */  \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += flag_o                                          */  \
        "adcxq %[zero_reference], %%r15            \n\t" /* r[7] += flag_c                                          */  \
        "mulxq %[modulus_0], %%r8, %%rcx           \n\t" /* (t[4], t[5]) <- (modulus[0] * k)                        */  \
        "adcxq %%r8, %%r9                          \n\t" /* r[1] += t[4] (%r9 now free)                             */  \
        "adoxq %%rcx, %%r10                        \n\t" /* r[2] += t[5] + flag_o                                   */  \
        "mulxq %[modulus_1], %%r8, %%rcx           \n\t" /* (t[6], t[7]) <- (modulus[1] * k)                        */  \
        "adcxq %%r8, %%r10                         \n\t" /* r[2] += t[6] + flag_c                                   */  \
        "adoxq %%rcx, %%r11                        \n\t" /* r[3] += t[7] + flag_o                                   */  \
        "adcxq %%rdi, %%r11                        \n\t" /* r[3] += t[0] + flag_c                                   */  \
                                                                                                                        \
        /* perform modular reduction: r[2] */                                                                           \
        "movq %%r10, %%rdx                         \n\t" /* move r10 into %rdx                                      */  \
        "mulxq %[r_inv], %%rdx, %%rdi              \n\t" /* (%rdx, _) <- k = r[2] * r_inv                           */  \
        "mulxq %[modulus_1], %%rdi, %%rcx          \n\t" /* (t[0], t[1]) <- (modulus[1] * k)                        */  \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (t[2], t[3]) <- (modulus[2] * k)                        */  \
        "adoxq %%rcx, %%r12                        \n\t" /* r[4] += t[1] + flag_o                                   */  \
        "adcxq %%r8, %%r12                         \n\t" /* r[4] += t[2] + flag_c                                   */  \
        "adoxq %%r9, %%r13                         \n\t" /* r[5] += t[3] + flag_o                                   */  \
        "mulxq %[modulus_3], %%r8, %%r9            \n\t" /* (t[4], t[5]) <- (modulus[3] * k)                        */  \
        "adcxq %%r8, %%r13                         \n\t" /* r[5] += t[4] + flag_c                                   */  \
        "adoxq %%r9, %%r14                         \n\t" /* r[6] += t[5] + flag_o                                   */  \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += flag_c                                          */  \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += flag_o                                          */  \
        "adcxq %[zero_reference], %%r15            \n\t" /* r[7] += flag_c                                          */  \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t" /* (t[6], t[7]) <- (modulus[0] * k)                        */  \
        "adcxq %%r8, %%r10                         \n\t" /* r[2] += t[6] (%r10 now free)                            */  \
        "adoxq %%r9, %%r11                         \n\t" /* r[3] += t[7] + flag_o                                   */  \
        "adcxq %%rdi, %%r11                        \n\t" /* r[3] += t[0] + flag_c                                   */  \
        "adoxq %[zero_reference], %%r12            \n\t" /* r[4] += flag_o                                          */  \
        "adoxq %[zero_reference], %%r13            \n\t" /* r[5] += flag_o                                          */  \
                                                                                                                        \
        /* perform modular reduction: r[3] */                                                                           \
        "movq %%r11, %%rdx                         \n\t" /* move r11 into %rdx                                      */  \
        "mulxq %[r_inv], %%rdx, %%rdi              \n\t" /* (%rdx, _) <- k = r[3] * r_inv                           */  \
        "mulxq %[modulus_0], %%rdi, %%rcx          \n\t" /* (t[0], t[1]) <- (modulus[0] * k)                        */  \
        "mulxq %[modulus_1], %%r8, %%r9            \n\t" /* (t[2], t[3]) <- (modulus[1] * k)                        */  \
        "adoxq %%rdi, %%r11                        \n\t" /* r[3] += t[0] (%r11 now free)                            */  \
        "adcxq %%r8, %%r12                         \n\t" /* r[4] += t[2] + flag_c                                   */  \
        "adoxq %%rcx, %%r12                        \n\t" /* r[4] += t[1] + flag_o                                   */  \
        "adcxq %%r9, %%r13                         \n\t" /* r[5] += t[3] + flag_c                                   */  \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (t[4], t[5]) <- (modulus[2] * k)                        */  \
        "mulxq %[modulus_3], %%r10, %%r11          \n\t" /* (t[6], t[7]) <- (modulus[3] * k)                        */  \
        "adoxq %%r8, %%r13                         \n\t" /* r[5] += t[4] + flag_o                                   */  \
        "adcxq %%r10, %%r14                        \n\t" /* r[6] += t[6] + flag_c                                   */  \
        "adoxq %%r9, %%r14                         \n\t" /* r[6] += t[5] + flag_o                                   */  \
        "adcxq %%r11, %%r15                        \n\t" /* r[7] += t[7] + flag_c                                   */  \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += flag_o                                          */

/**
 * Compute Montgomery multiplication of a, b.
 * Result is stored, in (%%r12, %%r13, %%r14, %%r15), in preparation for being stored in "r"
 **/
#define MUL(a1, a2, a3, a4, b)     \
        /*                                                                                                              */  \
        /* Register conventions (stable across all rounds):                                                             */  \
        /*   rdx = multiplier: a[i] during multiply, k during reduce (implicit source for mulxq)                       */  \
        /*   t[] = scratch from each mulxq pair: r8=t[0], r9=t[1], rdi=t[2], r11=t[3]                                  */  \
        /*   r[] = accumulator limbs, rotate each round (see per-block comment). After round i,                         */  \
        /*         r[i] is eliminated and its register is recycled as the new highest limb.                             */  \
        /*   Each round does: a[i]*b accumulation, then reduce r[i] via k = r[i]*r_inv.                                */  \
        /*   adcxq consumes flag_c (carry); adoxq consumes flag_o (overflow).                                           */  \
        /*                                                                                                              */  \
        /* round 0: r13=r[0] r14=r[1] r15=r[2] r10=r[3] r12=r[4]                                                      */  \
        "movq " a1 ", %%rdx                        \n\t" /* load a[0] into %rdx                                     */  \
        "xorq %%r8, %%r8                           \n\t" /* clear r8 register, we use this when we need 0           */  \
        /* front-load mul ops, can parallelize 4 of these but latency is 4 cycles */                                    \
        "mulxq 0(" b "), %%r13, %%r14              \n\t" /* (r[0], r[1]) <- a[0] * b[0]                             */  \
        "mulxq 8(" b "), %%r8, %%r9                \n\t" /* (t[0], t[1]) <- a[0] * b[1]                             */  \
        "mulxq 16(" b "), %%r15, %%r10             \n\t" /* (r[2] , r[3]) <- a[0] * b[2]                            */  \
        "mulxq 24(" b "), %%rdi, %%r12             \n\t" /* (t[2], r[4]) <- a[0] * b[3]                             */  \
        /* zero flags */                                                                                                \
                                                                                                                        \
        /* start computing modular reduction */                                                                         \
        "movq %%r13, %%rdx                         \n\t" /* move r[0] into %rdx                                     */  \
        "mulxq %[r_inv], %%rdx, %%r11              \n\t" /* (%rdx, _) <- k = r[0] * r_inv                           */  \
                                                                                                                        \
        /* start first addition chain */                                                                                \
        "adcxq %%r8, %%r14                         \n\t" /* r[1] += t[0]                                            */  \
        "adoxq %%rdi, %%r10                        \n\t" /* r[3] += t[2] + flag_o                                   */  \
        "adcxq %%r9, %%r15                         \n\t" /* r[2] += t[1] + flag_c                                   */  \
                                                                                                                        \
        /* reduce by r[0] * k */                                                                                        \
        "mulxq %[modulus_3], %%rdi, %%r11          \n\t" /* (t[2], t[3]) <- (modulus.data[3] * k)                   */  \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t" /* (t[4], t[5]) <- (modulus.data[0] * k)                   */  \
        "adcxq %%rdi, %%r10                        \n\t" /* r[3] += t[2] + flag_c                                   */  \
        "adoxq %%r11, %%r12                        \n\t" /* r[4] += t[3] + flag_o                                   */  \
        "adcxq %[zero_reference], %%r12            \n\t" /* r[4] += flag_c                                          */  \
        "adoxq %%r8, %%r13                         \n\t" /* r[0] += t[4] (%r13 now free)                            */  \
        "adcxq %%r9, %%r14                         \n\t" /* r[1] += t[5] + flag_c                                   */  \
        "mulxq %[modulus_1], %%rdi, %%r11          \n\t" /* (t[6], t[7]) <- (modulus.data[1] * k)                   */  \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (t[8], t[9]) <- (modulus.data[2] * k)                   */  \
        "adoxq %%rdi, %%r14                        \n\t" /* r[1] += t[6] + flag_o                                   */  \
        "adcxq %%r11, %%r15                        \n\t" /* r[2] += t[7] + flag_c                                   */  \
        "adoxq %%r8, %%r15                         \n\t" /* r[2] += t[8] + flag_o                                   */  \
        "adcxq %%r9, %%r10                         \n\t" /* r[3] += t[9] + flag_c                                   */  \
                                                                                                                        \
        /* modulus = 254 bits, so max(t[3])  = 62 bits                                                              */  \
        /* b also 254 bits, so (a[0] * b[3]) = 62 bits                                                              */  \
        /* i.e. carry flag here is always 0 if b is in mont form, no need to update r[5]                            */  \
        /* (which is very convenient because we're out of registers!)                                               */  \
        /* N.B. the value of r[4] now has a max of 63 bits and can accept another 62 bit value before overflowing   */  \
                                                                                                                        \
        /* round 1: r14=r[1] r15=r[2] r10=r[3] r12=r[4] r13=r[5]                                                       */  \
        /* a[1] * b */                                                                                                  \
        "movq " a2 ", %%rdx                      \n\t" /* load a[1] into %rdx                                     */    \
        "mulxq 16(" b "), %%r8, %%r9               \n\t" /* (t[2], t[3]) <- (a[1] * b[2])                           */  \
        "mulxq 24(" b "), %%rdi, %%r13             \n\t" /* (t[6], r[5]) <- (a[1] * b[3])                           */  \
        "adoxq %%r8, %%r10                         \n\t" /* r[3] += t[2] + flag_o                                   */  \
        "adcxq %%rdi, %%r12                        \n\t" /* r[4] += t[6] + flag_c                                   */  \
        "adoxq %%r9, %%r12                         \n\t" /* r[4] += t[3] + flag_o                                   */  \
        "adcxq %[zero_reference], %%r13            \n\t" /* r[5] += flag_c                                          */  \
        "adoxq %[zero_reference], %%r13            \n\t" /* r[5] += flag_o                                          */  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t" /* (t[0], t[1]) <- (a[1] * b[0])                           */  \
        "mulxq 8(" b "), %%rdi, %%r11              \n\t" /* (t[4], t[5]) <- (a[1] * b[1])                           */  \
        "adcxq %%r8, %%r14                         \n\t" /* r[1] += t[0] + flag_c                                   */  \
        "adoxq %%r9, %%r15                         \n\t" /* r[2] += t[1] + flag_o                                   */  \
        "adcxq %%rdi, %%r15                        \n\t" /* r[2] += t[4] + flag_c                                   */  \
        "adoxq %%r11, %%r10                        \n\t" /* r[3] += t[5] + flag_o                                   */  \
                                                                                                                        \
        /* reduce by r[1] * k */                                                                                        \
        "movq %%r14, %%rdx                         \n\t"  /* move r[1] into %rdx                                    */  \
        "mulxq %[r_inv], %%rdx, %%r8               \n\t"  /* (%rdx, _) <- k = r[1] * r_inv                          */  \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t"  /* (t[0], t[1]) <- (modulus.data[2] * k)                  */  \
        "mulxq %[modulus_3], %%rdi, %%r11          \n\t"  /* (t[2], t[3]) <- (modulus.data[3] * k)                  */  \
        "adcxq %%r8, %%r10                         \n\t"  /* r[3] += t[0] + flag_c                                  */  \
        "adoxq %%r9, %%r12                         \n\t"  /* r[4] += t[1] + flag_o                                  */  \
        "adcxq %%rdi, %%r12                        \n\t"  /* r[4] += t[2] + flag_c                                  */  \
        "adoxq %%r11, %%r13                        \n\t"  /* r[5] += t[3] + flag_o                                  */  \
        "adcxq %[zero_reference], %%r13            \n\t"  /* r[5] += flag_c                                         */  \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t"  /* (t[4], t[5]) <- (modulus.data[0] * k)                  */  \
        "mulxq %[modulus_1], %%rdi, %%r11          \n\t"  /* (t[6], t[7]) <- (modulus.data[1] * k)                  */  \
        "adoxq %%r8, %%r14                         \n\t"  /* r[1] += t[4] (%r14 now free)                           */  \
        "adcxq %%rdi, %%r15                        \n\t"  /* r[2] += t[6] + flag_c                                  */  \
        "adoxq %%r9, %%r15                         \n\t"  /* r[2] += t[5] + flag_o                                  */  \
        "adcxq %%r11, %%r10                        \n\t"  /* r[3] += t[7] + flag_c                                  */  \
                                                                                                                        \
        /* round 2: r15=r[2] r10=r[3] r12=r[4] r13=r[5] r14=r[6]                                                       */  \
        /* a[2] * b */                                                                                                  \
        "movq " a3 ", %%rdx                        \n\t" /* load a[2] into %rdx                                     */  \
        "mulxq 8(" b "), %%rdi, %%r11              \n\t" /* (t[2], t[3]) <- (a[2] * b[1])                           */  \
        "mulxq 16(" b "), %%r8, %%r9               \n\t" /* (t[4], t[5]) <- (a[2] * b[2])                           */  \
        "adoxq %%rdi, %%r10                        \n\t" /* r[3] += t[2] + flag_o                                   */  \
        "adcxq %%r11, %%r12                        \n\t" /* r[4] += t[3] + flag_c                                   */  \
        "adoxq %%r8, %%r12                         \n\t" /* r[4] += t[4] + flag_o                                   */  \
        "adcxq %%r9, %%r13                         \n\t" /* r[5] += t[5] + flag_c                                   */  \
        "mulxq 24(" b "), %%rdi, %%r14             \n\t" /* (t[6], r[6]) <- (a[2] * b[3])                           */  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t" /* (t[0], t[1]) <- (a[2] * b[0])                           */  \
        "adoxq %%rdi, %%r13                        \n\t" /* r[5] += t[6] + flag_o                                   */  \
        "adcxq %[zero_reference], %%r14            \n\t" /* r[6] += flag_c                                          */  \
        "adoxq %[zero_reference], %%r14            \n\t" /* r[6] += flag_o                                          */  \
        "adcxq %%r8, %%r15                         \n\t" /* r[2] += t[0] + flag_c                                   */  \
        "adoxq %%r9, %%r10                         \n\t" /* r[3] += t[1] + flag_o                                   */  \
                                                                                                                        \
        /* reduce by r[2] * k */                                                                                        \
        "movq %%r15, %%rdx                         \n\t"  /* move r[2] into %rdx                                    */  \
        "mulxq %[r_inv], %%rdx, %%r8               \n\t"  /* (%rdx, _) <- k = r[2] * r_inv                          */  \
        "mulxq %[modulus_1], %%rdi, %%r11          \n\t"  /* (t[0], t[1]) <- (modulus.data[1] * k)                  */  \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t"  /* (t[2], t[3]) <- (modulus.data[2] * k)                  */  \
        "adcxq %%rdi, %%r10                        \n\t"  /* r[3] += t[0] + flag_c                                  */  \
        "adoxq %%r11, %%r12                        \n\t"  /* r[4] += t[1] + flag_o                                  */  \
        "adcxq %%r8, %%r12                         \n\t"  /* r[4] += t[2] + flag_c                                  */  \
        "adoxq %%r9, %%r13                         \n\t"  /* r[5] += t[3] + flag_o                                  */  \
        "mulxq %[modulus_3], %%rdi, %%r11          \n\t"  /* (t[4], t[5]) <- (modulus.data[3] * k)                  */  \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t"  /* (t[6], t[7]) <- (modulus.data[0] * k)                  */  \
        "adcxq %%rdi, %%r13                        \n\t"  /* r[5] += t[4] + flag_c                                  */  \
        "adoxq %%r11, %%r14                        \n\t"  /* r[6] += t[5] + flag_o                                  */  \
        "adcxq %[zero_reference], %%r14            \n\t"  /* r[6] += flag_c                                         */  \
        "adoxq %%r8, %%r15                         \n\t"  /* r[2] += t[6] + flag_o (%r15 now free)                  */  \
        "adcxq %%r9, %%r10                         \n\t"  /* r[3] += t[7] + flag_c                                  */  \
                                                                                                                        \
        /* round 3: r10=r[3] r12=r[4] r13=r[5] r14=r[6] r15=r[7]                                                       */  \
        /* a[3] * b */                                                                                                  \
        "movq " a4 ", %%rdx                        \n\t"  /* load a[3] into %rdx                                    */  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t"  /* (t[0], t[1]) <- (a[3] * b[0])                          */  \
        "mulxq 8(" b "), %%rdi, %%r11              \n\t"  /* (t[4], t[5]) <- (a[3] * b[1])                          */  \
        "adoxq %%r8, %%r10                         \n\t"  /* r[3] += t[0] + flag_o                                  */  \
        "adcxq %%r9, %%r12                         \n\t"  /* r[4] += t[1] + flag_c                                  */  \
        "adoxq %%rdi, %%r12                        \n\t"  /* r[4] += t[4] + flag_o                                  */  \
        "adcxq %%r11, %%r13                        \n\t"  /* r[5] += t[5] + flag_c                                  */  \
                                                                                                                        \
        "mulxq 16(" b "), %%r8, %%r9               \n\t"  /* (t[2], t[3]) <- (a[3] * b[2])                          */  \
        "mulxq 24(" b "), %%rdi, %%r15             \n\t"  /* (t[6], r[7]) <- (a[3] * b[3])                          */  \
        "adoxq %%r8, %%r13                         \n\t"  /* r[5] += t[2] + flag_o                                  */  \
        "adcxq %%r9, %%r14                         \n\t"  /* r[6] += t[3] + flag_c                                  */  \
        "adoxq %%rdi, %%r14                        \n\t"  /* r[6] += t[6] + flag_o                                  */  \
        "adcxq %[zero_reference], %%r15            \n\t"  /* r[7] += flag_c                                         */  \
        "adoxq %[zero_reference], %%r15            \n\t"  /* r[7] += flag_o                                         */  \
                                                                                                                        \
        /* reduce by r[3] * k */                                                                                        \
        "movq %%r10, %%rdx                         \n\t" /* move r[3] into %rdx                                     */  \
        "mulxq %[r_inv], %%rdx, %%r8               \n\t" /* (%rdx, _) <- k = r[3] * r_inv                           */  \
        "mulxq %[modulus_0], %%r8, %%r9            \n\t" /* (t[0], t[1]) <- (modulus.data[0] * k)                   */  \
        "mulxq %[modulus_1], %%rdi, %%r11          \n\t" /* (t[2], t[3]) <- (modulus.data[1] * k)                   */  \
        "adoxq %%r8, %%r10                         \n\t" /* r[3] += t[0] + flag_o (%r10 now free)                   */  \
        "adcxq %%r9, %%r12                         \n\t" /* r[4] += t[1] + flag_c                                   */  \
        "adoxq %%rdi, %%r12                        \n\t" /* r[4] += t[2] + flag_o                                   */  \
        "adcxq %%r11, %%r13                        \n\t" /* r[5] += t[3] + flag_c                                   */  \
                                                                                                                        \
        "mulxq %[modulus_2], %%r8, %%r9            \n\t" /* (t[4], t[5]) <- (modulus.data[2] * k)                   */  \
        "mulxq %[modulus_3], %%rdi, %%rdx          \n\t" /* (t[6], t[7]) <- (modulus.data[3] * k)                   */  \
        "adoxq %%r8, %%r13                         \n\t" /* r[5] += t[4] + flag_o                                   */  \
        "adcxq %%r9, %%r14                         \n\t" /* r[6] += t[5] + flag_c                                   */  \
        "adoxq %%rdi, %%r14                        \n\t" /* r[6] += t[6] + flag_o                                   */  \
        "adcxq %%rdx, %%r15                        \n\t" /* r[7] += t[7] + flag_c                                   */  \
        "adoxq %[zero_reference], %%r15            \n\t" /* r[7] += flag_o                                          */

/**
 * Compute 256-bit multiplication of a, b.
 * Result is stored, r. // in (%%r12, %%r13, %%r14, %%r15), in preparation for being stored in "r"
 **/
#define MUL_256(a, b, r)                                                                                                \
        "movq 0(" a "), %%rdx                       \n\t" /* load a[0] into %rdx                                    */  \
                                                                                                                        \
        /* front-load mul ops, can parallelize 4 of these but latency is 4 cycles */                                    \
        "mulxq 8(" b "), %%r8, %%r9                 \n\t" /* (t[0], t[1]) <- a[0] * b[1]                            */  \
        "mulxq 24(" b "), %%rdi, %%r12              \n\t" /* (t[2], r[4]) <- a[0] * b[3] (overwrite a[0])           */  \
        "mulxq 0(" b "), %%r13, %%r14               \n\t" /* (r[0], r[1]) <- a[0] * b[0]                            */  \
        "mulxq 16(" b "), %%r15, %%rax              \n\t" /* (r[2] , r[3]) <- a[0] * b[2]                           */  \
        /* zero flags */                                                                                                \
        "xorq %%r10, %%r10                          \n\t" /* clear r10 register, we use this when we need 0         */  \
                                                                                                                        \
                                                                                                                        \
        /* start first addition chain */                                                                                \
        "adcxq %%r8, %%r14                         \n\t" /* r[1] += t[0]                                            */  \
        "adoxq %%rdi, %%rax                        \n\t" /* r[3] += t[2] + flag_o                                   */  \
        "adcxq %%r9, %%r15                         \n\t" /* r[2] += t[1] + flag_c                                   */  \
        "adcxq %%r10, %%rax                        \n\t" /* r[3] += flag_c                                           */  \
                                                                                                                        \
        /* a[1] * b */                                                                                                  \
        "movq 8(" a "), %%rdx                      \n\t" /* load a[1] into %rdx                                     */  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t" /* (t[0], t[1]) <- (a[1] * b[0])                           */  \
        "mulxq 8(" b "), %%rdi, %%rsi              \n\t" /* (t[4], t[5]) <- (a[1] * b[1])                           */  \
        "adcxq %%r8, %%r14                         \n\t" /* r[1] += t[0] + flag_c                                   */  \
        "adoxq %%r9, %%r15                         \n\t" /* r[2] += t[1] + flag_o                                   */  \
        "adcxq %%rdi, %%r15                        \n\t" /* r[2] += t[4] + flag_c                                   */  \
        "adoxq %%rsi, %%rax                        \n\t" /* r[3] += t[5] + flag_o                                   */  \
                                                                                                                        \
        "mulxq 16(" b "), %%r8, %%r9               \n\t" /* (t[2], t[3]) <- (a[1] * b[2])                           */  \
        "adcxq %%r8, %%rax                         \n\t" /* r[3] += t[2] + flag_c                                   */  \
                                                                                                                        \
        /* a[2] * b */                                                                                                  \
        "movq 16(" a "), %%rdx                     \n\t" /* load a[2] into %rdx                                     */  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t" /* (t[0], t[1]) <- (a[2] * b[0])                           */  \
        "mulxq 8(" b "), %%rdi, %%rsi              \n\t" /* (t[4], t[5]) <- (a[2] * b[1])                           */  \
        "adcxq %%r8, %%r15                         \n\t" /* r[2] += t[0] + flag_c                                   */  \
        "adoxq %%r9, %%rax                         \n\t" /* r[3] += t[1] + flag_o                                   */  \
        "adcxq %%rdi, %%rax                        \n\t" /* r[3] += t[4] + flag_c                                   */  \
                                                                                                                        \
                                                                                                                        \
        /* a[3] * b */                                                                                                  \
        "movq 24(" a "), %%rdx                     \n\t"  /* load a[3] into %rdx                                    */  \
        "mulxq 0(" b "), %%r8, %%r9                \n\t"  /* (t[0], t[1]) <- (a[3] * b[0])                          */  \
        "adcxq %%r8, %%rax                         \n\t"  /* r[3] += t[0] + flag_c                                  */  \
        "movq %%r13, 0(" r ")                      \n\t"                                                                \
        "movq %%r14, 8(" r ")                      \n\t"                                                                \
        "movq %%r15, 16(" r ")                     \n\t"                                                                \
        "movq %%rax, 24(" r ")                     \n\t"
#endif
