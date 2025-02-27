#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::tracegen {

struct AffinePointStandard {
    FF x;
    FF y;
    bool is_infinity;
};

AffinePointStandard point_to_standard_form(const AffinePoint& p);

} // namespace bb::avm2::tracegen
