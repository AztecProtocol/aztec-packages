#pragma once

#ifdef _WIN32
#define BB_INLINE __forceinline
#else
#define BB_INLINE __attribute__((always_inline)) inline
#endif

// Statement-position force-inline hint, applied to a call statement (not a function). The underlying
// `[[clang::always_inline]]` statement attribute is a Clang 12+ extension; GCC rejects an attribute at
// the start of a statement ("attributes at the beginning of statement are ignored", an error under
// -Werror=attributes). Expand to nothing off Clang -- GCC inlines these call sites at -O3 regardless;
// the hint matters on the Clang/WASM -Oz path. See vectorized_for.hpp for the rationale.
#ifdef __clang__
#define BB_INLINE_STMT [[clang::always_inline]]
#else
#define BB_INLINE_STMT
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

// Opinionated feature: functionally equivalent to [[maybe_unused]] but clearly
// marks things DEFINITELY unused. Aims to be more readable, at the tradeoff of being a custom thingy.
#define BB_UNUSED [[maybe_unused]]