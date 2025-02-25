#include "barretenberg/vm2/simulation/ecc.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"

namespace bb::avm2::simulation {

AffinePoint Ecc::add(const AffinePoint& p, const AffinePoint& q)
{
    // Check if points are on the curve.
    assert(p.on_curve() && "Point p is not on the curve");
    assert(q.on_curve() && "Point q is not on the curve");

    AffinePoint result = p + q;
    add_events.emit({ .p = p, .q = q, .result = result });
    return result;
}

AffinePoint Ecc::scalar_mul(const AffinePoint& point, const FF& scalar)
{
    uint256_t scalar_integer = static_cast<uint256_t>(scalar);
    AffinePoint temp = point;
    AffinePoint result = AffinePoint::infinity();
    auto intermediate_states = std::vector<ScalarMulIntermediateState>(254);

    for (size_t i = 0; i < 254; i++) {
        // TODO(Alvaro): Call to radix here when it is implemented.
        bool bit = scalar_integer.get_bit(i);
        if (bit) {
            result = add(result, temp);
        }
        intermediate_states[i] = { result, temp, bit };
        temp = add(temp, temp);
    }
    scalar_mul_events.emit(
        { .point = point, .scalar = scalar, .intermediate_states = intermediate_states, .result = result });
    return result;
}

} // namespace bb::avm2::simulation
