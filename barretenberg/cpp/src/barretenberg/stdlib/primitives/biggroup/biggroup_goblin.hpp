#pragma once

#include "../bigfield/bigfield.hpp"
#include "../bigfield/goblin_field.hpp"
#include "../byte_array/byte_array.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "../memory/rom_table.hpp"
#include "../memory/twin_rom_table.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb::stdlib::element_goblin {

/**
 * @brief Custom element class for when using goblin
 * @details When using goblin (builder = MEGA and element = bn254), the assumptions and heuristics
 *          we apply vary considerably to the "default" case, justifying a separate class
 *          (we use a `using` declaration to make `element` map to `goblin_element` if the correct parametrisation is
 * used, see the `IsGoblinBigGroup` concept for details) Differences between goblin and regular biggroup elements:
 *          1. state model is different (x/y coordinates are 2 136-bit field_t members instead of 4 68-bit field_t
 * members)
 *          2. on-curve checks are not applied in-circuit (they are applied in the ECCVM circuit)
 *          3. we do not need to range-constrain the coordinates to be 136-bits (applied in the Translator circuit)
 * @tparam Builder
 * @tparam Fq
 * @tparam Fr
 * @tparam NativeGroup
 */
template <class Builder, class Fq, class Fr, class NativeGroup> class goblin_element {
  public:
    using BaseField = Fq;
    using bool_ct = stdlib::bool_t<Builder>;
    using biggroup_tag = goblin_element; // Facilitates a constexpr check IsBigGroup

    goblin_element() = default;
    goblin_element(const typename NativeGroup::affine_element& input)
        : x(input.x)
        , y(input.y)
        , _is_infinity(input.is_point_at_infinity())
    {}
    goblin_element(const Fq& x, const Fq& y)
        : x(x)
        , y(y)
        , _is_infinity(false)
    {}
    goblin_element(const goblin_element& other) = default;
    goblin_element(goblin_element&& other) noexcept = default;
    goblin_element& operator=(const goblin_element& other) = default;
    goblin_element& operator=(goblin_element&& other) noexcept = default;
    ~goblin_element() = default;

    static goblin_element from_witness(Builder* ctx, const typename NativeGroup::affine_element& input)
    {
        goblin_element out;
        // ECCVM requires points at infinity to be represented by 0-value x/y coords
        if (input.is_point_at_infinity()) {
            Fq x = Fq::from_witness(ctx, bb::fq(0));
            Fq y = Fq::from_witness(ctx, bb::fq(0));
            out.x = x;
            out.y = y;
        } else {
            Fq x = Fq::from_witness(ctx, input.x);
            Fq y = Fq::from_witness(ctx, input.y);
            out.x = x;
            out.y = y;
        }
        out.set_point_at_infinity(witness_t<Builder>(ctx, input.is_point_at_infinity()));
        return out;
    }

    /**
     * @brief Creates fixed witnesses from a constant element.
     **/
    void convert_constant_to_fixed_witness(Builder* builder)
    {
        this->x.convert_constant_to_fixed_witness(builder);
        this->y.convert_constant_to_fixed_witness(builder);
    }

    void validate_on_curve() const
    {
        // happens in goblin eccvm
    }

    static goblin_element one(Builder* ctx)
    {
        uint256_t x = uint256_t(NativeGroup::one.x);
        uint256_t y = uint256_t(NativeGroup::one.y);
        Fq x_fq(ctx, x);
        Fq y_fq(ctx, y);
        return goblin_element(x_fq, y_fq);
    }

    static goblin_element point_at_infinity(Builder* ctx)
    {
        Fr zero = Fr::from_witness_index(ctx, ctx->zero_idx);
        Fq x_fq(zero, zero);
        Fq y_fq(zero, zero);
        goblin_element result(x_fq, y_fq);
        result.set_point_at_infinity(true);
        return result;
    }

    goblin_element checked_unconditional_add(const goblin_element& other) const
    {
        return goblin_element::operator+(*this, other);
    }
    goblin_element checked_unconditional_subtract(const goblin_element& other) const
    {
        return goblin_element::operator-(*this, other);
    }

    goblin_element operator+(const goblin_element& other) const
    {
        return batch_mul({ *this, other }, { Fr(1), Fr(1) });
    }

    goblin_element operator-(const goblin_element& other) const
    {
        auto builder = get_context(other);
        // Check that the internal accumulator is zero
        ASSERT(builder->op_queue->get_accumulator().is_point_at_infinity());

        // Compute the result natively, and validate that result + other == *this
        typename NativeGroup::affine_element result_value = typename NativeGroup::affine_element(
            typename NativeGroup::element(get_value()) - typename NativeGroup::element(other.get_value()));

        ecc_op_tuple op_tuple;
        op_tuple = builder->queue_ecc_add_accum(other.get_value());
        {
            auto x_lo = Fr::from_witness_index(builder, op_tuple.x_lo);
            auto x_hi = Fr::from_witness_index(builder, op_tuple.x_hi);
            auto y_lo = Fr::from_witness_index(builder, op_tuple.y_lo);
            auto y_hi = Fr::from_witness_index(builder, op_tuple.y_hi);
            x_lo.assert_equal(other.x.limbs[0]);
            x_hi.assert_equal(other.x.limbs[1]);
            y_lo.assert_equal(other.y.limbs[0]);
            y_hi.assert_equal(other.y.limbs[1]);
        }

        ecc_op_tuple op_tuple2 = builder->queue_ecc_add_accum(result_value);
        auto x_lo = Fr::from_witness_index(builder, op_tuple2.x_lo);
        auto x_hi = Fr::from_witness_index(builder, op_tuple2.x_hi);
        auto y_lo = Fr::from_witness_index(builder, op_tuple2.y_lo);
        auto y_hi = Fr::from_witness_index(builder, op_tuple2.y_hi);

        Fq result_x(x_lo, x_hi);
        Fq result_y(y_lo, y_hi);
        goblin_element result(result_x, result_y);

        // if the output is at infinity, this is represented by x/y coordinates being zero
        // because they are all 136-bit, we can do a cheap zerocheck by first summing the limbs
        auto op2_is_infinity = (x_lo.add_two(x_hi, y_lo) + y_hi).is_zero();
        result.set_point_at_infinity(op2_is_infinity);
        {
            ecc_op_tuple op_tuple3 = builder->queue_ecc_eq();
            auto x_lo = Fr::from_witness_index(builder, op_tuple3.x_lo);
            auto x_hi = Fr::from_witness_index(builder, op_tuple3.x_hi);
            auto y_lo = Fr::from_witness_index(builder, op_tuple3.y_lo);
            auto y_hi = Fr::from_witness_index(builder, op_tuple3.y_hi);

            x_lo.assert_equal(x.limbs[0]);
            x_hi.assert_equal(x.limbs[1]);
            y_lo.assert_equal(y.limbs[0]);
            y_hi.assert_equal(y.limbs[1]);
        }

        // Set the tag of the result to the union of the tags of inputs
        result.set_origin_tag(OriginTag(get_origin_tag(), other.get_origin_tag()));
        return result;
    }

    goblin_element operator-() const { return point_at_infinity(get_context()) - *this; }

    goblin_element operator+=(const goblin_element& other)
    {
        *this = *this + other;
        return *this;
    }
    goblin_element operator-=(const goblin_element& other)
    {
        *this = *this - other;
        return *this;
    }
    std::array<goblin_element, 2> checked_unconditional_add_sub(const goblin_element& other) const
    {
        return std::array<goblin_element, 2>{ *this + other, *this - other };
    }

    goblin_element operator*(const Fr& scalar) const { return batch_mul({ *this }, { scalar }); }

    goblin_element conditional_negate(const bool_ct& predicate) const
    {
        goblin_element negated = -(*this);
        goblin_element result(*this);
        result.y = Fq::conditional_assign(predicate, negated.y, result.y);
        return result;
    }

    goblin_element normalize() const
    {
        // no need to normalize, all goblin eccvm operations are returned normalized
        return *this;
    }

    goblin_element reduce() const
    {
        // no need to reduce, all goblin eccvm operations are returned normalized
        return *this;
    }

    goblin_element dbl() const { return batch_mul({ *this }, { 2 }); }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/707) max_num_bits is unused; could implement and
    // use this to optimize other operations. interface compatible with biggroup.hpp, the final parameter
    // handle_edge_cases is not needed as this is always done in the eccvm
    static goblin_element batch_mul(const std::vector<goblin_element>& points,
                                    const std::vector<Fr>& scalars,
                                    const size_t max_num_bits = 0,
                                    const bool handle_edge_cases = false);

    // we use this data structure to add together a sequence of points.
    // By tracking the previous values of x_1, y_1, \lambda, we can avoid

    typename NativeGroup::affine_element get_value() const
    {
        bb::fq x_val = x.get_value().lo;
        bb::fq y_val = y.get_value().lo;
        auto result = typename NativeGroup::affine_element(x_val, y_val);
        if (is_point_at_infinity().get_value()) {
            result.self_set_infinity();
        }
        return result;
    }

    Builder* get_context() const
    {
        if (x.get_context() != nullptr) {
            return x.get_context();
        }
        if (y.get_context() != nullptr) {
            return y.get_context();
        }
        return nullptr;
    }

    Builder* get_context(const goblin_element& other) const
    {
        if (x.get_context() != nullptr) {
            return x.get_context();
        }
        if (y.get_context() != nullptr) {
            return y.get_context();
        }
        if (other.x.get_context() != nullptr) {
            return other.x.get_context();
        }
        if (other.y.get_context() != nullptr) {
            return other.y.get_context();
        }
        return nullptr;
    }

    bool_ct is_point_at_infinity() const { return _is_infinity; }
    void set_point_at_infinity(const bool_ct& is_infinity) { _is_infinity = is_infinity; }
    /**
     * @brief Enforce x and y coordinates of a point to be (0,0) in the case of point at infinity
     *
     * @details We need to have a standard witness in Noir and the point at infinity can have non-zero random
     * coefficients when we get it as output from our optimised algorithms. This function returns a (0,0) point, if
     * it is a point at infinity
     */
    goblin_element get_standard_form() const
    {
        const bool_ct is_infinity = is_point_at_infinity();
        goblin_element result(*this);
        const Fq zero = Fq::zero();
        result.x = Fq::conditional_assign(is_infinity, zero, result.x);
        result.y = Fq::conditional_assign(is_infinity, zero, result.y);
        return result;
    }

    OriginTag get_origin_tag() const
    {
        return OriginTag(x.get_origin_tag(), y.get_origin_tag(), _is_infinity.get_origin_tag());
    }

    void set_origin_tag(const OriginTag& tag)
    {
        x.set_origin_tag(tag);
        y.set_origin_tag(tag);
        _is_infinity.set_origin_tag(tag);
    }

    Fq x;
    Fq y;

  private:
    bool_ct _is_infinity;
};

template <typename C, typename Fq, typename Fr, typename G>
inline std::ostream& operator<<(std::ostream& os, goblin_element<C, Fq, Fr, G> const& v)
{
    return os << "{ " << v.x << " , " << v.y << " }";
}
} // namespace bb::stdlib::element_goblin

#include "biggroup_goblin_impl.hpp"
