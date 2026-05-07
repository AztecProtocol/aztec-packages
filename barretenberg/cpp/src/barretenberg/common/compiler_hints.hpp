#pragma once

#ifdef _WIN32
#define BB_INLINE __forceinline
#else
#define BB_INLINE __attribute__((always_inline)) inline
#endif

// TODO(AD): Other instrumentation?
#ifdef XRAY
#define BB_PROFILE [[clang::xray_always_instrument]] [[clang::noinline]]
#define BB_NO_PROFILE [[clang::xray_never_instrument]]
#else
#define BB_PROFILE
#define BB_NO_PROFILE
#endif

// Optimization hints for clang - which outcome of an expression is expected for better
// branch-prediction optimization
#ifdef __clang__
#define BB_LIKELY(x) __builtin_expect(!!(x), 1)
#define BB_UNLIKELY(x) __builtin_expect(!!(x), 0)
#else
#define BB_LIKELY(x) x
#define BB_UNLIKELY(x) x
#endif

// Force the compiler to fully unroll the immediately following loop. Used for short, fixed-bound
// loops in tight arithmetic kernels where unrolling exposes ILP.
#ifdef __clang__
#define BB_FORCE_UNROLL _Pragma("clang loop unroll(full)")
#elif defined(__GNUC__)
#define BB_FORCE_UNROLL _Pragma("GCC unroll 16")
#else
#define BB_FORCE_UNROLL
#endif

// Opinionated feature: functionally equivalent to [[maybe_unused]] but clearly
// marks things DEFINITELY unused. Aims to be more readable, at the tradeoff of being a custom thingy.
#define BB_UNUSED [[maybe_unused]]