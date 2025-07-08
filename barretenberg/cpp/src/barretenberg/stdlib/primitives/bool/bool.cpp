// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "bool.hpp"
#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

using namespace bb;

namespace bb::stdlib {

/**
 * @brief Construct a constant `bool_t` object from a `bool` value
 */
template <typename Builder>
bool_t<Builder>::bool_t(const bool value)
    : witness_bool(value)
{}

/**
 * @brief Construct a constant `bool_t` object with a given Builder argument, its value is `false`.
 */
template <typename Builder>
bool_t<Builder>::bool_t(Builder* parent_context)
    : context(parent_context)
{}

/**
 * @brief Construct a `bool_t` object from a witness, note that the value stored at `witness_index` is constrained to be
 * 0 or 1.
 */
template <typename Builder>
bool_t<Builder>::bool_t(const witness_t<Builder>& value)
    : context(value.context)
{
    ASSERT((value.witness == bb::fr::zero()) || (value.witness == bb::fr::one()),
           "bool_t: witness value is not 0 or 1");
    witness_index = value.witness_index;
    // Constrain x := other.witness by the relation x^2 = x
    context->create_bool_gate(witness_index);
    witness_bool = (value.witness == bb::fr::one());
    witness_inverted = false;
    set_free_witness_tag();
}
/**
 * @brief Construct a constant `bool_t` object from a `bool` value with a given Builder argument.
 */
template <typename Builder>
bool_t<Builder>::bool_t(Builder* parent_context, const bool value)
    : context(parent_context)
    , witness_bool(value)
{}

/**
 * @brief Copy constructor
 */
template <typename Builder>
bool_t<Builder>::bool_t(const bool_t<Builder>& other)
    : context(other.context)
    , witness_bool(other.witness_bool)
    , witness_inverted(other.witness_inverted)
    , witness_index(other.witness_index)
    , tag(other.tag)
{}

/**
 * @brief Move constructor
 */
template <typename Builder>
bool_t<Builder>::bool_t(bool_t<Builder>&& other)
    : context(other.context)
    , witness_bool(other.witness_bool)
    , witness_inverted(other.witness_inverted)
    , witness_index(other.witness_index)
    , tag(other.tag)
{}

/**
 * @brief Assigns a native `bool` to `bool_t` object.
 */
template <typename Builder> bool_t<Builder>& bool_t<Builder>::operator=(const bool other)
{
    context = nullptr;
    witness_index = IS_CONSTANT;
    witness_bool = other;
    witness_inverted = false;
    return *this;
}

/**
 * @brief Assigns a `bool_t` to a `bool_t` object.
 */
template <typename Builder> bool_t<Builder>& bool_t<Builder>::operator=(const bool_t& other)
{
    context = other.context;
    witness_index = other.witness_index;
    witness_bool = other.witness_bool;
    witness_inverted = other.witness_inverted;
    tag = other.tag;
    return *this;
}

/**
 * @brief Assigns a `bool_t` to a `bool_t` object.
 */
template <typename Builder> bool_t<Builder>& bool_t<Builder>::operator=(bool_t&& other)
{
    context = other.context;
    witness_index = other.witness_index;
    witness_bool = other.witness_bool;
    witness_inverted = other.witness_inverted;
    tag = other.tag;
    return *this;
}
/**
 * @brief Assigns a `witness_t` to a `bool_t`. As above,  he value stored at `witness_index` is constrained to be
 * 0 or 1.
 */
template <typename Builder> bool_t<Builder>& bool_t<Builder>::operator=(const witness_t<Builder>& other)
{
    ASSERT((other.witness == bb::fr::one()) || (other.witness == bb::fr::zero()));
    context = other.context;
    witness_bool = other.witness == bb::fr::one();
    witness_index = other.witness_index;
    witness_inverted = false;
    // Constrain x := other.witness by the relation x^2 = x
    context->create_bool_gate(witness_index);
    set_free_witness_tag();
    return *this;
}

/**
 * @brief Implements AND in circuit
 */
template <typename Builder> bool_t<Builder> bool_t<Builder>::operator&(const bool_t& other) const
{
    bool_t<Builder> result(context ? context : other.context);
    bool left = witness_inverted ^ witness_bool;
    bool right = other.witness_inverted ^ other.witness_bool;
    result.witness_bool = left && right;

    ASSERT(result.context || (is_constant() && other.is_constant()));
    if (!is_constant() && !other.is_constant()) {
        bb::fr value = result.witness_bool ? bb::fr::one() : bb::fr::zero();
        result.witness_index = context->add_variable(value);

        /**
         * A bool can be represented by a witness value `w` and an 'inverted' flag `i`
         *
         * A bool's value is defined via the equation:
         *      w + i - 2.i.w
         *
         * | w | i | w + i - 2.i.w |
         * | - | - | ------------- |
         * | 0 | 0 |       0       |
         * | 0 | 1 |       1       |
         * | 1 | 0 |       1       |
         * | 1 | 1 |       0       |
         *
         * For two bools (w_a, i_a), (w_b, i_b), the & operation is expressed as:
         *
         *   (w_a + i_a - 2.i_a.w_a).(w_b + i_b - 2.i_b.w_b)
         *
         * This can be rearranged to:
         *
         *      w_a.w_b.(1 - 2.i_b - 2.i_a + 4.i_a.i_b)     -> q_m coefficient
         *    + w_a.(i_b.(1 - 2.i_a))                       -> q_1 coefficient
         *    + w_b.(i_a.(1 - 2.i_b))                       -> q_2 coefficient
         *    + i_a.i_b                                     -> q_c coefficient
         *
         * Note that since the value of the product above is always boolean, we don't need to add an explicit range
         * constraint for `result`.
         **/

        int i_a(static_cast<int>(witness_inverted));
        int i_b(static_cast<int>(other.witness_inverted));

        fr q_m{ 1 - 2 * i_b - 2 * i_a + 4 * i_a * i_b };
        fr q_l{ i_b * (1 - 2 * i_a) };
        fr q_r{ i_a * (1 - 2 * i_b) };
        fr q_o{ -1 };
        fr q_c{ i_a * i_b };

        context->create_poly_gate(
            { witness_index, other.witness_index, result.witness_index, q_m, q_l, q_r, q_o, q_c });
    } else if (!is_constant() && other.is_constant()) {
        ASSERT(!other.witness_inverted);
        // If rhs is a constant true, the output is determined by the lhs. Otherwise the output is a constant
        // `false`.
        result = other.witness_bool ? *this : other;

    } else if (is_constant() && !other.is_constant()) {
        ASSERT(!witness_inverted);
        // If lhs is a constant true, the output is determined by the rhs. Otherwise the output is a constant
        // `false`.
        result = witness_bool ? other : *this;
    }

    result.tag = OriginTag(tag, other.tag);
    return result;
}

/**
 * @brief Implements OR in circuit
 */
template <typename Builder> bool_t<Builder> bool_t<Builder>::operator|(const bool_t& other) const
{
    bool_t<Builder> result(context ? context : other.context);

    ASSERT(result.context || (is_constant() && other.is_constant()));

    result.witness_bool = (witness_bool ^ witness_inverted) | (other.witness_bool ^ other.witness_inverted);
    bb::fr value = result.witness_bool ? bb::fr::one() : bb::fr::zero();
    if (!is_constant() && !other.is_constant()) {
        result.witness_index = context->add_variable(value);
        // Let
        //      a := lhs = *this;
        //      b := rhs = other;
        // The result is given by
        //      a + b - a * b =  [-(1 - 2*i_a) * (1 - 2*i_b)] * w_a w_b +
        //                        [(1 - 2 * i_a) * (1 - i_b)] * w_a
        //                        [(1 - 2 * i_b) * (1 - i_a)] * w_b
        //                            [i_a + i_b - i_a * i_b] * 1
        const int rhs_inverted = static_cast<int>(other.witness_inverted);
        const int lhs_inverted = static_cast<int>(witness_inverted);

        bb::fr q_m{ -(1 - 2 * rhs_inverted) * (1 - 2 * lhs_inverted) };
        bb::fr q_l{ (1 - 2 * lhs_inverted) * (1 - rhs_inverted) };
        bb::fr q_r{ (1 - lhs_inverted) * (1 - 2 * rhs_inverted) };
        bb::fr q_o{ bb::fr::neg_one() };
        bb::fr q_c{ rhs_inverted + lhs_inverted - rhs_inverted * lhs_inverted };

        // Let r := a | b;
        // Constrain
        //      q_m * w_a * w_b + q_l * w_a + q_r * w_b + q_o * r + q_c = 0
        context->create_poly_gate(
            { witness_index, other.witness_index, result.witness_index, q_m, q_l, q_r, q_o, q_c });
    } else if (!is_constant() && other.is_constant()) {
        ASSERT(other.witness_inverted == false);

        // If we are computing a | b and b is a constant `true`, the result is a constant `true` that does not
        // depend on `a`.
        result = other.witness_bool ? other : *this;

    } else if (is_constant() && !other.is_constant()) {
        // If we are computing a | b and `a` is a constant `true`, the result is a constant `true` that does not
        // depend on `b`.
        ASSERT(witness_inverted == false);
        result = witness_bool ? *this : other;
    }
    result.tag = OriginTag(tag, other.tag);
    return result;
}

/**
 * @brief Implements XOR in circuit.
 */
template <typename Builder> bool_t<Builder> bool_t<Builder>::operator^(const bool_t& other) const
{
    bool_t<Builder> result(context == nullptr ? other.context : context);

    ASSERT(result.context || (is_constant() && other.is_constant()));

    result.witness_bool = (witness_bool ^ witness_inverted) ^ (other.witness_bool ^ other.witness_inverted);
    bb::fr value = result.witness_bool ? bb::fr::one() : bb::fr::zero();

    if (!is_constant() && !other.is_constant()) {
        result.witness_index = context->add_variable(value);
        // Let
        //      a := lhs = *this;
        //      b := rhs = other;
        // The result is given by
        //      a + b - 2 * a * b =    [-2 *(1 - 2*i_a) * (1 - 2*i_b)] * w_a w_b +
        //                          [(1 - 2 * i_a) * (1 - 2 * i_b)] * w_a
        //                          [(1 - 2 * i_b) * (1 - 2 * i_a)] * w_b
        //                              [i_a + i_b - 2 * i_a * i_b] * 1]
        const int rhs_inverted = static_cast<int>(other.witness_inverted);
        const int lhs_inverted = static_cast<int>(witness_inverted);
        // Compute the value that's being used in several selectors
        const int aux_prod = (1 - 2 * rhs_inverted) * (1 - 2 * lhs_inverted);

        bb::fr q_m{ -2 * aux_prod };
        bb::fr q_l{ aux_prod };
        bb::fr q_r{ aux_prod };
        bb::fr q_o{ bb::fr::neg_one() };
        bb::fr q_c{ lhs_inverted + rhs_inverted - 2 * rhs_inverted * lhs_inverted };

        // Let r := a ^ b;
        // Constrain
        //      q_m * w_a * w_b + q_l * w_a + q_r * w_b + q_o * r + q_c = 0
        context->create_poly_gate(
            { witness_index, other.witness_index, result.witness_index, q_m, q_l, q_r, q_o, q_c });
    } else if (!is_constant() && other.is_constant()) {
        // witness ^ 1 = !witness
        ASSERT(other.witness_inverted == false);
        result = other.witness_bool ? !*this : *this;

    } else if (is_constant() && !other.is_constant()) {
        ASSERT(witness_inverted == false);
        result = witness_bool ? !other : other;
    }
    result.tag = OriginTag(tag, other.tag);
    return result;
}
/**
 * @brief Implements negation in circuit.
 */
template <typename Builder> bool_t<Builder> bool_t<Builder>::operator!() const
{
    bool_t<Builder> result(*this);
    if (result.is_constant()) {
        ASSERT(!witness_inverted);
        // Negate the value of a constant bool_t element.
        result.witness_bool = !result.witness_bool;
    } else {
        // Negate the `inverted` flag of a witnees bool_t element.
        result.witness_inverted = !result.witness_inverted;
    }
    return result;
}

/**
 * @brief Implements equality operator in circuit.
 */
template <typename Builder> bool_t<Builder> bool_t<Builder>::operator==(const bool_t& other) const
{
    ASSERT(context || other.context || (is_constant() && other.is_constant()));
    bool_t<Builder> result(context ? context : other.context);

    result.witness_bool = (witness_bool ^ witness_inverted) == (other.witness_bool ^ other.witness_inverted);
    if (!is_constant() && !other.is_constant()) {
        const bb::fr value = result.witness_bool ? bb::fr::one() : bb::fr::zero();

        result.witness_index = context->add_variable(value);

        // Let
        //      a := lhs = *this;
        //      b := rhs = other;
        // The result is given by
        //      1 - a  - b + 2 a * b =   [2 *(1 - 2*i_a) * (1 - 2*i_b)] * w_a w_b +
        //                             [-(1 - 2 * i_a) * (1 - 2 * i_b)] * w_a +
        //                             [-(1 - 2 * i_b) * (1 - 2 * i_a)] * w_b +
        //                              [1 - i_a - i_b + 2 * i_a * i_b] * 1
        const int rhs_inverted = static_cast<int>(other.witness_inverted);
        const int lhs_inverted = static_cast<int>(witness_inverted);
        // Compute the value that's being used in several selectors
        const int aux_prod = (1 - 2 * rhs_inverted) * (1 - 2 * lhs_inverted);
        bb::fr q_m{ 2 * aux_prod };
        bb::fr q_l{ -aux_prod };
        bb::fr q_r{ -aux_prod };
        bb::fr q_o{ bb::fr::neg_one() };
        bb::fr q_c{ 1 - lhs_inverted - rhs_inverted + 2 * rhs_inverted * lhs_inverted };

        context->create_poly_gate(
            { witness_index, other.witness_index, result.witness_index, q_m, q_r, q_l, q_o, q_c });

    } else if (!is_constant() && (other.is_constant())) {
        // Compare *this with a constant other. If other == true, then we're checking *this == true. In this case we
        // propagate *this without adding extra constraints, otherwise (if other = false), we propagate !*this.
        ASSERT(other.witness_inverted == false);
        result = other.witness_bool ? *this : !(*this);
    } else if (is_constant() && !other.is_constant()) {
        // Completely analogous to the previous case.
        ASSERT(witness_inverted == false);
        result = witness_bool ? other : !other;
    }

    result.tag = OriginTag(tag, other.tag);
    return result;
}
/**
 * @brief Implements the `not equal` operator in circuit.
 */
template <typename Builder> bool_t<Builder> bool_t<Builder>::operator!=(const bool_t<Builder>& other) const
{
    return operator^(other);
}

template <typename Builder> bool_t<Builder> bool_t<Builder>::operator&&(const bool_t<Builder>& other) const
{
    return operator&(other);
}

template <typename Builder> bool_t<Builder> bool_t<Builder>::operator||(const bool_t<Builder>& other) const
{
    return operator|(other);
}

/**
 * @brief Implements copy constraint for `bool_t` elements.
 */
template <typename Builder> void bool_t<Builder>::assert_equal(const bool_t& rhs, std::string const& msg) const
{
    const bool_t lhs = *this;
    Builder* ctx = lhs.get_context() ? lhs.get_context() : rhs.get_context();
    (void)OriginTag(get_origin_tag(), rhs.get_origin_tag());
    if (lhs.is_constant() && rhs.is_constant()) {
        ASSERT(lhs.get_value() == rhs.get_value());
    } else if (lhs.is_constant()) {
        ASSERT(!lhs.witness_inverted);
        // if rhs is inverted, flip the value of the lhs constant
        const bool lhs_value = rhs.witness_inverted ? !lhs.witness_bool : lhs.witness_bool;
        ctx->assert_equal_constant(rhs.witness_index, lhs_value, msg);
    } else if (rhs.is_constant()) {
        ASSERT(!rhs.witness_inverted);
        // if lhs is inverted, flip the value of the rhs constant
        const bool rhs_value = lhs.witness_inverted ? !rhs.witness_bool : rhs.witness_bool;
        ctx->assert_equal_constant(lhs.witness_index, rhs_value, msg);
    } else {
        bool_t left = lhs;
        bool_t right = rhs;
        // we need to normalize iff lhs or rhs has an inverted witness (but not both)
        if (lhs.witness_inverted ^ rhs.witness_inverted) {
            left = left.normalize();
            right = right.normalize();
        }
        ctx->assert_equal(left.witness_index, right.witness_index, msg);
    }
}

/**
 * @brief Implements the ternary operator - if predicate == true then return lhs, else return rhs
 */
template <typename Builder>
bool_t<Builder> bool_t<Builder>::conditional_assign(const bool_t<Builder>& predicate,
                                                    const bool_t& lhs,
                                                    const bool_t& rhs)
{
    if (predicate.is_constant()) {
        auto result = bool_t(predicate.get_value() ? lhs : rhs);
        result.set_origin_tag(OriginTag(predicate.get_origin_tag(), lhs.get_origin_tag(), rhs.get_origin_tag()));
        return result;
    }

    bool same = lhs.witness_index == rhs.witness_index;
    bool witness_same = same && !lhs.is_constant() && (lhs.witness_inverted == rhs.witness_inverted);
    bool const_same = same && lhs.is_constant() && (lhs.witness_bool == rhs.witness_bool);
    if (witness_same || const_same) {
        return lhs;
    }
    return (predicate && lhs) || (!predicate && rhs);
}

/**
 * @brief Implements implication operator in circuit.
 */
template <typename Builder> bool_t<Builder> bool_t<Builder>::implies(const bool_t<Builder>& other) const
{
    // Thanks to negation operator being free, this computation requires at most 1 gate.
    return (!(*this) || other); // P => Q is equiv. to !P || Q (not(P) or Q).
}

/**
 * @brief Constrains the (a => b) == true.
 */
template <typename Builder> void bool_t<Builder>::must_imply(const bool_t& other, std::string const& msg) const
{
    implies(other).assert_equal(true, msg);
}

/**
 @brief Implements a "double-implication" (<=>), a.k.a "iff", a.k.a. "biconditional"
 */
template <typename Builder> bool_t<Builder> bool_t<Builder>::implies_both_ways(const bool_t<Builder>& other) const
{
    return !((*this) ^ other); // P <=> Q is equiv. to !(P ^ Q) (not(P xor Q)).
}

/**
 * @brief A bool_t element is **normalized** if `witness_inverted == false`. For a given `*this`, output its normalized
 * version.
 * @warning  The witness index of *this as well as its `witness_inverted` flag are re-written.
 */
template <typename Builder> bool_t<Builder> bool_t<Builder>::normalize() const
{
    if (is_constant()) {
        ASSERT(!witness_inverted);
        return *this;
    }

    if (!witness_inverted) {
        return *this;
    }
    // Let a := *this, need to constrain a = a_norm
    // [1 - 2 i_a] w_a + [-1] w_a_norm + [i_a] = 0
    //       ^             ^               ^
    //      q_l           q_o             q_c
    const bool value = witness_bool ^ witness_inverted;

    uint32_t new_witness = context->add_variable(bb::fr{ static_cast<int>(value) });

    const int inverted = static_cast<int>(witness_inverted);
    bb::fr q_l{ 1 - 2 * inverted };
    bb::fr q_c{ inverted };
    bb::fr q_o = bb::fr::neg_one();
    bb::fr q_m = bb::fr::zero();
    bb::fr q_r = bb::fr::zero();
    context->create_poly_gate({ witness_index, witness_index, new_witness, q_m, q_l, q_r, q_o, q_c });

    witness_index = new_witness;
    witness_bool = value;
    witness_inverted = false;
    return *this;
}

/**
 * Create a witness from a constant. This way the value of the witness is fixed and public (public, because the
 * value becomes hard-coded as an element of the q_c selector vector).
 */
template <typename Builder> void bool_t<Builder>::convert_constant_to_fixed_witness(Builder* ctx)
{
    ASSERT(is_constant() && ctx);
    context = ctx;
    (*this) = bool_t<Builder>(witness_t<Builder>(context, get_value()));
    context->fix_witness(witness_index, get_value());
    unset_free_witness_tag();
}

template class bool_t<bb::UltraCircuitBuilder>;
template class bool_t<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
