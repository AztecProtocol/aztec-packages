#pragma once

namespace proof_system::plonk {
namespace stdlib {

/**
 * @brief Goblin style batch multiplication
 *
 * @details In goblin-style arithmetization, the operands (points/scalars) for each mul-accumulate operation are
 * decomposed into smaller components and written to an operation queue via the builder. The components are also added
 * as witness variables. This function adds constraints demonstrating the fidelity of the point/scalar decompositions
 * given the indices of the components in the variables array. The actual mul-accumulate operations are performed
 * natively (without constraints) under the hood, and the final result is obtained by queueing an equality operation via
 * the builder. The components of the result are returned as indices into the variables array from which the resulting
 * accumulator point is re-constructed.
 *
 * @tparam C CircuitBuilder
 * @tparam Fq Base field
 * @tparam Fr Scalar field
 * @tparam G Native group
 * @param points
 * @param scalars
 * @param max_num_bits
 * @return element<C, Fq, Fr, G>
 */
template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::goblin_batch_mul(const std::vector<element>& points,
                                                              const std::vector<Fr>& scalars,
                                                              [[maybe_unused]] const size_t max_num_bits)
{
    auto builder = points[0].get_context();

    // Check that the internal accumulator is zero?
    ASSERT(builder->op_queue.get_accumulator().is_point_at_infinity());

    // Loop over all points and scalars
    size_t num_points = points.size();
    for (size_t i = 0; i < num_points; ++i) {
        auto& point = points[i];
        auto& scalar = scalars[i];

        // Populate the goblin-style ecc op gates for the given mul inputs
        auto op_tuple = builder->queue_ecc_mul_accum(point.get_value(), scalar.get_value());

        // Adds constraints demonstrating that the EC point coordinates can be reconstructed from their decomposition.
        auto x_lo = Fr::from_witness_index(builder, op_tuple.x_lo);
        auto x_hi = Fr::from_witness_index(builder, op_tuple.x_hi);
        auto y_lo = Fr::from_witness_index(builder, op_tuple.y_lo);
        auto y_hi = Fr::from_witness_index(builder, op_tuple.y_hi);
        Fq point_x(x_lo, x_hi);
        Fq point_y(y_lo, y_hi);
        point.x.assert_equal(point_x);
        point.y.assert_equal(point_y);

        // // ALTERNATIVELY: try this and compare gate counts
        // point.x.assert_is_in_field()
        // point.y.assert_is_in_field()
        // x_lo.assert_equal(point.x.binary_basis_limbs[0] + shift_1 * point.x.binary_basis_limbs[1]);
        // x_hi.assert_equal(point.x.binary_basis_limbs[2] + shift_1 * point.x.binary_basis_limbs[3]);
        // y_lo.assert_equal(point.y.binary_basis_limbs[0] + shift_1 * point.y.binary_basis_limbs[1]);
        // y_hi.assert_equal(point.y.binary_basis_limbs[2] + shift_1 * point.y.binary_basis_limbs[3]);

        // Add constraints demonstrating proper decomposition of scalar into endomorphism scalars
        auto z_1 = Fr::from_witness_index(builder, op_tuple.z_1);
        auto z_2 = Fr::from_witness_index(builder, op_tuple.z_2);
        auto beta = G::subgroup_field::cube_root_of_unity();
        scalar.assert_equal(z_1 - z_2 * beta);
    }

    // Populate equality gates based on the internal accumulator point
    auto op_tuple = builder->queue_ecc_eq();

    // Reconstruct the result of the batch mul using indices into the variables array
    auto x_lo = Fr::from_witness_index(builder, op_tuple.x_lo);
    auto x_hi = Fr::from_witness_index(builder, op_tuple.x_hi);
    auto y_lo = Fr::from_witness_index(builder, op_tuple.y_lo);
    auto y_hi = Fr::from_witness_index(builder, op_tuple.y_hi);
    Fq point_x(x_lo, x_hi);
    Fq point_y(y_lo, y_hi);

    return element(point_x, point_y);
}

} // namespace stdlib
} // namespace proof_system::plonk
