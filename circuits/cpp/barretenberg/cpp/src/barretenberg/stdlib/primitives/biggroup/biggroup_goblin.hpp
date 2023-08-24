#pragma once

namespace proof_system::plonk {
namespace stdlib {

/**
 * @brief Goblin style batch multiplication
 * @note (Luke): The approach of having a distinct interface for goblin style group operations is limited/flawed. The
 * natural alternative is to abstract the details away from the circuit writer and to simply allow the strategy to be
 * determined by the type of circuit constructor (i.e. Goblin or not) from within biggroup. Currently, the goblin-style
 * circuit builder functionality has been incorporated directly into the UltraCircuitBuilder, thus there is no
 * means for distinction. If we decide it is preferable to support fully flexible goblin-style group operations via the
 * existing biggroup API, we will need to make an independent GoblinUltraCircuitBuilder class (plausibly via inheritance
 * from UltraCircuitBuilder) and implement Goblin-style strategies for each of the operations in biggroup.
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

        // Constrain decomposition of point coordinates to reconstruct original values.
        // Note: may need to do point.x.assert_is_in_field() prior to the assert_eq() according to Kesha.
        auto x_lo = Fr::from_witness_index(builder, op_tuple.x_lo);
        auto x_hi = Fr::from_witness_index(builder, op_tuple.x_hi);
        auto y_lo = Fr::from_witness_index(builder, op_tuple.y_lo);
        auto y_hi = Fr::from_witness_index(builder, op_tuple.y_hi);
        Fq point_x(x_lo, x_hi);
        Fq point_y(y_lo, y_hi);
        // point.x.assert_is_in_field(); // WORKTODO: needed?
        // point.y.assert_is_in_field();
        point.x.assert_equal(point_x);
        point.y.assert_equal(point_y);

        // Constrain endomorphism scalars to reconstruct scalar
        auto z_1 = Fr::from_witness_index(builder, op_tuple.z_1);
        auto z_2 = Fr::from_witness_index(builder, op_tuple.z_2);
        auto beta = G::subgroup_field::cube_root_of_unity();
        scalar.assert_equal(z_1 - z_2 * beta);
    }

    // Populate equality gates based on the internal accumulator point
    auto op_tuple = builder->queue_ecc_eq();

    // Reconstruct the result of the batch mul
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
