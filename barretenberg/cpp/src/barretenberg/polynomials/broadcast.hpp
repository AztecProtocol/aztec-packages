#pragma once

#include "barretenberg/ecc/fields/vector_field.hpp"
#include "barretenberg/polynomials/vectorized_for.hpp"

#include <cstddef>

namespace bb {

// Adapts a scalar Fr into the token-dispatched operator[] protocol used by
// Polynomial / PolynomialSpan in vectorized_for<N> kernels. For ScalarIndex
// it yields the scalar; for ContiguousVectorIndex<N> it yields a VectorField
// holding the same scalar broadcast across all lanes. A kernel can then read
//
//     vectorized_for<5>(0, n, [&](auto ctx) {
//         self[ctx] = self[ctx] + other[ctx] * scaling[ctx];
//     });
//
// without an `if constexpr` branch on the token type: `scaling[ctx]` returns
// Fr in the tail and VectorField in the bulk, matching the type the
// surrounding arithmetic expects.
//
// Both forms are materialized once in the constructor (the VectorField
// broadcast does a one-time splat of `s` into all lanes), and both operator[]
// overloads return by const-reference so iterating callers do not pay a copy
// per loop block.
template <typename Fr> struct Broadcast {
    using Vec = VectorField<typename Fr::Params>;

    Fr scalar;
    Vec vector;

    explicit Broadcast(const Fr& s)
        : scalar(s)
        , vector(Vec::broadcast(s))
    {}

    [[gnu::always_inline]] const Fr& operator[](ScalarIndex) const { return scalar; }

    template <size_t N> [[gnu::always_inline]] const Vec& operator[](ContiguousVectorIndex<N>) const { return vector; }
};

} // namespace bb
