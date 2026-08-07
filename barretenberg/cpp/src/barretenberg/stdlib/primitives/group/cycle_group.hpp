// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: a48c205d6dcd4338f5b83b4fda18bff6015be07b}
// external_1:  { status: Complete, auditors: [Sherlock], commit: 13c1b927c6c }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group_offset_generators.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_scalar.hpp"
#include "barretenberg/stdlib/primitives/group/straus_lookup_table.hpp"
#include "barretenberg/stdlib/primitives/group/straus_plookup_table.hpp"
#include "barretenberg/stdlib/primitives/group/straus_scalar_slice.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base_params.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <optional>

namespace bb::stdlib {

/**
 * @brief cycle_group represents a group Element of the proving system's embedded curve, i.e. a curve with a cofactor 1
 * defined over a field equal to the circuit's native field Builder::FF
 * @details In barretenberg, cycle group is used to represent the Grumpkin curve defined over the bn254 scalar field.
 * The point at infinity is tracked via an `is_infinity` flag. At observation boundaries (serialize_to_fields,
 * set_public, operator==, assert_equal), coordinates are canonicalized to (0, 0) when is_infinity is true.
 * Intermediate arithmetic results may have non-canonical coordinates when is_infinity is true.
 *
 * @note For the honest prover, we restrict the construction of cycle group elements in the following ways: (1) x and y
 * coordinates of a point must have matching constancy, i.e. both are constants or both are witnesses, enforced via a
 * runtime assert. (2) We disallow construction of points not on the curve via runtime asserts (always) and via circuit
 * constraints in select situations, e.g. EC operations from noir in DSL.
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
    using OffsetGenerators = cycle_group_offset_generators<Curve>;

    using BigScalarField = stdlib::bigfield<Builder, bb::fq::Params>;
    using cycle_scalar = ::bb::stdlib::cycle_scalar<Builder>;
    using straus_lookup_table = ::bb::stdlib::straus_lookup_table<Builder>;
    using straus_plookup_table = ::bb::stdlib::straus_plookup_table<Builder>;
    using straus_scalar_slices = ::bb::stdlib::straus_scalar_slices<Builder>;

    // Bit-size for scalars represented in the ROM lookup tables used in the variable-base MSM algorithm
    static constexpr size_t ROM_TABLE_BITS = 4;
    static constexpr size_t NUM_BITS_FULL_FIELD_SIZE = bb::fq::modulus.get_msb() + 1;
    // Domain separator for generating offset generator points in the variable-base MSM algorithm

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
    // Construct from coordinates. Infinity is auto-detected from (x == 0 && y == 0).
    explicit cycle_group(const field_t& x, const field_t& y, bool assert_on_curve = true);
    cycle_group(const AffineElement& _in);
    static cycle_group one(Builder* _context);
    static cycle_group constant_infinity(Builder* _context = nullptr);
    static cycle_group from_witness(Builder* _context, const AffineElement& _in);
    static cycle_group from_constant_witness(Builder* _context, const AffineElement& _in);
    Builder* get_context(const cycle_group& other) const;
    Builder* get_context() const { return context; }
    AffineElement get_value() const;

    // Coordinate accessors (non-owning, const reference)
    const field_t& x() const { return _x; }
    const field_t& y() const { return _y; }
    [[nodiscard]] bool is_constant() const
    {
        return _x.is_constant() && _y.is_constant() && _is_infinity.is_constant();
    }
    bool_t is_point_at_infinity() const { return _is_infinity; }
    [[nodiscard]] bool is_constant_point_at_infinity() const
    {
        return _is_infinity.is_constant() && _is_infinity.get_value();
    }
    void standardize();
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
                                 const std::vector<BigScalarField>& scalars)
    {
        std::vector<cycle_scalar> cycle_scalars;
        for (auto scalar : scalars) {
            cycle_scalars.emplace_back(scalar);
        }
        return batch_mul(base_points, cycle_scalars);
    }
    static cycle_group batch_mul(const std::vector<cycle_group>& base_points, const std::vector<cycle_scalar>& scalars);

    static cycle_group fixed_batch_mul(const std::vector<cycle_group>& constant_points,
                                       const std::vector<BigScalarField>& scalars,
                                       size_t table_bits = ROM_TABLE_BITS)
    {
        std::vector<cycle_scalar> cycle_scalars;
        for (auto scalar : scalars) {
            cycle_scalars.emplace_back(scalar);
        }
        return fixed_batch_mul(constant_points, cycle_scalars, table_bits);
    }
    static cycle_group fixed_batch_mul(const std::vector<cycle_group>& constant_points,
                                       const std::vector<cycle_scalar>& scalars,
                                       size_t table_bits = ROM_TABLE_BITS);
    cycle_group operator*(const cycle_scalar& scalar) const;
    cycle_group& operator*=(const cycle_scalar& scalar);
    cycle_group operator*(const BigScalarField& scalar) const;
    cycle_group& operator*=(const BigScalarField& scalar);
    bool_t operator==(cycle_group& other);
    void assert_equal(cycle_group& other, std::string const& msg = "cycle_group::assert_equal");
    static cycle_group conditional_assign(const bool_t& predicate, const cycle_group& lhs, const cycle_group& rhs);

    /**
     * @brief Set the origin tag for x, y and _is_infinity members of cycle_group
     *
     * @param tag
     */
    void set_origin_tag(OriginTag tag) const
    {
        _x.set_origin_tag(tag);
        _y.set_origin_tag(tag);
        _is_infinity.set_origin_tag(tag);
    }

    /**
     * @brief Get the origin tag of cycle_group (a merege of origin tags of x, y and _is_infinity members)
     *
     * @return OriginTag
     */
    OriginTag get_origin_tag() const
    {
        return OriginTag(_x.get_origin_tag(), _y.get_origin_tag(), _is_infinity.get_origin_tag());
    }

    /**
     * @brief Set the free witness flag for the cycle_group's tags
     */
    void set_free_witness_tag()
    {
        _x.set_free_witness_tag();
        _y.set_free_witness_tag();
        _is_infinity.set_free_witness_tag();
    }

    /**
     * @brief Unset the free witness flag for the cycle_group's tags
     */
    void unset_free_witness_tag()
    {
        _x.unset_free_witness_tag();
        _y.unset_free_witness_tag();
        _is_infinity.unset_free_witness_tag();
    }

    /**
     * Fix a witness. The value of the witness is constrained with a selector
     **/
    void fix_witness()
    {
        // Origin tags should be updated within
        _x.fix_witness();
        _y.fix_witness();
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
        standardize(); // if point is at infinity, ensure coordinates are (0,0).
        uint32_t start_idx = _x.set_public();
        _y.set_public();
        return start_idx;
    }

  private:
    // Allow straus_lookup_table and straus_plookup_table to access the private constructor for efficiency
    friend class ::bb::stdlib::straus_lookup_table<Builder>;
    friend class ::bb::stdlib::straus_plookup_table<Builder>;

    // Private constructor that allows explicit control over infinity flag.
    // Use public constructors or factory methods instead - they auto-detect infinity from coordinates.
    cycle_group(const field_t& x, const field_t& y, bool_t is_infinity, bool assert_on_curve);

    field_t _x;
    field_t _y;
    bool_t _is_infinity;
    Builder* context;

    static batch_mul_internal_output _variable_base_batch_mul_internal(std::span<cycle_scalar> scalars,
                                                                       std::span<cycle_group> base_points,
                                                                       std::span<AffineElement const> offset_generators,
                                                                       bool unconditional_add);

    static batch_mul_internal_output _fixed_base_batch_mul_internal(std::span<cycle_scalar> scalars,
                                                                    std::span<AffineElement> base_points);

    static batch_mul_internal_output _fixed_base_plookup_batch_mul_internal(
        std::span<cycle_scalar> scalars,
        std::span<AffineElement const> base_points,
        std::span<AffineElement const> offset_generators,
        size_t table_bits = ROM_TABLE_BITS);

    // Internal implementation for unconditional_add and unconditional_subtract
    cycle_group _unconditional_add_or_subtract(const cycle_group& other,
                                               bool is_addition,
                                               const std::optional<AffineElement> hint) const;
};

template <typename Builder> inline std::ostream& operator<<(std::ostream& os, cycle_group<Builder> const& v)
{
    return os << "{ " << v.x() << ", " << v.y() << " }";
}
} // namespace bb::stdlib
