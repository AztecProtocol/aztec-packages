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
 * @details The primary use for this class is scalar multiplication of points on the Grumpkin curve. For simplicity,
 * class is hardcoded for 254-bit scalars
 *
 * @note The reason for not using `bigfield` to represent cycle scalars is that `bigfield` is inefficient in this
 * context. All required range checks for `cycle_scalar` can be obtained for free from the `batch_mul` algorithm, making
 * the range checks performed by `bigfield` largely redundant.
 *
 * @warning: The field validation performed by cycle_scalar constructors assumes that the lo/hi limbs will
 * be range-constrained during scalar multiplication. The validation is ONLY sound when the cycle_scalar is used in a
 * batch_mul operation (which applies range constraints as part of the MSM algorithm).
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

    // Enforce the architectural constraint that cycle_scalar is hardcoded for 254-bit scalars
    static_assert(NUM_BITS == 254);
    static_assert(LO_BITS == 128 && HI_BITS == 126);

    enum class SkipValidation { FLAG };

  private:
    field_t _lo; // LO_BITS of the scalar
    field_t _hi; // Remaining HI_BITS of the scalar

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

    cycle_scalar(const field_t& lo, const field_t& hi, SkipValidation flag);

    /**
     * @brief Validates that the scalar (lo + hi * 2^LO_BITS) is less than the Grumpkin scalar field modulus
     */
    void validate_scalar_is_in_field() const;

  public:
    cycle_scalar(const ScalarField& in = 0);
    cycle_scalar(const field_t& lo, const field_t& hi);
    static cycle_scalar from_witness(Builder* context, const ScalarField& value);
    explicit cycle_scalar(BigScalarField& scalar);

    [[nodiscard]] bool is_constant() const;
    ScalarField get_value() const;
    Builder* get_context() const { return _lo.get_context() != nullptr ? _lo.get_context() : _hi.get_context(); }

    const field_t& lo() const { return _lo; }
    const field_t& hi() const { return _hi; }

    /**
     * @brief Get the origin tag of the cycle_scalar (a merge of the lo and hi tags)
     *
     * @return OriginTag
     */
    OriginTag get_origin_tag() const { return OriginTag(_lo.get_origin_tag(), _hi.get_origin_tag()); }
    /**
     * @brief Set the origin tag of lo and hi members of cycle scalar
     *
     * @param tag
     */
    void set_origin_tag(const OriginTag& tag)
    {
        _lo.set_origin_tag(tag);
        _hi.set_origin_tag(tag);
    }
    /**
     * @brief Set the free witness flag for the cycle scalar's tags
     */
    void set_free_witness_tag()
    {
        _lo.set_free_witness_tag();
        _hi.set_free_witness_tag();
    }
    /**
     * @brief Unset the free witness flag for the cycle scalar's tags
     */
    void unset_free_witness_tag()
    {
        _lo.unset_free_witness_tag();
        _hi.unset_free_witness_tag();
    }
};

} // namespace bb::stdlib
