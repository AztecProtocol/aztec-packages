#include "barretenberg/vm2/simulation/ecc.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"

namespace bb::avm2::simulation {

EmbeddedCurvePoint Ecc::add(const EmbeddedCurvePoint& p, const EmbeddedCurvePoint& q)
{
    // Check if points are on the curve.
    assert(p.on_curve() && "Point p is not on the curve");
    assert(q.on_curve() && "Point q is not on the curve");

    EmbeddedCurvePoint result = p + q;
    add_events.emit({ .p = p, .q = q, .result = result });
    return result;
}

EmbeddedCurvePoint Ecc::scalar_mul(const EmbeddedCurvePoint& point, const FF& scalar)
{
    auto intermediate_states = std::vector<ScalarMulIntermediateState>(254);
    auto bits = to_radix.to_le_bits(scalar, 254);

    // First iteration does conditional assignment instead of addition
    EmbeddedCurvePoint temp = point;
    bool bit = bits[0];

    EmbeddedCurvePoint result = bit ? temp : EmbeddedCurvePoint::infinity();
    intermediate_states[0] = { result, temp, bit };

    for (size_t i = 1; i < 254; i++) {
        bit = bits[i];
        temp = add(temp, temp);

        if (bit) {
            result = add(result, temp);
        }
        intermediate_states[i] = { result, temp, bit };
    }
    scalar_mul_events.emit(
        { .point = point, .scalar = scalar, .intermediate_states = std::move(intermediate_states), .result = result });
    return result;
}

} // namespace bb::avm2::simulation
