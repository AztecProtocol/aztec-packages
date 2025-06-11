// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "field.hpp"
#include "../bool/bool.hpp"
#include "../circuit_builders/circuit_builders.hpp"
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
    , additive_constant(0)
    , multiplicative_constant(1)
    , witness_index(value.witness_index)
{}

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
    if (other.witness_index == IS_CONSTANT) {
        additive_constant = (other.witness_bool ^ other.witness_inverted) ? bb::fr::one() : bb::fr::zero();
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
 * @brief Convert a field_t element to a boolean and enforce bool constraints.
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
    if (this->is_constant()) {
        ASSERT(additive_constant == bb::fr::one() || additive_constant == bb::fr::zero());
        bool_t<Builder> result(context);
        result.witness_bool = (additive_constant == bb::fr::one());
        result.set_origin_tag(tag);
        return result;
    }

    const bool add_constant_check = (additive_constant == bb::fr::zero());
    const bool mul_constant_check = (multiplicative_constant == bb::fr::one());
    const bool inverted_check = (additive_constant == bb::fr::one()) && (multiplicative_constant == bb::fr::neg_one());
    bool_t<Builder> result(context);
    // Process the elements of the form
    //      a = a.v * 1 + 0 and a = a.v * (-1) + 1
    // They do not need to be normalized, as in the first case the value of
    //      a == a.v,
    // and in the second case
    //      a == ¬(a.v).
    // The distinction between the cases is tracked by the .witness_inverted field of bool_t.
    uint32_t witness_idx = witness_index;
    if ((add_constant_check && mul_constant_check) || inverted_check) {
        result.witness_inverted = inverted_check;
    } else {
        // In general, the witness has to be normalized.
        witness_idx = get_normalized_witness_index();
    }
    // Get the normalized value of the witness
    bb::fr witness = context->get_variable(witness_idx);
    BB_ASSERT_EQ((witness == bb::fr::zero()) || (witness == bb::fr::one()),
                 true,
                 "Attempting to create a bool_t from a witness_t not satisfying x^2 - x = 0");
    result.witness_bool = (witness == bb::fr::one());
    result.witness_index = witness_idx;
    context->create_bool_gate(witness_idx);
    result.set_origin_tag(tag);
    return result;
}

template <typename Builder> field_t<Builder> field_t<Builder>::operator+(const field_t& other) const
{
    Builder* ctx = (context == nullptr) ? other.context : context;
    field_t<Builder> result(ctx);
    // Ensure that non-constant circuit elements can not be added without context
    ASSERT(ctx || (witness_index == IS_CONSTANT && other.witness_index == IS_CONSTANT));

    if (witness_index == other.witness_index && !this->is_constant()) {
        // If summands represent the same circuit variable, i.e. their witness indices coincide, we just need to update
        // the scaling factors of this variable.
        result.additive_constant = additive_constant + other.additive_constant;
        result.multiplicative_constant = multiplicative_constant + other.multiplicative_constant;
        result.witness_index = witness_index;
    } else if (this->is_constant() && other.is_constant()) {
        // both inputs are constant - don't add a gate
        result.additive_constant = additive_constant + other.additive_constant;
    } else if (!this->is_constant() && other.is_constant()) {
        // one input is constant - don't add a gate, but update scaling factors
        result.additive_constant = additive_constant + other.additive_constant;
        result.multiplicative_constant = multiplicative_constant;
        result.witness_index = witness_index;
    } else if (this->is_constant() && !other.is_constant()) {
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

template <typename Builder> field_t<Builder> field_t<Builder>::operator-(const field_t& other) const
{
    field_t<Builder> rhs(other);
    rhs.additive_constant.self_neg();
    if (rhs.witness_index != IS_CONSTANT) {
        rhs.multiplicative_constant.self_neg();
    }
    return operator+(rhs);
}

template <typename Builder> field_t<Builder> field_t<Builder>::operator*(const field_t& other) const
{
    Builder* ctx = (context == nullptr) ? other.context : context;
    field_t<Builder> result(ctx);
    // Ensure that non-constant circuit elements can not be multiplied without context
    ASSERT(ctx || (this->is_constant() && other.is_constant()));

    if (this->is_constant() && other.is_constant()) {
        // Both inputs are constant - don't add a gate.
        // The value of a constant is tracked in `.additive_constant`.
        result.additive_constant = additive_constant * other.additive_constant;
    } else if (!this->is_constant() && other.is_constant()) {

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
    } else if (this->is_constant() && !other.is_constant()) {
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
 * @brief Given field elements `a` = `*this` and `b` = `other`, output \f$ a / b \f$ without checking whether \f$  b = 0
 * \f$.
 */
template <typename Builder> field_t<Builder> field_t<Builder>::divide_no_zero_check(const field_t& other) const
{

    // Let
    //    a := this;
    //    b := other;
    //    q := a / b;
    Builder* ctx = (context == nullptr) ? other.context : context;
    field_t<Builder> result(ctx);
    // Ensure that non-constant circuit elements can not be divided without context
    ASSERT(ctx || (this->is_constant() && other.is_constant()));

    bb::fr additive_multiplier = bb::fr::one();

    if (this->is_constant() && other.is_constant()) {
        // Both inputs are constant, the result is given by
        //      q = a.add / b.add, if b != 0.
        //      q = a.add        , if b == 0
        if (!(other.additive_constant == bb::fr::zero())) {
            additive_multiplier = other.additive_constant.invert();
        }
        result.additive_constant = additive_constant * additive_multiplier;
    } else if (!this->is_constant() && other.is_constant()) {
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
    } else if (this->is_constant() && !other.is_constant()) {
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
 * @brief raise a field_t to a power of an exponent (field_t). Note that the exponent must not exceed 32 bits and is
 * implicitly range constrained.
 *
 * @returns this ** (exponent)
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
 * @brief raise a field_t to a power of an exponent (field_t). Note that the exponent must not exceed 32 bits and is
 * implicitly range constrained.
 *
 * @returns this ** (exponent)
 */
template <typename Builder> field_t<Builder> field_t<Builder>::pow(const field_t& exponent) const
{
    uint256_t exponent_value = exponent.get_value();

    if (is_constant() && exponent.is_constant()) {
        return field_t(get_value().pow(exponent_value));
    }
    // Use the constant version that perfoms only the necessary multiplications if the exponent is constant
    if (exponent.is_constant()) {
        return pow(static_cast<uint32_t>(exponent_value));
    }

    auto* ctx = exponent.context;

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
 * @returns `this * to_mul + to_add`
 */
template <typename Builder> field_t<Builder> field_t<Builder>::madd(const field_t& to_mul, const field_t& to_add) const
{
    Builder* ctx = first_non_null<Builder>(context, to_mul.context, to_add.context);

    if (to_mul.is_constant() && to_add.is_constant() && this->is_constant()) {
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
    //   = a.v * b.v * [a.mul * b.mul] + a.v * [a.mul * b.add] + b.v * [b.mul + a.add] + c.v * [c.mul] +
    //     [a.add * b.add + c.add]
    //   = a.v * b.v * [     q_m     ] + a.v * [     q_1     ] + b.v * [     q_2     ] + c.v * [ q_3 ] + [ q_c ]

    bb::fr q_m = multiplicative_constant * to_mul.multiplicative_constant;
    bb::fr q_1 = multiplicative_constant * to_mul.additive_constant;
    bb::fr q_2 = to_mul.multiplicative_constant * additive_constant;
    bb::fr q_3 = to_add.multiplicative_constant;
    bb::fr q_c = additive_constant * to_mul.additive_constant + to_add.additive_constant;

    // Note: the value of a constant field_t is wholly tracked by the field_t's `additive_constant` member, which is
    // accounted for in the above-calculated selectors (`q_`'s). Therefore no witness (`variables[witness_index]`)
    // exists for constants, and so the field_t's corresponding wire value is set to `0` in the gate equation.
    bb::fr a = witness_index == IS_CONSTANT ? bb::fr(0) : ctx->get_variable(witness_index);
    bb::fr b = to_mul.witness_index == IS_CONSTANT ? bb::fr(0) : ctx->get_variable(to_mul.witness_index);
    bb::fr c = to_add.witness_index == IS_CONSTANT ? bb::fr(0) : ctx->get_variable(to_add.witness_index);

    bb::fr out = a * b * q_m + a * q_1 + b * q_2 + c * q_3 + q_c;

    field_t<Builder> result(ctx);
    result.witness_index = ctx->add_variable(out);
    ctx->create_big_mul_gate({
        .a = witness_index == IS_CONSTANT ? ctx->zero_idx : witness_index,
        .b = to_mul.witness_index == IS_CONSTANT ? ctx->zero_idx : to_mul.witness_index,
        .c = to_add.witness_index == IS_CONSTANT ? ctx->zero_idx : to_add.witness_index,
        .d = result.witness_index,
        .mul_scaling = q_m,
        .a_scaling = q_1,
        .b_scaling = q_2,
        .c_scaling = q_3,
        .d_scaling = -bb::fr(1),
        .const_scaling = q_c,
    });
    result.tag = OriginTag(tag, to_mul.tag, to_add.tag);
    return result;
}

/**
 * @brief Returns (this + a + b)
 *
 * @details Use custom big_mul_gate to save gates.
 *
 * @tparam Builder
 * @param add_a
 * @param add_b
 * @return field_t<Builder>
 */
template <typename Builder> field_t<Builder> field_t<Builder>::add_two(const field_t& add_a, const field_t& add_b) const
{
    Builder* ctx = first_non_null<Builder>(context, add_a.context, add_b.context);

    if ((add_a.is_constant()) && (add_b.is_constant()) && (this->is_constant())) {
        return (*this) + add_a + add_b;
    }
    bb::fr q_1 = multiplicative_constant;
    bb::fr q_2 = add_a.multiplicative_constant;
    bb::fr q_3 = add_b.multiplicative_constant;
    bb::fr q_c = additive_constant + add_a.additive_constant + add_b.additive_constant;

    bb::fr a = this->is_constant() ? bb::fr(0) : ctx->get_variable(witness_index);
    bb::fr b = add_a.is_constant() ? bb::fr(0) : ctx->get_variable(add_a.witness_index);
    bb::fr c = add_b.is_constant() ? bb::fr(0) : ctx->get_variable(add_b.witness_index);

    bb::fr out = a * q_1 + b * q_2 + c * q_3 + q_c;

    field_t<Builder> result(ctx);
    result.witness_index = ctx->add_variable(out);

    ctx->create_big_mul_gate({
        .a = this->is_constant() ? ctx->zero_idx : witness_index,
        .b = add_a.is_constant() ? ctx->zero_idx : add_a.witness_index,
        .c = add_b.is_constant() ? ctx->zero_idx : add_b.witness_index,
        .d = result.witness_index,
        .mul_scaling = bb::fr(0),
        .a_scaling = q_1,
        .b_scaling = q_2,
        .c_scaling = q_3,
        .d_scaling = -bb::fr(1),
        .const_scaling = q_c,
    });
    result.tag = OriginTag(tag, add_a.tag, add_b.tag);
    return result;
}

/**
 * @brief Return a new element, where the in-circuit witness contains the actual represented value (multiplicative
 * constant is 1 and additive_constant is 0)
 *
 * @details If the element is a constant or it is already normalized, just return the element itself
 *
 * @todo We need to add a mechanism into the circuit builders for caching normalized variants for fields and bigfields.
 *It should make the circuits smaller. https://github.com/AztecProtocol/barretenberg/issues/1052
 *
 * @tparam Builder
 * @return field_t<Builder>
 */
template <typename Builder> field_t<Builder> field_t<Builder>::normalize() const
{
    if (witness_index == IS_CONSTANT ||
        ((multiplicative_constant == bb::fr::one()) && (additive_constant == bb::fr::zero()))) {
        return *this;
    }

    // Value of this = this.v * this.mul + this.add; // where this.v = context->variables[this.witness_index]
    // Normalised result = result.v * 1 + 0;         // where result.v = this.v * this.mul + this.add
    // We need a new gate to enforce that the `result` was correctly calculated from `this`.

    field_t<Builder> result(context);
    bb::fr value = context->get_variable(witness_index);
    bb::fr out;
    out = value * multiplicative_constant;
    out += additive_constant;

    result.witness_index = context->add_variable(out);
    result.additive_constant = bb::fr::zero();
    result.multiplicative_constant = bb::fr::one();

    // Aim of new gate: this.v * this.mul + this.add == result.v
    // <=>                           this.v * [this.mul] +                  result.v * [ -1] + [this.add] == 0
    // <=> this.v * this.v * [ 0 ] + this.v * [this.mul] + this.v * [ 0 ] + result.v * [ -1] + [this.add] == 0
    // <=> this.v * this.v * [q_m] + this.v * [   q_l  ] + this.v * [q_r] + result.v * [q_o] + [   q_c  ] == 0

    context->create_add_gate({ .a = witness_index,
                               .b = witness_index,
                               .c = result.witness_index,
                               .a_scaling = multiplicative_constant,
                               .b_scaling = 0,
                               .c_scaling = bb::fr::neg_one(),
                               .const_scaling = additive_constant });
    result.tag = tag;
    return result;
}

template <typename Builder> void field_t<Builder>::assert_is_zero(std::string const& msg) const
{
    if (get_value() != bb::fr(0)) {
        context->failure(msg);
    }

    if (witness_index == IS_CONSTANT) {
        ASSERT(additive_constant == bb::fr(0));
        return;
    }

    // Aim of new gate: this.v * this.mul + this.add == 0
    // I.e.:
    // this.v * 0 * [ 0 ] + this.v * [this.mul] + 0 * [ 0 ] + 0 * [ 0 ] + [this.add] == 0
    // this.v * 0 * [q_m] + this.v * [   q_l  ] + 0 * [q_r] + 0 * [q_o] + [   q_c  ] == 0

    Builder* ctx = context;

    context->create_poly_gate({
        .a = witness_index,
        .b = ctx->zero_idx,
        .c = ctx->zero_idx,
        .q_m = bb::fr(0),
        .q_l = multiplicative_constant,
        .q_r = bb::fr(0),
        .q_o = bb::fr(0),
        .q_c = additive_constant,
    });
}

template <typename Builder> void field_t<Builder>::assert_is_not_zero(std::string const& msg) const
{

    if (witness_index == IS_CONSTANT) {
        ASSERT(additive_constant != bb::fr(0), msg);
        return;
    }

    if (get_value() == 0) {
        context->failure(msg);
    }

    bb::fr inverse_value = (get_value() == 0) ? 0 : get_value().invert();

    field_t<Builder> inverse(witness_t<Builder>(context, inverse_value));

    // inverse is added in the circuit for checking that field element is not zero
    // and it won't be used anymore, so it's needed to add this element in used witnesses
    if constexpr (IsUltraBuilder<Builder>) {
        context->update_used_witnesses(inverse.witness_index);
    }

    // Aim of new gate: `this` has an inverse (hence is not zero).
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
        .q_l = bb::fr(0),               // a * 0
        .q_r = additive_constant,       // b * mul_const
        .q_o = bb::fr(0),               // c * 0
        .q_c = bb::fr(-1),              // -1
    });
}

template <typename Builder> bool_t<Builder> field_t<Builder>::is_zero() const
{
    if (witness_index == IS_CONSTANT) {
        auto result = bool_t(context, (get_value() == bb::fr::zero()));
        result.set_origin_tag(get_origin_tag());
        return result;
    }

    // To check whether a field element, k, is zero, we use the fact that, if k > 0,
    // there exists a modular inverse k', such that k * k' = 1

    // To verify whether k = 0, we must do 2 checks
    // First is that (k * k') - 1 + is_zero = 0

    // If is_zero = false, then k' must be the modular inverse of k, therefore k is not 0

    // If is_zero = true, then either k or k' is zero (or both)
    // To ensure that it is k that is zero, and not k', we must apply
    // an additional check: that if is_zero = true, k' = 1
    // This way, if (k * k') = 0, we know that k = 0.
    // The second check is: (is_zero * k') - is_zero = 0
    field_t k = normalize();
    bool_t is_zero = witness_t(context, (k.get_value() == bb::fr::zero()));
    field_t k_inverse;
    if (is_zero.get_value()) {
        k_inverse = witness_t(context, bb::fr::one());
    } else {
        bb::fr k_inverse_value = k.get_value().invert();
        k_inverse = witness_t(context, k_inverse_value);
    }

    // k * k_inverse + is_zero - 1 = 0
    bb::fr q_m = bb::fr::one();
    bb::fr q_l = bb::fr::zero();
    bb::fr q_r = bb::fr::zero();
    bb::fr q_o = bb::fr::one();
    bb::fr q_c = bb::fr::neg_one();

    context->create_poly_gate({ .a = k.witness_index,
                                .b = k_inverse.witness_index,
                                .c = is_zero.witness_index,
                                .q_m = q_m,
                                .q_l = q_l,
                                .q_r = q_r,
                                .q_o = q_o,
                                .q_c = q_c });

    // is_zero * k_inverse - is_zero = 0
    q_o = bb::fr::neg_one();
    q_c = bb::fr::zero();

    context->create_poly_gate({ .a = is_zero.witness_index,
                                .b = k_inverse.witness_index,
                                .c = is_zero.witness_index,
                                .q_m = q_m,
                                .q_l = q_l,
                                .q_r = q_r,
                                .q_o = q_o,
                                .q_c = q_c });
    is_zero.set_origin_tag(tag);
    return is_zero;
}

template <typename Builder> bb::fr field_t<Builder>::get_value() const
{
    if (witness_index != IS_CONSTANT) {
        ASSERT(context != nullptr);
        return (multiplicative_constant * context->get_variable(witness_index)) + additive_constant;
    }
    ASSERT(this->multiplicative_constant == bb::fr::one());
    // A constant field_t's value is tracked wholly by its additive_constant member.
    return additive_constant;
}

template <typename Builder> bool_t<Builder> field_t<Builder>::operator==(const field_t& other) const
{
    Builder* ctx = (context == nullptr) ? other.context : context;
    if (is_constant() && other.is_constant()) {
        auto result = bool_t<Builder>((get_value() == other.get_value()));
        result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
        return result;
    }

    bb::fr fa = get_value();
    bb::fr fb = other.get_value();
    bb::fr fd = fa - fb;
    bool is_equal = (fa == fb);
    bb::fr fc = is_equal ? bb::fr::one() : fd.invert();
    bool_t result(ctx, is_equal);
    result.witness_index = ctx->add_variable(is_equal);
    result.witness_bool = is_equal;

    field_t x(witness_t(ctx, fc));
    // element x is auxiliary variable to create constraints
    // for operator == and it won't be used anymore
    if constexpr (IsUltraBuilder<Builder>) {
        ctx->update_used_witnesses(x.witness_index);
    }
    const field_t& a = *this;
    const field_t& b = other;
    const field_t diff = a - b;
    // these constraints ensure that result is a boolean
    field_t::evaluate_polynomial_identity(diff, x, result, -field_t(bb::fr::one()));
    field_t::evaluate_polynomial_identity(diff, result, field_t(bb::fr::zero()), field_t(bb::fr::zero()));

    result.set_origin_tag(OriginTag(tag, other.tag));
    return result;
}

template <typename Builder> bool_t<Builder> field_t<Builder>::operator!=(const field_t& other) const
{
    return !operator==(other);
}

template <typename Builder>
field_t<Builder> field_t<Builder>::conditional_negate(const bool_t<Builder>& predicate) const
{
    if (predicate.is_constant()) {
        auto result = field_t(predicate.get_value() ? -(*this) : *this);
        result.set_origin_tag(OriginTag(get_origin_tag(), predicate.get_origin_tag()));
        return result;
    }
    field_t<Builder> predicate_field(predicate);
    field_t<Builder> multiplicand = -(predicate_field + predicate_field);
    return multiplicand.madd(*this, *this);
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
    // If lhs and rhs are the same witness, just return it
    if (lhs.get_witness_index() == rhs.get_witness_index() && (lhs.additive_constant == rhs.additive_constant) &&
        (lhs.multiplicative_constant == rhs.multiplicative_constant)) {
        return lhs;
    }

    return (lhs - rhs).madd(predicate, rhs);
}

template <typename Builder>
void field_t<Builder>::create_range_constraint(const size_t num_bits, std::string const& msg) const
{
    if (num_bits == 0) {
        assert_is_zero("0-bit range_constraint on non-zero field_t.");
    } else {
        if (is_constant()) {
            ASSERT(uint256_t(get_value()).get_msb() < num_bits);
        } else {
            if constexpr (HasPlookup<Builder>) {
                context->decompose_into_default_range(normalize().get_witness_index(),
                                                      num_bits,
                                                      bb::UltraCircuitBuilder::DEFAULT_PLOOKUP_RANGE_BITNUM,
                                                      msg);
            } else {
                context->decompose_into_base4_accumulators(normalize().get_witness_index(), num_bits, msg);
            }
        }
    }
}

/**
 * @brief Constrain that this field is equal to the given field.
 *
 * @warning: After calling this method, both field values *will* be equal, regardless of whether the constraint
 * succeeds or fails. This can lead to confusion when debugging. If you want to log the inputs, do so before
 * calling this method.
 */
template <typename Builder> void field_t<Builder>::assert_equal(const field_t& rhs, std::string const& msg) const
{
    const field_t lhs = *this;
    Builder* ctx = lhs.get_context() ? lhs.get_context() : rhs.get_context();
    (void)OriginTag(get_origin_tag(), rhs.get_origin_tag());
    if (lhs.is_constant() && rhs.is_constant()) {
        ASSERT(lhs.get_value() == rhs.get_value());
    } else if (lhs.is_constant()) {
        field_t right = rhs.normalize();
        ctx->assert_equal_constant(right.witness_index, lhs.get_value(), msg);
    } else if (rhs.is_constant()) {
        field_t left = lhs.normalize();
        ctx->assert_equal_constant(left.witness_index, rhs.get_value(), msg);
    } else {
        field_t left = lhs.normalize();
        field_t right = rhs.normalize();
        ctx->assert_equal(left.witness_index, right.witness_index, msg);
    }
}

template <typename Builder> void field_t<Builder>::assert_not_equal(const field_t& rhs, std::string const& msg) const
{
    const field_t lhs = *this;
    const field_t diff = lhs - rhs;
    diff.assert_is_not_zero(msg);
}

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

template <typename Builder>
std::array<field_t<Builder>, 4> field_t<Builder>::preprocess_two_bit_table(const field_t& T0,
                                                                           const field_t& T1,
                                                                           const field_t& T2,
                                                                           const field_t& T3)
{
    // (1 - t0)(1 - t1).T0 + t0(1 - t1).T1 + (1 - t0)t1.T2 + t0.t1.T3

    // -t0.t1.T0 - t0.t1.T1 -t0.t1.T2 + t0.t1.T3 => t0.t1(T3 - T2 - T1 + T0)
    // -t0.T0 + t0.T1 => t0(T1 - T0)
    // -t1.T0 - t1.T2 => t1(T2 - T0)
    // T0 = constant term
    std::array<field_t, 4> table;
    table[0] = T0;
    table[1] = T1 - T0;
    table[2] = T2 - T0;
    table[3] = T3 - T2 - T1 + T0;
    return table;
}

// Given T, stores the coefficients of the multilinear polynomial in t0,t1,t2, that on input a binary string b of
// length 3, equals T_b
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
    table[0] = T0;                                    // const coeff
    table[1] = T1 - T0;                               // t0 coeff
    table[2] = T2 - T0;                               // t1 coeff
    table[3] = T4 - T0;                               // t2 coeff
    table[4] = T3 - T2 - T1 + T0;                     // t0t1 coeff
    table[5] = T5 - T4 - T1 + T0;                     // t0t2 coeff
    table[6] = T6 - T4 - T2 + T0;                     // t1t2 coeff
    table[7] = T7 - T6 - T5 + T4 - T3 + T2 + T1 - T0; // t0t1t2 coeff
    return table;
}

template <typename Builder>
field_t<Builder> field_t<Builder>::select_from_two_bit_table(const std::array<field_t, 4>& table,
                                                             const bool_t<Builder>& t1,
                                                             const bool_t<Builder>& t0)
{
    field_t R0 = static_cast<field_t>(t1).madd(table[3], table[1]);
    field_t R1 = R0.madd(static_cast<field_t>(t0), table[0]);
    field_t R2 = static_cast<field_t>(t1).madd(table[2], R1);
    return R2;
}

// we wish to compute the multilinear polynomial stored at point (t0,t1,t2) in a minimal number of gates.
// The straightforward thing would be eight multiplications to get the monomials and several additions between them
// It turns out you can do it in 7 multadd gates using the formula
// X:= ((t0*a012+a12)*t1+a2)*t2+a_const  - 3 gates
// Y:= (t0*a01+a1)*t1+X - 2 gates
// Z:= (t2*a02 + a0)*t0 + Y - 2 gates
template <typename Builder>
field_t<Builder> field_t<Builder>::select_from_three_bit_table(const std::array<field_t, 8>& table,
                                                               const bool_t<Builder>& t2,
                                                               const bool_t<Builder>& t1,
                                                               const bool_t<Builder>& t0)
{
    field_t R0 = static_cast<field_t>(t0).madd(table[7], table[6]);
    field_t R1 = static_cast<field_t>(t1).madd(R0, table[3]);
    field_t R2 = static_cast<field_t>(t2).madd(R1, table[0]);
    field_t R3 = static_cast<field_t>(t0).madd(table[4], table[2]);
    field_t R4 = static_cast<field_t>(t1).madd(R3, R2);
    field_t R5 = static_cast<field_t>(t2).madd(table[5], table[1]);
    field_t R6 = static_cast<field_t>(t0).madd(R5, R4);
    return R6;
}

/**
 * @brief Constrain a + b + c + d to be equal to 0
 */
template <typename Builder>
void field_t<Builder>::evaluate_linear_identity(const field_t& a, const field_t& b, const field_t& c, const field_t& d)
{
    Builder* ctx = first_non_null(a.context, b.context, c.context, d.context);

    if (a.is_constant() && b.is_constant() && c.is_constant() && d.is_constant()) {
        ASSERT(a.get_value() + b.get_value() + c.get_value() + d.get_value() == 0);
        return;
    }

    // validate that a + b + c + d = 0
    bb::fr q_1 = a.multiplicative_constant;
    bb::fr q_2 = b.multiplicative_constant;
    bb::fr q_3 = c.multiplicative_constant;
    bb::fr q_4 = d.multiplicative_constant;
    bb::fr q_c = a.additive_constant + b.additive_constant + c.additive_constant + d.additive_constant;

    ctx->create_big_add_gate({
        a.is_constant() ? ctx->zero_idx : a.witness_index,
        b.is_constant() ? ctx->zero_idx : b.witness_index,
        c.is_constant() ? ctx->zero_idx : c.witness_index,
        d.is_constant() ? ctx->zero_idx : d.witness_index,
        q_1,
        q_2,
        q_3,
        q_4,
        q_c,
    });
}

template <typename Builder>
void field_t<Builder>::evaluate_polynomial_identity(const field_t& a,
                                                    const field_t& b,
                                                    const field_t& c,
                                                    const field_t& d)
{
    Builder* ctx = first_non_null(a.context, b.context, c.context, d.context);

    if (a.is_constant() && b.is_constant() && c.is_constant() && d.is_constant()) {
        ASSERT((a.get_value() * b.get_value() + c.get_value() + d.get_value()).is_zero());
        return;
    }

    // validate that a * b + c + d = 0
    bb::fr q_m = a.multiplicative_constant * b.multiplicative_constant;
    bb::fr q_1 = a.multiplicative_constant * b.additive_constant;
    bb::fr q_2 = b.multiplicative_constant * a.additive_constant;
    bb::fr q_3 = c.multiplicative_constant;
    bb::fr q_4 = d.multiplicative_constant;
    bb::fr q_c = a.additive_constant * b.additive_constant + c.additive_constant + d.additive_constant;

    ctx->create_big_mul_gate({
        a.is_constant() ? ctx->zero_idx : a.witness_index,
        b.is_constant() ? ctx->zero_idx : b.witness_index,
        c.is_constant() ? ctx->zero_idx : c.witness_index,
        d.is_constant() ? ctx->zero_idx : d.witness_index,
        q_m,
        q_1,
        q_2,
        q_3,
        q_4,
        q_c,
    });
}

/**
 * Compute sum of inputs
 */
template <typename Builder> field_t<Builder> field_t<Builder>::accumulate(const std::vector<field_t>& input)
{
    if (input.empty()) {
        return field_t<Builder>(nullptr, 0);
    }
    if (input.size() == 1) {
        return input[0]; //.normalize();
    }
    /**
     * If we are using UltraCircuitBuilder, we can accumulate 3 values into a sum per gate.
     * We track a decumulating sum of values in the 4th wire of every row.
     * i.e. the 4th wire of the first row is the total output value
     *
     * At every gate, we subtract off three elements from `input`. Every gate apart from the final gate,
     * is an 'extended' addition gate, that includes the 4th wire of the next gate
     *
     * e.g. to accumulate 9 limbs, structure is:
     *
     * | l_1 | l_2 | l_3 | s_3 |
     * | l_4 | l_5 | l_6 | s_2 |
     * | l_7 | l_8 | l_9 | s_1 |
     *
     * We validate:
     *
     * s_3 - l_1 - l_2 - l_3 - s_2 = 0
     * s_2 - l_4 - l_5 - l_6 - s_1 = 0
     * s_1 - l_7 - l_8 - l_9 = 0
     *
     * If num elements is not a multiple of 3, the final gate will be padded with zero_idx wires
     **/
    if constexpr (HasPlookup<Builder>) {
        Builder* ctx = nullptr;
        std::vector<field_t> accumulator;
        field_t constant_term = 0;

        // Step 1: remove constant terms from input field elements
        for (const auto& element : input) {
            if (element.is_constant()) {
                constant_term += element;
            } else {
                accumulator.emplace_back(element);
            }
            ctx = (element.get_context() ? element.get_context() : ctx);
        }
        if (accumulator.empty()) {
            return constant_term;
        } else if (accumulator.size() != input.size()) {
            accumulator[0] += constant_term;
        }

        // Step 2: compute output value
        size_t num_elements = accumulator.size();
        bb::fr output = 0;
        for (const auto& acc : accumulator) {
            output += acc.get_value();
        }

        // Step 3: pad accumulator to be a multiple of 3
        const size_t num_padding_wires = (num_elements % 3) == 0 ? 0 : 3 - (num_elements % 3);
        for (size_t i = 0; i < num_padding_wires; ++i) {
            accumulator.emplace_back(field_t<Builder>::from_witness_index(ctx, ctx->zero_idx));
        }
        num_elements = accumulator.size();
        const size_t num_gates = (num_elements / 3);

        field_t total = witness_t(ctx, output);
        field_t accumulating_total = total;

        for (size_t i = 0; i < num_gates; ++i) {
            ctx->create_big_add_gate(
                {
                    accumulator[3 * i].get_witness_index(),
                    accumulator[3 * i + 1].get_witness_index(),
                    accumulator[3 * i + 2].get_witness_index(),
                    accumulating_total.witness_index,
                    accumulator[3 * i].multiplicative_constant,
                    accumulator[3 * i + 1].multiplicative_constant,
                    accumulator[3 * i + 2].multiplicative_constant,
                    -1,
                    accumulator[3 * i].additive_constant + accumulator[3 * i + 1].additive_constant +
                        accumulator[3 * i + 2].additive_constant,
                },
                ((i == num_gates - 1) ? false : true));
            bb::fr new_total = accumulating_total.get_value() - accumulator[3 * i].get_value() -
                               accumulator[3 * i + 1].get_value() - accumulator[3 * i + 2].get_value();
            accumulating_total = witness_t<Builder>(ctx, new_total);
        }
        OriginTag new_tag{};
        for (const auto& single_input : input) {
            new_tag = OriginTag(new_tag, single_input.tag);
        }
        total.tag = new_tag;
        return total.normalize();
    }
    field_t<Builder> total;
    for (const auto& item : input) {
        total += item;
    }
    return total;
}

template <typename Builder>
std::array<field_t<Builder>, 3> field_t<Builder>::slice(const uint8_t msb, const uint8_t lsb) const
{
    ASSERT(msb >= lsb);
    ASSERT(msb < grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH);
    const field_t lhs = *this;
    Builder* ctx = lhs.get_context();

    const uint256_t value = uint256_t(get_value());
    const auto msb_plus_one = uint32_t(msb) + 1;
    const auto hi_mask = ((uint256_t(1) << (256 - uint32_t(msb))) - 1);
    const auto hi = (value >> msb_plus_one) & hi_mask;

    const auto lo_mask = (uint256_t(1) << lsb) - 1;
    const auto lo = value & lo_mask;

    const auto slice_mask = ((uint256_t(1) << (uint32_t(msb - lsb) + 1)) - 1);
    const auto slice = (value >> lsb) & slice_mask;

    const field_t hi_wit = field_t(witness_t(ctx, hi));
    const field_t lo_wit = field_t(witness_t(ctx, lo));
    const field_t slice_wit = field_t(witness_t(ctx, slice));

    hi_wit.create_range_constraint(grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH - uint32_t(msb),
                                   "slice: hi value too large.");
    lo_wit.create_range_constraint(lsb, "slice: lo value too large.");
    slice_wit.create_range_constraint(msb_plus_one - lsb, "slice: sliced value too large.");
    assert_equal(
        ((hi_wit * field_t(uint256_t(1) << msb_plus_one)) + lo_wit + (slice_wit * field_t(uint256_t(1) << lsb))));

    std::array<field_t, 3> result = { lo_wit, slice_wit, hi_wit };
    for (size_t i = 0; i < 3; i++) {
        result[i].tag = tag;
    }
    return result;
}

/**
 * @brief Build a circuit allowing a user to prove that they have decomposed `this` into bits.
 *
 * @details A bit vector `result` is extracted and used to to construct a sum `sum` using the normal binary expansion.
 * Along the way, we extract a value `shifted_high_limb` which is equal to `sum_hi` in the natural decomposition
 *          `sum = sum_lo + 2**128*sum_hi`.
 * We impose a copy constraint between `sum` and `this` but that only imposes equality in `Fr`; it could be that
 * `result` has overflowed the modulus `r`. To impose a unique value of `result`, we constrain `sum` to satisfy `r - 1
 * >= sum >= 0`. In order to do this inside of `Fr`, we must reduce break the check down in the smaller checks so that
 * we can check non-negativity of integers using range constraints in Fr.
 *
 * At circuit compilation time we build the decomposition `r - 1 = p_lo + 2**128*p_hi`. Then desired schoolbook
 * subtraction is
 *                 p_hi - b       |        p_lo + b*2**128         (++foo++ is foo crossed out)
 *                 ++p_hi++       |           ++p_lo++               (b = 0, 1)
 *            -                   |
 *                  sum_hi        |             sum_lo
 *         -------------------------------------------------
 *     y_lo := p_hi - b - sum_hi  |  y_hi :=  p_lo + b*2**128 - sum_lo
 *
 * Here `b` is the boolean "a carry is necessary". Each of the resulting values can be checked for underflow by imposing
 * a small range constraint, since the negative of a small value in `Fr` is a large value in `Fr`.
 */
template <typename Builder>
std::vector<bool_t<Builder>> field_t<Builder>::decompose_into_bits(
    const std::function<witness_t<Builder>(Builder*, uint64_t, uint256_t)> get_bit) const
{
    static constexpr size_t num_bits = 256;
    ASSERT(num_bits == 256);
    static constexpr size_t midpoint = num_bits / 2 - 1;
    std::vector<bool_t<Builder>> result(num_bits);

    const uint256_t val_u256 = static_cast<uint256_t>(get_value());
    field_t<Builder> sum(context, 0);
    field_t<Builder> shifted_high_limb(context, 0); // will equal high 128 bits, left shifted by 128 bits
    for (size_t i = 0; i < num_bits; ++i) {
        bool_t<Builder> bit = get_bit(context, num_bits - 1 - i, val_u256);
        bit.set_origin_tag(tag);
        result[num_bits - 1 - i] = bit;
        bb::fr scaling_factor_value = fr(2).pow(static_cast<uint64_t>(num_bits - 1 - i));
        field_t<Builder> scaling_factor(context, scaling_factor_value);

        sum = sum + (scaling_factor * bit);
        if (i == midpoint) {
            shifted_high_limb = sum;
        }
    }

    this->assert_equal(sum); // `this` and `sum` are both normalized here.

    // If value can be larger than modulus we must enforce unique representation
    constexpr uint256_t modulus_minus_one = fr::modulus - 1;
    auto modulus_bits = modulus_minus_one.get_msb() + 1;
    if (num_bits >= modulus_bits) {
        // r - 1 = p_lo + 2**128 * p_hi
        const fr p_lo = modulus_minus_one.slice(0, 128);
        const fr p_hi = modulus_minus_one.slice(128, 256);

        // `shift` is used to shift high limbs. It has the dual purpose of representing a borrowed bit.
        const fr shift = fr(uint256_t(1) << 128);
        // We always borrow from 2**128*p_hi. We handle whether this was necessary later.
        // y_lo = (2**128 + p_lo) - sum_lo
        field_t<Builder> y_lo = (-sum) + (p_lo + shift);
        y_lo += shifted_high_limb;

        // A carry was necessary if and only if the 128th bit y_lo_hi of y_lo is 0.
        auto [y_lo_lo, y_lo_hi, zeros] = y_lo.slice(128, 128);
        // This copy constraint, along with the constraints of field_t::slice, imposes that y_lo has bit length 129.
        // Since the integer y_lo is at least -2**128+1, which has more than 129 bits in `Fr`, the implicit range
        // constraint shows that y_lo is non-negative.
        context->assert_equal(
            zeros.witness_index, context->zero_idx, "field_t: bit decomposition_fails: high limb non-zero");
        // y_borrow is the boolean "a carry was necessary"
        field_t<Builder> y_borrow = -(y_lo_hi - 1);
        // If a carry was necessary, subtract that carry from p_hi
        // y_hi = (p_hi - y_borrow) - sum_hi
        field_t<Builder> y_hi = -(shifted_high_limb / shift) + (p_hi);
        y_hi -= y_borrow;
        // As before, except that now the range constraint is explicit, this shows that y_hi is non-negative.
        y_hi.create_range_constraint(128, "field_t: bit decomposition fails: y_hi is too large.");
    }

    return result;
}

template class field_t<bb::UltraCircuitBuilder>;
template class field_t<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
