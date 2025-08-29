// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb::stdlib {

// Forward declaration
template <typename Builder> class cycle_group;

/**
 * @brief cycle_scalar represents a member of the cycle curve SCALAR FIELD.
 *        This is NOT the native circuit field type.
 *        i.e. for a BN254 circuit, cycle_group will be Grumpkin and cycle_scalar will be Grumpkin::ScalarField
 *        (BN254 native field is BN254::ScalarField == Grumpkin::BaseField)
 *
 * @details We convert scalar multiplication inputs into cycle_scalars to enable scalar multiplication to be
 * *complete* i.e. Grumpkin points multiplied by BN254 scalars does not produce a cyclic group
 * as BN254::ScalarField < Grumpkin::ScalarField
 * This complexity *should* not leak outside the cycle_group / cycle_scalar implementations, as cycle_scalar
 * performs all required conversions if the input scalars are stdlib::field_t elements
 *
 * @note We opted to create a new class to represent `cycle_scalar` instead of using `bigfield`,
 * as `bigfield` is inefficient in this context. All required range checks for `cycle_scalar` can be obtained for
 * free from the `batch_mul` algorithm, making the range checks performed by `bigfield` largely redundant.
 */
template <typename Builder> class cycle_scalar {
  public:
    using field_t = stdlib::field_t<Builder>;
    using Curve = typename Builder::EmbeddedCurve;
    using ScalarField = typename Curve::ScalarField;
    using BigScalarField = stdlib::bigfield<Builder, typename ScalarField::Params>;

    static constexpr size_t NUM_BITS = ScalarField::modulus.get_msb() + 1;
    static constexpr size_t LO_BITS = field_t::native::Params::MAX_BITS_PER_ENDOMORPHISM_SCALAR;
    static constexpr size_t HI_BITS = NUM_BITS - LO_BITS;

    field_t lo;
    field_t hi;

  private:
    size_t _num_bits = NUM_BITS;
    bool _skip_primality_test = false;
    // if our scalar multiplier is a bn254 FF scalar (e.g. pedersen hash),
    // we want to validate the cycle_scalar < bn254::fr::modulus *not* grumpkin::fr::modulus
    bool _use_bn254_scalar_field_for_primality_test = false;

  public:
    cycle_scalar(const field_t& _lo,
                 const field_t& _hi,
                 const size_t bits,
                 const bool skip_primality_test,
                 const bool use_bn254_scalar_field_for_primality_test)
        : lo(_lo)
        , hi(_hi)
        , _num_bits(bits)
        , _skip_primality_test(skip_primality_test)
        , _use_bn254_scalar_field_for_primality_test(use_bn254_scalar_field_for_primality_test) {};
    cycle_scalar(const ScalarField& _in = 0);
    cycle_scalar(const field_t& _lo, const field_t& _hi);
    cycle_scalar(const field_t& _in);
    static cycle_scalar from_witness(Builder* context, const ScalarField& value);
    static cycle_scalar from_witness_bitstring(Builder* context, const uint256_t& bitstring, size_t num_bits);
    static cycle_scalar create_from_bn254_scalar(const field_t& _in, bool skip_primality_test = false);
    [[nodiscard]] bool is_constant() const;
    ScalarField get_value() const;
    Builder* get_context() const { return lo.get_context() != nullptr ? lo.get_context() : hi.get_context(); }
    [[nodiscard]] size_t num_bits() const { return _num_bits; }
    [[nodiscard]] bool skip_primality_test() const { return _skip_primality_test; }
    [[nodiscard]] bool use_bn254_scalar_field_for_primality_test() const
    {
        return _use_bn254_scalar_field_for_primality_test;
    }
    void validate_scalar_is_in_field() const;

    explicit cycle_scalar(BigScalarField&);
    /**
     * @brief Get the origin tag of the cycle_scalar (a merge of the lo and hi tags)
     *
     * @return OriginTag
     */
    OriginTag get_origin_tag() const { return OriginTag(lo.get_origin_tag(), hi.get_origin_tag()); }
    /**
     * @brief Set the origin tag of lo and hi members of cycle scalar
     *
     * @param tag
     */
    void set_origin_tag(const OriginTag& tag) const
    {
        lo.set_origin_tag(tag);
        hi.set_origin_tag(tag);
    }
    /**
     * @brief Set the free witness flag for the cycle scalar's tags
     */
    void set_free_witness_tag()
    {
        lo.set_free_witness_tag();
        hi.set_free_witness_tag();
    }
    /**
     * @brief Unset the free witness flag for the cycle scalar's tags
     */
    void unset_free_witness_tag()
    {
        lo.unset_free_witness_tag();
        hi.unset_free_witness_tag();
    }
};

} // namespace bb::stdlib