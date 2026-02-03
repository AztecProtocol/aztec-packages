#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declaration
class MemoryInterface;

class EccInterface {
  public:
    virtual ~EccInterface() = default;
    virtual EmbeddedCurvePoint add(const EmbeddedCurvePoint& p, const EmbeddedCurvePoint& q) = 0;
    virtual EmbeddedCurvePoint scalar_mul(const EmbeddedCurvePoint& point, const FF& scalar) = 0;
    virtual void add(MemoryInterface& memory,
                     const EmbeddedCurvePoint& p,
                     const EmbeddedCurvePoint& q,
                     MemoryAddress dst_address) = 0;
};

} // namespace bb::avm2::simulation
