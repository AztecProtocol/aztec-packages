#include "barretenberg/vm2/tracegen/lib/ecc.hpp"

namespace bb::avm2::tracegen {

AffinePointStandard point_to_standard_form(const AffinePoint& p)
{
    if (p.is_point_at_infinity()) {
        return { FF::zero(), FF::zero(), true };
    }
    return { p.x, p.y, false };
}

} // namespace bb::avm2::tracegen
