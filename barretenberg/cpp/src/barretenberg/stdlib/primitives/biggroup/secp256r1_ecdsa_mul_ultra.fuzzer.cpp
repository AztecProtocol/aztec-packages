// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/**
 * @file secp256r1_ecdsa_mul_ultra.fuzzer.cpp
 * @brief Differential fuzzer for the hybrid ECDSA mul `R = u₁·G + u₂·Q` on secp256r1.
 *
 * Each iteration consumes 96 bytes:
 *   - bytes  0..31  → u₁
 *   - bytes 32..63  → u₂
 *   - bytes 64..95  → scalar q used to derive an on-curve pubkey Q = q·G
 *
 * The fuzzer compares the in-circuit hybrid path (fixed-base u₁·G + fake-GLV u₂·Q) against the native sum.
 * Special-cases u₂ ∈ {0, ±1}: the fake-GLV path substitutes u₂ → 2 internally, so the returned point is
 * deliberately wrong but the `u2_is_acceptable` soundness flag MUST be false. The fuzzer asserts that
 * relationship in both directions (acceptable ⇔ u₂ ∉ {0, ±1}).
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
using element_native = typename g1_native::element;

namespace {
fr_native scalar_from_bytes(const uint8_t* p)
{
    uint64_t limbs[4]{};
    for (size_t i = 0; i < 4; ++i) {
        std::memcpy(&limbs[i], p + i * 8, sizeof(uint64_t));
    }
    return fr_native(uint256_t(limbs[0], limbs[1], limbs[2], limbs[3]));
}
} // namespace

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    if (Size < 96) {
        return 0;
    }

    const fr_native u1_native = scalar_from_bytes(Data + 0);
    const fr_native u2_native = scalar_from_bytes(Data + 32);
    const fr_native q_native = scalar_from_bytes(Data + 64);

    // Q = q · G. If q = 0 the pubkey is at infinity, which `secp256r1_ecdsa_mul` doesn't support.
    if (q_native == fr_native::zero()) {
        return 0;
    }

    const affine_native Q_native(g1_native::one * q_native);

    Builder builder;
    element_ct Q = element_ct::from_witness(&builder, Q_native);
    scalar_ct u1 = scalar_ct::from_witness(&builder, u1_native);
    scalar_ct u2 = scalar_ct::from_witness(&builder, u2_native);

    const auto out = element_ct::secp256r1_ecdsa_mul(Q, u1, u2);

    const bool u2_degenerate =
        (u2_native == fr_native::zero()) || (u2_native == fr_native::one()) || (u2_native == -fr_native::one());

    // The soundness flag must mirror the degeneracy in both directions.
    assert(out.u2_is_acceptable.get_value() == !u2_degenerate && "ecdsa_mul: u2_is_acceptable mismatch");

    if (!u2_degenerate) {
        // Result must match the native u₁·G + u₂·Q.
        const affine_native expected(g1_native::one * u1_native + element_native(Q_native) * u2_native);

        if (expected.is_point_at_infinity()) {
            assert(out.result.is_point_at_infinity().get_value() && "ecdsa_mul: expected infinity");
        } else {
            assert(!out.result.is_point_at_infinity().get_value() && "ecdsa_mul: unexpected infinity");
            assert(out.result.x().get_value().lo == uint256_t(expected.x) && "ecdsa_mul: x mismatch");
            assert(out.result.y().get_value().lo == uint256_t(expected.y) && "ecdsa_mul: y mismatch");
        }
    }

    assert(bb::CircuitChecker::check(builder) && "ecdsa_mul: circuit check failed");
    return 0;
}
