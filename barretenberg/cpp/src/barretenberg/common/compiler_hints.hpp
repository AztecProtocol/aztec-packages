#pragma once

#ifdef _WIN32
#define BBERG_INLINE __forceinline inline
#else
#define BBERG_INLINE __attribute__((always_inline)) inline
#endif

// TODO(AD): Other instrumentation?
#ifdef XRAY
#define BBERG_PROFILE [[clang::xray_always_instrument]] [[clang::noinline]]
#else
#define BBERG_PROFILE
#endif