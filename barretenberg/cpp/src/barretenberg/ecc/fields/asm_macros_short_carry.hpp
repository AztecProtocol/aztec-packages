#pragma once

#if defined(__ADX__) && !defined(DISABLE_ADX)
// clang-format off
#define SQR_LOW_HALF_REDUCE_STEP(u0, u1, u2, u3)                                                                                 \
        "movq " u0 ", %%rdx                         \n\t"                                               \
        "imulq %[r_inv], %%rdx                      \n\t"                          \
        "xorl %%edi, %%edi                          \n\t"                                              \
        "mulxq %[modulus_0], %%rdi, %%rcx           \n\t"                                    \
        "adcxq %%rdi, " u0 "                        \n\t"                           \
        "adoxq %%rcx, " u1 "                        \n\t"                                         \
        "mulxq %[modulus_1], %%rdi, %%rcx           \n\t"                                    \
        "adcxq %%rdi, " u1 "                        \n\t"                                    \
        "adoxq %%rcx, " u2 "                        \n\t"                                    \
        "mulxq %[modulus_2], %%rdi, %%rcx           \n\t"                                    \
        "adcxq %%rdi, " u2 "                        \n\t"                                    \
        "adoxq %%rcx, " u3 "                        \n\t"                                    \
        "mulxq %[modulus_3], %%rdi, " u0 "          \n\t"      \
        "adcxq %%rdi, " u3 "                        \n\t"                                    \
        "adoxq %[zero_reference], " u0 "            \n\t"                                     \
        "adcxq %[zero_reference], " u0 "            \n\t"

#define SQR_LOW_HALF_REDUCTION(a)                                                                                                          \
        "movq 0(" a "), %%rdx                      \n\t"                                                \
        "xorq %%r8, %%r8                           \n\t"                                 \
        "mulxq 8(" a "), %%r9, %%r10               \n\t"                   \
        "mulxq 16(" a "), %%r8, %%r15              \n\t"               \
        "mulxq 24(" a "), %%r11, %%r12             \n\t"                   \
        "adoxq %%r8, %%r10                         \n\t"                       \
        "adcxq %%r15, %%r11                        \n\t"                       \
        "movq 8(" a "), %%rdx                      \n\t"                                                \
        "mulxq 16(" a "), %%r8, %%r15              \n\t"                                    \
        "mulxq 24(" a "), %%rdi, %%rcx             \n\t"                                    \
        "movq 24(" a "), %%rdx                     \n\t"                                                \
        "mulxq 16(" a "), %%r13, %%r14             \n\t"                   \
        "adoxq %%r8, %%r11                         \n\t"                       \
        "adcxq %%rdi, %%r12                        \n\t"                       \
        "adoxq %%r15, %%r12                        \n\t"                       \
        "adcxq %%rcx, %%r13                        \n\t"                       \
        "adoxq %[zero_reference], %%r13            \n\t"                       \
        "adcxq %[zero_reference], %%r14            \n\t"                       \
        "adoxq %[zero_reference], %%r14            \n\t"                       \
        "adoxq %%r9, %%r9                          \n\t"                       \
        "adcxq %%r12, %%r12                        \n\t"                       \
        "adoxq %%r10, %%r10                        \n\t"                       \
        "adcxq %%r13, %%r13                        \n\t"                       \
        "adoxq %%r11, %%r11                        \n\t"                       \
        "adcxq %%r14, %%r14                        \n\t"                       \
        "movq 0(" a "), %%rdx                      \n\t"                                                \
        "mulxq %%rdx, %%r8, %%rcx                  \n\t"         \
        "movq 16(" a "), %%rdx                     \n\t"                                                \
        "mulxq %%rdx, %%rdx, %%rdi                 \n\t"             \
        "adcxq %%rcx, %%r9                         \n\t" \
        "adoxq %%rdx, %%r12                        \n\t" \
        "adoxq %%rdi, %%r13                        \n\t"                      \
        "movq 24(" a "), %%rdx                     \n\t"                                                \
        "mulxq %%rdx, %%rcx, %%r15                 \n\t"        \
        "movq 8(" a "), %%rdx                      \n\t"                                                \
        "mulxq %%rdx, %%rdi, %%rdx                 \n\t"             \
        "adcxq %%rdi, %%r10                        \n\t"                       \
        "adcxq %%rdx, %%r11                        \n\t"                      \
        "adoxq %%rcx, %%r14                        \n\t"                      \
        "adoxq %[zero_reference], %%r15            \n\t"                      \
        "adcxq %[zero_reference], %%r12             \n\t"                                             \
        "adcxq %[zero_reference], %%r13             \n\t"                                               \
        "adcxq %[zero_reference], %%r14             \n\t"                                               \
        "adcxq %[zero_reference], %%r15             \n\t"                   \
        SQR_LOW_HALF_REDUCE_STEP("%%r8", "%%r9", "%%r10", "%%r11")                                                               \
        SQR_LOW_HALF_REDUCE_STEP("%%r9", "%%r10", "%%r11", "%%r8")                                                               \
        SQR_LOW_HALF_REDUCE_STEP("%%r10", "%%r11", "%%r8", "%%r9")                                                               \
        SQR_LOW_HALF_REDUCE_STEP("%%r11", "%%r8", "%%r9", "%%r10")                                                               \
        "addq %%r8, %%r12                           \n\t"                                    \
        "adcq %%r9, %%r13                           \n\t"                               \
        "adcq %%r10, %%r14                          \n\t"                               \
        "adcq %%r11, %%r15                          \n\t"                               \


#define MUL_SHORT_CARRY_ROW(ai, b, t0, t1, t2, t3, t4)                                                                              \
        "xorl %%r11d, %%r11d                        \n\t"                                     \
        "movq " ai ", %%rdx                         \n\t"                                               \
        "mulxq 0(" b "), %%r8, %%r9                 \n\t"                                   \
        "adcxq %%r8, " t0 "                         \n\t"                                        \
        "adoxq %%r9, " t1 "                         \n\t"                                        \
        "mulxq 8(" b "), %%r8, %%r9                 \n\t"                                   \
        "adcxq %%r8, " t1 "                         \n\t"                                   \
        "adoxq %%r9, " t2 "                         \n\t"                                   \
        "mulxq 16(" b "), %%r8, %%r9                \n\t"                                   \
        "adcxq %%r8, " t2 "                         \n\t"                                   \
        "adoxq %%r9, " t3 "                         \n\t"                                   \
        "mulxq 24(" b "), %%r8, " t4 "              \n\t"                                 \
        "adcxq %%r8, " t3 "                         \n\t"                                   \
        "adoxq %%r11, " t4 "                        \n\t"                                    \
        "adcxq %%r11, " t4 "                        \n\t"

#define MUL_SHORT_CARRY_REDUCE_STEP(t0, t1, t2, t3, t4)                                                                             \
        "movq " t0 ", %%rdx                         \n\t"                                               \
        "imulq %[r_inv], %%rdx                      \n\t"                          \
        "xorl %%r11d, %%r11d                        \n\t"                                     \
        "mulxq %[modulus_0], %%r8, %%r9             \n\t"                                      \
        "adcxq %%r8, " t0 "                         \n\t"                           \
        "adoxq %%r9, " t1 "                         \n\t"                                         \
        "mulxq %[modulus_1], %%r8, %%r9             \n\t"                                      \
        "adcxq %%r8, " t1 "                         \n\t"                                    \
        "adoxq %%r9, " t2 "                         \n\t"                                    \
        "mulxq %[modulus_2], %%r8, %%r9             \n\t"                                      \
        "adcxq %%r8, " t2 "                         \n\t"                                    \
        "adoxq %%r9, " t3 "                         \n\t"                                    \
        "mulxq %[modulus_3], %%r8, %%r9             \n\t"                                      \
        "adcxq %%r8, " t3 "                         \n\t"                                    \
        "adoxq %%r9, " t4 "                         \n\t"                         \
        "adcxq %%r11, " t4 "                        \n\t"

#define MUL_SHORT_CARRY(a1, a2, a3, a4, b)                                                                                          \
        "xorl %%r11d, %%r11d                        \n\t"                                     \
        "movq " a1 ", %%rdx                         \n\t"                                               \
        "mulxq 0(" b "), %%r13, %%r14               \n\t"                               \
        "mulxq 8(" b "), %%r8, %%r15                \n\t"                                 \
        "adcxq %%r8, %%r14                          \n\t"                                        \
        "mulxq 16(" b "), %%r8, %%r10               \n\t"                                 \
        "adcxq %%r8, %%r15                          \n\t"                                   \
        "mulxq 24(" b "), %%r8, %%r12               \n\t"                                 \
        "adcxq %%r8, %%r10                          \n\t"                                   \
        "adcxq %%r11, %%r12                         \n\t"                   \
        MUL_SHORT_CARRY_REDUCE_STEP("%%r13", "%%r14", "%%r15", "%%r10", "%%r12")                                                    \
        MUL_SHORT_CARRY_ROW(a2, b, "%%r14", "%%r15", "%%r10", "%%r12", "%%r13")                                                     \
        MUL_SHORT_CARRY_REDUCE_STEP("%%r14", "%%r15", "%%r10", "%%r12", "%%r13")                                                    \
        MUL_SHORT_CARRY_ROW(a3, b, "%%r15", "%%r10", "%%r12", "%%r13", "%%r14")                                                     \
        MUL_SHORT_CARRY_REDUCE_STEP("%%r15", "%%r10", "%%r12", "%%r13", "%%r14")                                                    \
        MUL_SHORT_CARRY_ROW(a4, b, "%%r10", "%%r12", "%%r13", "%%r14", "%%r15")                                                     \
        MUL_SHORT_CARRY_REDUCE_STEP("%%r10", "%%r12", "%%r13", "%%r14", "%%r15")

// clang-format on
#endif
