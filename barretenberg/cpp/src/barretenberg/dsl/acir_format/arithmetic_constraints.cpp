// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Federico], commit: 2094fd1467dd9a94803b2c5007cf60ac357aa7d2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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

template <typename Builder>
void check_bilinear_batched_eq_gate(Builder& builder,
                                    const bilinear_batched_eq_gate_<typename Builder::FF>& bilinear_batched_eq)
{
    using FF = typename Builder::FF;
    auto value_from_witness = [&](uint32_t w) { return builder.get_variable(w); };

    FF half_1;
    FF half_2;
    if (bilinear_batched_eq.mode == BilinearBatchedEqMode::Bilinear) {
        half_1 = bilinear_batched_eq.q_m * value_from_witness(bilinear_batched_eq.a) *
                     value_from_witness(bilinear_batched_eq.b) +
                 bilinear_batched_eq.q_5 * value_from_witness(bilinear_batched_eq.a) *
                     value_from_witness(bilinear_batched_eq.c) +
                 bilinear_batched_eq.q_l * value_from_witness(bilinear_batched_eq.a) +
                 bilinear_batched_eq.q_r * value_from_witness(bilinear_batched_eq.b) +
                 bilinear_batched_eq.q_o * value_from_witness(bilinear_batched_eq.c) +
                 bilinear_batched_eq.q_4 * value_from_witness(bilinear_batched_eq.d) + bilinear_batched_eq.q_c;
        half_2 = FF::zero();
    } else {
        half_1 = bilinear_batched_eq.q_l * value_from_witness(bilinear_batched_eq.a) +
                 bilinear_batched_eq.q_r * value_from_witness(bilinear_batched_eq.b) + bilinear_batched_eq.q_c;
        half_2 = bilinear_batched_eq.q_o * value_from_witness(bilinear_batched_eq.c) +
                 bilinear_batched_eq.q_4 * value_from_witness(bilinear_batched_eq.d) + bilinear_batched_eq.q_m;
    }

    if ((half_1 != FF::zero() || half_2 != FF::zero()) && !builder.failed() && !builder.is_write_vk_mode()) {
        builder.failure("bilinear_batched_eq_gate");
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

template <typename Builder> void create_bilinear_constraint(Builder& builder, const BilinearConstraint& constraint)
{
    using FF = typename Builder::FF;
    // The two products fill wires a, b, c with real witnesses. Wire d carries only a linear term and may
    // be the IS_CONSTANT sentinel; substitute the builder's zero index so the row references a real slot.
    BB_ASSERT(constraint.a != bb::stdlib::IS_CONSTANT && constraint.b != bb::stdlib::IS_CONSTANT &&
                  constraint.c != bb::stdlib::IS_CONSTANT,
              "create_bilinear_constraint: the product wires a, b, c must be real witnesses.");
    uint32_t d = constraint.d == bb::stdlib::IS_CONSTANT ? builder.zero_idx() : constraint.d;

    bilinear_batched_eq_gate_<FF> gate{
        .mode = BilinearBatchedEqMode::Bilinear,
        .a = constraint.a,
        .b = constraint.b,
        .c = constraint.c,
        .d = d,
        .q_l = constraint.q_l,
        .q_r = constraint.q_r,
        .q_o = constraint.q_o,
        .q_4 = constraint.q_4,
        .q_c = constraint.q_c,
        .q_m = constraint.q_m,
        .q_5 = constraint.q_5,
    };
    check_bilinear_batched_eq_gate(builder, gate);
    builder.create_bilinear_batched_eq_gate(gate);
}

template <typename Builder>
void create_batched_eq_check_constraint(Builder& builder, const BatchedEqCheckConstraint& constraint)
{
    using FF = typename Builder::FF;
    // A BATCHED_EQ row may leave wires as the IS_CONSTANT sentinel. Substitute the builder's zero index so each row
    // references a real witness slot. Wire `a` is always a real witness.
    BatchedEqCheckConstraint resolved = constraint;
    BB_ASSERT(resolved.a != bb::stdlib::IS_CONSTANT,
              "create_batched_eq_check_constraint: wire `a` must always be a real witness index.");
    if (resolved.b == bb::stdlib::IS_CONSTANT) {
        resolved.b = builder.zero_idx();
    }
    if (resolved.c == bb::stdlib::IS_CONSTANT) {
        resolved.c = builder.zero_idx();
    }
    if (resolved.d == bb::stdlib::IS_CONSTANT) {
        resolved.d = builder.zero_idx();
    }

    bilinear_batched_eq_gate_<FF> gate{
        .mode = BilinearBatchedEqMode::BatchedEq,
        .a = resolved.a,
        .b = resolved.b,
        .c = resolved.c,
        .d = resolved.d,
        .q_l = resolved.q_l,
        .q_r = resolved.q_r,
        .q_o = resolved.q_o,
        .q_4 = resolved.q_4,
        .q_c = resolved.q_c,
        .q_m = resolved.q_m,
        .q_5 = FF::zero(),
    };
    check_bilinear_batched_eq_gate(builder, gate);
    builder.create_bilinear_batched_eq_gate(gate);
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

template void create_bilinear_constraint<UltraCircuitBuilder>(UltraCircuitBuilder&, const BilinearConstraint&);
template void create_bilinear_constraint<MegaCircuitBuilder>(MegaCircuitBuilder&, const BilinearConstraint&);
template void create_batched_eq_check_constraint<UltraCircuitBuilder>(UltraCircuitBuilder&,
                                                                      const BatchedEqCheckConstraint&);
template void create_batched_eq_check_constraint<MegaCircuitBuilder>(MegaCircuitBuilder&,
                                                                     const BatchedEqCheckConstraint&);

} // namespace acir_format
