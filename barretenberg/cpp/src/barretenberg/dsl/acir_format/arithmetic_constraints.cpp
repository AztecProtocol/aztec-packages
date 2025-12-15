// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], date: 2025-12-12 }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "arithmetic_constraints.hpp"

namespace acir_format {

template <typename Builder> void set_zero_idx(const Builder& builder, QuadConstraint& mul_quad)
{
    using FF = Builder::FF;

    auto replace_and_check_zero_scaling = [&](uint32_t& index, const FF& scaling) {
        if (index == bb::stdlib::IS_CONSTANT) {
            index = builder.zero_idx();
            BB_ASSERT_EQ(scaling, FF(0), "mul_quad_ gate with IS_CONSTANT witness index has non-zero scaling");
        }
    };

    BB_ASSERT_NEQ(mul_quad.a,
                  bb::stdlib::IS_CONSTANT,
                  "mul_quad_ gate cannot have IS_CONSTANT for witness a. An error here probably means a conversion "
                  "issue in acir_to_constraint_buf.");
    replace_and_check_zero_scaling(mul_quad.b, mul_quad.b_scaling);
    replace_and_check_zero_scaling(mul_quad.c, mul_quad.c_scaling);
    replace_and_check_zero_scaling(mul_quad.d, mul_quad.d_scaling);
}

template <typename Builder>
void check_mul_add_gate(Builder& builder, const QuadConstraint& mul_quad, const typename Builder::FF next_wire_w4)
{
    using FF = Builder::FF;

    FF result = mul_quad.const_scaling + next_wire_w4;
    result += builder.get_variable(mul_quad.a) * builder.get_variable(mul_quad.b) * mul_quad.mul_scaling;
    result += builder.get_variable(mul_quad.a) * mul_quad.a_scaling;
    result += builder.get_variable(mul_quad.b) * mul_quad.b_scaling;
    result += builder.get_variable(mul_quad.c) * mul_quad.c_scaling;
    result += builder.get_variable(mul_quad.d) * mul_quad.d_scaling;

    if (result != FF::zero() && !builder.failed() && !builder.is_write_vk_mode()) {
        builder.failure("mul_add_gate");
    }
}

template <typename Builder> void create_quad_constraint(Builder& builder, QuadConstraint& mul_quad)
{
    // Replace IS_CONSTANT indices with zero indices
    set_zero_idx(builder, mul_quad);
    // Check if the gate is valid
    check_mul_add_gate(builder, mul_quad);
    // Create gate
    builder.create_big_mul_add_gate(mul_quad);
}

template <typename Builder> void create_big_quad_constraint(Builder& builder, BigQuadConstraint& big_constraint)
{
    using FF = typename Builder::FF;

    // The index/value of the 4-th witness in the next gate (not used in the first gate)
    // It is result of the expression calculated on the current gate
    uint32_t next_w4_wire_idx = 0;
    FF next_w4_wire_value = FF::zero();

    for (size_t j = 0; j < big_constraint.size() - 1; ++j) {
        // Replace IS_CONSTANT indices with zero indices
        set_zero_idx(builder, big_constraint[j]);
        // Create the mul_add gate
        builder.create_big_mul_add_gate(big_constraint[j], /*include_next_gate_w_4*/ true);
        // Update the index/value of the 4-th wire
        next_w4_wire_value = builder.get_variable(big_constraint[j].a) * builder.get_variable(big_constraint[j].b) *
                                 big_constraint[j].mul_scaling +
                             builder.get_variable(big_constraint[j].a) * big_constraint[j].a_scaling +
                             builder.get_variable(big_constraint[j].b) * big_constraint[j].b_scaling +
                             builder.get_variable(big_constraint[j].c) * big_constraint[j].c_scaling +
                             builder.get_variable(big_constraint[j].d) * big_constraint[j].d_scaling +
                             big_constraint[j].const_scaling;
        next_w4_wire_value = -next_w4_wire_value;
        next_w4_wire_idx = builder.add_variable(next_w4_wire_value);
        // Check if the gate is valid
        check_mul_add_gate(builder, big_constraint[j], next_w4_wire_value);
        // Set the 4-th wire of the next gate
        big_constraint[j + 1].d = next_w4_wire_idx;
        big_constraint[j + 1].d_scaling = fr(-1);
    }
    // Replace IS_CONSTANT indices with zero indices
    set_zero_idx(builder, big_constraint.back());
    // Create final gate
    builder.create_big_mul_add_gate(big_constraint.back(), /*include_next_gate_w_4*/ false);
    // Check if the gate is valid
    check_mul_add_gate(builder, big_constraint.back());
}

template void set_zero_idx<UltraCircuitBuilder>(const UltraCircuitBuilder&, QuadConstraint&);

template void set_zero_idx<MegaCircuitBuilder>(const MegaCircuitBuilder&, QuadConstraint&);

template void check_mul_add_gate<UltraCircuitBuilder>(UltraCircuitBuilder&,
                                                      const QuadConstraint&,
                                                      const typename UltraCircuitBuilder::FF);

template void check_mul_add_gate<MegaCircuitBuilder>(MegaCircuitBuilder&,
                                                     const QuadConstraint&,
                                                     const typename MegaCircuitBuilder::FF);

template void create_quad_constraint<UltraCircuitBuilder>(UltraCircuitBuilder& builder, QuadConstraint& constraint);

template void create_quad_constraint<MegaCircuitBuilder>(MegaCircuitBuilder& builder, QuadConstraint& constraint);

template void create_big_quad_constraint<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                              BigQuadConstraint& big_constraint);

template void create_big_quad_constraint<MegaCircuitBuilder>(MegaCircuitBuilder& builder,
                                                             BigQuadConstraint& big_constraint);

} // namespace acir_format
