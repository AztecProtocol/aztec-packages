#include "barretenberg/vm2/simulation/ecc.hpp"

namespace bb::avm2::simulation {

AffinePoint Ecc::add(const AffinePoint& p, const AffinePoint& q)
{
    // Check if points are on the curve.
    assert(p.on_curve() && "Point p is not on the curve");
    assert(q.on_curve() && "Point q is not on the curve");

    AffinePoint result = p + q;
    events.emit({ .p = p, .q = q, .result = result });
    return result;
}

} // namespace bb::avm2::simulation
