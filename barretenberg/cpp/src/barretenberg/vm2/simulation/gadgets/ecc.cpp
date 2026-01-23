#include "barretenberg/vm2/simulation/gadgets/ecc.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/uint1.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"

namespace bb::avm2::simulation {

namespace {

class InternalEccException : public std::runtime_error {
  public:
    using std::runtime_error::runtime_error; // Inherit the constructor.
};

} // namespace

/**
 * @brief Adds Grumpkin curve points P and Q and emits an EccAddEvent.
 *  Corresponds to the non-memory aware subtrace ecc.pil.
 *
 * @throws Unexpected exception if points are not on the curve or not normalized.
 *  Note: This function assumes that the points p and q are on the curve. You should only use this function internally
 * if you can guarantee this. Otherwise it is called via the opcode ECADD, see the overloaded function Ecc::add (which
 * performs the curve check).
 *
 * @param p The point P.
 * @param q The point Q.
 * @return The result of P + Q.
 */
EmbeddedCurvePoint Ecc::add(const EmbeddedCurvePoint& p, const EmbeddedCurvePoint& q)
{
    // Check if points are on the curve. These will throw an unexpected exception if they fail.
    BB_ASSERT(p.on_curve(), "Point p is not on the curve");
    BB_ASSERT(q.on_curve(), "Point q is not on the curve");
    // Check if the points are normalized (infinity points must be (0, 0, true)).
    if (p.is_infinity()) {
        BB_ASSERT((p.x() == 0) && (p.y() == 0), "Point p is not normalized");
    }
    if (q.is_infinity()) {
        BB_ASSERT((q.x() == 0) && (q.y() == 0), "Point q is not normalized");
    }

    EmbeddedCurvePoint result = p + q;
    add_events.emit({ .p = p, .q = q, .result = result });
    return result;
}

/**
 * @brief Performs scalar multiplication of an FF value with a Grumpkin curve point using the double and add algorithm,
 * and emits a ScalarMulEvent. Corresponds to the non-memory aware subtrace scalar_mul.pil.
 *
 * @throws Unexpected exception if the input point is not on the curve.
 *  Note: This function assumes that the point is on the curve. As this should only be used internally, it is treated as
 * a catastrophic failure if the point is not on the curve.
 *  Note: Though Grumpkin scalars are in Fq, not Fr (= our FF), our use cases require FF values. This is safe because
 * |Fr| < |Fq|, so we cannot multiply by invalid scalars.
 *
 * @param point The point P.
 * @param scalar The FF scalar.
 * @return The result of scalar * P.
 */
EmbeddedCurvePoint Ecc::scalar_mul(const EmbeddedCurvePoint& point, const FF& scalar)
{
    // This is bad - the scalar mul circuit assumes that the point is on the curve.
    // This will throw an unexpected exception if it fails.
    BB_ASSERT(point.on_curve(), "Point must be on the curve for scalar multiplication");

    // FF bit size == 254.
    auto intermediate_states = std::vector<ScalarMulIntermediateState>(254);
    // Emits ToRadixEvent, see #[TO_RADIX] in scalar_mul.pil.
    auto bits = to_radix.to_le_bits(scalar, 254).first;

    // Normalize input infinity point (infinity points must be (0, 0, true)).
    EmbeddedCurvePoint point_input = point.is_infinity() ? EmbeddedCurvePoint::infinity() : point;

    // First iteration does conditional assignment instead of addition. Note: in circuit we perform reverse aggregation,
    // so the corresponding constraints for below are gated by 'end'.

    // See 'Temp Computation' section in scalar_mul.pil.
    EmbeddedCurvePoint temp = point_input;
    bool bit = bits[0];

    // See 'Result Computation' section in scalar_mul.pil.
    EmbeddedCurvePoint result = bit ? temp : EmbeddedCurvePoint::infinity();
    intermediate_states[0] = { result, temp, bit };

    for (size_t i = 1; i < 254; i++) {
        bit = bits[i];
        // Emits EccAddEvent, see #[DOUBLE] in scalar_mul.pil.
        temp = add(temp, temp);
        if (bit) {
            // Emits EccAddEvent, see #[ADD] in scalar_mul.pil.
            result = add(result, temp);
        }
        intermediate_states[i] = { result, temp, bit };
    }
    scalar_mul_events.emit({ .point = point_input,
                             .scalar = scalar,
                             .intermediate_states = std::move(intermediate_states),
                             .result = result });
    return result;
}

/**
 * @brief Adds Grumpkin curve points P and Q and emits an EccAddMemoryEvent.
 *  Corresponds to the memory aware subtrace ecc_mem.pil (namespace ecc_add_mem).
 *
 * @throws InternalEccException if
 *        - the memory write is out of bounds
 *        - either point is not on the curve
 *  Note: The memory reads are handled by dispatching in execution (Execution::ecc_add(), #[DISPATCH_TO_ECC_ADD]).
 *
 * @param memory The memory interface.
 * @param p The point P.
 * @param q The point Q.
 * @param dst_address The memory address to write the result of P + Q to.
 */
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
        // Emits GreaterThanEvent, see #[CHECK_DST_ADDR_IN_RANGE] in ecc_mem.pil.
        if (gt.gt(max_write_address, AVM_HIGHEST_MEM_ADDRESS)) {
            throw InternalEccException("dst address out of range");
        }

        if (!p.on_curve() || !q.on_curve()) {
            throw InternalEccException("One of the points is not on the curve");
        }

        // Normalize input infinity points.
        EmbeddedCurvePoint p_input = p.is_infinity() ? EmbeddedCurvePoint::infinity() : p;
        EmbeddedCurvePoint q_input = q.is_infinity() ? EmbeddedCurvePoint::infinity() : q;

        // Emits EccAddEvent, see #[INPUT_OUTPUT_ECC_ADD] in ecc_mem.pil.
        EmbeddedCurvePoint result =
            add(p_input, q_input); // Cannot throw since we have checked on_curve() and normalized.

        // Emits MemoryEvents, see #[WRITE_MEM_i] for i = 0, 1, 2,  in ecc_mem.pil.
        memory.set(dst_address, MemoryValue::from<FF>(result.x()));
        memory.set(dst_address + 1, MemoryValue::from<FF>(result.y()));
        memory.set(dst_address + 2, MemoryValue::from<uint1_t>(result.is_infinity() ? 1 : 0));

        add_memory_events.emit({ .execution_clk = execution_clk,
                                 .space_id = space_id,
                                 .p = p,
                                 .q = q,
                                 .result = result,
                                 .dst_address = dst_address });
    } catch (const InternalEccException& e) {
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
