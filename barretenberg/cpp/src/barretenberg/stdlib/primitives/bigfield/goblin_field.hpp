#pragma once
#include "../bigfield/bigfield.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb::stdlib {

/**
 * @brief goblin_field wraps x/y coordinates of bn254 group elements when using goblin
 * @details this class exists because we do not want to parametrise goblin bn254 coordinates with bigfield.
 *          bigfield generates a large number of constraints to apply checks that are not needed for goblin coordinates
 *          This is because, in the goblin context we can apply the following heuristics:
 *          1. goblin coordinate field elements are range-constrained in the Translator circuit (no need to range
 * constrain here)
 *          2. field elements that come out of the ECCVM are well-formed, we do not need to call `assert_is_in_field`
 *          3. there should be no need to apply arithmetic to goblin coordinate field elements in-circuit
 *          Having a distinct class for `goblin_field` allows us to harvest these optimisations without a proliferation
 * of edge cases and bloated logic in other classes
 * @tparam Builder
 */
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

    // constructors mirror bigfield constructors
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
        uint256_t lo_v = converted.slice(0, NUM_LIMB_BITS * 2);
        uint256_t hi_v = converted.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3 + NUM_LAST_LIMB_BITS);
        limbs = { bb::fr(lo_v), bb::fr(hi_v) };
    }
    goblin_field(field_ct lo, field_ct hi)
        : limbs{ lo, hi }
    {}

    // N.B. this method is because AggregationState expects group element coordinates to be split into 4 slices
    // (we could update to only use 2 for Mega but that feels complex)
    static goblin_field construct_from_limbs(
        field_ct lolo, field_ct lohi, field_ct hilo, field_ct hihi, [[maybe_unused]] bool can_overflow = false)
    {
        goblin_field result;
        result.limbs = { lolo + lohi * (uint256_t(1) << NUM_LIMB_BITS), hilo + hihi * (uint256_t(1) << NUM_LIMB_BITS) };
        return result;
    }

    void assert_equal(const goblin_field& other) const
    {
        limbs[0].assert_equal(other.limbs[0]);
        limbs[1].assert_equal(other.limbs[1]);
    }
    static goblin_field zero() { return goblin_field{ 0, 0 }; }

    static goblin_field from_witness(Builder* ctx, bb::fq input)
    {
        uint256_t converted(input);
        uint256_t lo_v = converted.slice(0, NUM_LIMB_BITS * 2);
        uint256_t hi_v = converted.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3 + NUM_LAST_LIMB_BITS);
        field_ct lo = field_ct::from_witness(ctx, lo_v);
        field_ct hi = field_ct::from_witness(ctx, hi_v);
        return goblin_field(lo, hi);
    }

    /**
     * Create a witness from a constant. This way the value of the witness is fixed and public.
     **/
    void convert_constant_to_fixed_witness(Builder* builder)
    {
        for (auto& limb : limbs) {
            limb.convert_constant_to_fixed_witness(builder);
        }
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

    OriginTag get_origin_tag() const { return OriginTag(limbs[0].get_origin_tag(), limbs[1].get_origin_tag()); }

    void set_origin_tag(const OriginTag& tag)
    {
        limbs[0].set_origin_tag(tag);
        limbs[1].set_origin_tag(tag);
    }
};
template <typename C> inline std::ostream& operator<<(std::ostream& os, goblin_field<C> const& v)
{
    return os << "{ " << v.limbs[0] << " , " << v.limbs[1] << " }";
}
} // namespace bb::stdlib