// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/**
 * @file secp256r1_fixed_base_mul_ultra.fuzzer.cpp
 * @brief Differential fuzzer for the secp256r1 fixed-base ROM-table multiplication.
 *
 * Builds a fresh UltraCircuitBuilder per fuzz iteration, witnesses a random scalar u, computes
 *     R = u · G   (in-circuit)
 * via `element::secp256r1_fixed_base_mul`, and compares against the native multiplication. Also asserts
 * the circuit is satisfied.
 *
 * Covers the 7-bit + short-tail Pedersen-style window construction, the lo/hi plookup chain, and the
 * total-offset subtraction (including the u = 0 → infinity edge case).
 */

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <cassert>
#include <cstdint>
#include <cstring>

using bb::numeric::uint256_t;
using Builder = bb::UltraCircuitBuilder;
using Curve = bb::stdlib::secp256r1<Builder>;
using element_ct = typename Curve::Group;
using scalar_ct = typename Curve::ScalarField;
using fr_native = typename Curve::ScalarFieldNative;
using g1_native = typename Curve::GroupNative;
using affine_native = typename g1_native::affine_element;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    // Need 32 bytes for one scalar.
    if (Size < 32) {
        return 0;
    }

    uint64_t limbs[4]{};
    for (size_t i = 0; i < 4; ++i) {
        std::memcpy(&limbs[i], Data + i * 8, sizeof(uint64_t));
    }
    const uint256_t scalar_raw(limbs[0], limbs[1], limbs[2], limbs[3]);
    const fr_native scalar(scalar_raw);

    Builder builder;
    scalar_ct u = scalar_ct::from_witness(&builder, scalar);

    const auto output = element_ct::secp256r1_fixed_base_mul(u);
    const affine_native expected(g1_native::one * scalar);

    if (expected.is_point_at_infinity()) {
        // u = 0 → expected = O; the in-circuit construction should also flag infinity.
        assert(output.is_point_at_infinity().get_value() && "fixed_base_mul: u=0 did not yield infinity");
    } else {
        assert(!output.is_point_at_infinity().get_value() && "fixed_base_mul: unexpected infinity");
        assert(output.x().get_value().lo == uint256_t(expected.x) && "fixed_base_mul: x mismatch");
        assert(output.y().get_value().lo == uint256_t(expected.y) && "fixed_base_mul: y mismatch");
    }

    assert(bb::CircuitChecker::check(builder) && "fixed_base_mul: circuit check failed");
    return 0;
}
