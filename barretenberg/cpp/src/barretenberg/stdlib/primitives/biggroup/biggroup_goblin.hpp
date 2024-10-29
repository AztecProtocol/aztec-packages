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
        if (input.is_point_at_infinity()) {
            Fq x = Fq::from_witness(ctx, NativeGroup::affine_one.x);
            Fq y = Fq::from_witness(ctx, NativeGroup::affine_one.y);
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
        std::vector<goblin_element> points{ *this, other };
        return batch_mul({ *this, other }, { Fr(1), -Fr(1) });
    }
    goblin_element operator-() const { return batch_mul({ *this }, { -Fr(1) }); }
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
