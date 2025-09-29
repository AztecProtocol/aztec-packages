// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_scalar.hpp"
#include "barretenberg/stdlib/primitives/group/straus_lookup_table.hpp"
#include "barretenberg/stdlib/primitives/group/straus_scalar_slice.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base_params.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <optional>

namespace bb::stdlib {

/**
 * @brief cycle_group represents a group Element of the proving system's embedded curve, i.e. a curve with a cofactor 1
 * defined over a field equal to the circuit's native field Builder::FF
 * @details In barretenberg, cycle group is used to represent the Grumpkin curve defined over the bn254 scalar field.
 *
 * @tparam Builder
 */
template <typename Builder> class cycle_group {
  public:
    using field_t = stdlib::field_t<Builder>;
    using BaseField = field_t;
    using bool_t = stdlib::bool_t<Builder>;
    using witness_t = stdlib::witness_t<Builder>;

    using Curve = bb::curve::Grumpkin;
    using Group = bb::grumpkin::g1;
    using Element = bb::grumpkin::g1::element;
    using AffineElement = bb::grumpkin::g1::affine_element;
    using GeneratorContext = crypto::GeneratorContext<Curve>;

    using BigScalarField = stdlib::bigfield<Builder, bb::fq::Params>;
    using cycle_scalar = ::bb::stdlib::cycle_scalar<Builder>;
    using straus_lookup_table = ::bb::stdlib::straus_lookup_table<Builder>;
    using straus_scalar_slices = ::bb::stdlib::straus_scalar_slices<Builder>;

    // Bit-size for scalars represented in the ROM lookup tables used in the variable-base MSM algorithm
    static constexpr size_t ROM_TABLE_BITS = 4;
    static constexpr size_t NUM_BITS_FULL_FIELD_SIZE = bb::fq::modulus.get_msb() + 1;
    // Domain separator for generating offset generator points in the variable-base MSM algorithm
    static constexpr std::string_view OFFSET_GENERATOR_DOMAIN_SEPARATOR = "cycle_group_offset_generator";

    // Since the cycle_group base field is the circuit's native field, it can be stored using two public inputs.
    static constexpr size_t PUBLIC_INPUTS_SIZE = 2;

  private:
    /**
     * @brief Stores temporary variables produced by internal multiplication algorithms
     *
     */
    struct batch_mul_internal_output {
        cycle_group accumulator;
        AffineElement offset_generator_delta;
    };

  public:
    cycle_group(Builder* _context = nullptr);
    cycle_group(field_t _x, field_t _y, bool_t _is_infinity);
    cycle_group(const bb::fr& _x, const bb::fr& _y, bool _is_infinity);
    cycle_group(const AffineElement& _in);
    static cycle_group one(Builder* _context);
    static cycle_group constant_infinity(Builder* _context = nullptr);
    static cycle_group from_witness(Builder* _context, const AffineElement& _in);
    static cycle_group from_constant_witness(Builder* _context, const AffineElement& _in);
    Builder* get_context(const cycle_group& other) const;
    Builder* get_context() const { return context; }
    AffineElement get_value() const;
    [[nodiscard]] bool is_constant() const { return x.is_constant() && y.is_constant() && _is_infinity.is_constant(); }
    bool_t is_point_at_infinity() const { return _is_infinity; }
    [[nodiscard]] bool is_constant_point_at_infinity() const
    {
        return _is_infinity.is_constant() && _is_infinity.get_value();
    }
#ifdef FUZZING
    void set_point_at_infinity(const bool_t& is_infinity);
#endif
    void standardize();
    bool is_standard() const { return this->_is_standard; };
    cycle_group get_standard_form();
    void validate_on_curve() const;
    cycle_group dbl(const std::optional<AffineElement> hint = std::nullopt) const;
    cycle_group unconditional_add(const cycle_group& other,
                                  const std::optional<AffineElement> hint = std::nullopt) const;
    cycle_group unconditional_subtract(const cycle_group& other,
                                       const std::optional<AffineElement> hint = std::nullopt) const;
    cycle_group checked_unconditional_add(const cycle_group& other,
                                          const std::optional<AffineElement> hint = std::nullopt) const;
    cycle_group checked_unconditional_subtract(const cycle_group& other,
                                               const std::optional<AffineElement> hint = std::nullopt) const;
    cycle_group operator+(const cycle_group& other) const;
    cycle_group operator-(const cycle_group& other) const;
    cycle_group operator-() const;
    cycle_group& operator+=(const cycle_group& other);
    cycle_group& operator-=(const cycle_group& other);
    static cycle_group batch_mul(const std::vector<cycle_group>& base_points,
                                 const std::vector<BigScalarField>& scalars,
                                 GeneratorContext context = {})
    {
        std::vector<cycle_scalar> cycle_scalars;
        for (auto scalar : scalars) {
            cycle_scalars.emplace_back(scalar);
        }
        return batch_mul(base_points, cycle_scalars, context);
    }
    static cycle_group batch_mul(const std::vector<cycle_group>& base_points,
                                 const std::vector<cycle_scalar>& scalars,
                                 const GeneratorContext& context = {});
    cycle_group operator*(const cycle_scalar& scalar) const;
    cycle_group& operator*=(const cycle_scalar& scalar);
    cycle_group operator*(const BigScalarField& scalar) const;
    cycle_group& operator*=(const BigScalarField& scalar);
    bool_t operator==(cycle_group& other);
    void assert_equal(cycle_group& other, std::string const& msg = "cycle_group::assert_equal");
    static cycle_group conditional_assign(const bool_t& predicate, const cycle_group& lhs, const cycle_group& rhs);
    cycle_group operator/(const cycle_group& other) const;

    /**
     * @brief Set the origin tag for x, y and _is_infinity members of cycle_group
     *
     * @param tag
     */
    void set_origin_tag(OriginTag tag) const
    {
        x.set_origin_tag(tag);
        y.set_origin_tag(tag);
        _is_infinity.set_origin_tag(tag);
    }
    /**
     * @brief Get the origin tag of cycle_group (a merege of origin tags of x, y and _is_infinity members)
     *
     * @return OriginTag
     */
    OriginTag get_origin_tag() const
    {
        return OriginTag(x.get_origin_tag(), y.get_origin_tag(), _is_infinity.get_origin_tag());
    }

    /**
     * @brief Set the free witness flag for the cycle_group's tags
     */
    void set_free_witness_tag()
    {
        x.set_free_witness_tag();
        y.set_free_witness_tag();
        _is_infinity.set_free_witness_tag();
    }

    /**
     * @brief Unset the free witness flag for the cycle_group's tags
     */
    void unset_free_witness_tag()
    {
        x.unset_free_witness_tag();
        y.unset_free_witness_tag();
        _is_infinity.unset_free_witness_tag();
    }

    /**
     * Fix a witness. The value of the witness is constrained with a selector
     **/
    void fix_witness()
    {
        // Origin tags should be updated within
        x.fix_witness();
        y.fix_witness();
        _is_infinity.fix_witness();

        // This is now effectively a constant
        unset_free_witness_tag();
    }
    /**
     * @brief Set the witness indices representing the cycle_group to public
     *
     * @return uint32_t Index into the public inputs array at which the representation is stored
     */
    uint32_t set_public()
    {
        uint32_t start_idx = x.set_public();
        y.set_public();
        return start_idx;
    }

    /**
     * @brief Reconstruct a cycle_group from limbs (generally stored in the public inputs)
     * @details The base field of the cycle_group curve is the same as the circuit's native field so each coordinate is
     * represented by a single "limb".
     *
     * @param limbs The coordinates of the cycle_group element
     * @return cycle_group
     */
    static cycle_group reconstruct_from_public(const std::span<const field_t, 2>& limbs)
    {
        return cycle_group(limbs[0], limbs[1], false);
    }

    field_t x;
    field_t y;

  private:
    bool_t _is_infinity;
    // The point is considered to be `standard` or in `standard form` when:
    // - It's not a point at infinity, and the coordinates belong to the curve
    // - It's a point at infinity and both of the coordinates are set to be 0. (0, 0)
    // Most of the time it is true, so we won't need to do extra conditional_assign
    // during `get_standard_form`, `assert_equal` or `==` calls
    // However sometimes it won't be the case(due to some previous design choices),
    // so we can handle these cases using this flag
    bool _is_standard;
    Builder* context;

    static batch_mul_internal_output _variable_base_batch_mul_internal(std::span<cycle_scalar> scalars,
                                                                       std::span<cycle_group> base_points,
                                                                       std::span<AffineElement const> offset_generators,
                                                                       bool unconditional_add);

    static batch_mul_internal_output _fixed_base_batch_mul_internal(std::span<cycle_scalar> scalars,
                                                                    std::span<AffineElement> base_points);

    // Internal implementation for unconditional_add and unconditional_subtract
    cycle_group _unconditional_add_or_subtract(const cycle_group& other,
                                               bool is_addition,
                                               const std::optional<AffineElement> hint) const;
};

template <typename Builder> inline std::ostream& operator<<(std::ostream& os, cycle_group<Builder> const& v)
{
    return os << "{ " << v.x << ", " << v.y << " }";
}
} // namespace bb::stdlib
