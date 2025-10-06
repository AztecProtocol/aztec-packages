// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "field.hpp"
#include "../bool/bool.hpp"
#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <functional>

using namespace bb;

namespace bb::stdlib {

template <typename Builder>
field_t<Builder>::field_t(Builder* parent_context)
    : context(parent_context)
    , additive_constant(bb::fr::zero())
    , multiplicative_constant(bb::fr::one())
    , witness_index(IS_CONSTANT)
{}

template <typename Builder>
field_t<Builder>::field_t(const witness_t<Builder>& value)
    : context(value.context)
    , additive_constant(bb::fr::zero())
    , multiplicative_constant(bb::fr::one())
    , witness_index(value.witness_index)
{
    set_free_witness_tag();
}

template <typename Builder>
field_t<Builder>::field_t(Builder* parent_context, const bb::fr& value)
    : context(parent_context)
    , additive_constant(value)
    , multiplicative_constant(bb::fr::one())
    , witness_index(IS_CONSTANT)
{}

template <typename Builder>
field_t<Builder>::field_t(const bool_t<Builder>& other)
    : context(other.context)
{
    if (other.is_constant()) {
        additive_constant = other.get_value();
        multiplicative_constant = bb::fr::one();
        witness_index = IS_CONSTANT;
    } else {
        witness_index = other.witness_index;
        additive_constant = other.witness_inverted ? bb::fr::one() : bb::fr::zero();
        multiplicative_constant = other.witness_inverted ? bb::fr::neg_one() : bb::fr::one();
    }
    tag = other.tag;
}

template <typename Builder>
field_t<Builder> field_t<Builder>::from_witness_index(Builder* ctx, const uint32_t witness_index)
{
    field_t<Builder> result(ctx);
    result.witness_index = witness_index;
    return result;
}

/**
 * @brief Convert `field_t` element to `bool_t` and enforce bool constraints.
 *
 * @tparam Builder
 * @return bool_t<Builder>
 */
template <typename Builder> field_t<Builder>::operator bool_t<Builder>() const
{
    // If `this` is a constant field_t element, the resulting bool is also constant.
    // In this case, `additive_constant` uniquely determines the value of `this`.
    // After ensuring that `additive_constant` \in {0, 1}, we set the `.witness_bool` field of `result` to match the
    // value of `additive_constant`.
    if (is_constant()) {
        ASSERT(additive_constant == bb::fr::one() || additive_constant == bb::fr::zero());
        bool_t<Builder> result(context);
        result.witness_bool = (additive_constant == bb::fr::one());
        result.set_origin_tag(tag);
        return result;
    }

    const bool add_constant_check = (additive_constant == bb::fr::zero());
    const bool mul_constant_check = (multiplicative_constant == bb::fr::one());
    const bool inverted_check = (additive_constant == bb::fr::one()) && (multiplicative_constant == bb::fr::neg_one());
    bool result_inverted = false;
    // Process the elements of the form
    //      a = a.v * 1 + 0 and a = a.v * (-1) + 1
    // They do not need to be normalized if `a.v` is constrained to be boolean. In the first case, we have
    //      a == a.v,
    // and in the second case
    //      a == ¬(a.v).
    // The distinction between the cases is tracked by the .witness_inverted field of bool_t.
    uint32_t witness_idx = witness_index;
    if ((add_constant_check && mul_constant_check) || inverted_check) {
        result_inverted = inverted_check;
    } else {
        // In general, the witness has to be normalized.
        witness_idx = get_normalized_witness_index();
    }
    // Get the normalized value of the witness
    bb::fr witness = context->get_variable(witness_idx);
    BB_ASSERT_EQ((witness == bb::fr::zero()) || (witness == bb::fr::one()),
                 true,
                 "Attempting to create a bool_t from a witness_t not satisfying x^2 - x = 0");
    bool_t result(context, witness == bb::fr::one());
    result.witness_inverted = result_inverted;
    result.witness_index = witness_idx;
    context->create_bool_gate(witness_idx);
    result.set_origin_tag(tag);
    return result;
}

/**
 * @brief Field addition operator.
 * @details Optimized to not create extra gates when at least one of the summands is constant.
 */
template <typename Builder> field_t<Builder> field_t<Builder>::operator+(const field_t& other) const
{
    Builder* ctx = validate_context(other.context, context);
    field_t<Builder> result(ctx);
    // Ensure that non-constant circuit elements can not be added without context
    ASSERT(ctx || (is_constant() && other.is_constant()));

    if (witness_index == other.witness_index && !is_constant()) {
        // If summands represent the same circuit variable, i.e. their witness indices coincide, we just need to update
        // the scaling factors of this variable.
        result.additive_constant = additive_constant + other.additive_constant;
        result.multiplicative_constant = multiplicative_constant + other.multiplicative_constant;
        result.witness_index = witness_index;
    } else if (is_constant() && other.is_constant()) {
        // both inputs are constant - don't add a gate
        result.additive_constant = additive_constant + other.additive_constant;
    } else if (!is_constant() && other.is_constant()) {
        // one input is constant - don't add a gate, but update scaling factors
        result.additive_constant = additive_constant + other.additive_constant;
        result.multiplicative_constant = multiplicative_constant;
        result.witness_index = witness_index;
    } else if (is_constant() && !other.is_constant()) {
        result.additive_constant = additive_constant + other.additive_constant;
        result.multiplicative_constant = other.multiplicative_constant;
        result.witness_index = other.witness_index;
    } else {
        // The summands are distinct circuit variables, the result needs to be constrained.
        //       a + b = a.v * a.mul + b.v * b.mul + (a.add + b.add)
        // which leads to the constraint
        //       a.v * q_l + b.v * q_r + result.v * q_o + q_c = 0,
        // where q_l, q_r, q_0, and q_c are the selectors storing corresponding scaling factors.
        bb::fr left = ctx->get_variable(witness_index);        // =: a.v
        bb::fr right = ctx->get_variable(other.witness_index); // =: b.v
        bb::fr result_value = left * multiplicative_constant;
        result_value += right * other.multiplicative_constant;
        result_value += additive_constant;
        result_value += other.additive_constant;
        result.witness_index = ctx->add_variable(result_value);

        ctx->create_add_gate({ .a = witness_index,
                               .b = other.witness_index,
                               .c = result.witness_index,
                               .a_scaling = multiplicative_constant,
                               .b_scaling = other.multiplicative_constant,
                               .c_scaling = bb::fr::neg_one(),
                               .const_scaling = (additive_constant + other.additive_constant) });
    }
    result.tag = OriginTag(tag, other.tag);
    return result;
}
/**
 * @brief Subtraction operator deduced from the addition operator.
 */
template <typename Builder> field_t<Builder> field_t<Builder>::operator-(const field_t& other) const
{
    field_t<Builder> rhs(other);
    rhs.additive_constant.self_neg();
    if (!rhs.is_constant()) {
        // Negate the multiplicative constant of the rhs then feed to `+` operator
        rhs.multiplicative_constant.self_neg();
    }
    return operator+(rhs);
}

/**
 * @brief Field multiplication operator.
 * @details Optimized to not create extra gates when at least one of the multiplicands is constant.
 */
template <typename Builder> field_t<Builder> field_t<Builder>::operator*(const field_t& other) const
{
    Builder* ctx = validate_context(other.context, context);
    field_t<Builder> result(ctx);
    // Ensure that non-constant circuit elements can not be multiplied without context
    ASSERT(ctx || (is_constant() && other.is_constant()));

    if (is_constant() && other.is_constant()) {
        // Both inputs are constant - don't add a gate.
        // The value of a constant is tracked in `.additive_constant`.
        result.additive_constant = additive_constant * other.additive_constant;
    } else if (!is_constant() && other.is_constant()) {

        //  Here and in the next case, only one input is not constant: don't add a gate, but update scaling factors.
        // More concretely, let:
        //   a := this;
        //   b := other;
        //   a.v := ctx->variables[a.witness_index], the value of a;
        //   b.v := ctx->variables[b.witness_index], the value of b;
        //   .mul = .multiplicative_constant
        //   .add = .additive_constant
        // Value of this   = a.v * a.mul + a.add;
        // Value of other  = b.add
        // Value of result = a * b = a.v * [a.mul * b.add] + [a.add * b.add]
        //                            ^           ^result.mul      ^result.add
        //                            ^result.v

        result.additive_constant = additive_constant * other.additive_constant;
        result.multiplicative_constant = multiplicative_constant * other.additive_constant;
        // We simply updated the scaling factors of `*this`, so `witness_index` of `result` must be equal to
        // `this->witness_index`.
        result.witness_index = witness_index;
    } else if (is_constant() && !other.is_constant()) {
        // Only one input is not constant: don't add a gate, but update scaling factors
        result.additive_constant = additive_constant * other.additive_constant;
        result.multiplicative_constant = other.multiplicative_constant * additive_constant;
        // We simply updated the scaling factors of `other`, so `witness_index` of `result` must be equal to
        // `other->witness_index`.
        result.witness_index = other.witness_index;
    } else {
        /**
         * Both inputs are circuit variables: create a * b constraint.
         *
         * Value of this   = a.v * a.mul + a.add;
         * Value of other  = b.v * b.mul + b.add;
         * Value of result = a * b
         *            = [a.v * b.v] * [a.mul * b.mul] + a.v * [a.mul * b.add] + b.v * [a.add * b.mul] + [a.ac * b.add]
         *            = [a.v * b.v] * [     q_m     ] + a.v * [     q_l     ] + b.v * [     q_r     ] + [    q_c     ]
         *            ^               ^Notice the add/mul_constants are placed into selectors when a gate is created.
         *            |                Only the witnesses (pointed-to by the witness_indexes) form the wires in/out of
         *            |                the gate.
         *            ^This entire value is pushed to ctx->variables as a new witness. The
         *             implied additive & multiplicative constants of the new witness are 0 & 1 resp.
         * Left wire value: a.v
         * Right wire value: b.v
         * Output wire value: result.v (with q_o = -1)
         */

        bb::fr T0;
        bb::fr q_m;
        bb::fr q_l;
        bb::fr q_r;
        bb::fr q_c;

        // Compute selector values
        q_c = additive_constant * other.additive_constant;
        q_r = additive_constant * other.multiplicative_constant;
        q_l = multiplicative_constant * other.additive_constant;
        q_m = multiplicative_constant * other.multiplicative_constant;

        bb::fr left = context->get_variable(witness_index);        // =: a.v
        bb::fr right = context->get_variable(other.witness_index); // =: b.v
        bb::fr result_value;

        result_value = left * right;
        result_value *= q_m;
        // Scale `b.v` by the constant `a_mul * b_add`
        T0 = left * q_l;
        result_value += T0;
        // Scale `a.v` by the constant `a_add * b_mul`
        T0 = right * q_r;
        result_value += T0;
        result_value += q_c;
        result.witness_index = ctx->add_variable(result_value);
        // Constrain
        //    a.v * b.v * q_m + a.v * q_l + b_v * q_r + q_c + result.v * q_o = 0
        ctx->create_poly_gate({ .a = witness_index,
                                .b = other.witness_index,
                                .c = result.witness_index,
                                .q_m = q_m,
                                .q_l = q_l,
                                .q_r = q_r,
                                .q_o = bb::fr::neg_one(),
                                .q_c = q_c });
    }
    result.tag = OriginTag(tag, other.tag);
    return result;
}

/**
 * @brief Since in divide_no_zero_check, we check \f$ a / b = q \f$ by the constraint \f$ a = b \cdot q\f$, if \f$ a =
 * b= 0\f$, we can set \f$ q \f$ to *any value* and it will pass the constraint. Hence, when not having prior knowledge
 * of \f$ b \f$ not being zero it is essential to check.
 *
 * If \f$ b = 0 \f$ and is constant, this method aborts due to failed ASSERT( b !=0 ) condition inside
 * `assert_is_not_zero()`.
 * If \f$ b = 0 \f$ and is not constant, a `Builder` failure is set and an unsatisfiable constraint `1 = 0` is
 * created.
 *
 */
template <typename Builder> field_t<Builder> field_t<Builder>::operator/(const field_t& other) const
{
    // If the denominator is a constant 0, the division is aborted. Otherwise, it is constrained to be non-zero.
    other.assert_is_not_zero("field_t::operator/ divisor is 0");
    return divide_no_zero_check(other);
}

/**
 * @brief Given field elements `a` = `*this` and `b` = `other`, output  `a / b` without checking whether `b = 0`.
 */
template <typename Builder> field_t<Builder> field_t<Builder>::divide_no_zero_check(const field_t& other) const
{

    // Let
    //    a := this;
    //    b := other;
    //    q := a / b;
    Builder* ctx = validate_context(context, other.context);
    field_t<Builder> result(ctx);
    // Ensure that non-constant circuit elements can not be divided without context
    ASSERT(ctx || (is_constant() && other.is_constant()));

    bb::fr additive_multiplier = bb::fr::one();

    if (is_constant() && other.is_constant()) {
        // Both inputs are constant, the result is given by
        //      q = a.add / b.add, if b != 0.
        //      q = a.add        , if b == 0
        if (!(other.additive_constant == bb::fr::zero())) {
            additive_multiplier = other.additive_constant.invert();
        }
        result.additive_constant = additive_constant * additive_multiplier;
    } else if (!is_constant() && other.is_constant()) {
        // The numerator is a circuit variable, the denominator is a constant.
        // The result is obtained by updating the circuit variable `a`
        //      q = a.v * [a.mul / b.add] + a.add / b.add, if b != 0.
        //      q = a                                    , if b == 0
        // with q.witness_index = a.witness_index.
        if (!(other.additive_constant == bb::fr::zero())) {
            additive_multiplier = other.additive_constant.invert();
        }
        result.additive_constant = additive_constant * additive_multiplier;
        result.multiplicative_constant = multiplicative_constant * additive_multiplier;
        result.witness_index = witness_index;
    } else if (is_constant() && !other.is_constant()) {
        // The numerator is a constant, the denominator is a circuit variable.
        // If a == 0, the result is a constant 0, otherwise the result is a new variable that has to be constrained.
        if (get_value() == 0) {
            result.additive_constant = 0;
            result.multiplicative_constant = 1;
            result.witness_index = IS_CONSTANT;
        } else {
            bb::fr numerator = get_value();
            bb::fr denominator_inv = other.get_value();
            denominator_inv = denominator_inv.is_zero() ? 0 : denominator_inv.invert();

            bb::fr out(numerator * denominator_inv);
            result.witness_index = ctx->add_variable(out);
            // Define non-zero selector values for a `poly` gate
            // q_m := b.mul
            // q_l := b.add
            // q_c := a     (= a.add, since a is constant)
            bb::fr q_m = other.multiplicative_constant;
            bb::fr q_l = other.additive_constant;
            bb::fr q_c = -get_value();
            // The value of the quotient q = a / b has to satisfy
            //      q * (b.v * b.mul +  b.add) = a
            // Create a `poly` gate to constrain the quotient.
            // q * b.v * q_m +  q * q_l + 0 * b + 0 * c + q_c = 0
            ctx->create_poly_gate({ .a = result.witness_index,
                                    .b = other.witness_index,
                                    .c = result.witness_index,
                                    .q_m = q_m,
                                    .q_l = q_l,
                                    .q_r = 0,
                                    .q_o = 0,
                                    .q_c = q_c });
        }
    } else {
        // Both numerator and denominator are circuit variables. Create a new circuit variable with the value a / b.
        bb::fr numerator = get_value();
        bb::fr denominator_inv = other.get_value();
        denominator_inv = denominator_inv.is_zero() ? 0 : denominator_inv.invert();

        bb::fr out(numerator * denominator_inv);
        result.witness_index = ctx->add_variable(out);

        // The value of the quotient q = a / b has to satisfy
        //      q * (b.v * b.mul +  b.add) = a.v * a.mul + a.add
        // Create a `poly` gate to constrain the quotient
        //  	q * b.v * q_m +  q * q_l + 0 * c + a.v * q_o + q_c = 0,
        // where the `poly_gate` selector values are defined as follows:
        //  	q_m = b.mul;
        //      q_l = b.add;
        //      q_r = 0;
        //      q_o = - a.mul;
        //      q_c = - a.add.
        bb::fr q_m = other.multiplicative_constant;
        bb::fr q_l = other.additive_constant;
        bb::fr q_r = bb::fr::zero();
        bb::fr q_o = -multiplicative_constant;
        bb::fr q_c = -additive_constant;

        ctx->create_poly_gate({ .a = result.witness_index,
                                .b = other.witness_index,
                                .c = witness_index,
                                .q_m = q_m,
                                .q_l = q_l,
                                .q_r = q_r,
                                .q_o = q_o,
                                .q_c = q_c });
    }
    result.tag = OriginTag(tag, other.tag);
    return result;
}

/**
 * @brief Raise this field element to the power of the provided uint32_t exponent.
 *
 */
template <typename Builder> field_t<Builder> field_t<Builder>::pow(const uint32_t& exponent) const
{
    if (is_constant()) {
        return field_t(get_value().pow(exponent));
    }
    if (exponent == 0) {
        return field_t(bb::fr::one());
    }

    bool accumulator_initialized = false;
    field_t<Builder> accumulator;
    field_t<Builder> running_power = *this;
    auto shifted_exponent = exponent;

    // Square and multiply, there's no need to constrain the exponent bit decomposition, as it is an integer constant.
    while (shifted_exponent != 0) {
        if (shifted_exponent & 1) {
            if (!accumulator_initialized) {
                accumulator = running_power;
                accumulator_initialized = true;
            } else {
                accumulator *= running_power;
            }
        }
        if (shifted_exponent >= 2) {
            // Don't update `running_power` if `shifted_exponent` = 1, as it won't be used anywhere.
            running_power = running_power.sqr();
        }
        shifted_exponent >>= 1;
    }
    return accumulator;
}

/**
 * @brief Raise a field_t to a power of an exponent (field_t). Note that the exponent must not exceed 32 bits and is
 * implicitly range constrained.
 */
template <typename Builder> field_t<Builder> field_t<Builder>::pow(const field_t& exponent) const
{
    uint256_t exponent_value = exponent.get_value();
    BB_ASSERT_LT(exponent_value.get_msb(), 32U);

    if (is_constant() && exponent.is_constant()) {
        return field_t(get_value().pow(exponent_value));
    }
    // Use the constant version that perfoms only the necessary multiplications if the exponent is constant
    if (exponent.is_constant()) {
        return pow(static_cast<uint32_t>(exponent_value));
    }

    auto* ctx = validate_context(context, exponent.context);

    std::array<bool_t<Builder>, 32> exponent_bits;
    // Collect individual bits as bool_t's
    for (size_t i = 0; i < exponent_bits.size(); ++i) {
        uint256_t value_bit = exponent_value & 1;
        bool_t<Builder> bit;
        bit = bool_t<Builder>(witness_t<Builder>(ctx, value_bit.data[0]));
        bit.set_origin_tag(exponent.tag);
        exponent_bits[31 - i] = bit;
        exponent_value >>= 1;
    }

    field_t<Builder> exponent_accumulator(bb::fr::zero());
    for (const auto& bit : exponent_bits) {
        exponent_accumulator += exponent_accumulator;
        exponent_accumulator += bit;
    }
    // Constrain the sum of bool_t bits to be equal to the original exponent value.
    exponent.assert_equal(exponent_accumulator, "field_t::pow exponent accumulator incorrect");

    // Compute the result of exponentiation
    field_t accumulator(ctx, bb::fr::one());
    const field_t one(bb::fr::one());
    for (size_t i = 0; i < 32; ++i) {
        accumulator *= accumulator;
        // If current bit == 1, multiply by the base, else propagate the accumulator
        const field_t multiplier = conditional_assign(exponent_bits[i], *this, one);
        accumulator *= multiplier;
    }
    accumulator = accumulator.normalize();
    accumulator.tag = OriginTag(tag, exponent.tag);
    return accumulator;
}

/**
 * @returns Efficiently compute `this * to_mul + to_add` using custom `big_mul` gate.
 */
template <typename Builder> field_t<Builder> field_t<Builder>::madd(const field_t& to_mul, const field_t& to_add) const
{
    Builder* ctx = validate_context<Builder>(context, to_mul.context, to_add.context);

    const bool mul_by_const = is_constant() || to_mul.is_constant();

    if (mul_by_const) {
        // If at least one of the multiplicands is constant, `madd` is efficiently handled by `*` and `+`
        // operators.
        return ((*this) * to_mul + to_add);
    }

    // Let:
    //    a = this;
    //    b = to_mul;
    //    c = to_add;
    //    a.v = ctx->variables[this.witness_index];
    //    b.v = ctx->variables[to_mul.witness_index];
    //    c.v = ctx->variables[to_add.witness_index];
    //    .mul = .multiplicative_constant;
    //    .add = .additive_constant.
    //
    // result = a * b + c
    //   = (a.v * a.mul + a.add) * (b.v * b.mul + b.add) + (c.v * c.mul + c.add)
    //   = a.v * b.v * [a.mul * b.mul] + a.v * [a.mul * b.add] + b.v * [b.mul + a.add] + c.v * [c.mul]
    //      +  [a.add * b.add + c.add]
    //   = a.v * b.v * [ mul_scaling ] + a.v * [  a_scaling  ] + b.v * [  b_scaling  ] + c.v * [ c_scaling ]
    //      +    [ const_scaling ]

    bb::fr mul_scaling = multiplicative_constant * to_mul.multiplicative_constant;
    bb::fr a_scaling = multiplicative_constant * to_mul.additive_constant;
    bb::fr b_scaling = to_mul.multiplicative_constant * additive_constant;
    bb::fr c_scaling = to_add.multiplicative_constant;
    bb::fr const_scaling = additive_constant * to_mul.additive_constant + to_add.additive_constant;

    // Note: the value of a constant field_t is wholly tracked by the field_t's `additive_constant` member, which is
    // accounted for in the above-calculated selectors (`q_`'s). Therefore no witness (`variables[witness_index]`)
    // exists for constants, and so the field_t's corresponding wire value is set to `0` in the gate equation.
    bb::fr a = is_constant() ? bb::fr::zero() : ctx->get_variable(witness_index);
    bb::fr b = to_mul.is_constant() ? bb::fr::zero() : ctx->get_variable(to_mul.witness_index);
    bb::fr c = to_add.is_constant() ? bb::fr::zero() : ctx->get_variable(to_add.witness_index);

    bb::fr out = a * b * mul_scaling + a * a_scaling + b * b_scaling + c * c_scaling + const_scaling;

    field_t<Builder> result(ctx);
    result.witness_index = ctx->add_variable(out);
    ctx->create_big_mul_gate({
        .a = is_constant() ? ctx->zero_idx : witness_index,
        .b = to_mul.is_constant() ? ctx->zero_idx : to_mul.witness_index,
        .c = to_add.is_constant() ? ctx->zero_idx : to_add.witness_index,
        .d = result.witness_index,
        .mul_scaling = mul_scaling,
        .a_scaling = a_scaling,
        .b_scaling = b_scaling,
        .c_scaling = c_scaling,
        .d_scaling = bb::fr::neg_one(),
        .const_scaling = const_scaling,
    });
    result.tag = OriginTag(tag, to_mul.tag, to_add.tag);
    return result;
}

/**
 * @brief Efficiently compute (this + a + b) using `big_mul` gate.
 */
template <typename Builder> field_t<Builder> field_t<Builder>::add_two(const field_t& add_b, const field_t& add_c) const
{
    const bool has_const_summand = is_constant() || add_b.is_constant() || add_c.is_constant();

    if (has_const_summand) {
        // If at least one of the summands is constant, the summation is efficiently handled by `+` operator
        return (*this) + add_b + add_c;
    }
    Builder* ctx = validate_context<Builder>(context, add_b.context, add_c.context);

    // Let  d := a + (b+c), where
    //      a := *this;
    //      b := add_b;
    //      c := add_c;
    // define selector values by
    //      mul_scaling   :=  0
    //      a_scaling     :=  a_mul;
    //      b_scaling     :=  b_mul;
    //      c_scaling     :=  c_mul;
    //      d_scaling     :=  -1;
    //      const_scaling := a_add + b_add + c_add;
    // Create a `big_mul_gate` to constrain
    //  	a * b * mul_scaling + a * a_scaling + b * b_scaling + c * c_scaling + d * d_scaling + const_scaling = 0

    bb::fr a_scaling = multiplicative_constant;
    bb::fr b_scaling = add_b.multiplicative_constant;
    bb::fr c_scaling = add_c.multiplicative_constant;
    bb::fr const_scaling = additive_constant + add_b.additive_constant + add_c.additive_constant;

    // Compute the sum of values of all summands
    bb::fr a = is_constant() ? bb::fr::zero() : ctx->get_variable(witness_index);
    bb::fr b = add_b.is_constant() ? bb::fr::zero() : ctx->get_variable(add_b.witness_index);
    bb::fr c = add_c.is_constant() ? bb::fr::zero() : ctx->get_variable(add_c.witness_index);

    bb::fr out = a * a_scaling + b * b_scaling + c * c_scaling + const_scaling;

    field_t<Builder> result(ctx);
    result.witness_index = ctx->add_variable(out);

    // Constrain the result
    ctx->create_big_mul_gate({
        .a = is_constant() ? ctx->zero_idx : witness_index,
        .b = add_b.is_constant() ? ctx->zero_idx : add_b.witness_index,
        .c = add_c.is_constant() ? ctx->zero_idx : add_c.witness_index,
        .d = result.witness_index,
        .mul_scaling = bb::fr::zero(),
        .a_scaling = a_scaling,
        .b_scaling = b_scaling,
        .c_scaling = c_scaling,
        .d_scaling = bb::fr::neg_one(),
        .const_scaling = const_scaling,
    });
    result.tag = OriginTag(tag, add_b.tag, add_c.tag);
    return result;
}

/**
 * @brief Return a new element, where the in-circuit witness contains the actual represented value (multiplicative
 * constant is 1 and additive_constant is 0)
 *
 * @details If the element is a constant or it is already normalized, just return the element itself
 *
 */
template <typename Builder> field_t<Builder> field_t<Builder>::normalize() const
{
    if (is_normalized()) {
        return *this;
    }
    ASSERT(context);

    // Value of this = this.v * this.mul + this.add; // where this.v = context->variables[this.witness_index]
    // Normalised result = result.v * 1 + 0;         // where result.v = this.v * this.mul + this.add
    // We need a new gate to enforce that the `result` was correctly calculated from `this`.
    field_t<Builder> result(context);
    bb::fr value = context->get_variable(witness_index);

    result.witness_index = context->add_variable(value * multiplicative_constant + additive_constant);
    result.additive_constant = bb::fr::zero();
    result.multiplicative_constant = bb::fr::one();

    // The aim of a new `add` gate is to constrain
    //              this.v * this.mul + this.add == result.v
    // Let
    //     a_scaling     := this.mul;
    //     b_scaling     := 0;
    //     c_scaling     := -1;
    //     const_scaling := this.add;
    // The `add` gate enforces the relation
    //       this.v * a_scaling + result.v * c_scaling + const_scaling = 0

    context->create_add_gate({ .a = witness_index,
                               .b = context->zero_idx,
                               .c = result.witness_index,
                               .a_scaling = multiplicative_constant,
                               .b_scaling = bb::fr::zero(),
                               .c_scaling = bb::fr::neg_one(),
                               .const_scaling = additive_constant });
    result.tag = tag;
    return result;
}

/**
 * @brief Enforce a copy constraint between *this and 0 stored at zero_idx of the Builder.
 */
template <typename Builder> void field_t<Builder>::assert_is_zero(std::string const& msg) const
{

    if (is_constant()) {
        BB_ASSERT_EQ(additive_constant == bb::fr::zero(), true, msg);
        return;
    }

    if ((get_value() != bb::fr::zero()) && !context->failed()) {
        context->failure(msg);
    }
    // Aim of a new `poly` gate: constrain this.v * this.mul + this.add == 0
    // I.e.:
    // this.v * 0 * [ 0 ] + this.v * [this.mul] + 0 * [ 0 ] + 0 * [ 0 ] + [this.add] == 0
    // this.v * 0 * [q_m] + this.v * [   q_l  ] + 0 * [q_r] + 0 * [q_o] + [   q_c  ] == 0

    context->create_poly_gate({
        .a = witness_index,
        .b = context->zero_idx,
        .c = context->zero_idx,
        .q_m = bb::fr::zero(),
        .q_l = multiplicative_constant,
        .q_r = bb::fr::zero(),
        .q_o = bb::fr::zero(),
        .q_c = additive_constant,
    });
}

/**
 *  @brief Constrain *this to be non-zero by establishing that it has an inverse.
 */
template <typename Builder> void field_t<Builder>::assert_is_not_zero(std::string const& msg) const
{

    if (is_constant()) {
        BB_ASSERT_EQ(additive_constant != bb::fr::zero(), true, msg);
        return;
    }

    if ((get_value() == bb::fr::zero()) && !context->failed()) {
        context->failure(msg);
    }

    bb::fr inverse_value = (get_value() == bb::fr::zero()) ? bb::fr::zero() : get_value().invert();

    field_t<Builder> inverse(witness_t<Builder>(context, inverse_value));

    // inverse is added in the circuit for checking that field element is not zero
    // and it won't be used anymore, so it's needed to add this element in used witnesses
    if constexpr (IsUltraBuilder<Builder>) {
        context->update_used_witnesses(inverse.witness_index);
    }

    // Aim of a new `poly` gate: `this` has an inverse (hence is not zero).
    // I.e.:
    //     (this.v * this.mul + this.add) * inverse.v == 1;
    // <=> this.v * inverse.v * [this.mul] + this.v * [ 0 ] + inverse.v * [this.add] + 0 * [ 0 ] + [ -1] == 0
    // <=> this.v * inverse.v * [   q_m  ] + this.v * [q_l] + inverse.v * [   q_r  ] + 0 * [q_o] + [q_c] == 0

    // (a * mul_const + add_const) * b - 1 = 0
    context->create_poly_gate({
        .a = witness_index,             // input value
        .b = inverse.witness_index,     // inverse
        .c = context->zero_idx,         // no output
        .q_m = multiplicative_constant, // a * b * mul_const
        .q_l = bb::fr::zero(),          // a * 0
        .q_r = additive_constant,       // b * mul_const
        .q_o = bb::fr::zero(),          // c * 0
        .q_c = bb::fr::neg_one(),       // -1
    });
}

/**
 * @brief Validate whether a field_t element is zero.
 *
 * @details
 * Let     a   := (*this).normalize()
 *         is_zero := (a == 0)
 *
 * To check whether `a = 0`, we use the fact that, if `a != 0`, it has a modular inverse `I`, such that
 *  	   a * I =  1.
 *
 * We reduce the check to the following algebraic constraints
 * 1)      a * I - 1 + is_zero   = 0
 * 2)      -is_zero * I + is_zero = 0
 *
 * If the value of `is_zero` is `false`, the first equation reduces to
 *  	   a * I = 1
 * then `I` must be the modular inverse of `a`, therefore `a != 0`. This explains the first constraint.
 *
 * If `is_zero = true`, then either `a` or `I` is zero (or both). To ensure that
 *         a = 0 && I != 0
 * we use the second constraint, it validates that
 *         (is_zero.v = true) ==>  (I = 1)
 * This way, if `a * I = 0`, we know that a = 0.
 *
 * @warning  If you want to ENFORCE that a field_t object is zero, use `assert_is_zero`
 */
template <typename Builder> bool_t<Builder> field_t<Builder>::is_zero() const
{
    bb::fr native_value = get_value();
    const bool is_zero_raw = native_value.is_zero();

    if (is_constant()) {
        // Create a constant bool_t
        bool_t is_zero(context, is_zero_raw);
        is_zero.set_origin_tag(get_origin_tag());
        return is_zero;
    }

    bool_t is_zero = witness_t(context, is_zero_raw);

    // This can be done out of circuit, as `is_zero = true` implies `I = 1`.
    bb::fr inverse_native = (is_zero_raw) ? bb::fr::one() : native_value.invert();

    field_t inverse = witness_t(context, inverse_native);

    // Note that `evaluate_polynomial_identity(a, b, c, d)` checks that `a * b + c + d = 0`, so we are using it for the
    // constraints 1) and 2) above.
    // More precisely, to check that `a * I - 1 + is_zero   = 0`, it creates a `big_mul_gate` given by the equation:
    //      a.v * I.v * mul_scaling + a.v * a_scaling + I.v * b_scaling + is_zero.v * c_scaling + (-1) * d_scaling +
    //      const_scaling = 0
    // where
    //      muk_scaling := a.mul * I.mul;
    //      a_scaling := a.mul * I.add;
    //      b_scaling := I.mul * a.add;
    //      c_scaling := 1;
    //      d_scaling := 0;
    //      const_scaling := a.add * I.add + is_zero.add - 1;
    field_t::evaluate_polynomial_identity(*this, inverse, is_zero, bb::fr::neg_one());

    // To check that `-is_zero * I + is_zero = 0`, create a `big_mul_gate` given by the equation:
    //      is_zero.v * (-I).v * mul_scaling + is_zero.v * a_scaling + (-I).v * b_scaling + is_zero.v * c_scaling + 0 *
    //      d_scaling + const_scaling = 0
    // where
    //      mul_scaling := is_zero.mul * (-I).mul;
    //      a_scaling := is_zero.mul * (-I).add;
    //      b_scaling := (-I).mul * is_zero.add;
    //      c_scaling := is_zero.mul;
    //      d_scaling := 0;
    //      const_scaling := is_zero.add * (-I).add + is_zero.add;
    field_t::evaluate_polynomial_identity(is_zero, -inverse, is_zero, bb::fr::zero());
    is_zero.set_origin_tag(tag);
    return is_zero;
}
/**
 * @brief Given a := *this, compute its value given by a.v * a.mul + a.add.
 *
 * @warning The result of this operation is a **native** field element. Ensure its value is properly constrained or only
 * used for debugging purposes.
 */
template <typename Builder> bb::fr field_t<Builder>::get_value() const
{
    if (!is_constant()) {
        ASSERT(context);
        return (multiplicative_constant * context->get_variable(witness_index)) + additive_constant;
    }
    ASSERT_DEBUG(multiplicative_constant == bb::fr::one());
    // A constant field_t's value is tracked wholly by its additive_constant member.
    return additive_constant;
}

/**
 * @brief Compute a `bool_t` equal to (a == b)
 */
template <typename Builder> bool_t<Builder> field_t<Builder>::operator==(const field_t& other) const
{
    return ((*this) - other).is_zero();
}

/**
 * @brief Compute a `bool_t` equal to (a != b)
 */
template <typename Builder> bool_t<Builder> field_t<Builder>::operator!=(const field_t& other) const
{
    return !operator==(other);
}

/**
 * @brief If predicate's value == true, negate the value, else keep it unchanged.
 */
template <typename Builder>
field_t<Builder> field_t<Builder>::conditional_negate(const bool_t<Builder>& predicate) const
{
    if (predicate.is_constant()) {
        field_t result = predicate.get_value() ? -(*this) : *this;
        result.set_origin_tag(OriginTag(get_origin_tag(), predicate.get_origin_tag()));
        return result;
    }
    // Compute
    //      `predicate` * ( -2 * a ) + a.
    // If predicate's value == true, then the output is `-a`, else it's `a`
    static constexpr bb::fr minus_two(-2);
    return field_t(predicate).madd(*this * minus_two, *this);
}

/**
 * @brief If predicate == true then return lhs, else return rhs

 * @details Conditional assign x = (predicate) ? lhs : rhs can be expressed arithmetically as follows
 *      x = predciate * lhs + (1 - predicate) * rhs
 * which is equivalent to
 *      x = (lhs - rhs) * predicate + rhs = (lhs - rhs)*madd(predicate, rhs)
 * where take advantage of `madd()` to create less gates.
 *
 * @return field_t<Builder>
 */
template <typename Builder>
field_t<Builder> field_t<Builder>::conditional_assign(const bool_t<Builder>& predicate,
                                                      const field_t& lhs,
                                                      const field_t& rhs)
{
    // If the predicate is constant, the conditional assignment can be done out of circuit
    if (predicate.is_constant()) {
        auto result = field_t(predicate.get_value() ? lhs : rhs);
        result.set_origin_tag(OriginTag(predicate.get_origin_tag(), lhs.get_origin_tag(), rhs.get_origin_tag()));
        return result;
    }
    // If lhs and rhs are the same witness or constant, just return it
    if (lhs.get_witness_index() == rhs.get_witness_index() && (lhs.additive_constant == rhs.additive_constant) &&
        (lhs.multiplicative_constant == rhs.multiplicative_constant)) {
        return lhs;
    }

    return (lhs - rhs).madd(predicate, rhs);
}

/**
 * @brief Let x = *this.normalize(), constrain x.v < 2^{num_bits}
 *
 */
template <typename Builder>
void field_t<Builder>::create_range_constraint(const size_t num_bits, std::string const& msg) const
{
    if (num_bits == 0) {
        assert_is_zero("0-bit range_constraint on non-zero field_t.");
    } else {
        if (is_constant()) {
            BB_ASSERT_LT(uint256_t(get_value()).get_msb(), num_bits, msg);
        } else {
            context->decompose_into_default_range(
                get_normalized_witness_index(), num_bits, bb::UltraCircuitBuilder::DEFAULT_PLOOKUP_RANGE_BITNUM, msg);
        }
    }
}

/**
 * @brief Copy constraint: constrain that `*this` field is equal to `rhs` element.
 *
 * @warning: After calling this method, both field values *will* be equal, regardless of whether the constraint
 * succeeds or fails. This can lead to confusion when debugging. If you want to log the inputs, do so before
 * calling this method.
 */
template <typename Builder> void field_t<Builder>::assert_equal(const field_t& rhs, std::string const& msg) const
{
    const field_t lhs = *this;
    Builder* ctx = validate_context(lhs.get_context(), rhs.get_context());
    if (lhs.is_constant() && rhs.is_constant()) {
        BB_ASSERT_EQ(lhs.get_value(), rhs.get_value(), "field_t::assert_equal: constants are not equal");
        return;
    }
    if (lhs.is_constant()) {
        ctx->assert_equal_constant(rhs.get_normalized_witness_index(), lhs.get_value(), msg);
    } else if (rhs.is_constant()) {
        ctx->assert_equal_constant(lhs.get_normalized_witness_index(), rhs.get_value(), msg);
    } else {
        if (lhs.is_normalized() || rhs.is_normalized()) {
            ctx->assert_equal(lhs.get_normalized_witness_index(), rhs.get_normalized_witness_index(), msg);
        } else {
            // Instead of creating 2 gates for normalizing both witnesses and applying a copy constraint, we use a
            // single `add` gate constraining a - b = 0
            ctx->create_add_gate({ .a = lhs.witness_index,
                                   .b = rhs.witness_index,
                                   .c = ctx->zero_idx,
                                   .a_scaling = lhs.multiplicative_constant,
                                   .b_scaling = -rhs.multiplicative_constant,
                                   .c_scaling = 0,
                                   .const_scaling = lhs.additive_constant - rhs.additive_constant });
            if ((lhs.get_value() != rhs.get_value()) && !ctx->failed()) {
                ctx->failure(msg);
            }
        }
    }
}
/**
 * @brief Constrain `*this` to be not equal to `rhs`.
 */
template <typename Builder> void field_t<Builder>::assert_not_equal(const field_t& rhs, std::string const& msg) const
{
    const field_t lhs = *this;
    const field_t diff = lhs - rhs;
    diff.assert_is_not_zero(msg);
}
/**
 * @brief Constrain `*this` \in `set` by enforcing that P(X) = \prod_{s \in set} (X - s) is 0 at X = *this.
 */
template <typename Builder>
void field_t<Builder>::assert_is_in_set(const std::vector<field_t>& set, std::string const& msg) const
{
    const field_t input = *this;
    field_t product = (input - set[0]);
    for (size_t i = 1; i < set.size(); i++) {
        product *= (input - set[i]);
    }
    product.assert_is_zero(msg);
}

/**
 * @brief Given a table T of size 4, outputs the monomial coefficients of the multilinear polynomial in `t0, t1`
 * that on a input binary string `b` of length 2, equals T_b. In the Lagrange basis, the desired polynomial is given
 * by the formula (1 - t0)(1 - t1).T0 + t0(1 - t1).T1 + (1 - t0)t1.T2 + t0.t1.T3
 *
 * Expand the coefficients to obtain the coefficients in the monomial basis.
 */
template <typename Builder>
std::array<field_t<Builder>, 4> field_t<Builder>::preprocess_two_bit_table(const field_t& T0,
                                                                           const field_t& T1,
                                                                           const field_t& T2,
                                                                           const field_t& T3)
{

    std::array<field_t, 4> table;
    table[0] = T0;                         // const coeff
    table[1] = T1 - T0;                    // t0 coeff
    table[2] = T2 - T0;                    // t1 coeff
    table[3] = T3.add_two(-table[2], -T1); // t0t1 coeff
    return table;
}

/** @brief Given a table T of size 8, outputs the monomial coefficients of the multilinear polynomial in t0, t1, t2,
 * that on a input binary string `b` of length 3, equals T_b.
 */
template <typename Builder>
std::array<field_t<Builder>, 8> field_t<Builder>::preprocess_three_bit_table(const field_t& T0,
                                                                             const field_t& T1,
                                                                             const field_t& T2,
                                                                             const field_t& T3,
                                                                             const field_t& T4,
                                                                             const field_t& T5,
                                                                             const field_t& T6,
                                                                             const field_t& T7)
{
    std::array<field_t, 8> table;
    table[0] = T0;                                  // const coeff
    table[1] = T1 - T0;                             // t0 coeff
    table[2] = T2 - T0;                             // t1 coeff
    table[3] = T4 - T0;                             // t2 coeff
    table[4] = T3.add_two(-table[2], -T1);          // t0t1 coeff
    table[5] = T5.add_two(-table[3], -T1);          // t0t2 coeff
    table[6] = T6.add_two(-table[3], -T2);          // t1t2 coeff
    table[7] = T7.add_two(-T6 - T5, T4 - table[4]); // t0t1t2 coeff
    return table;
}

/**
 * @brief Given a multilinear polynomial in 2 variables, which is represented by a table of monomial coefficients,
 * compute its evaluation at the point `(t0, t1)` using minimal number of gates.
 */
template <typename Builder>
field_t<Builder> field_t<Builder>::select_from_two_bit_table(const std::array<field_t, 4>& table,
                                                             const bool_t<Builder>& t1,
                                                             const bool_t<Builder>& t0)
{
    field_t R0 = field_t(t1).madd(table[3], table[1]);
    field_t R1 = R0.madd(field_t(t0), table[0]);
    field_t R2 = field_t(t1).madd(table[2], R1);
    return R2;
}

/**
 * @brief Given a multilinear polynomial in 3 variables, which is represented by a table of monomial coefficients,
 * compute its evaluation at `(t0, t1, t2)` using minimal number of gates.
 *
 * @details The straightforward thing would be eight
 * multiplications to get the monomials and several additions between them. It turns out you can do it in 7 `madd` gates
 * using the formulas
 *       X := ((t0*a_012 + a12)*t1 + a2)*t2 + a_const    //  - 3 gates
 *       Y := (t0*a01 + a1)*t1 + X                       //  - 2 gates
 *       Z := (t2*a02 + a0)*t0 + Y                       //  - 2 gates
 */
template <typename Builder>
field_t<Builder> field_t<Builder>::select_from_three_bit_table(const std::array<field_t, 8>& table,
                                                               const bool_t<Builder>& t2,
                                                               const bool_t<Builder>& t1,
                                                               const bool_t<Builder>& t0)
{
    field_t R0 = field_t(t0).madd(table[7], table[6]);
    field_t R1 = field_t(t1).madd(R0, table[3]);
    field_t R2 = field_t(t2).madd(R1, table[0]);
    field_t R3 = field_t(t0).madd(table[4], table[2]);
    field_t R4 = field_t(t1).madd(R3, R2);
    field_t R5 = field_t(t2).madd(table[5], table[1]);
    field_t R6 = field_t(t0).madd(R5, R4);
    return R6;
}

/**
 * @brief Constrain a + b + c + d to be equal to 0
 */
template <typename Builder>
void field_t<Builder>::evaluate_linear_identity(
    const field_t& a, const field_t& b, const field_t& c, const field_t& d, const std::string& msg)
{
    Builder* ctx = validate_context(a.context, b.context, c.context, d.context);

    if (a.is_constant() && b.is_constant() && c.is_constant() && d.is_constant()) {
        BB_ASSERT_EQ(a.get_value() + b.get_value() + c.get_value() + d.get_value(), 0);
        return;
    }

    const bool identity_holds = (a.get_value() + b.get_value() + c.get_value() + d.get_value()).is_zero();
    if (!identity_holds && !ctx->failed()) {
        ctx->failure(msg);
    }

    // validate that a + b + c + d = 0
    bb::fr const_scaling = a.additive_constant + b.additive_constant + c.additive_constant + d.additive_constant;

    ctx->create_big_add_gate({
        .a = a.is_constant() ? ctx->zero_idx : a.witness_index,
        .b = b.is_constant() ? ctx->zero_idx : b.witness_index,
        .c = c.is_constant() ? ctx->zero_idx : c.witness_index,
        .d = d.is_constant() ? ctx->zero_idx : d.witness_index,
        .a_scaling = a.multiplicative_constant,
        .b_scaling = b.multiplicative_constant,
        .c_scaling = c.multiplicative_constant,
        .d_scaling = d.multiplicative_constant,
        .const_scaling = const_scaling,
    });
}
/**
 * @brief Given a, b, c, d, constrain
 *            a * b + c + d = 0
 * by creating a `big_mul_gate`.
 */
template <typename Builder>
void field_t<Builder>::evaluate_polynomial_identity(
    const field_t& a, const field_t& b, const field_t& c, const field_t& d, const std::string& msg)
{
    if (a.is_constant() && b.is_constant() && c.is_constant() && d.is_constant()) {
        ASSERT((a.get_value() * b.get_value() + c.get_value() + d.get_value()).is_zero());
        return;
    }

    Builder* ctx = validate_context(a.context, b.context, c.context, d.context);

    const bool identity_holds = ((a.get_value() * b.get_value()) + c.get_value() + d.get_value()).is_zero();
    if (!identity_holds && !ctx->failed()) {
        ctx->failure(msg);
    }

    // validate that a * b + c + d = 0
    bb::fr mul_scaling = a.multiplicative_constant * b.multiplicative_constant;
    bb::fr a_scaling = a.multiplicative_constant * b.additive_constant;
    bb::fr b_scaling = b.multiplicative_constant * a.additive_constant;
    bb::fr c_scaling = c.multiplicative_constant;
    bb::fr d_scaling = d.multiplicative_constant;
    bb::fr const_scaling = a.additive_constant * b.additive_constant + c.additive_constant + d.additive_constant;

    ctx->create_big_mul_gate({
        .a = a.is_constant() ? ctx->zero_idx : a.witness_index,
        .b = b.is_constant() ? ctx->zero_idx : b.witness_index,
        .c = c.is_constant() ? ctx->zero_idx : c.witness_index,
        .d = d.is_constant() ? ctx->zero_idx : d.witness_index,
        .mul_scaling = mul_scaling,
        .a_scaling = a_scaling,
        .b_scaling = b_scaling,
        .c_scaling = c_scaling,
        .d_scaling = d_scaling,
        .const_scaling = const_scaling,
    });
}

/**
 * @brief Efficiently compute the sum of vector entries. Using `big_add_gate` we reduce the number of gates needed
 * to compute from `input.size()` to `input_size.size() / 3`.
 *
 * Note that if the size of the input vector is not a multiple of 3, the final gate will be padded with zero_idx wires
 */
template <typename Builder> field_t<Builder> field_t<Builder>::accumulate(const std::vector<field_t>& input)
{
    if (input.empty()) {
        return field_t(bb::fr::zero());
    }

    if (input.size() == 1) {
        return input[0].normalize();
    }

    std::vector<field_t> accumulator;
    field_t constant_term = bb::fr::zero();

    // Remove constant terms from input field elements
    for (const auto& element : input) {
        if (element.is_constant()) {
            constant_term += element;
        } else {
            accumulator.emplace_back(element);
        }
    }
    if (accumulator.empty()) {
        return constant_term;
    }
    // Add the accumulated constant term to the first witness. It does not create any gates - only the additive
    // constant of `accumulator[0]` is updated.
    accumulator[0] += constant_term;

    // At this point, the `accumulator` vector consisting of witnesses is not empty, so we can extract the context.
    Builder* ctx = validate_context<Builder>(accumulator);

    // Step 2: compute output value
    size_t num_elements = accumulator.size();
    bb::fr output = bb::fr::zero();
    for (const auto& acc : accumulator) {
        output += acc.get_value();
    }

    // Pad the accumulator with zeroes so that its size is a multiple of 3.
    const size_t num_padding_wires = (num_elements % 3) == 0 ? 0 : 3 - (num_elements % 3);
    for (size_t i = 0; i < num_padding_wires; ++i) {
        accumulator.emplace_back(field_t<Builder>::from_witness_index(ctx, ctx->zero_idx));
    }
    num_elements = accumulator.size();
    const size_t num_gates = (num_elements / 3);
    // Last gate is handled separetely
    const size_t last_gate_idx = num_gates - 1;

    field_t total = witness_t(ctx, output);
    field_t accumulating_total = total;

    // Let
    //      a_i := accumulator[3*i];
    //      b_i := accumulator[3*i+1];
    //      c_i := accumulator[3*i+2];
    //      d_0 := total;
    //      d_i := total - \sum_(j <  3*i) accumulator[j];
    // which leads us to equations
    //      d_{i+1} = d_{i} - a_i - b_i - c_i for i = 0, ..., last_idx - 1;
    //      0       = d_{i} - a_i - b_i - c_i for i = last_gate_idx,
    // that are turned into constraints below.

    for (size_t i = 0; i < last_gate_idx; ++i) {
        // For i < last_gate_idx, we create a `big_add_gate` constraint
        //      a_i.v * a_scaling + b_i.v * b_scaling + c_i.v * c_scaling + d_i.v * d_scaling + const_scaling +
        //      w_4_omega = 0
        // where
        //      a_scaling       :=  a_i.mul
        //      b_scaling       :=  b_i.mul
        //      c_scaling       :=  c_i.mul
        //      d_scaling       := -1
        //      const_scaling   :=  a_i.add + b_i.add + c_i.add
        //      w_4_omega :=  d_{i+1}
        ctx->create_big_add_gate(
            {
                .a = accumulator[3 * i].witness_index,
                .b = accumulator[3 * i + 1].witness_index,
                .c = accumulator[3 * i + 2].witness_index,
                .d = accumulating_total.witness_index,
                .a_scaling = accumulator[3 * i].multiplicative_constant,
                .b_scaling = accumulator[3 * i + 1].multiplicative_constant,
                .c_scaling = accumulator[3 * i + 2].multiplicative_constant,
                .d_scaling = -1,
                .const_scaling = accumulator[3 * i].additive_constant + accumulator[3 * i + 1].additive_constant +
                                 accumulator[3 * i + 2].additive_constant,
            },
            /*use_next_gate_w_4 = */ true);
        bb::fr new_total = accumulating_total.get_value() - accumulator[3 * i].get_value() -
                           accumulator[3 * i + 1].get_value() - accumulator[3 * i + 2].get_value();
        accumulating_total = witness_t<Builder>(ctx, new_total);
    }

    // For i = last_gate_idx, we create a `big_add_gate` constraining
    //      a_i.v * a_scaling + b_i.v * b_scaling + c_i.v * c_scaling + d_i.v * d_scaling + const_scaling = 0
    ctx->create_big_add_gate({
        .a = accumulator[3 * last_gate_idx].witness_index,
        .b = accumulator[3 * last_gate_idx + 1].witness_index,
        .c = accumulator[3 * last_gate_idx + 2].witness_index,
        .d = accumulating_total.witness_index,
        .a_scaling = accumulator[3 * last_gate_idx].multiplicative_constant,
        .b_scaling = accumulator[3 * last_gate_idx + 1].multiplicative_constant,
        .c_scaling = accumulator[3 * last_gate_idx + 2].multiplicative_constant,
        .d_scaling = -1,
        .const_scaling = accumulator[3 * last_gate_idx].additive_constant +
                         accumulator[3 * last_gate_idx + 1].additive_constant +
                         accumulator[3 * last_gate_idx + 2].additive_constant,
    });
    OriginTag new_tag{};
    for (const auto& single_input : input) {
        new_tag = OriginTag(new_tag, single_input.tag);
    }
    total.tag = new_tag;
    return total.normalize();
}

/**
 * @brief Splits the field element into (lo, hi), where:
 * - lo contains bits [0, lsb_index)
 * - hi contains bits [lsb_index, num_bits)
 * @details Max bits is specified as an argument, and must be <= grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH (to ensure no
 * modular wrap).
 *
 */
template <typename Builder>
std::pair<field_t<Builder>, field_t<Builder>> field_t<Builder>::no_wrap_split_at(const size_t lsb_index,
                                                                                 const size_t num_bits) const
{
    ASSERT(lsb_index < num_bits);
    ASSERT(num_bits <= grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH);

    const uint256_t value = get_value();
    const uint256_t hi = value >> lsb_index;
    const uint256_t lo = value % (uint256_t(1) << lsb_index);

    if (is_constant()) {
        // If `*this` is constant, we can return the split values directly
        ASSERT(lo + (hi << lsb_index) == value);
        return std::make_pair(field_t<Builder>(lo), field_t<Builder>(hi));
    }

    // Handle edge case when lsb_index == 0
    if (lsb_index == 0) {
        ASSERT(hi == value);
        ASSERT(lo == 0);
        create_range_constraint(num_bits, "split_at: hi value too large.");
        return std::make_pair(field_t<Builder>(0), *this);
    }

    Builder* ctx = get_context();
    ASSERT(ctx != nullptr);

    field_t<Builder> lo_wit(witness_t(ctx, lo));
    field_t<Builder> hi_wit(witness_t(ctx, hi));

    // Ensure that `lo_wit` is in the range [0, 2^lsb_index - 1]
    lo_wit.create_range_constraint(lsb_index, "split_at: lo value too large.");

    // Ensure that `hi_wit` is in the range [0, 2^(num_bits - lsb_index) - 1]
    hi_wit.create_range_constraint(num_bits - lsb_index, "split_at: hi value too large.");

    // Check that *this = lo_wit + hi_wit * 2^{lsb_index}
    const field_t<Builder> reconstructed = lo_wit + (hi_wit * field_t<Builder>(uint256_t(1) << lsb_index));
    assert_equal(reconstructed, "split_at: decomposition failed");

    // Set the origin tag for both witnesses
    lo_wit.set_origin_tag(tag);
    hi_wit.set_origin_tag(tag);

    return std::make_pair(lo_wit, hi_wit);
}

template class field_t<bb::UltraCircuitBuilder>;
template class field_t<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
