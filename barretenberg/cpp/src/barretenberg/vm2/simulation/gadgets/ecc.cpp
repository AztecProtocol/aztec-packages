#include "barretenberg/vm2/simulation/gadgets/ecc.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/uint1.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"

namespace bb::avm2::simulation {

// This function assumes that the points p and q are on the curve. You should only
// use this function internally if you can guarantee this. Otherwise it is called
// via the opcode ECADD, see the overloaded function Ecc::add (which performs the curve check)
EmbeddedCurvePoint Ecc::add(const EmbeddedCurvePoint& p, const EmbeddedCurvePoint& q)
{
    // Check if points are on the curve.
    assert(p.on_curve() && "Point p is not on the curve");
    assert(q.on_curve() && "Point q is not on the curve");

    EmbeddedCurvePoint result = p + q;
    add_events.emit({ .p = p, .q = q, .result = result });
    return result;
}

// This function assumes that the point is on the curve. As this should only be used internally,
// it is treated as a catastrophic failure if the point is not on the curve.
EmbeddedCurvePoint Ecc::scalar_mul(const EmbeddedCurvePoint& point, const FF& scalar)
{
    // This is bad - the scalar mul circuit assumes that the point is on the curve.
    ASSERT(point.on_curve(), "Point must be on the curve for scalar multiplication");

    auto intermediate_states = std::vector<ScalarMulIntermediateState>(254);
    auto bits = to_radix.to_le_bits(scalar, 254).first;

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

void Ecc::add(MemoryInterface& memory,
              const EmbeddedCurvePoint& p,
              const EmbeddedCurvePoint& q,
              MemoryAddress dst_address)
{
    uint32_t execution_clk = execution_id_manager.get_execution_id();
    uint16_t space_id = memory.get_space_id();

    try {
        // The resulting EmbeddedCurvePoint is a triple of (x, y, is_infinity).
        // The x and y coordinates are stored at dst_address and dst_address + 1 respectively,
        // and the is_infinity flag is stored at dst_address + 2.
        // Therefore, the maximum address that needs to be written to is dst_address + 2.
        uint64_t max_write_address = static_cast<uint64_t>(dst_address) + 2;
        if (gt.gt(max_write_address, AVM_HIGHEST_MEM_ADDRESS)) {
            throw std::runtime_error("dst address out of range");
        }

        if (!p.on_curve() || !q.on_curve()) {
            throw std::runtime_error("One of the points is not on the curve");
        }

        EmbeddedCurvePoint result = add(p, q);
        memory.set(dst_address, MemoryValue::from<FF>(result.x()));
        memory.set(dst_address + 1, MemoryValue::from<FF>(result.y()));
        memory.set(dst_address + 2, MemoryValue::from<uint1_t>(result.is_infinity() ? 1 : 0));

        add_memory_events.emit({ .execution_clk = execution_clk,
                                 .space_id = space_id,
                                 .p = p,
                                 .q = q,
                                 .result = result,
                                 .dst_address = dst_address });
    } catch (const std::exception& e) {
        // Note this point is not on the curve, but corresponds
        // to default values the circuit will assign.
        EmbeddedCurvePoint res = EmbeddedCurvePoint(0, 0, false);
        add_memory_events.emit({ .execution_clk = execution_clk,
                                 .space_id = space_id,
                                 .p = p,
                                 .q = q,
                                 .result = res,
                                 .dst_address = dst_address });
        throw EccException("Add failed: " + std::string(e.what()));
    }
}

} // namespace bb::avm2::simulation
