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
 * @brief Represents a member of the Grumpkin curve scalar field (i.e. BN254 base field).
 * @details The primary use for this class is scalar multiplication of points on the Grumpkin curve. It largely exists
 * to abstract away the details of performing these operations with values of different origins, which may or may not
 * originate from the Grumpkin scalar field, e.g. u256 values or BN254 scalars. In these cases we convert scalar
 * multiplication inputs into cycle_scalars to enable scalar multiplication to be complete. E.g. multiplication of
 * Grumpkin points by BN254 scalars does not produce a cyclic group as BN254::ScalarField < Grumpkin::ScalarField.
 *
 * @note The reason for not using `bigfield` to represent cycle scalars is that `bigfield` is inefficient in this
 * context. All required range checks for `cycle_scalar` can be obtained for free from the `batch_mul` algorithm, making
 * the range checks performed by `bigfield` largely redundant.
 */
template <typename Builder> class cycle_scalar {
  public:
    using field_t = stdlib::field_t<Builder>;
    using Curve = typename Builder::EmbeddedCurve;
    using ScalarField = typename Curve::ScalarField;
    using BigScalarField = stdlib::bigfield<Builder, typename ScalarField::Params>;

    static constexpr size_t NUM_BITS = ScalarField::modulus.get_msb() + 1; // equivalent for both bn254 and grumpkin
    static constexpr size_t LO_BITS = field_t::native::Params::MAX_BITS_PER_ENDOMORPHISM_SCALAR;
    static constexpr size_t HI_BITS = NUM_BITS - LO_BITS;

    field_t lo; // LO_BITS of the scalar
    field_t hi; // Remaining HI_BITS of the scalar

  private:
    size_t _num_bits = NUM_BITS;
    bool _skip_primality_test = false;
    // if our scalar multiplier is a bn254 FF scalar (e.g. pedersen hash),
    // we want to validate the cycle_scalar < bn254::fr::modulus *not* grumpkin::fr::modulus
    bool _use_bn254_scalar_field_for_primality_test = false;

    /**
     * @brief Decompose a uint256_t value into lo and hi parts for cycle_scalar representation
     *
     * @param value The value to decompose
     * @return std::pair<uint256_t, uint256_t> (lo, hi) where lo is LO_BITS and hi is the remaining bits
     */
    static std::pair<uint256_t, uint256_t> decompose_into_lo_hi_u256(const uint256_t& value)
    {
        return { value.slice(0, LO_BITS), value.slice(LO_BITS, NUM_BITS) };
    }

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

  public:
    // AUDITTODO: this is used only in the fuzzer.
    cycle_scalar(const ScalarField& _in = 0);
    cycle_scalar(const field_t& _lo, const field_t& _hi);
    // AUDITTODO: this is used only in the fuzzer. Its not inherently problematic, but perhaps the fuzzer should use a
    // production entrypoint.
    static cycle_scalar from_witness(Builder* context, const ScalarField& value);
    static cycle_scalar from_u256_witness(Builder* context, const uint256_t& bitstring);
    static cycle_scalar create_from_bn254_scalar(const field_t& _in);
    explicit cycle_scalar(BigScalarField& scalar);

    [[nodiscard]] bool is_constant() const;
    ScalarField get_value() const;
    Builder* get_context() const { return lo.get_context() != nullptr ? lo.get_context() : hi.get_context(); }
    [[nodiscard]] size_t num_bits() const { return _num_bits; }
    [[nodiscard]] bool skip_primality_test() const { return _skip_primality_test; }
    [[nodiscard]] bool use_bn254_scalar_field_for_primality_test() const
    {
        return _use_bn254_scalar_field_for_primality_test;
    }

    /**
     * @brief Validates that the scalar (lo + hi * 2^LO_BITS) is less than the appropriate field modulus
     * @details Checks against either bn254 scalar field or grumpkin scalar field based on internal flags
     */
    void validate_scalar_is_in_field() const;

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
