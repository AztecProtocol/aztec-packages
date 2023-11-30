#pragma once

#ifdef _WIN32
#define BBERG_INLINE __forceinline inline
#else
#define BBERG_INLINE __attribute__((always_inline)) inline
#endif

// TODO(AD): Other instrumentation?
#ifdef XRAY
#define BBERG_PROFILE [[clang::xray_always_instrument]] [[clang::noinline]]
#define BBERG_NO_PROFILE [[clang::xray_never_instrument]]
#else
#define BBERG_PROFILE
#define BBERG_NO_PROFILE
#endif

// Our serialization code loads misaligned addresses.
// If we ever hit an architecture where this doesn't work, at least it'll be loud.
#if defined(__clang__)
#define BBERG_IGNORE_UNDEFINED_MISALIGN __attribute__((no_sanitize("alignment")))
#else
#define BBERG_IGNORE_UNDEFINED_MISALIGN
#endif