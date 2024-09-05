#pragma once
#include "../bigfield/bigfield.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"

namespace bb::stdlib {
template <class Builder> class goblin_field {
  public:
    static constexpr uint1024_t DEFAULT_MAXIMUM_REMAINDER =
        bigfield<Builder, bb::Bn254FqParams>::DEFAULT_MAXIMUM_REMAINDER;
    static constexpr size_t NUM_LIMBS = bigfield<Builder, bb::Bn254FqParams>::NUM_LIMBS;
    static constexpr size_t NUM_LIMB_BITS = bigfield<Builder, bb::Bn254FqParams>::NUM_LIMB_BITS;
    static constexpr size_t NUM_LAST_LIMB_BITS = bigfield<Builder, bb::Bn254FqParams>::NUM_LAST_LIMB_BITS;

    using field_ct = stdlib::field_t<Builder>;
    using bool_ct = stdlib::bool_t<Builder>;
    std::array<field_ct, 2> limbs;

    goblin_field()
        : limbs{ 0, 0 }
    {}

    goblin_field(Builder* parent_context, const uint256_t& value)
    {
        (*this) = goblin_field(bb::fq(value));
        limbs[0].context = parent_context;
        limbs[1].context = parent_context;
    }
    goblin_field(bb::fq input)
    {
        uint256_t converted(input);
        uint256_t lo_v = converted.slice(0, 136);
        uint256_t hi_v = converted.slice(136, 254);
        limbs = { bb::fr(lo_v), bb::fr(hi_v) };
    }
    goblin_field(field_ct lo, field_ct hi)
        : limbs{ lo, hi }
    {}

    // N.B. this method is because AggregationState expects group element coordinates to be split into 4 slices
    // (we could update to only use 2 for Mega but that feels complex)
    goblin_field(field_ct lolo, field_ct lohi, field_ct hilo, field_ct hihi, [[maybe_unused]] bool can_overflow = false)
        : limbs{ lolo + lohi * (uint256_t(1) << 68), hilo + hihi * (uint256_t(1) << 68) }
    {}

    void assert_equal(const goblin_field& other) const
    {
        limbs[0].assert_equal(other.limbs[0]);
        limbs[1].assert_equal(other.limbs[1]);
    }
    static goblin_field zero() { return goblin_field{ 0, 0 }; }

    static goblin_field from_witness(Builder* ctx, bb::fq input)
    {
        uint256_t converted(input);
        uint256_t lo_v = converted.slice(0, 136);
        uint256_t hi_v = converted.slice(136, 254);
        field_ct lo = field_ct::from_witness(ctx, lo_v);
        field_ct hi = field_ct::from_witness(ctx, hi_v);
        return goblin_field(lo, hi);
    }

    static goblin_field conditional_assign(const bool_ct& predicate, const goblin_field& lhs, goblin_field& rhs)
    {
        goblin_field result;
        result.limbs = {
            field_ct::conditional_assign(predicate, lhs.limbs[0], rhs.limbs[0]),
            field_ct::conditional_assign(predicate, lhs.limbs[1], rhs.limbs[1]),
        };
        return result;
    }

    // matches the interface for bigfield
    uint512_t get_value() const
    {
        uint256_t lo = limbs[0].get_value();
        uint256_t hi = limbs[1].get_value();
        uint256_t result = lo + (hi << 136);
        return result;
    }

    // matches the interface for bigfield
    uint512_t get_maximum_value() const { return (*this).get_value(); }

    Builder* get_context() const
    {
        if (limbs[0].get_context()) {
            return limbs[0].get_context();
        }
        return limbs[1].get_context();
    }

    // done in the translator circuit
    void assert_is_in_field(){};
};
template <typename C> inline std::ostream& operator<<(std::ostream& os, goblin_field<C> const& v)
{
    return os << "{ " << v.limbs[0] << " , " << v.limbs[1] << " }";
}
} // namespace bb::stdlib