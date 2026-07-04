#pragma once

#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/ecc/fields/vector_field.hpp"

#include <array>
#include <cstddef>
#include <type_traits>

namespace bb {

// Compile-time trait: is a SIMD VectorField<Fr::Params> operator* body actually compiled on this
// target? Delegates to `simd_available_v` (vector_field.hpp), which is target-aware — false on a
// non-SIMD build and false for any Fr without a body (e.g. stdlib::field_t today). Because it is
// target-aware, callers branch on it with a plain `if constexpr` and need no `#if __wasm_simd128__`.
template <typename Fr> inline constexpr bool simd_supported_v = simd_available_v<typename Fr::Params>;

// Number of field elements per ContiguousVectorIndex<N> / VectorIndex<N>
// token, equal to VectorField's q1s1 lane count (4 SIMD lanes + 1 scalar
// field on the integer pipe). Naming the constant lets call sites be
// explicit about *why* the literal 5 appears, but it does NOT by itself
// make the surrounding code width-agnostic — the actual width is baked
// into:
//   * VectorField::gather / scatter signatures (std::array<size_t, 5>)
//   * VectorField's load/store-array helpers (std::array<Field, 5>)
//   * VectorWriteProxyT::idx in polynomial.hpp
//   * VectorField's q1s1 Mont-mul kernel itself
// Changing the value requires touching all of the above; do not assume
// the templates carry it through transparently. The vectorized_for /
// vectorized_for_if loop functions and the operator[] dispatch on tokens
// are the only pieces that are genuinely parameterized on N today.
inline constexpr size_t VECTOR_FIELD_WIDTH = 5;

struct ScalarIndex {
    size_t i;
};

template <size_t N> struct VectorIndex {
    std::array<size_t, N> idx;
};

// ContiguousVectorIndex<N> marks an N-wide block of consecutive indices
// [base, base+N). The bulk path of vectorized_for<N> emits this so kernels
// can route through Polynomial's contiguous-load overloads, which fuse the
// N scalar loads into raw SIMD loads of the underlying Fr limb bytes.
//
// vectorized_for_if<N> still emits VectorIndex<N> because its lane indices
// are not consecutive.
template <size_t N> struct ContiguousVectorIndex {
    size_t base;
};

constexpr ScalarIndex shift(ScalarIndex ctx, size_t d)
{
    return ScalarIndex{ ctx.i + d };
}

template <size_t N> constexpr VectorIndex<N> shift(VectorIndex<N> ctx, size_t d)
{
    VectorIndex<N> out{};
    for (size_t k = 0; k < N; ++k) {
        out.idx[k] = ctx.idx[k] + d;
    }
    return out;
}

template <size_t N> constexpr ContiguousVectorIndex<N> shift(ContiguousVectorIndex<N> ctx, size_t d)
{
    return ContiguousVectorIndex<N>{ ctx.base + d };
}

// Design note (native vs WASM):
//
// The point of emitting ContiguousVectorIndex<N> tokens in the bulk is to
// route the kernel through Polynomial's vector operator[], which on WASM
// resolves to VectorField's q1s1 SIMD primitives (the win).
//
// On native, VectorField has no SIMD — its fallback stores `Field elts[N]`
// and loops over `elts` scalar-by-scalar inside every operator. The bulk
// path therefore costs (i) loading N Fr's into the struct, (ii) doing N
// scalar ops on the struct, (iii) writing N Fr's back. For cheap ops
// (+, -) this round-trip costs more than the work it saves; we measured a
// ~13% slowdown on `+=`/`-=` at 2^16 elements vs a plain scalar loop.
//
// So on native, we degenerate to plain scalar: every iteration emits a
// ScalarIndex. The kernel still compiles uniformly (its generic lambda
// just gets one fewer instantiation on this target). This recovers full
// scalar-loop performance on native without forcing kernels to grow
// `if constexpr (is_wasm)` branches at every call site.
//
// Perf cliff to be aware of: this only degrades the IMPLICIT path through
// `vectorized_for<N>`. Direct user code that mints
// `ContiguousVectorIndex<N>{...}` tokens by hand still hits VectorField's
// native fallback and pays the round-trip. That's intentional — opting
// into the SIMD shape explicitly is a "you know what you're doing" signal,
// and we'd rather keep the abstraction surface honest than silently
// rewrite explicit token use under the hood.
template <size_t N, typename Fr, typename K>
[[gnu::always_inline]] inline void vectorized_for(size_t start, size_t end, K&& kernel)
{
    // simd_supported_v<Fr> is target-aware, so on native (and for any Fr without a SIMD body) it is
    // false and the packed branch below is discarded by `if constexpr` — no `#if __wasm_simd128__`.
    if constexpr (simd_supported_v<Fr>) {
        size_t i = start;
        // Bulk: emit ContiguousVectorIndex<N> so the kernel routes through the
        // fast contiguous-load path.
        //
        // The kernel call sites are tagged with `BB_INLINE_STMT` (see compiler_hints.hpp)
        // so that under -Oz the generic lambda's `operator()` is inlined into the bulk
        // loop instead of being emitted as a standalone WASM function and called once per
        // N-wide block. This keeps the kernel body resident in the caller's TurboFan
        // compilation unit so V8 can register-allocate the SIMD lanes across blocks.
        while (i + N <= end) {
            BB_INLINE_STMT kernel(ContiguousVectorIndex<N>{ i });
            i += N;
        }
        // Tail
        while (i < end) {
            BB_INLINE_STMT kernel(ScalarIndex{ i });
            ++i;
        }
    } else {
        // Scalar fallback: native (avoids the round-trip through the VectorField scalar fallback), or an
        // Fr without a SIMD body (e.g. bb::fq under ECCVM/Translator) so the kernel never instantiates
        // against an undefined VectorField<Params>::operator*.
        for (size_t i = start; i < end; ++i) {
            BB_INLINE_STMT kernel(ScalarIndex{ i });
        }
    }
}

// Sparse variant of vectorized_for. Walks [start, end), invokes `predicate(i)` for each i,
// and gathers indices that pass into a VectorIndex<N> buffer; once full, dispatches one
// kernel call with the gather token. Leftover indices at the end run scalar-by-scalar.
//
// Same V8/TurboFan perf cliff applies as in vectorized_for above: both the predicate lambda
// and the kernel lambda need to inline through this template. The bulk call site is tagged
// here only for the kernel — the predicate body should be inline-friendly by construction
// (a small function-of-i, not a polymorphic dispatcher).
//
// VectorIndex<N> routes through VectorField::gather (random-access scalar reads), so the
// per-bulk savings come from amortizing kernel call overhead, not from contiguous-SIMD
// loads. For dense ranges where every i passes the predicate, prefer vectorized_for.
template <size_t N, typename Fr, typename P, typename K>
void vectorized_for_if(size_t start, size_t end, P&& predicate, K&& kernel)
{
    // Target-aware via simd_supported_v (see vectorized_for): the gather path is discarded by
    // `if constexpr` on native and for any Fr without a SIMD body — no `#if __wasm_simd128__` needed.
    if constexpr (simd_supported_v<Fr>) {
        VectorIndex<N> buf{};
        size_t count = 0;
        for (size_t i = start; i < end; ++i) {
            if (predicate(i)) {
                buf.idx[count++] = i;
                if (count == N) {
                    kernel(buf);
                    count = 0;
                }
            }
        }
        // Drain leftovers scalar-by-scalar
        for (size_t k = 0; k < count; ++k) {
            kernel(ScalarIndex{ buf.idx[k] });
        }
    } else {
        // Scalar fallback: native (VectorIndex<N> would otherwise round-trip through VectorField::gather)
        // or an Fr without a SIMD body.
        for (size_t i = start; i < end; ++i) {
            if (predicate(i)) {
                kernel(ScalarIndex{ i });
            }
        }
    }
}

} // namespace bb
