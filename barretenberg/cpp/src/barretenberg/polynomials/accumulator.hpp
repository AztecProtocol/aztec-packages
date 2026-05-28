#pragma once

#include "barretenberg/ecc/fields/vector_field.hpp"
#include "barretenberg/polynomials/vectorized_for.hpp"

#include <array>
#include <cstddef>

namespace bb {

// Per-token reduction accumulator for use inside `vectorized_for<N>` kernels.
//
// Pairs with Polynomial / PolynomialSpan's token-dispatched operator[] to
// keep the kernel body uniform across the bulk and tail paths. The bulk
// (ContiguousVectorIndex<N>) contributions land in a VectorField slot,
// summing lane-wise; the tail (ScalarIndex) contributions land in a scalar
// Fr slot. `reduce()` horizontal-adds the N lanes together with the scalar
// to give the final result.
//
// Canonical kernel shape:
//
//     Accumulator<Fr> acc;
//     vectorized_for<VECTOR_FIELD_WIDTH>(0, n, [&](auto ctx) {
//         acc += view[ctx];                       // dot, sum, …
//     });
//     Fr result = acc.reduce();
//
// Both forms — `scalar_acc` and `vector_acc` — are materialised in the
// constructor so the loop never branches on the token type to pick an
// accumulator. The compile-time branch lives at the operator+= overload
// set: ScalarIndex iterations hit operator+=(const Fr&), bulk iterations
// hit operator+=(const Vec&).
//
// Reduction order is implementation-defined: lanes are summed in lane
// order (L=0,1,2,3,4) then added to the scalar slot. For finite field
// addition this is associative and commutative so the result is bit-
// identical regardless, but callers that care about specific summation
// order for floats / Kahan-style work should not use this.
template <typename Fr> struct Accumulator {
    using Vec = VectorField<typename Fr::Params>;

    Fr scalar_acc;
    Vec vector_acc;

    Accumulator()
        : scalar_acc(0)
        , vector_acc(Vec::broadcast(Fr(0)))
    {}

    [[gnu::always_inline]] void operator+=(const Fr& v) { scalar_acc = scalar_acc + v; }

    [[gnu::always_inline]] void operator+=(const Vec& v) { vector_acc = vector_acc + v; }

    // Horizontal reduce: sum all lanes of vector_acc and the scalar slot
    // into a single Fr. Tree-shaped (depth 3 for 6 inputs) so a chain of
    // five serial Fr-adds does not sit on the critical path.
    Fr reduce() const
    {
        static_assert(VECTOR_FIELD_WIDTH == 5, "Accumulator::reduce tree assumes width 5");
        const std::array<Fr, VECTOR_FIELD_WIDTH> lanes = vector_acc.to_array();
        const Fr s01 = lanes[0] + lanes[1];
        const Fr s23 = lanes[2] + lanes[3];
        const Fr s4s = lanes[4] + scalar_acc;
        return (s01 + s23) + s4s;
    }
};

} // namespace bb
