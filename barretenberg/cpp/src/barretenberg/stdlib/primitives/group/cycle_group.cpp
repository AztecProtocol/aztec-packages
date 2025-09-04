// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "../field/field.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "./cycle_group.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
namespace bb::stdlib {

/**
 * @brief Construct a new cycle group<Builder>::cycle group object
 * defaults to a constant point at infinity.
 *
 * @note Please don't use this constructor in case you want to assign the
 * coordinates later.
 */
// WORKTODO: is this fuzzer only logic? if so lets mark it accordingly e.g. with sig (Builder* _context, FUZZER_ONLY)
template <typename Builder>
cycle_group<Builder>::cycle_group(Builder* _context)
    : x(0)
    , y(0)
    , _is_infinity(true)
    , _is_constant(true)
    , _is_standard(true)
    , context(_context)
{}

/**
 * @brief Construct a new cycle group<Builder>::cycle group object
 *
 * @param _x
 * @param _y
 * @param is_infinity
 */
template <typename Builder>
cycle_group<Builder>::cycle_group(field_t _x, field_t _y, bool_t is_infinity)
    : x(_x.normalize())
    , y(_y.normalize())
    , _is_infinity(is_infinity)
    , _is_constant(_x.is_constant() && _y.is_constant() && is_infinity.is_constant())
    , _is_standard(is_infinity.is_constant())
{
    if (_x.get_context() != nullptr) {
        context = _x.get_context();
    } else if (_y.get_context() != nullptr) {
        context = _y.get_context();
    } else {
        context = is_infinity.get_context();
    }

    if (is_infinity.is_constant() && is_infinity.get_value()) {
        this->x = 0;
        this->y = 0;
        this->_is_infinity = true;
        this->_is_constant = true;
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1067): This ASSERT is missing in the constructor but
    // causes schnorr acir test to fail due to a bad input (a public key that has x and y coordinate set to 0).
    // Investigate this to be able to enable the test.
    // ASSERT(get_value().on_curve());
}

/**
 * @brief Construct a new cycle group<Builder>::cycle group object
 *
 * @details is_infinity is a circuit constant. We EXPLICITLY require that whether this point is infinity/not infinity is
 * known at circuit-construction time *and* we know this point is on the curve. These checks are not constrained.
 * Use from_witness if these conditions are not met.
 * Examples of when conditions are met: point is a derived from a point that is on the curve + not at infinity.
 * e.g. output of a doubling operation
 * @tparam Builder
 * @param _x
 * @param _y
 * @param is_infinity
 */
template <typename Builder>
cycle_group<Builder>::cycle_group(const FF& _x, const FF& _y, bool is_infinity)
    : x(is_infinity ? 0 : _x)
    , y(is_infinity ? 0 : _y)
    , _is_infinity(is_infinity)
    , _is_constant(true)
    , _is_standard(true)
    , context(nullptr)
{
    ASSERT(get_value().on_curve());
}

/**
 * @brief Construct a cycle_group object out of an AffineElement object
 *
 * @note This produces a circuit-constant object i.e. known at compile-time, no constraints.
 *       If `_in` is not fixed for a given circuit, use `from_witness` instead
 *
 * @details ensures the representation of point at infinity is consistent
 * @tparam Builder
 * @param _in
 */
template <typename Builder>
cycle_group<Builder>::cycle_group(const AffineElement& _in)
    : x(_in.is_point_at_infinity() ? 0 : _in.x)
    , y(_in.is_point_at_infinity() ? 0 : _in.y)
    , _is_infinity(_in.is_point_at_infinity())
    , _is_constant(true)
    , _is_standard(true)
    , context(nullptr)
{}

/**
 * @brief Construct a cycle_group representation of Group::one.
 *
 * @tparam Builder
 * @param _context
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::one(Builder* _context)
{
    field_t x(_context, Group::one.x);
    field_t y(_context, Group::one.y);
    return cycle_group<Builder>(x, y, /*is_infinity=*/false);
}

/**
 * @brief Converts an AffineElement into a circuit witness.
 *
 * @details Somewhat expensive as we do an on-curve check and `_is_infinity` is a witness and not a constant.
 *          If an element is being converted where it is known the element is on the curve and/or cannot be point at
 *          infinity, it is best to use other methods (e.g. direct conversion of field_t coordinates)
 *
 * @tparam Builder
 * @param _context
 * @param _in
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::from_witness(Builder* _context, const AffineElement& _in)
{
    cycle_group result(_context);

    // Point at infinity's coordinates break our arithmetic
    // Since we are not using these coordinates anyway
    // We can set them both to be zero
    if (_in.is_point_at_infinity()) {
        result.x = field_t(witness_t(_context, FF::zero()));
        result.y = field_t(witness_t(_context, FF::zero()));
    } else {
        result.x = field_t(witness_t(_context, _in.x));
        result.y = field_t(witness_t(_context, _in.y));
    }
    result._is_infinity = bool_t(witness_t(_context, _in.is_point_at_infinity()));
    result._is_constant = false;
    result._is_standard = true;
    result.validate_is_on_curve();
    result.set_free_witness_tag();
    return result;
}

/**
 * @brief Converts a native AffineElement into a witness, but constrains the witness values to be known constants.
 *
 * @details When performing group operations where one operand is a witness and one is a constant,
 * it can be more efficient to convert the constant element into a witness. This is because we have custom gates
 * that evaluate additions in one constraint, but only if both operands are witnesses.
 *
 * @tparam Builder
 * @param _context
 * @param _in
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::from_constant_witness(Builder* _context, const AffineElement& _in)
{
    cycle_group result(_context);

    // Point at infinity's coordinates break our arithmetic
    // Since we are not using these coordinates anyway
    // We can set them both to be zero
    if (_in.is_point_at_infinity()) {
        result.x = FF::zero();
        result.y = FF::zero();
        result._is_constant = true;
    } else {
        result.x = field_t(witness_t(_context, _in.x));
        result.y = field_t(witness_t(_context, _in.y));
        result.x.assert_equal(result.x.get_value());
        result.y.assert_equal(result.y.get_value());
        result._is_constant = false;
    }
    // point at infinity is circuit constant
    result._is_infinity = _in.is_point_at_infinity();
    result._is_standard = true;
    result.unset_free_witness_tag();
    return result;
}

template <typename Builder> Builder* cycle_group<Builder>::get_context(const cycle_group& other) const
{
    if (get_context() != nullptr) {
        return get_context();
    }
    return other.get_context();
}

template <typename Builder> typename cycle_group<Builder>::AffineElement cycle_group<Builder>::get_value() const
{
    AffineElement result(x.get_value(), y.get_value());
    if (is_point_at_infinity().get_value()) {
        result.self_set_infinity();
    }
    return result;
}

/**
 * @brief On-curve check.
 *
 * @tparam Builder
 */
template <typename Builder> void cycle_group<Builder>::validate_is_on_curve() const
{
    // This class is for short Weierstrass curves only!
    static_assert(Group::curve_a == 0);
    auto xx = x * x;
    auto xxx = xx * x;
    auto res = y.madd(y, -xxx - Group::curve_b);
    // if the point is marked as the point at infinity, then res should be changed to 0, but otherwise, we leave res
    // unchanged from the original value
    res *= !is_point_at_infinity();
    res.assert_is_zero();
}
/**
 * @brief  Get point in standard form. If the point is a point at infinity, ensure the coordinates are (0,0)
 *
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::get_standard_form()
{
    this->standardize();
    return *this;
}

/**
 * @brief  Set the point to the point at infinity.
 * Depending on constant'ness of the predicate put the coordinates in an apropriate standard form.
 *
 */
template <typename Builder> void cycle_group<Builder>::set_point_at_infinity(const bool_t& is_infinity)
{
    BB_ASSERT_EQ(this->x.is_constant() && this->y.is_constant() && this->_is_infinity.is_constant(),
                 this->_is_constant);

    this->_is_standard = true;

    if (is_infinity.is_constant() && this->_is_infinity.is_constant()) {
        // Check that it's not possible to enter the case when
        // The point is already infinity, but `is_infinity` = false
        ASSERT((this->_is_infinity.get_value() == is_infinity.get_value()) || is_infinity.get_value());

        if (is_infinity.get_value()) {
            this->x = 0;
            this->y = 0;
            this->_is_infinity = true;
            this->_is_constant = true;
        }
        return;
    }

    if (is_infinity.is_constant() && !this->_is_infinity.is_constant()) {
        if (is_infinity.get_value()) {
            this->x = 0;
            this->y = 0;
            this->_is_infinity = true;
            this->_is_constant = true;
        } else {
            this->_is_infinity.assert_equal(false);
            this->_is_infinity = false;
        }
        return;
    }

    if (this->_is_infinity.is_constant() && this->_is_infinity.get_value()) {
        // I can't imagine this case happening, but still
        is_infinity.assert_equal(true);

        this->x = 0;
        this->y = 0;
        this->_is_constant = true;
        return;
    }

    this->x = field_t::conditional_assign(is_infinity, 0, this->x).normalize();
    this->y = field_t::conditional_assign(is_infinity, 0, this->y).normalize();

    // We won't bump into the case where we end up with non constant coordinates
    ASSERT(!this->x.is_constant());
    ASSERT(!this->y.is_constant());
    this->_is_constant = false;

    // We have to check this to avoid the situation, where we change the infinity
    bool_t set_allowed = (this->_is_infinity == is_infinity) || is_infinity;
    set_allowed.assert_equal(true);
    this->_is_infinity = is_infinity;

    // In case we set point at infinity on a constant without an existing context
    if (this->context == nullptr) {
        this->context = is_infinity.get_context();
    }
}

/**
 * @brief Get the point to the standard form. If the point is a point at infinity, ensure the coordinates are (0,0)
 * If the point is already standard nothing changes
 *
 */
template <typename Builder> void cycle_group<Builder>::standardize()
{
    BB_ASSERT_EQ(this->x.is_constant() && this->y.is_constant() && this->_is_infinity.is_constant(),
                 this->_is_constant);
    if (this->_is_infinity.is_constant() && this->_is_infinity.get_value()) {
        ASSERT(this->_is_constant);
        ASSERT(this->_is_standard);
    }

    if (this->_is_standard) {
        return;
    }
    this->_is_standard = true;

    this->x = field_t::conditional_assign(this->_is_infinity, 0, this->x).normalize();
    this->y = field_t::conditional_assign(this->_is_infinity, 0, this->y).normalize();
}

/**
 * @brief Evaluates a doubling. Uses Ultra double gate
 *
 * @tparam Builder
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::dbl(const std::optional<AffineElement> hint) const
    requires IsUltraArithmetic<Builder>
{
    // ensure we use a value of y that is not zero. (only happens if point at infinity)
    // this costs 0 gates if `is_infinity` is a circuit constant
    auto modified_y = field_t::conditional_assign(is_point_at_infinity(), 1, y).normalize();

    // We have to return the point at infinity immediately
    // Cause in that very case the `modified_y` is a constant value, with witness_index = -1
    // Hence the following `create_ecc_dbl_gate` will throw an ASSERTION error
    if (this->is_point_at_infinity().is_constant() && this->is_point_at_infinity().get_value()) {
        return *this;
    }

    cycle_group result;
    if (hint.has_value()) {
        auto x3 = hint.value().x;
        auto y3 = hint.value().y;
        if (is_constant()) {
            result = cycle_group(x3, y3, is_point_at_infinity());
            // We need to manually propagate the origin tag
            result.set_origin_tag(get_origin_tag());

            return result;
        }

        result = cycle_group(witness_t(context, x3), witness_t(context, y3), is_point_at_infinity());
    } else {
        auto x1 = x.get_value();
        auto y1 = modified_y.get_value();

        // N.B. the formula to derive the witness value for x3 mirrors the formula in elliptic_relation.hpp
        // Specifically, we derive x^4 via the Short Weierstrass curve formula `y^2 = x^3 + b`
        // i.e. x^4 = x * (y^2 - b)
        // We must follow this pattern exactly to support the edge-case where the input is the point at infinity.
        auto y_pow_2 = y1.sqr();
        auto x_pow_4 = x1 * (y_pow_2 - Group::curve_b);
        auto lambda_squared = (x_pow_4 * 9) / (y_pow_2 * 4);
        auto lambda = (x1 * x1 * 3) / (y1 + y1);
        auto x3 = lambda_squared - x1 - x1;
        auto y3 = lambda * (x1 - x3) - y1;
        if (is_constant()) {
            auto result = cycle_group(x3, y3, is_point_at_infinity().get_value());
            // We need to manually propagate the origin tag
            result.set_origin_tag(get_origin_tag());
            return result;
        }

        result = cycle_group(witness_t(context, x3), witness_t(context, y3), is_point_at_infinity());
    }

    context->create_ecc_dbl_gate(bb::ecc_dbl_gate_<FF>{
        .x1 = x.get_witness_index(),
        .y1 = modified_y.get_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
    });

    // We need to manually propagate the origin tag
    result.x.set_origin_tag(OriginTag(x.get_origin_tag(), y.get_origin_tag()));
    result.y.set_origin_tag(OriginTag(x.get_origin_tag(), y.get_origin_tag()));
    return result;
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        Incomplete addition formula edge cases are *NOT* checked!
 *        Only use this method if you know the x-coordinates of the operands cannot collide
 *        and none of the operands is a point at infinity
 *        Ultra version that uses ecc group gate
 *
 * @tparam Builder
 * @param other
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::unconditional_add(const cycle_group& other,
                                                             const std::optional<AffineElement> hint) const
    requires IsUltraArithmetic<Builder>
{
    auto context = get_context(other);

    const bool lhs_constant = is_constant();
    const bool rhs_constant = other.is_constant();
    if (lhs_constant && !rhs_constant) {
        auto lhs = cycle_group::from_constant_witness(context, get_value());
        // We need to manually propagate the origin tag
        lhs.set_origin_tag(get_origin_tag());
        return lhs.unconditional_add(other, hint);
    }
    if (!lhs_constant && rhs_constant) {
        auto rhs = cycle_group::from_constant_witness(context, other.get_value());
        // We need to manually propagate the origin tag
        rhs.set_origin_tag(other.get_origin_tag());
        return unconditional_add(rhs, hint);
    }
    cycle_group result;
    if (hint.has_value()) {
        auto x3 = hint.value().x;
        auto y3 = hint.value().y;
        if (lhs_constant && rhs_constant) {
            return cycle_group(x3, y3, /*is_infinity=*/false);
        }
        result = cycle_group(witness_t(context, x3), witness_t(context, y3), /*is_infinity=*/false);
    } else {
        const auto p1 = get_value();
        const auto p2 = other.get_value();
        AffineElement p3(Element(p1) + Element(p2));
        if (lhs_constant && rhs_constant) {
            auto result = cycle_group(p3);
            // We need to manually propagate the origin tag
            result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
            return result;
        }
        field_t r_x(witness_t(context, p3.x));
        field_t r_y(witness_t(context, p3.y));
        result = cycle_group(r_x, r_y, /*is_infinity=*/false);
    }
    bb::ecc_add_gate_<FF> add_gate{
        .x1 = x.get_witness_index(),
        .y1 = y.get_witness_index(),
        .x2 = other.x.get_witness_index(),
        .y2 = other.y.get_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
        .sign_coefficient = 1,
    };
    context->create_ecc_add_gate(add_gate);

    // We need to manually propagate the origin tag (merging the tag of two inputs)
    result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
    return result;
}

/**
 * @brief will evaluate ECC point subtraction over `*this` and `other`.
 *        Incomplete addition formula edge cases are *NOT* checked!
 *        Only use this method if you know the x-coordinates of the operands cannot collide
 *        and none of the operands is a point at infinity
 *
 * @tparam Builder
 * @param other
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::unconditional_subtract(const cycle_group& other,
                                                                  const std::optional<AffineElement> hint) const
{
    if constexpr (!IS_ULTRA) {
        return unconditional_add(-other, hint);
    } else {
        auto context = get_context(other);

        const bool lhs_constant = is_constant();
        const bool rhs_constant = other.is_constant();

        if (lhs_constant && !rhs_constant) {
            auto lhs = cycle_group<Builder>::from_constant_witness(context, get_value());
            // We need to manually propagate the origin tag
            lhs.set_origin_tag(get_origin_tag());
            return lhs.unconditional_subtract(other, hint);
        }
        if (!lhs_constant && rhs_constant) {
            auto rhs = cycle_group<Builder>::from_constant_witness(context, other.get_value());
            // We need to manually propagate the origin tag
            rhs.set_origin_tag(other.get_origin_tag());
            return unconditional_subtract(rhs);
        }
        cycle_group result;
        if (hint.has_value()) {
            auto x3 = hint.value().x;
            auto y3 = hint.value().y;
            if (lhs_constant && rhs_constant) {
                return cycle_group(x3, y3, /*is_infinity=*/false);
            }
            result = cycle_group(witness_t(context, x3), witness_t(context, y3), /*is_infinity=*/false);
        } else {
            auto p1 = get_value();
            auto p2 = other.get_value();
            AffineElement p3(Element(p1) - Element(p2));
            if (lhs_constant && rhs_constant) {
                auto result = cycle_group(p3);
                // We need to manually propagate the origin tag
                result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
                return result;
            }
            field_t r_x(witness_t(context, p3.x));
            field_t r_y(witness_t(context, p3.y));
            result = cycle_group(r_x, r_y, /*is_infinity=*/false);
        }
        bb::ecc_add_gate_<FF> add_gate{
            .x1 = x.get_witness_index(),
            .y1 = y.get_witness_index(),
            .x2 = other.x.get_witness_index(),
            .y2 = other.y.get_witness_index(),
            .x3 = result.x.get_witness_index(),
            .y3 = result.y.get_witness_index(),
            .sign_coefficient = -1,
        };
        context->create_ecc_add_gate(add_gate);

        // We need to manually propagate the origin tag (merging the tag of two inputs)
        result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
        return result;
    }
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        Uses incomplete addition formula
 *        If incomplete addition formula edge cases are triggered (x-coordinates of operands collide),
 *        the constraints produced by this method will be unsatisfiable.
 *        Useful when an honest prover will not produce a point collision with overwhelming probability,
 *        but a cheating prover will be able to.
 *
 * @tparam Builder
 * @param other
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::checked_unconditional_add(const cycle_group& other,
                                                                     const std::optional<AffineElement> hint) const
{
    field_t x_delta = this->x - other.x;
    if (x_delta.is_constant()) {
        ASSERT(x_delta.get_value() != 0);
    } else {
        x_delta.assert_is_not_zero("cycle_group::checked_unconditional_add, x-coordinate collision");
    }
    return unconditional_add(other, hint);
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 *        Uses incomplete addition formula
 *        If incomplete addition formula edge cases are triggered (x-coordinates of operands collide),
 *        the constraints produced by this method will be unsatisfiable.
 *        Useful when an honest prover will not produce a point collision with overwhelming probability,
 *        but a cheating prover will be able to.
 *
 * @tparam Builder
 * @param other
 * @param hint : value of output point witness, if known ahead of time (used to avoid modular inversions during witgen)
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::checked_unconditional_subtract(const cycle_group& other,
                                                                          const std::optional<AffineElement> hint) const
{
    field_t x_delta = this->x - other.x;
    if (x_delta.is_constant()) {
        ASSERT(x_delta.get_value() != 0);
    } else {
        x_delta.assert_is_not_zero("cycle_group::checked_unconditional_subtract, x-coordinate collision");
    }
    return unconditional_subtract(other, hint);
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        This method uses complete addition i.e. is compatible with edge cases.
 *        Method is expensive due to needing to evaluate both an addition, a doubling,
 *        plus conditional logic to handle points at infinity.
 *
 * @tparam Builder
 * @param other
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator+(const cycle_group& other) const
{
    if (this->_is_infinity.is_constant() && this->_is_infinity.get_value()) {
        return other;
    }
    if (other._is_infinity.is_constant() && other._is_infinity.get_value()) {
        return *this;
    }

    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);
    const bool_t double_predicate = (x_coordinates_match && y_coordinates_match);
    const bool_t infinity_predicate = (x_coordinates_match && !y_coordinates_match);

    auto x1 = x;
    auto y1 = y;
    auto x2 = other.x;
    auto y2 = other.y;
    // if x_coordinates match, lambda triggers a divide by zero error.
    // Adding in `x_coordinates_match` ensures that lambda will always be well-formed
    auto x_diff = x2.add_two(-x1, x_coordinates_match);
    // Computes lambda = (y2-y1)/x_diff, using the fact that x_diff is never 0
    field_t lambda;
    if ((y1.is_constant() && y2.is_constant()) || x_diff.is_constant()) {
        lambda = (y2 - y1).divide_no_zero_check(x_diff);
    } else {
        lambda =
            field_t::from_witness(this->get_context(other), (y2.get_value() - y1.get_value()) / x_diff.get_value());
        // We need to manually propagate the origin tag
        lambda.set_origin_tag(OriginTag(x_diff.get_origin_tag(), y1.get_origin_tag(), y2.get_origin_tag()));
        field_t::evaluate_polynomial_identity(x_diff, lambda, -y2, y1);
    }

    auto x3 = lambda.madd(lambda, -(x2 + x1));
    auto y3 = lambda.madd(x1 - x3, -y1);
    cycle_group add_result(x3, y3, x_coordinates_match);

    auto dbl_result = dbl();

    // dbl if x_match, y_match
    // infinity if x_match, !y_match
    auto result_x = field_t::conditional_assign(double_predicate, dbl_result.x, add_result.x);
    auto result_y = field_t::conditional_assign(double_predicate, dbl_result.y, add_result.y);

    const bool_t lhs_infinity = is_point_at_infinity();
    const bool_t rhs_infinity = other.is_point_at_infinity();
    // if lhs infinity, return rhs
    result_x = field_t::conditional_assign(lhs_infinity, other.x, result_x);
    result_y = field_t::conditional_assign(lhs_infinity, other.y, result_y);

    // if rhs infinity, return lhs
    result_x = field_t::conditional_assign(rhs_infinity, x, result_x).normalize();
    result_y = field_t::conditional_assign(rhs_infinity, y, result_y).normalize();

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);

    return cycle_group(result_x, result_y, result_is_infinity);
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 *        This method uses complete addition i.e. is compatible with edge cases.
 *        Method is expensive due to needing to evaluate both an addition, a doubling,
 *        plus conditional logic to handle points at infinity.
 *
 * @tparam Builder
 * @param other
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator-(const cycle_group& other) const
{
    if (other._is_infinity.is_constant() && other._is_infinity.get_value()) {
        return *this;
    }
    if (this->_is_infinity.is_constant() && this->_is_infinity.get_value()) {
        return -other;
    }

    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);
    const bool_t double_predicate = (x_coordinates_match && !y_coordinates_match).normalize();
    const bool_t infinity_predicate = (x_coordinates_match && y_coordinates_match).normalize();
    if (!infinity_predicate.is_constant()) {
        infinity_predicate.get_context()->update_used_witnesses(infinity_predicate.get_normalized_witness_index());
    }
    auto x1 = x;
    auto y1 = y;
    auto x2 = other.x;
    auto y2 = other.y;
    auto x_diff = x2.add_two(-x1, x_coordinates_match);
    // Computes lambda = (-y2-y1)/x_diff, using the fact that x_diff is never 0
    field_t lambda;
    if ((y1.is_constant() && y2.is_constant()) || x_diff.is_constant()) {
        lambda = (-y2 - y1).divide_no_zero_check(x_diff);
    } else {
        lambda =
            field_t::from_witness(this->get_context(other), (-y2.get_value() - y1.get_value()) / x_diff.get_value());
        // We need to manually propagate the origin tag
        lambda.set_origin_tag(OriginTag(x_diff.get_origin_tag(), y1.get_origin_tag(), y2.get_origin_tag()));
        field_t::evaluate_polynomial_identity(x_diff, lambda, y2, y1);
    }

    auto x3 = lambda.madd(lambda, -(x2 + x1));
    auto y3 = lambda.madd(x1 - x3, -y1);
    cycle_group add_result(x3, y3, x_coordinates_match);

    auto dbl_result = dbl();

    // dbl if x_match, !y_match
    // infinity if x_match, y_match
    auto result_x = field_t::conditional_assign(double_predicate, dbl_result.x, add_result.x);
    auto result_y = field_t::conditional_assign(double_predicate, dbl_result.y, add_result.y);

    if constexpr (IsUltraBuilder<Builder>) {
        if (result_x.get_context()) {
            result_x.get_context()->update_used_witnesses(result_x.witness_index);
        }
        if (result_y.get_context()) {
            result_y.get_context()->update_used_witnesses(result_y.witness_index);
        }
    }

    const bool_t lhs_infinity = is_point_at_infinity();
    const bool_t rhs_infinity = other.is_point_at_infinity();
    // if lhs infinity, return -rhs
    result_x = field_t::conditional_assign(lhs_infinity, other.x, result_x);
    result_y = field_t::conditional_assign(lhs_infinity, (-other.y).normalize(), result_y);

    // if rhs infinity, return lhs
    result_x = field_t::conditional_assign(rhs_infinity, x, result_x).normalize();
    result_y = field_t::conditional_assign(rhs_infinity, y, result_y).normalize();

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    // n.b. can likely optimize this
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);

    return cycle_group(result_x, result_y, result_is_infinity);
}

/**
 * @brief Negates a point
 *
 * @tparam Builder
 * @param other
 * @return cycle_group<Builder>
 */
template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator-() const
{
    cycle_group result(*this);
    // We have to normalize immediately. All the methods, related to
    // elliptic curve operations, assume that the coordinates are in normalized form and
    // don't perform any extra normalizations
    result.y = (-y).normalize();
    return result;
}

template <typename Builder> cycle_group<Builder>& cycle_group<Builder>::operator+=(const cycle_group& other)
{
    *this = *this + other;
    return *this;
}

template <typename Builder> cycle_group<Builder>& cycle_group<Builder>::operator-=(const cycle_group& other)
{
    *this = *this - other;
    return *this;
}

/**
 * @brief Internal algorithm to perform a variable-base batch mul.
 *
 * @note Explicit assumption that all base_points are witnesses and not constants!
 *       Constant points must be filtered out by `batch_mul` before calling this.
 *
 * @details batch mul performed via the Straus multiscalar multiplication algorithm
 *          (optimal for MSMs where num points <128-ish).
 *          If Builder is not ULTRA, number of bits per Straus round = 1,
 *          which reduces to the basic double-and-add algorithm
 *
 * @details If `unconditional_add = true`, we use `::unconditional_add` instead of `::checked_unconditional_add`.
 *          Use with caution! Only should be `true` if we're doing an ULTRA fixed-base MSM so we know the points cannot
 *          collide with the offset generators.
 *
 * @note ULTRA Builder will call `_variable_base_batch_mul_internal` to evaluate fixed-base MSMs over points that do
 *       not exist in our precomputed plookup tables. This is a comprimise between maximising circuit efficiency and
 *       minimizing the blowup size of our precomputed table polynomials. variable-base mul uses small ROM lookup tables
 *       which are witness-defined and not part of the plookup protocol.
 * @tparam Builder
 * @param scalars
 * @param base_points
 * @param offset_generators
 * @param unconditional_add
 * @return cycle_group<Builder>::batch_mul_internal_output
 */
template <typename Builder>
typename cycle_group<Builder>::batch_mul_internal_output cycle_group<Builder>::_variable_base_batch_mul_internal(
    const std::span<cycle_scalar> scalars,
    const std::span<cycle_group> base_points,
    const std::span<AffineElement const> offset_generators,
    const bool unconditional_add)
{
    BB_ASSERT_EQ(scalars.size(), base_points.size());

    Builder* context = nullptr;
    for (auto& scalar : scalars) {
        if (scalar.lo.get_context() != nullptr) {
            context = scalar.get_context();
            break;
        }
    }
    for (auto& point : base_points) {
        if (point.get_context() != nullptr) {
            context = point.get_context();
            break;
        }
    }

    size_t num_bits = 0;
    for (auto& s : scalars) {
        num_bits = std::max(num_bits, s.num_bits());
    }
    size_t num_rounds = (num_bits + TABLE_BITS - 1) / TABLE_BITS;

    const size_t num_points = scalars.size();

    std::vector<straus_scalar_slice> scalar_slices;

    /**
     * Compute the witness values of the batch_mul algorithm natively, as Element types with a Z-coordinate.
     * We then batch-convert to AffineElement types, and feed these points as "hints" into the cycle_group methods.
     * This avoids the need to compute modular inversions for every group operation, which dramatically reduces witness
     * generation times
     */
    std::vector<Element> operation_transcript;
    std::vector<std::vector<Element>> native_straus_tables;
    Element offset_generator_accumulator = offset_generators[0];
    {
        for (size_t i = 0; i < num_points; ++i) {
            std::vector<Element> native_straus_table;
            native_straus_table.emplace_back(offset_generators[i + 1]);
            size_t table_size = 1ULL << TABLE_BITS;
            for (size_t j = 1; j < table_size; ++j) {
                native_straus_table.emplace_back(native_straus_table[j - 1] + base_points[i].get_value());
            }
            native_straus_tables.emplace_back(native_straus_table);
        }
        for (size_t i = 0; i < num_points; ++i) {
            scalar_slices.emplace_back(straus_scalar_slice(context, scalars[i], TABLE_BITS));

            auto table_transcript = straus_lookup_table::compute_straus_lookup_table_hints(
                base_points[i].get_value(), offset_generators[i + 1], TABLE_BITS);
            std::copy(table_transcript.begin() + 1, table_transcript.end(), std::back_inserter(operation_transcript));
        }
        Element accumulator = offset_generators[0];

        for (size_t i = 0; i < num_rounds; ++i) {
            if (i != 0) {
                for (size_t j = 0; j < TABLE_BITS; ++j) {
                    // offset_generator_accuulator is a regular Element, so dbl() won't add constraints
                    accumulator = accumulator.dbl();
                    operation_transcript.emplace_back(accumulator);
                    offset_generator_accumulator = offset_generator_accumulator.dbl();
                }
            }
            for (size_t j = 0; j < num_points; ++j) {

                const Element point =
                    native_straus_tables[j][static_cast<size_t>(scalar_slices[j].slices_native[num_rounds - i - 1])];

                accumulator += point;

                operation_transcript.emplace_back(accumulator);
                offset_generator_accumulator = offset_generator_accumulator + Element(offset_generators[j + 1]);
            }
        }
    }

    // Normalize the computed witness points and convert into AffineElement type
    Element::batch_normalize(&operation_transcript[0], operation_transcript.size());

    std::vector<AffineElement> operation_hints;
    operation_hints.reserve(operation_transcript.size());
    for (auto& element : operation_transcript) {
        operation_hints.emplace_back(AffineElement(element.x, element.y));
    }

    std::vector<straus_lookup_table> point_tables;
    const size_t hints_per_table = (1ULL << TABLE_BITS) - 1;
    OriginTag tag{};
    for (size_t i = 0; i < num_points; ++i) {
        std::span<AffineElement> table_hints(&operation_hints[i * hints_per_table], hints_per_table);
        // Merge tags
        tag = OriginTag(tag, scalars[i].get_origin_tag(), base_points[i].get_origin_tag());
        scalar_slices.emplace_back(straus_scalar_slice(context, scalars[i], TABLE_BITS));
        point_tables.emplace_back(straus_lookup_table(context, base_points[i], offset_generators[i + 1], TABLE_BITS));
    }

    AffineElement* hint_ptr = &operation_hints[num_points * hints_per_table];
    cycle_group accumulator = offset_generators[0];

    // populate the set of points we are going to add into our accumulator, *before* we do any ECC operations
    // this way we are able to fuse mutliple ecc add / ecc double operations and reduce total gate count.
    // (ecc add/ecc double gates normally cost 2 Ultra gates. However if we chain add->add, add->double,
    // double->add, double->double, they only cost one)
    std::vector<cycle_group> points_to_add;
    for (size_t i = 0; i < num_rounds; ++i) {
        for (size_t j = 0; j < num_points; ++j) {
            const std::optional<field_t> scalar_slice = scalar_slices[j].read(num_rounds - i - 1);
            // if we are doing a batch mul over scalars of different bit-lengths, we may not have any scalar bits for a
            // given round and a given scalar
            if (scalar_slice.has_value()) {
                const cycle_group point = point_tables[j].read(scalar_slice.value());
                points_to_add.emplace_back(point);
            }
        }
    }

    std::vector<std::tuple<field_t, field_t>> x_coordinate_checks;
    size_t point_counter = 0;
    for (size_t i = 0; i < num_rounds; ++i) {
        if (i != 0) {
            for (size_t j = 0; j < TABLE_BITS; ++j) {
                accumulator = accumulator.dbl(*hint_ptr);
                hint_ptr++;
            }
        }

        for (size_t j = 0; j < num_points; ++j) {
            const std::optional<field_t> scalar_slice = scalar_slices[j].read(num_rounds - i - 1);
            // if we are doing a batch mul over scalars of different bit-lengths, we may not have a bit slice
            // for a given round and a given scalar
            BB_ASSERT_EQ(scalar_slice.value().get_value(), scalar_slices[j].slices_native[num_rounds - i - 1]);
            if (scalar_slice.has_value()) {
                const auto& point = points_to_add[point_counter++];
                if (!unconditional_add) {
                    x_coordinate_checks.push_back({ accumulator.x, point.x });
                }
                accumulator = accumulator.unconditional_add(point, *hint_ptr);
                hint_ptr++;
            }
        }
    }

    // validate that none of the x-coordinate differences are zero
    // we batch the x-coordinate checks together
    // because `assert_is_not_zero` witness generation needs a modular inversion (expensive)
    field_t coordinate_check_product = 1;
    for (auto& [x1, x2] : x_coordinate_checks) {
        auto x_diff = x2 - x1;
        coordinate_check_product *= x_diff;
    }
    coordinate_check_product.assert_is_not_zero("_variable_base_batch_mul_internal x-coordinate collision");

    // Set the final accumulator's tag to the union of all points' and scalars' tags
    accumulator.set_origin_tag(tag);
    /**
     * offset_generator_accumulator represents the sum of all the offset generator terms present in `accumulator`.
     * We don't subtract off yet, as we may be able to combine `offset_generator_accumulator` with other constant terms
     * in `batch_mul` before performing the subtraction.
     */
    return { accumulator, AffineElement(offset_generator_accumulator) };
}

/**
 * @brief Internal algorithm to perform a fixed-base batch mul for ULTRA Builder
 *
 * @details Uses plookup tables which contain lookups for precomputed multiples of the input base points.
 *          Means we can avoid all point doublings and reduce one scalar mul to ~29 lookups + 29 ecc addition gates
 *
 * @tparam Builder
 * @param scalars
 * @param base_points
 * @param
 * @return cycle_group<Builder>::batch_mul_internal_output
 */
template <typename Builder>
typename cycle_group<Builder>::batch_mul_internal_output cycle_group<Builder>::_fixed_base_batch_mul_internal(
    const std::span<cycle_scalar> scalars,
    const std::span<AffineElement> base_points,
    const std::span<AffineElement const> /*unused*/)
    requires IsUltraArithmetic<Builder>
{
    BB_ASSERT_EQ(scalars.size(), base_points.size());

    const size_t num_points = base_points.size();
    using MultiTableId = plookup::MultiTableId;
    using ColumnIdx = plookup::ColumnIdx;

    std::vector<MultiTableId> plookup_table_ids;
    std::vector<AffineElement> plookup_base_points;
    std::vector<field_t> plookup_scalars;

    OriginTag tag{};
    for (size_t i = 0; i < num_points; ++i) {
        // Merge all tags of scalars
        tag = OriginTag(tag, scalars[i].get_origin_tag());
        std::optional<std::array<MultiTableId, 2>> table_id =
            plookup::fixed_base::table::get_lookup_table_ids_for_point(base_points[i]);
        ASSERT(table_id.has_value());
        plookup_table_ids.emplace_back(table_id.value()[0]);
        plookup_table_ids.emplace_back(table_id.value()[1]);
        plookup_base_points.emplace_back(base_points[i]);
        plookup_base_points.emplace_back(Element(base_points[i]) * (uint256_t(1) << cycle_scalar::LO_BITS));
        plookup_scalars.emplace_back(scalars[i].lo);
        plookup_scalars.emplace_back(scalars[i].hi);
    }

    std::vector<cycle_group> lookup_points;
    Element offset_generator_accumulator = Group::point_at_infinity;
    for (size_t i = 0; i < plookup_scalars.size(); ++i) {
        plookup::ReadData<field_t> lookup_data =
            plookup_read<Builder>::get_lookup_accumulators(plookup_table_ids[i], plookup_scalars[i]);
        for (size_t j = 0; j < lookup_data[ColumnIdx::C2].size(); ++j) {
            const auto x = lookup_data[ColumnIdx::C2][j];
            const auto y = lookup_data[ColumnIdx::C3][j];
            lookup_points.emplace_back(cycle_group(x, y, /*is_infinity=*/false));
        }

        std::optional<AffineElement> offset_1 =
            plookup::fixed_base::table::get_generator_offset_for_table_id(plookup_table_ids[i]);

        ASSERT(offset_1.has_value());
        offset_generator_accumulator += offset_1.value();
    }
    /**
     * Compute the witness values of the batch_mul algorithm natively, as Element types with a Z-coordinate.
     * We then batch-convert to AffineElement types, and feed these points as "hints" into the cycle_group methods.
     * This avoids the need to compute modular inversions for every group operation, which dramatically reduces witness
     * generation times
     */
    std::vector<Element> operation_transcript;
    {
        Element accumulator = lookup_points[0].get_value();
        for (size_t i = 1; i < lookup_points.size(); ++i) {
            accumulator = accumulator + (lookup_points[i].get_value());
            operation_transcript.emplace_back(accumulator);
        }
    }
    Element::batch_normalize(&operation_transcript[0], operation_transcript.size());
    std::vector<AffineElement> operation_hints;
    operation_hints.reserve(operation_transcript.size());
    for (auto& element : operation_transcript) {
        operation_hints.emplace_back(AffineElement(element.x, element.y));
    }

    cycle_group accumulator = lookup_points[0];
    // Perform all point additions sequentially. The Ultra ecc_addition relation costs 1 gate iff additions are chained
    // and output point of previous addition = input point of current addition.
    // If this condition is not met, the addition relation costs 2 gates. So it's good to do these sequentially!
    for (size_t i = 1; i < lookup_points.size(); ++i) {
        accumulator = accumulator.unconditional_add(lookup_points[i], operation_hints[i - 1]);
    }
    /**
     * offset_generator_accumulator represents the sum of all the offset generator terms present in `accumulator`.
     * We don't subtract off yet, as we may be able to combine `offset_generator_accumulator` with other constant terms
     * in `batch_mul` before performing the subtraction.
     */
    // Set accumulator's origin tag to the union of all scalars' tags
    accumulator.set_origin_tag(tag);
    return { accumulator, offset_generator_accumulator };
}

/**
 * @brief Multiscalar multiplication algorithm.
 *
 * @details Uses the Straus MSM algorithm. `batch_mul` splits inputs into three categories:
 *          1. point and scalar multiplier are both constant
 *          2. point is constant, scalar multiplier is a witness
 *          3. point is a witness, scalar multiplier can be witness or constant
 *
 * For Category 1, the scalar mul can be precomuted without constraints
 * For Category 2, we use a fixed-base variant of Straus (with plookup tables if available).
 * For Category 3, we use standard Straus.
 * The results from all 3 categories are combined and returned as an output point.
 *
 * @note batch_mul can handle all known cases of trigger incomplete addition formula exceptions and other weirdness:
 *       1. some/all of the input points are points at infinity
 *       2. some/all of the input scalars are 0
 *       3. some/all input points are equal to each other
 *       4. output is the point at infinity
 *       5. input vectors are empty
 *
 * @note offset_generator_data is a pointer to precomputed offset generator list.
 *       There is a default parameter point that poitns to a list with DEFAULT_NUM_GENERATORS generator points (32)
 *       If more offset generators are required, they will be derived in-place which can be expensive.
 *       (num required offset generators is either num input points + 1 or num input points + 2,
 *        depends on if one or both of _fixed_base_batch_mul_internal, _variable_base_batch_mul_internal are called)
 *       If you're calling this function repeatedly and you KNOW you need >32 offset generators,
 *       it's faster to create a `generator_data` object with the required size and pass it in as a parameter.
 * @tparam Builder
 * @param scalars
 * @param base_points
 * @param offset_generator_data
 * @return cycle_group<Builder>
 */
template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::batch_mul(const std::vector<cycle_group>& base_points,
                                                     const std::vector<cycle_scalar>& scalars,
                                                     const GeneratorContext context)
{
    BB_ASSERT_EQ(scalars.size(), base_points.size());

    std::vector<cycle_scalar> variable_base_scalars;
    std::vector<cycle_group> variable_base_points;
    std::vector<cycle_scalar> fixed_base_scalars;
    std::vector<AffineElement> fixed_base_points;

    // Merge all tags
    OriginTag result_tag;
    for (auto [point, scalar] : zip_view(base_points, scalars)) {
        result_tag = OriginTag(result_tag, OriginTag(point.get_origin_tag(), scalar.get_origin_tag()));
    }
    size_t num_bits = 0;
    for (auto& s : scalars) {
        num_bits = std::max(num_bits, s.num_bits());

        // Note: is this the best place to put `validate_is_in_field`? Should it not be part of the constructor?
        // Note note: validate_scalar_is_in_field does not apply range checks to the hi/lo slices, this is performed
        // implicitly via the scalar mul algorithm
        s.validate_scalar_is_in_field();
    }

    // if num_bits != NUM_BITS, skip lookup-version of fixed-base scalar mul. too much complexity
    bool num_bits_not_full_field_size = num_bits != NUM_BITS;

    // When calling `_variable_base_batch_mul_internal`, we can unconditionally add iff all of the input points
    // are fixed-base points
    // (i.e. we are ULTRA Builder and we are doing fixed-base mul over points not present in our plookup tables)
    bool can_unconditional_add = true;
    bool has_non_constant_component = false;
    Element constant_acc = Group::point_at_infinity;
    for (size_t i = 0; i < scalars.size(); ++i) {
        bool scalar_constant = scalars[i].is_constant();
        bool point_constant = base_points[i].is_constant();
        if (scalar_constant && point_constant) {
            constant_acc += (base_points[i].get_value()) * (scalars[i].get_value());
        } else if (!scalar_constant && point_constant) {
            if (base_points[i].get_value().is_point_at_infinity()) {
                // oi mate, why are you creating a circuit that multiplies a known point at infinity?
                continue;
            }
            if constexpr (IS_ULTRA) {
                if (!num_bits_not_full_field_size &&
                    plookup::fixed_base::table::lookup_table_exists_for_point(base_points[i].get_value())) {
                    fixed_base_scalars.push_back(scalars[i]);
                    fixed_base_points.push_back(base_points[i].get_value());
                } else {
                    // womp womp. We have lookup tables at home. ROM tables.
                    variable_base_scalars.push_back(scalars[i]);
                    variable_base_points.push_back(base_points[i]);
                }
            } else {
                fixed_base_scalars.push_back(scalars[i]);
                fixed_base_points.push_back(base_points[i].get_value());
            }
            has_non_constant_component = true;
        } else {
            variable_base_scalars.push_back(scalars[i]);
            variable_base_points.push_back(base_points[i]);
            can_unconditional_add = false;
            has_non_constant_component = true;
            // variable base
        }
    }

    // If all inputs are constant, return the computed constant component and call it a day.
    if (!has_non_constant_component) {
        auto result = cycle_group(constant_acc);
        result.set_origin_tag(result_tag);
        return result;
    }

    // add the constant component into our offset accumulator
    // (we'll subtract `offset_accumulator` from the MSM output i.e. we negate here to counter the future negation)
    Element offset_accumulator = -constant_acc;
    const bool has_variable_points = !variable_base_points.empty();
    const bool has_fixed_points = !fixed_base_points.empty();

    // Compute all required offset generators.
    const size_t num_offset_generators =
        variable_base_points.size() + fixed_base_points.size() + has_variable_points + has_fixed_points;
    const std::span<AffineElement const> offset_generators =
        context.generators->get(num_offset_generators, 0, OFFSET_GENERATOR_DOMAIN_SEPARATOR);

    cycle_group result;
    if (has_fixed_points) {
        const auto [fixed_accumulator, offset_generator_delta] =
            _fixed_base_batch_mul_internal(fixed_base_scalars, fixed_base_points, offset_generators);
        offset_accumulator += offset_generator_delta;
        result = fixed_accumulator;
    }

    if (has_variable_points) {
        std::span<AffineElement const> offset_generators_for_variable_base_batch_mul{
            offset_generators.data() + fixed_base_points.size(), offset_generators.size() - fixed_base_points.size()
        };
        const auto [variable_accumulator, offset_generator_delta] =
            _variable_base_batch_mul_internal(variable_base_scalars,
                                              variable_base_points,
                                              offset_generators_for_variable_base_batch_mul,
                                              can_unconditional_add);
        offset_accumulator += offset_generator_delta;
        if (has_fixed_points) {
            result = can_unconditional_add ? result.unconditional_add(variable_accumulator)
                                           : result.checked_unconditional_add(variable_accumulator);
        } else {
            result = variable_accumulator;
        }
    }

    // Update `result` to remove the offset generator terms, and add in any constant terms from `constant_acc`.
    // We have two potential modes here:
    // 1. All inputs are fixed-base and constant_acc is not the point at infinity
    // 2. Everything else.
    // Case 1 is a special case, as we *know* we cannot hit incomplete addition edge cases,
    // under the assumption that all input points are linearly independent of one another.
    // Because constant_acc is not the point at infnity we know that at least 1 input scalar was not zero,
    // i.e. the output will not be the point at infinity. We also know under case 1, we won't trigger the
    // doubling formula either, as every point is lienarly independent of every other point (including offset
    // generators).
    if (!constant_acc.is_point_at_infinity() && can_unconditional_add) {
        result = result.unconditional_add(AffineElement(-offset_accumulator));
    } else {
        // For case 2, we must use a full subtraction operation that handles all possible edge cases, as the output
        // point may be the point at infinity.
        // TODO(@zac-williamson) We can probably optimize this a bit actually. We might hit the point at infinity,
        // but an honest prover won't trigger the doubling edge case.
        // (doubling edge case implies input points are also the offset generator points,
        // which we can assume an honest Prover will not do if we make this case produce unsatisfiable constraints)
        // We could do the following:
        // 1. If x-coords match, assert y-coords do not match
        // 2. If x-coords match, return point at infinity, else return result - offset_accumulator.
        // This would be slightly cheaper than operator- as we do not have to evaluate the double edge case.
        result = result - AffineElement(offset_accumulator);
    }
    // Ensure the tag of the result is a union of all inputs
    result.set_origin_tag(result_tag);
    return result;
}

template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator*(const cycle_scalar& scalar) const
{
    return batch_mul({ *this }, { scalar });
}

template <typename Builder> cycle_group<Builder>& cycle_group<Builder>::operator*=(const cycle_scalar& scalar)
{
    *this = operator*(scalar);
    return *this;
}

template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator*(const BigScalarField& scalar) const
{
    return batch_mul({ *this }, { scalar });
}

template <typename Builder> cycle_group<Builder>& cycle_group<Builder>::operator*=(const BigScalarField& scalar)
{
    *this = operator*(scalar);
    return *this;
}

template <typename Builder> bool_t<Builder> cycle_group<Builder>::operator==(cycle_group& other)
{
    this->standardize();
    other.standardize();
    const auto equal = (x == other.x) && (y == other.y) && (this->_is_infinity == other._is_infinity);
    return equal;
}

template <typename Builder> void cycle_group<Builder>::assert_equal(cycle_group& other, std::string const& msg)
{
    this->standardize();
    other.standardize();
    x.assert_equal(other.x, msg);
    y.assert_equal(other.y, msg);
    this->_is_infinity.assert_equal(other._is_infinity);
}

template <typename Builder>
cycle_group<Builder> cycle_group<Builder>::conditional_assign(const bool_t& predicate,
                                                              const cycle_group& lhs,
                                                              const cycle_group& rhs)
{
    auto x_res = field_t::conditional_assign(predicate, lhs.x, rhs.x).normalize();
    auto y_res = field_t::conditional_assign(predicate, lhs.y, rhs.y).normalize();
    auto _is_infinity_res =
        bool_t::conditional_assign(predicate, lhs.is_point_at_infinity(), rhs.is_point_at_infinity());

    bool _is_standard_res = lhs._is_standard && rhs._is_standard;
    if (predicate.is_constant()) {
        _is_standard_res = predicate.get_value() ? lhs._is_standard : rhs._is_standard;
    }

    // Rare case when we bump into two constants, s.t. lhs = -rhs
    if (x_res.is_constant() && !y_res.is_constant()) {
        auto ctx = predicate.get_context();
        x_res = field_t::from_witness_index(ctx, ctx->put_constant_variable(x_res.get_value()));
    }

    cycle_group<Builder> result(x_res, y_res, _is_infinity_res);
    result._is_standard = _is_standard_res;
    return result;
};

template <typename Builder> cycle_group<Builder> cycle_group<Builder>::operator/(const cycle_group& /*unused*/) const
{
    // TODO(@kevaundray solve the discrete logarithm problem)
    throw_or_abort("Implementation under construction...");
}

template class cycle_group<bb::UltraCircuitBuilder>;
template class cycle_group<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
