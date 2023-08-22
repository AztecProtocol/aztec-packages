#include "goblin_ultra_circuit_builder.hpp"
#include <barretenberg/plonk/proof_system/constants.hpp>
#include <unordered_map>
#include <unordered_set>

using namespace barretenberg;

namespace proof_system {

/**
 * @brief Add gates corresponding to a batched mul
 *
 * @param points
 * @param scalars
 * @return g1::affine_element Result of batched mul
 */
template <typename FF>
g1::affine_element GoblinUltraCircuitBuilder_<FF>::batch_mul(const std::vector<g1::affine_element>& points,
                                                       const std::vector<fr>& scalars)
{
    // TODO(luke): Do we necessarily want to check accum == 0? Other checks?
    ASSERT(op_queue.get_accumulator().is_point_at_infinity());

    size_t num_muls = points.size();
    for (size_t idx = 0; idx < num_muls; ++idx) {
        queue_ecc_mul_accum(points[idx], scalars[idx]);
    }
    return op_queue.get_accumulator();
}

/**
 * @brief Add gates for simple point addition without scalar and compute corresponding op natively
 *
 * @param point
 */
template <typename FF> void GoblinUltraCircuitBuilder_<FF>::queue_ecc_add_accum(const barretenberg::g1::affine_element& point)
{
    // Add raw op to queue
    op_queue.add_accumulate(point);

    // Add ecc op gates
    add_ecc_op_gates(EccOpCode::ADD_ACCUM, point);
}

/**
 * @brief Add gates for point mul and add and compute corresponding op natively
 *
 * @param point
 * @param scalar
 */
template <typename FF>
void GoblinUltraCircuitBuilder_<FF>::queue_ecc_mul_accum(const barretenberg::g1::affine_element& point,
                                                   const barretenberg::fr& scalar)
{
    // Add raw op to op queue
    op_queue.mul_accumulate(point, scalar);

    // Add ecc op gates
    add_ecc_op_gates(EccOpCode::MUL_ACCUM, point, scalar);
}

/**
 * @brief Add point equality gates
 *
 * @return point to which equality has been asserted
 */
template <typename FF> barretenberg::g1::affine_element GoblinUltraCircuitBuilder_<FF>::queue_ecc_eq()
{
    // Add raw op to op queue
    auto point = op_queue.eq();

    // Add ecc op gates
    add_ecc_op_gates(EccOpCode::EQUALITY, point);

    return point;
}

/**
 * @brief Add ecc op gates given an op code and its operands
 *
 * @param op Op code
 * @param point
 * @param scalar
 */
template <typename FF>
void GoblinUltraCircuitBuilder_<FF>::add_ecc_op_gates(uint32_t op, const g1::affine_element& point, const fr& scalar)
{
    auto op_tuple = make_ecc_op_tuple(op, point, scalar);

    record_ecc_op(op_tuple);
}

/**
 * @brief Decompose ecc operands into components, add corresponding variables, return ecc op tuple
 *
 * @param op
 * @param point
 * @param scalar
 * @return ecc_op_tuple Tuple of indices into variables array used to construct pair of ecc op gates
 */
template <typename FF>
ecc_op_tuple GoblinUltraCircuitBuilder_<FF>::make_ecc_op_tuple(uint32_t op, const g1::affine_element& point, const fr& scalar)
{
    const size_t CHUNK_SIZE = 2 * DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
    auto x_256 = uint256_t(point.x);
    auto y_256 = uint256_t(point.y);
    auto x_lo_idx = this->add_variable(x_256.slice(0, CHUNK_SIZE));
    auto x_hi_idx = this->add_variable(x_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2));
    auto y_lo_idx = this->add_variable(y_256.slice(0, CHUNK_SIZE));
    auto y_hi_idx = this->add_variable(y_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2));

    // Split scalar into 128 bit endomorphism scalars
    fr z_1 = 0;
    fr z_2 = 0;
    // TODO(luke): do this montgomery conversion here?
    // auto converted = scalar.from_montgomery_form();
    // fr::split_into_endomorphism_scalars(converted, z_1, z_2);
    // z_1 = z_1.to_montgomery_form();
    // z_2 = z_2.to_montgomery_form();
    fr::split_into_endomorphism_scalars(scalar, z_1, z_2);
    auto z_1_idx = this->add_variable(z_1);
    auto z_2_idx = this->add_variable(z_2);

    return { op, x_lo_idx, x_hi_idx, y_lo_idx, y_hi_idx, z_1_idx, z_2_idx };
}

/**
 * @brief Add ecc operation to queue
 *
 * @param in Variables array indices corresponding to operation inputs
 * @note We dont explicitly set values for the selectors here since their values are fully determined by
 * num_ecc_op_gates. E.g. in the composer we can reconstruct q_ecc_op as the indicator on the first num_ecc_op_gates
 * indices. All other selectors are simply 0 on this domain.
 */
template <typename FF> void GoblinUltraCircuitBuilder_<FF>::record_ecc_op(const ecc_op_tuple& in)
{
    ecc_op_wire_1.emplace_back(in.op);
    ecc_op_wire_2.emplace_back(in.x_lo);
    ecc_op_wire_3.emplace_back(in.x_hi);
    ecc_op_wire_4.emplace_back(in.y_lo);

    ecc_op_wire_1.emplace_back(in.op); // TODO(luke): second op val is sort of a dummy. use "op" again?
    ecc_op_wire_2.emplace_back(in.y_hi);
    ecc_op_wire_3.emplace_back(in.z_lo);
    ecc_op_wire_4.emplace_back(in.z_hi);

    num_ecc_op_gates += 2;
};

template class GoblinUltraCircuitBuilder_<barretenberg::fr>;

} // namespace proof_system