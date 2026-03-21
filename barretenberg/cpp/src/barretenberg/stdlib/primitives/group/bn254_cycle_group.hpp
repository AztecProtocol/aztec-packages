#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/honk/execution_trace/gate_data.hpp"

namespace bb::stdlib {

/**
 * @brief BN254 point operations in a Grumpkin circuit (GrumpkinUltraCircuitBuilder).
 *
 * @details Analogous to cycle_group which provides Grumpkin point operations in a BN254 circuit.
 * Here, BN254 coordinates live in bn254::fq which equals grumpkin::fr — the native field of a Grumpkin circuit.
 * The elliptic relation's get_curve_b() dispatches to BN254's b=3 when FF::modulus == fq::modulus,
 * so create_ecc_add_gate / create_ecc_dbl_gate enforce BN254 curve equations natively.
 *
 * Unlike cycle_group, this class works directly with builder witness indices rather than stdlib field_t,
 * because the stdlib field_t/witness_t primitives are hardcoded to bb::fr and don't support
 * GrumpkinUltraCircuitBuilder (where FF = bb::fq).
 *
 * Scalars for scalar_mul are BN254::Fr values (~254 bits). In a Grumpkin circuit these are non-native,
 * so we bit-decompose them (254 boolean constraints) then do double-and-add with native point operations.
 *
 * @tparam Builder Expected to be GrumpkinUltraCircuitBuilder (FF = grumpkin::fr = bn254::fq)
 */
template <typename Builder> class bn254_cycle_group {
  public:
    using FF = typename Builder::FF; // = grumpkin::fr = bn254::fq (native in Grumpkin circuit)

    // The curve whose points we operate on
    using NativeGroup = bb::g1;
    using AffineElement = bb::g1::affine_element;
    using Element = bb::g1::element;

    // BN254 scalar field (non-native in Grumpkin circuit)
    using ScalarField = bb::fr;
    static constexpr size_t SCALAR_NUM_BITS = 254;

    bn254_cycle_group() = default;

    /**
     * @brief Construct from witness indices (already added to builder)
     */
    bn254_cycle_group(Builder* ctx, uint32_t x_idx, uint32_t y_idx, bool is_infinity)
        : context(ctx)
        , x_witness_index(x_idx)
        , y_witness_index(y_idx)
        , _is_infinity(is_infinity)
    {}

    /**
     * @brief Create a witness from a native AffineElement
     * @details Adds the coordinates as witnesses and constrains the point to be on the BN254 curve.
     */
    static bn254_cycle_group from_witness(Builder* ctx, const AffineElement& p)
    {
        FF x_val = p.is_point_at_infinity() ? FF::zero() : p.x;
        FF y_val = p.is_point_at_infinity() ? FF::zero() : p.y;

        uint32_t x_idx = ctx->add_variable(x_val);
        uint32_t y_idx = ctx->add_variable(y_val);

        bn254_cycle_group result(ctx, x_idx, y_idx, p.is_point_at_infinity());
        if (!p.is_point_at_infinity()) {
            result.validate_on_curve();
        }
        return result;
    }

    /**
     * @brief Create a constant-witness (constrained to equal a known value)
     */
    static bn254_cycle_group from_constant_witness(Builder* ctx, const AffineElement& p)
    {
        FF x_val = p.is_point_at_infinity() ? FF::zero() : p.x;
        FF y_val = p.is_point_at_infinity() ? FF::zero() : p.y;

        uint32_t x_idx = ctx->add_variable(x_val);
        uint32_t y_idx = ctx->add_variable(y_val);

        // Constrain witness values to equal the known constants
        ctx->assert_equal_constant(x_idx, x_val);
        ctx->assert_equal_constant(y_idx, y_val);

        return bn254_cycle_group(ctx, x_idx, y_idx, p.is_point_at_infinity());
    }

    /**
     * @brief Validate that the point lies on BN254: y^2 = x^3 + 3
     * @details Uses arithmetic gates to enforce y^2 - x^3 - 3 = 0
     */
    void validate_on_curve() const
    {
        if (_is_infinity) {
            return;
        }
        // Create witnesses for intermediate values
        FF x_val = context->get_variable(x_witness_index);
        FF y_val = context->get_variable(y_witness_index);

        FF x_sqr = x_val * x_val;
        FF x_cube = x_sqr * x_val;
        FF y_sqr = y_val * y_val;

        // Constrain: x_sqr = x * x
        // mul_quad: a*b*mul_scaling + a*a_scaling + b*b_scaling + c*c_scaling + d*d_scaling + const_scaling = 0
        uint32_t x_sqr_idx = context->add_variable(x_sqr);
        context->create_big_mul_add_gate({ .a = x_witness_index, .b = x_witness_index,
                                           .c = x_sqr_idx,       .d = context->zero_idx(),
                                           .mul_scaling = FF(1),  .a_scaling = FF(0),
                                           .b_scaling = FF(0),    .c_scaling = FF(-1),
                                           .d_scaling = FF(0),    .const_scaling = FF(0) });

        // Constrain: y_sqr = y * y
        uint32_t y_sqr_idx = context->add_variable(y_sqr);
        context->create_big_mul_add_gate({ .a = y_witness_index, .b = y_witness_index,
                                           .c = y_sqr_idx,       .d = context->zero_idx(),
                                           .mul_scaling = FF(1),  .a_scaling = FF(0),
                                           .b_scaling = FF(0),    .c_scaling = FF(-1),
                                           .d_scaling = FF(0),    .const_scaling = FF(0) });

        // Constrain: x_cube = x_sqr * x
        uint32_t x_cube_idx = context->add_variable(x_cube);
        context->create_big_mul_add_gate({ .a = x_sqr_idx,       .b = x_witness_index,
                                           .c = x_cube_idx,      .d = context->zero_idx(),
                                           .mul_scaling = FF(1),  .a_scaling = FF(0),
                                           .b_scaling = FF(0),    .c_scaling = FF(-1),
                                           .d_scaling = FF(0),    .const_scaling = FF(0) });

        // Constrain: y_sqr = x_cube + 3 (i.e., y_sqr - x_cube - 3 = 0)
        constexpr FF curve_b = NativeGroup::curve_b; // = 3
        context->create_big_add_gate({ y_sqr_idx, x_cube_idx, context->zero_idx(), context->zero_idx(),
                                       FF(1),     FF(-1),      FF(0),              FF(0),             -curve_b });
    }

    /**
     * @brief Incomplete addition: P1 + P2 (assumes x1 != x2 and neither is infinity)
     */
    bn254_cycle_group unconditional_add(const bn254_cycle_group& other) const
    {
        BB_ASSERT(context != nullptr);
        auto p1 = get_value();
        auto p2 = other.get_value();
        auto p3 = AffineElement(Element(p1) + Element(p2));

        uint32_t x3_idx = context->add_variable(p3.x);
        uint32_t y3_idx = context->add_variable(p3.y);

        context->create_ecc_add_gate(ecc_add_gate_{
            .x1 = x_witness_index,
            .y1 = y_witness_index,
            .x2 = other.x_witness_index,
            .y2 = other.y_witness_index,
            .x3 = x3_idx,
            .y3 = y3_idx,
            .is_addition = true,
        });

        return bn254_cycle_group(context, x3_idx, y3_idx, false);
    }

    /**
     * @brief Incomplete subtraction: P1 - P2
     */
    bn254_cycle_group unconditional_subtract(const bn254_cycle_group& other) const
    {
        BB_ASSERT(context != nullptr);
        auto p1 = get_value();
        auto p2 = other.get_value();
        auto p3 = AffineElement(Element(p1) - Element(p2));

        uint32_t x3_idx = context->add_variable(p3.x);
        uint32_t y3_idx = context->add_variable(p3.y);

        context->create_ecc_add_gate(ecc_add_gate_{
            .x1 = x_witness_index,
            .y1 = y_witness_index,
            .x2 = other.x_witness_index,
            .y2 = other.y_witness_index,
            .x3 = x3_idx,
            .y3 = y3_idx,
            .is_addition = false,
        });

        return bn254_cycle_group(context, x3_idx, y3_idx, false);
    }

    /**
     * @brief Point doubling: 2 * P
     */
    bn254_cycle_group dbl() const
    {
        BB_ASSERT(context != nullptr);
        auto p1 = get_value();
        auto p3 = AffineElement(Element(p1).dbl());

        uint32_t x3_idx = context->add_variable(p3.x);
        uint32_t y3_idx = context->add_variable(p3.y);

        context->create_ecc_dbl_gate(ecc_dbl_gate_<FF>{
            .x1 = x_witness_index,
            .y1 = y_witness_index,
            .x3 = x3_idx,
            .y3 = y3_idx,
        });

        return bn254_cycle_group(context, x3_idx, y3_idx, false);
    }

    /**
     * @brief Negate: return -P = (x, -y)
     */
    bn254_cycle_group operator-() const
    {
        BB_ASSERT(context != nullptr);
        FF neg_y = -(context->get_variable(y_witness_index));
        uint32_t neg_y_idx = context->add_variable(neg_y);
        // Constrain: y + neg_y = 0
        context->create_big_add_gate(
            { y_witness_index, neg_y_idx, context->zero_idx(), context->zero_idx(), FF(1), FF(1), FF(0), FF(0), FF(0) });
        return bn254_cycle_group(context, x_witness_index, neg_y_idx, _is_infinity);
    }

    /**
     * @brief Conditional select: if predicate_val, return lhs witness values, else return rhs witness values
     * @details Uses arithmetic gates for conditional assignment on each coordinate.
     * @param predicate_idx Witness index of a boolean (0 or 1)
     * @param predicate_val Native boolean value of the predicate
     */
    static bn254_cycle_group conditional_assign(Builder* ctx,
                                                uint32_t predicate_idx,
                                                bool predicate_val,
                                                const bn254_cycle_group& lhs,
                                                const bn254_cycle_group& rhs)
    {
        // result = rhs + predicate * (lhs - rhs)
        // For x: x_result = x_rhs + predicate * (x_lhs - x_rhs)
        FF x_lhs = ctx->get_variable(lhs.x_witness_index);
        FF x_rhs = ctx->get_variable(rhs.x_witness_index);
        FF y_lhs = ctx->get_variable(lhs.y_witness_index);
        FF y_rhs = ctx->get_variable(rhs.y_witness_index);

        FF x_result = predicate_val ? x_lhs : x_rhs;
        FF y_result = predicate_val ? y_lhs : y_rhs;
        bool inf_result = predicate_val ? lhs._is_infinity : rhs._is_infinity;

        uint32_t x_result_idx = ctx->add_variable(x_result);
        uint32_t y_result_idx = ctx->add_variable(y_result);

        // Constrain: predicate * (x_lhs - x_rhs) = x_result - x_rhs
        // i.e., predicate * x_lhs - predicate * x_rhs - x_result + x_rhs = 0
        // Using big_mul_gate: predicate * x_lhs + 0 - x_result + x_rhs = 0
        // Actually: predicate * x_lhs + (1 - predicate) * x_rhs - x_result = 0
        // Which is: predicate * (x_lhs - x_rhs) + x_rhs - x_result = 0

        // Create witness for (x_lhs - x_rhs)
        FF x_diff = x_lhs - x_rhs;
        uint32_t x_diff_idx = ctx->add_variable(x_diff);
        // Constrain: x_lhs - x_rhs - x_diff = 0
        ctx->create_big_add_gate({ lhs.x_witness_index, rhs.x_witness_index, x_diff_idx, ctx->zero_idx(),
                                   FF(1),               FF(-1),               FF(-1),      FF(0),         FF(0) });
        // Constrain: predicate * x_diff + x_rhs - x_result = 0
        // mul_quad: a*b*mul_scaling + a*a_scaling + b*b_scaling + c*c_scaling + d*d_scaling + const = 0
        // With a=predicate, b=x_diff, c=x_rhs, d=x_result:
        //   predicate*x_diff*1 + c*1 + d*(-1) = 0
        ctx->create_big_mul_add_gate({ .a = predicate_idx, .b = x_diff_idx,
                                       .c = rhs.x_witness_index, .d = x_result_idx,
                                       .mul_scaling = FF(1), .a_scaling = FF(0),
                                       .b_scaling = FF(0), .c_scaling = FF(1),
                                       .d_scaling = FF(-1), .const_scaling = FF(0) });

        // Same for y
        FF y_diff = y_lhs - y_rhs;
        uint32_t y_diff_idx = ctx->add_variable(y_diff);
        ctx->create_big_add_gate({ lhs.y_witness_index, rhs.y_witness_index, y_diff_idx, ctx->zero_idx(),
                                   FF(1),               FF(-1),               FF(-1),      FF(0),         FF(0) });
        ctx->create_big_mul_add_gate({ .a = predicate_idx, .b = y_diff_idx,
                                       .c = rhs.y_witness_index, .d = y_result_idx,
                                       .mul_scaling = FF(1), .a_scaling = FF(0),
                                       .b_scaling = FF(0), .c_scaling = FF(1),
                                       .d_scaling = FF(-1), .const_scaling = FF(0) });

        return bn254_cycle_group(ctx, x_result_idx, y_result_idx, inf_result);
    }

    /**
     * @brief Scalar multiplication via double-and-add with bit decomposition
     * @details The scalar is a BN254::Fr value (non-native). We decompose it into 254 bits
     * (as boolean witnesses) and perform double-and-add.
     *
     * Uses an offset point to avoid point-at-infinity edge cases:
     * acc = offset
     * for i = MSB down to 0:
     *   acc = 2 * acc
     *   if bit_i: acc = acc + P
     * result = acc - offset * 2^254
     *
     * @param scalar_native The native BN254::Fr scalar value
     * @return bn254_cycle_group The result P * s
     */
    bn254_cycle_group scalar_mul(const ScalarField& scalar_native) const
    {
        BB_ASSERT(context != nullptr);

        uint256_t scalar_uint(scalar_native);

        // Bit-decompose the scalar into 254 bool witnesses
        std::vector<uint32_t> bit_indices(SCALAR_NUM_BITS);
        for (size_t i = 0; i < SCALAR_NUM_BITS; i++) {
            FF bit_val = scalar_uint.get_bit(i) ? FF::one() : FF::zero();
            bit_indices[i] = context->add_variable(bit_val);
            // Constrain to boolean: bit * (1 - bit) = 0
            // i.e., bit * bit - bit = 0
            context->create_big_mul_add_gate({ .a = bit_indices[i], .b = bit_indices[i],
                                               .c = context->zero_idx(), .d = context->zero_idx(),
                                               .mul_scaling = FF(1), .a_scaling = FF(-1),
                                               .b_scaling = FF(0), .c_scaling = FF(0),
                                               .d_scaling = FF(0), .const_scaling = FF(0) });
        }

        // Constrain the bit decomposition: sum(bits[i] * 2^i) = scalar
        // Since BN254::Fr < BN254::Fq (circuit field), no overflow possible.
        // We accumulate in chunks to avoid having too many terms per gate.
        {
            FF running_sum = FF::zero();
            FF power_of_two = FF::one();
            for (size_t i = 0; i < SCALAR_NUM_BITS; i++) {
                FF bit_val = scalar_uint.get_bit(i) ? FF::one() : FF::zero();
                running_sum += bit_val * power_of_two;
                power_of_two += power_of_two; // power_of_two *= 2
            }
            // Now constrain the sum via sequential addition gates
            // Use a running accumulator witness
            uint32_t acc_idx = context->zero_idx();
            power_of_two = FF::one();
            for (size_t i = 0; i < SCALAR_NUM_BITS; i++) {
                FF old_acc = context->get_variable(acc_idx);
                FF bit_val = context->get_variable(bit_indices[i]);
                FF new_acc = old_acc + bit_val * power_of_two;
                uint32_t new_acc_idx = context->add_variable(new_acc);

                // Constrain: new_acc = old_acc + bit * power_of_two
                // i.e., new_acc - old_acc - bit * power_of_two = 0
                context->create_big_add_gate(
                    { new_acc_idx, acc_idx, bit_indices[i], context->zero_idx(),
                      FF(1),       FF(-1),  -power_of_two,  FF(0),             FF(0) });

                acc_idx = new_acc_idx;
                power_of_two += power_of_two;
            }
            // Final accumulator should equal the scalar value
            FF expected = FF(scalar_uint);
            context->assert_equal_constant(acc_idx, expected);
        }

        // Handle zero scalar
        if (scalar_uint == 0) {
            return from_witness(context, AffineElement::infinity());
        }

        // Use offset-based double-and-add to avoid infinity edge cases
        auto offset_generator = NativeGroup::one;

        // Compute offset * 2^254 natively
        Element offset_scaled = offset_generator;
        for (size_t i = 0; i < SCALAR_NUM_BITS; i++) {
            offset_scaled = offset_scaled.dbl();
        }
        auto offset_scaled_affine = AffineElement(offset_scaled);

        // Initialize accumulator with the offset generator
        auto acc = from_constant_witness(context, AffineElement(offset_generator));

        // Double-and-add loop from MSB to LSB
        for (int i = static_cast<int>(SCALAR_NUM_BITS) - 1; i >= 0; i--) {
            acc = acc.dbl();
            auto acc_plus_p = acc.unconditional_add(*this);
            acc = conditional_assign(
                context, bit_indices[static_cast<size_t>(i)], scalar_uint.get_bit(static_cast<size_t>(i)), acc_plus_p,
                acc);
        }

        // Subtract the scaled offset: result = acc - offset * 2^254
        auto offset_point = from_constant_witness(context, offset_scaled_affine);
        acc = acc.unconditional_subtract(offset_point);

        return acc;
    }

    /**
     * @brief Batch scalar multiplication: compute sum(scalars[i] * points[i])
     * @details Simple sequential implementation: compute each scalar_mul and accumulate.
     */
    static bn254_cycle_group batch_mul(const std::vector<bn254_cycle_group>& points,
                                       const std::vector<ScalarField>& scalars)
    {
        BB_ASSERT(points.size() == scalars.size());
        BB_ASSERT(!points.empty());

        auto result = points[0].scalar_mul(scalars[0]);
        for (size_t i = 1; i < points.size(); i++) {
            auto term = points[i].scalar_mul(scalars[i]);
            result = result.unconditional_add(term);
        }
        return result;
    }

    AffineElement get_value() const
    {
        if (_is_infinity) {
            return AffineElement::infinity();
        }
        FF x_val = context->get_variable(x_witness_index);
        FF y_val = context->get_variable(y_witness_index);
        return AffineElement(x_val, y_val);
    }

    Builder* get_context() const { return context; }

    uint32_t get_x_witness_index() const { return x_witness_index; }
    uint32_t get_y_witness_index() const { return y_witness_index; }
    bool is_point_at_infinity() const { return _is_infinity; }

    /**
     * @brief Set the witness indices for coordinates to public inputs
     * @return uint32_t Start index into public inputs array
     */
    uint32_t set_public()
    {
        uint32_t start_idx = context->set_public_input(x_witness_index);
        context->set_public_input(y_witness_index);
        return start_idx;
    }

  private:
    Builder* context = nullptr;
    uint32_t x_witness_index = 0;
    uint32_t y_witness_index = 0;
    bool _is_infinity = true;
};

} // namespace bb::stdlib
