#pragma once

#if defined(__x86_64__) && !defined(__wasm__) && (defined(__clang__) || defined(__GNUC__))
#include <cpuid.h>
#include <cstdint>

namespace bb {

/** Check every IFMA kernel feature and the OS-managed AVX-512 register state without compiler runtime symbols. */
inline bool cpu_supports_avx512_ifma() noexcept
{
    static const bool supported = [] {
        unsigned int eax = 0;
        unsigned int ebx = 0;
        unsigned int ecx = 0;
        unsigned int edx = 0;
        if (__get_cpuid(1, &eax, &ebx, &ecx, &edx) == 0) {
            return false;
        }
        // XGETBV is legal only when XSAVE and OSXSAVE are present. AVX is also required by the kernels.
        constexpr unsigned int required_leaf1 = (1U << 26) | (1U << 27) | (1U << 28);
        if ((ecx & required_leaf1) != required_leaf1) {
            return false;
        }
        unsigned int xcr0_low = 0;
        unsigned int xcr0_high = 0;
        // Read XCR0 without requiring an xsave target attribute on this baseline-ISA dispatch function.
        __asm__ volatile("xgetbv" : "=a"(xcr0_low), "=d"(xcr0_high) : "c"(0));
        // XMM, YMM, opmask, ZMM_Hi256 and Hi16_ZMM must all be enabled by the operating system.
        constexpr unsigned int required_xcr0 = 0xe6U;
        if ((xcr0_low & required_xcr0) != required_xcr0) {
            return false;
        }
        if (__get_cpuid_count(7, 0, &eax, &ebx, &ecx, &edx) == 0) {
            return false;
        }
        constexpr unsigned int required_leaf7 = (1U << 16) | (1U << 17) | (1U << 21) | (1U << 30) | (1U << 31);
        return (ebx & required_leaf7) == required_leaf7;
    }();
    return supported;
}

} // namespace bb
#endif
